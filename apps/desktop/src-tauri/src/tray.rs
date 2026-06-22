#[cfg(target_os = "windows")]
const WINDOWS_TRAY_ICON: &[u8] = include_bytes!("../icons/tray/tray-color.png");
#[cfg(target_os = "macos")]
const MACOS_TRAY_RUNNING_ICON: &[u8] = include_bytes!("../icons/tray/tray-menubar-running.png");
#[cfg(target_os = "macos")]
const MACOS_TRAY_STOPPED_ICON: &[u8] = include_bytes!("../icons/tray/tray-menubar-stopped.png");

#[cfg(target_os = "windows")]
fn tray_icon_for_status(_running: bool) -> tauri::Result<Image<'static>> {
    Image::from_bytes(WINDOWS_TRAY_ICON)
}

#[cfg(target_os = "macos")]
fn tray_icon_for_status(running: bool) -> tauri::Result<Image<'static>> {
    let bytes = if running {
        MACOS_TRAY_RUNNING_ICON
    } else {
        MACOS_TRAY_STOPPED_ICON
    };
    Image::from_bytes(bytes)
}

fn stop_sidecar_on_exit(app: &tauri::AppHandle) {
    let settings = read_settings(app).ok();
    let state = app.state::<Mutex<ManagedSidecar>>();
    if let Ok(mut sidecar) = state.lock() {
        if let Some(mut child) = sidecar.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(settings) = settings {
            terminate_listeners_on_port(settings.port, &[]);
            stop_auto_tag(&mut sidecar, &settings);
        }
    };
}

fn start_saved_sidecar(app: &AppHandle) -> Result<SidecarStatus, String> {
    let settings = read_settings(app)?;
    if !settings.setup_completed {
        return Err(String::from("セットアップが完了していません。"));
    }
    let status = {
        let state = app.state::<Mutex<ManagedSidecar>>();
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        start_sidecar_for_settings(app, &mut sidecar, settings)
    }?;
    refresh_tray_menu(app);
    emit_sidecar_status_changed(app, &status);
    Ok(status)
}

fn stop_saved_sidecar(app: &AppHandle) -> Result<SidecarStatus, String> {
    let settings = read_settings(app)?;
    let status = {
        let state = app.state::<Mutex<ManagedSidecar>>();
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        stop_sidecar_for_settings(&mut sidecar, &settings)
    }?;
    refresh_tray_menu(app);
    emit_sidecar_status_changed(app, &status);
    Ok(status)
}

fn saved_sidecar_status(app: &AppHandle) -> Result<SidecarStatus, String> {
    let settings = read_settings(app)?;
    let state = app.state::<Mutex<ManagedSidecar>>();
    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    status_from(&mut sidecar, &settings)
}

fn toggle_saved_sidecar(app: &AppHandle) -> Result<(), String> {
    if saved_sidecar_status(app)?.running {
        stop_saved_sidecar(app)?;
    } else {
        start_saved_sidecar(app)?;
    }
    Ok(())
}

