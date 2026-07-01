fn status_from(
    sidecar: &mut ManagedSidecar,
    fallback: &AppSettings,
) -> Result<SidecarStatus, String> {
    if let Some(child) = sidecar.child.as_mut() {
        if child
            .try_wait()
            .map_err(|error| format!("Caramel Board の状態を確認できません: {error}"))?
            .is_some()
        {
            sidecar.child = None;
            sidecar.started_at = None;
        }
    }

    let settings = sidecar.settings.as_ref().unwrap_or(fallback);
    let external_dev_server_running =
        external_dev_server_enabled() && http_health_ok(settings.port);
    Ok(SidecarStatus {
        running: sidecar.child.is_some() || external_dev_server_running,
        url: server_url(settings),
        pid: sidecar.child.as_ref().map(std::process::Child::id),
        started_at: sidecar.started_at,
    })
}

fn emit_sidecar_status_changed(app: &AppHandle, status: &SidecarStatus) {
    if let Err(error) = app.emit("sidecar-status-changed", status.clone()) {
        eprintln!("Emit sidecar status failed: {error}");
    }
}

fn sidecar_server_command(app: &AppHandle, server_root: &Path) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        let dev_runner = repo_root().join("scripts/dev-server.mjs");
        if !dev_runner.exists() {
            return Err(String::from(
                "開発用サーバーの起動スクリプトが見つかりません。リポジトリ直下で npm run dev を実行してください。",
            ));
        }

        let mut command = node_command(app);
        command
            .arg(child_process_path(dev_runner))
            .current_dir(child_process_path(server_root));
        return Ok(command);
    }

    let server_entry = server_root.join("dist/entry.node.mjs");
    if !server_entry.exists() {
        return Err(String::from(
            "Caramel Board の起動に必要なファイルが見つかりません。先にアプリをビルドしてください。",
        ));
    }

    let mut command = node_command(app);
    command
        .arg(child_process_path(server_entry))
        .current_dir(child_process_path(server_root));
    Ok(command)
}

fn configure_sidecar_stdio(command: &mut Command) {
    command.stdin(Stdio::null());
    if cfg!(debug_assertions) {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }
}

fn external_dev_server_enabled() -> bool {
    cfg!(debug_assertions)
        && matches!(
            env::var("CARAMEL_DEV_EXTERNAL_SERVER").as_deref(),
            Ok("1") | Ok("true")
        )
}

