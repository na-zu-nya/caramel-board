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
    sync::Mutex,
    thread,
    time::Duration,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use tauri::{
    menu::{MenuBuilder, MenuEvent},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

include!("domain.rs");
include!("settings.rs");
include!("platform/process.rs");
include!("platform/resources.rs");
include!("features/ffmpeg.rs");
include!("features/autotag.rs");
include!("features/sidecar.rs");
include!("features/data_store.rs");
include!("features/docker_migration.rs");
include!("tray.rs");

pub fn run() {
    tauri::Builder::default()
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
            migrate_from_docker,
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
            tauri::RunEvent::ExitRequested { .. } => {
                stop_sidecar_on_exit(app);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                show_settings_window(app);
            }
            _ => {}
        });
}