fn open_saved_server_url(app: &AppHandle) -> Result<(), String> {
    let status = start_saved_sidecar(app)?;
    let settings = read_settings(app)?;
    if !wait_server_ready(settings.port, Some(60_000)) {
        return Err(String::from(
            "Caramel Board の起動完了を確認できませんでした。",
        ));
    }
    app.opener()
        .open_url(status.url, None::<&str>)
        .map_err(|error| format!("ブラウザで開けません: {error}"))
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn copy_text_to_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut child = hidden_command("cmd")
        .arg("/C")
        .arg("clip")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("クリップボードを開けません: {error}"))?;

    #[cfg(target_os = "macos")]
    let mut child = hidden_command("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("クリップボードを開けません: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("URLを書き込めません: {error}"))?;
    }

    let status = child
        .wait()
        .map_err(|error| format!("クリップボードへのコピーを完了できません: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(String::from("クリップボードへのコピーに失敗しました。"))
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn copy_saved_server_url(app: &AppHandle) -> Result<(), String> {
    let settings = read_settings(app)?;
    copy_text_to_clipboard(&server_url(&settings))
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn close_settings_window(window: &tauri::Window) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.hide();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let tray_resident = read_settings(window.app_handle())
            .map(|settings| settings.setup_completed && is_tray_resident(&settings))
            .unwrap_or(false);
        if tray_resident {
            let _ = window.hide();
        } else {
            cleanup_and_exit(window.app_handle());
        }
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn handle_tray_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "toggle_sidecar" => {
            if let Err(error) = toggle_saved_sidecar(app) {
                eprintln!("Toggle Caramel Board from tray failed: {error}");
                show_settings_window(app);
                refresh_tray_menu(app);
            }
        }
        "show_settings" => show_settings_window(app),
        "open_browser" => {
            if let Err(error) = open_saved_server_url(app) {
                eprintln!("Open browser from tray failed: {error}");
                show_settings_window(app);
                refresh_tray_menu(app);
            }
        }
        "copy_url" => {
            if let Err(error) = copy_saved_server_url(app) {
                eprintln!("Copy URL from tray failed: {error}");
            }
        }
        "quit" => {
            cleanup_and_exit(app);
        }
        _ => {}
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn build_tray_menu(app: &AppHandle, running: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let status_label = if running {
        "Status: Running"
    } else {
        "Status: Stopped"
    };
    let toggle_label = if running {
        "Stop Caramel Board"
    } else {
        "Start Caramel Board"
    };
    let status_item = MenuItem::with_id(app, "sidecar_status", status_label, false, None::<&str>)?;

    MenuBuilder::new(app)
        .item(&status_item)
        .text("toggle_sidecar", toggle_label)
        .separator()
        .text("show_settings", "Open Settings")
        .separator()
        .text("open_browser", "Open in Browser")
        .text("copy_url", "Copy URL")
        .separator()
        .text("quit", "Quit")
        .build()
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn refresh_tray_icon(app: &AppHandle, running: bool) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    let icon = match tray_icon_for_status(running) {
        Ok(icon) => icon,
        Err(error) => {
            eprintln!("Load tray icon failed: {error}");
            return;
        }
    };
    #[cfg(target_os = "macos")]
    let result = tray.set_icon_with_as_template(Some(icon), false);
    #[cfg(target_os = "windows")]
    let result = tray.set_icon(Some(icon));
    if let Err(error) = result {
        eprintln!("Update tray icon failed: {error}");
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn refresh_tray_menu(app: &AppHandle) {
    let running = saved_sidecar_status(app)
        .map(|status| status.running)
        .unwrap_or(false);
    refresh_tray_icon(app, running);

    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    match build_tray_menu(app, running) {
        Ok(menu) => {
            if let Err(error) = tray.set_menu(Some(menu)) {
                eprintln!("Update tray menu failed: {error}");
            }
        }
        Err(error) => {
            eprintln!("Build tray menu failed: {error}");
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn refresh_tray_menu(_app: &AppHandle) {}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let running = saved_sidecar_status(app.handle())
        .map(|status| status.running)
        .unwrap_or(false);
    let menu = build_tray_menu(app.handle(), running)?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Caramel Board")
        .icon(tray_icon_for_status(running)?)
        .menu(&menu)
        .on_menu_event(handle_tray_menu_event);

    #[cfg(target_os = "macos")]
    {
        builder = builder.show_menu_on_left_click(true);
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.show_menu_on_left_click(false).on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_settings_window(tray.app_handle());
            }
        });
    }

    builder.build(app)?;
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn setup_tray(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    setup_tray(app)?;
    let handle = app.handle().clone();
    let settings = read_settings(&handle).ok();
    if let Some(settings) = settings.as_ref() {
        let _ = apply_app_shell_settings(&handle, settings);
    } else {
        apply_app_shell_settings_if_available(&handle);
    }

    let background_launch = has_cli_arg("--background");
    let auto_apply_standalone_migrations = has_cli_arg(APPLY_STANDALONE_MIGRATIONS_ARG);
    if background_launch {
        if let Some(window) = handle.get_webview_window("main") {
            match settings.as_ref() {
                Some(settings) if settings.setup_completed && is_tray_resident(settings) => {
                    let _ = window.hide();
                }
                Some(settings) if settings.setup_completed => {
                    let _ = window.minimize();
                }
                _ => {}
            }
        }
        if let Some(settings) = settings.as_ref() {
            if settings.setup_completed && settings.launch_on_startup {
                if auto_apply_standalone_migrations {
                    match normalize_settings_for_app(&handle, settings.clone())
                        .and_then(|settings| apply_standalone_migration_blocking(&handle, settings))
                    {
                        Ok(()) => {}
                        Err(error) => {
                            eprintln!("Background standalone migration failed: {error}");
                            show_settings_window(&handle);
                            return Ok(());
                        }
                    }
                }
                match standalone_migration_status_for_settings(&handle, settings) {
                    Ok(migration_status) if migration_status.status == "ready" => {
                        if let Err(error) = start_saved_sidecar(&handle) {
                            eprintln!("Background server start failed: {error}");
                        }
                    }
                    Ok(_) => {
                        show_settings_window(&handle);
                    }
                    Err(error) => {
                        eprintln!("Background migration status check failed: {error}");
                        show_settings_window(&handle);
                    }
                }
            }
        }
    }
    Ok(())
}