fn start_sidecar_for_settings(
    app: &AppHandle,
    sidecar: &mut ManagedSidecar,
    settings: AppSettings,
) -> Result<SidecarStatus, String> {
    if sidecar.child.is_some() {
        let current = status_from(sidecar, &settings)?;
        if current.running {
            return Ok(current);
        }
    }

    let migration_status = standalone_migration_status_for_settings(app, &settings)?;
    if migration_status.status != "ready" {
        return Err(format!(
            "データベース更新が必要です。デスクトップアプリでマイグレーションを実行してください。\n{}",
            migration_status.message
        ));
    }

    if external_dev_server_enabled() {
        sidecar.settings = Some(settings.clone());
        if !http_health_ok(settings.port) {
            return Err(String::from(
                "開発用サーバーが起動していません。リポジトリ直下の npm run dev を確認してください。",
            ));
        }
        return status_from(sidecar, &settings);
    }

    terminate_listeners_on_port(settings.port, &[]);

    let server_root = resource_or_repo_path(app, "server", "apps/server");

    ensure_parent(Path::new(&settings.db_path))?;
    fs::create_dir_all(&settings.library_path)
        .map_err(|error| format!("ライブラリディレクトリを作成できません: {error}"))?;

    let client_dist = resource_or_repo_path(app, "client/dist", "apps/client/dist");
    let mut command = sidecar_server_command(app, &server_root)?;
    command
        .env("PORT", settings.port.to_string())
        .env(
            "HOST",
            if settings.allow_external_network {
                "0.0.0.0"
            } else {
                "127.0.0.1"
            },
        )
        .env(
            "CARAMEL_ALLOW_EXTERNAL",
            if settings.allow_external_network {
                "1"
            } else {
                "0"
            },
        )
        .env("STANDALONE_SQLITE_PATH", &settings.db_path)
        .env("SQLITE_DB_PATH", &settings.db_path)
        .env("FILES_STORAGE", &settings.library_path)
        .env("STATIC_ROOT", child_process_path(&client_dist))
        .env("CARAMEL_UI_LANGUAGE", &settings.language)
        .env("JOYTAG_SERVER_URL", auto_tag_url(&settings))
        .env(
            "CARAMEL_BASIC_AUTH_ENABLED",
            if settings.basic_auth_enabled {
                "1"
            } else {
                "0"
            },
        )
        .env("CARAMEL_BASIC_AUTH_USERNAME", &settings.basic_auth_username)
        .env("CARAMEL_BASIC_AUTH_PASSWORD", &settings.basic_auth_password);
    configure_sidecar_stdio(&mut command);

    if let Some(ffmpeg_path) = effective_ffmpeg_path(&settings) {
        command.env("FFMPEG_PATH", &ffmpeg_path);
        if let Some(ffprobe_path) = ffprobe_path_for_ffmpeg(&ffmpeg_path) {
            command.env("FFPROBE_PATH", ffprobe_path);
        }
    }
    if let Some(pdf_rasterizer_path) = effective_pdf_rasterizer_path(&settings) {
        command.env("PDF_RASTERIZER_PATH", pdf_rasterizer_path);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("Caramel Board を起動できません: {error}"))?;
    sidecar.child = Some(child);
    sidecar.settings = Some(settings.clone());
    sidecar.started_at = Some(now_epoch_seconds());

    if let Err(error) = start_auto_tag_if_enabled(app, sidecar, &settings) {
        eprintln!("AutoTag start skipped: {error}");
    }

    status_from(sidecar, &settings)
}

fn stop_sidecar_for_settings(
    sidecar: &mut ManagedSidecar,
    settings: &AppSettings,
) -> Result<SidecarStatus, String> {
    if external_dev_server_enabled() && sidecar.child.is_none() {
        return status_from(sidecar, settings);
    }

    if let Some(mut child) = sidecar.child.take() {
        child
            .kill()
            .map_err(|error| format!("Caramel Board を停止できません: {error}"))?;
        let _ = child.wait();
    }
    terminate_listeners_on_port(settings.port, &[]);
    stop_auto_tag(sidecar, settings);
    sidecar.started_at = None;
    status_from(sidecar, settings)
}

#[tauri::command]
fn local_ip_address() -> String {
    detect_local_ip().unwrap_or_else(|| String::from("127.0.0.1"))
}

fn detect_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_unspecified() || ip.is_loopback() {
        None
    } else {
        Some(ip.to_string())
    }
}

#[tauri::command]
fn sidecar_status(
    app: AppHandle,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<SidecarStatus, String> {
    let settings = read_settings(&app)?;
    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    status_from(&mut sidecar, &settings)
}

#[tauri::command]
fn start_sidecar(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<SidecarStatus, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &settings)?;

    let status = {
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        start_sidecar_for_settings(&app, &mut sidecar, settings)
    }?;
    refresh_tray_menu(&app);
    emit_sidecar_status_changed(&app, &status);
    Ok(status)
}

#[tauri::command]
fn stop_sidecar(
    app: AppHandle,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<SidecarStatus, String> {
    let settings = read_settings(&app)?;

    let status = {
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        stop_sidecar_for_settings(&mut sidecar, &settings)
    }?;
    refresh_tray_menu(&app);
    emit_sidecar_status_changed(&app, &status);
    Ok(status)
}

#[tauri::command]
fn wait_server_ready(port: u16, timeout_ms: Option<u64>) -> bool {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.unwrap_or(60_000));
    loop {
        if http_health_ok(port) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(300));
    }
}

fn http_health_ok(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(1000)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(2000)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1000)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    let Ok(read) = stream.read(&mut buf) else {
        return false;
    };
    String::from_utf8_lossy(&buf[..read]).contains(" 200 ")
}
