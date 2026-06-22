use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::BTreeSet,
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream, UdpSocket},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    },
    thread,
    time::Duration,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "windows")]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuEvent, MenuItem},
    tray::TrayIconBuilder,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

const APPLY_STANDALONE_MIGRATIONS_ARG: &str = "--apply-standalone-migrations";

fn has_cli_arg(name: &str) -> bool {
    env::args().any(|arg| arg == name)
}

include!("domain.rs");
include!("settings.rs");
include!("platform/process.rs");
include!("platform/resources.rs");
include!("features/ffmpeg.rs");
include!("features/autotag.rs");
include!("features/standalone_migration.rs");
include!("features/sidecar.rs");
include!("features/data_store.rs");
include!("features/docker_migration.rs");
include!("tray.rs");

static EXIT_CLEANUP_STARTED: AtomicBool = AtomicBool::new(false);

fn run_exit_cleanup_once(app: &AppHandle) {
    if !EXIT_CLEANUP_STARTED.swap(true, Ordering::SeqCst) {
        stop_sidecar_on_exit(app);
    }
}

fn cleanup_and_exit(app: &AppHandle) {
    run_exit_cleanup_once(app);
    app.exit(0);
}

#[cfg(target_os = "windows")]
struct StrictSingleInstanceMutex(isize);

#[cfg(target_os = "windows")]
fn encode_windows_wide(value: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    use std::os::windows::prelude::OsStrExt;

    value
        .as_ref()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn strict_single_instance_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("strict-single-instance");

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS},
            System::Threading::{CreateMutexW, ReleaseMutex},
        };

        return builder
            .setup(|app, _api| {
                let mutex_name =
                    encode_windows_wide(format!("{}-strict-sim", app.config().identifier));
                let hmutex = unsafe { CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr()) };
                if hmutex.is_null() {
                    return Ok(());
                }

                if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                    unsafe {
                        CloseHandle(hmutex);
                    }
                    app.cleanup_before_exit();
                    std::process::exit(0);
                }

                app.manage(StrictSingleInstanceMutex(hmutex as isize));
                Ok(())
            })
            .on_event(|app, event| {
                if let tauri::RunEvent::Exit = event {
                    if let Some(hmutex) = app.try_state::<StrictSingleInstanceMutex>() {
                        unsafe {
                            ReleaseMutex(hmutex.0 as _);
                            CloseHandle(hmutex.0 as _);
                        }
                    }
                }
            })
            .build();
    }

    #[cfg(not(target_os = "windows"))]
    {
        builder.build()
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_settings_window(app);
            refresh_tray_menu(app);
        }))
        .plugin(strict_single_instance_plugin())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(ManagedSidecar::default()))
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            detect_ffmpeg,
            detect_pdf_rasterizer,
            autotag_status,
            autotag_install_metadata,
            autotag_install_progress,
            sidecar_status,
            start_sidecar,
            stop_sidecar,
            import_database,
            export_database,
            move_database,
            move_library,
            prepare_autotag,
            start_autotag_install,
            detect_docker_source,
            docker_migration_progress,
            start_docker_migration,
            standalone_migration_status,
            standalone_migration_progress,
            start_standalone_migration,
            apply_data_store,
            inspect_data_store,
            complete_setup,
            reset_setup,
            resolve_docker_storage_root,
            local_ip_address,
            wait_server_ready
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                close_settings_window(window);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !EXIT_CLEANUP_STARTED.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    cleanup_and_exit(app);
                }
            }
            tauri::RunEvent::Exit => {
                run_exit_cleanup_once(app);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                show_settings_window(app);
            }
            _ => {}
        });
}
