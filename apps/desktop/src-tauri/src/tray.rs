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
    let state = app.state::<Mutex<ManagedSidecar>>();
    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    start_sidecar_for_settings(app, &mut sidecar, settings)
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
    let tray_resident = read_settings(window.app_handle())
        .map(|settings| settings.setup_completed && is_tray_resident(&settings))
        .unwrap_or(true);
    if tray_resident {
        let _ = window.hide();
    } else {
        let _ = window.minimize();
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn handle_tray_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "show_settings" => show_settings_window(app),
        "open_browser" => {
            if let Err(error) = open_saved_server_url(app) {
                eprintln!("Open browser from tray failed: {error}");
            }
        }
        "copy_url" => {
            if let Err(error) = copy_saved_server_url(app) {
                eprintln!("Copy URL from tray failed: {error}");
            }
        }
        "quit" => {
            stop_sidecar_on_exit(app);
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show_settings", "Settings")
        .text("open_browser", "Open Browser")
        .text("copy_url", "Copy URL")
        .separator()
        .text("quit", "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Caramel Board")
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

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
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

    let background_launch = env::args().any(|arg| arg == "--background");
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
                if let Err(error) = start_saved_sidecar(&handle) {
                    eprintln!("Background server start failed: {error}");
                }
            }
        }
    }
    Ok(())
}
