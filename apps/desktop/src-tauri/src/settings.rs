fn default_docker_database_url() -> String {
    String::from("postgresql://caramel_user:caramel_pass@localhost:5432/caramel_board_db")
}

fn default_language() -> String {
    let lang = std::env::var("LANG").unwrap_or_default().to_lowercase();
    normalize_language(&lang)
}

fn default_resident_mode() -> String {
    String::from("tray")
}

fn normalize_language(language: &str) -> String {
    if language == "ja" || language.starts_with("ja_") || language.starts_with("ja-") {
        String::from("ja")
    } else {
        String::from("en")
    }
}

fn default_auto_tag_port() -> u16 {
    5001
}

fn default_auto_tag_threshold() -> f64 {
    0.4
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.language = normalize_language(&settings.language);
    if settings.resident_mode != "taskbar" && settings.resident_mode != "tray" {
        settings.resident_mode = default_resident_mode();
    }
    if settings.auto_tag_port == 0 {
        settings.auto_tag_port = default_auto_tag_port();
    }
    if !(0.0..=1.0).contains(&settings.auto_tag_threshold) {
        settings.auto_tag_threshold = default_auto_tag_threshold();
    }
    settings
}

fn auto_tag_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("データディレクトリを解決できません: {error}"))?
        .join("autotag"))
}

fn normalize_settings_for_app(
    app: &AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let mut normalized = normalize_settings(settings);
    let auto_tag_root = auto_tag_root(app)?;
    if normalized.auto_tag_repo_dir.trim().is_empty() {
        normalized.auto_tag_repo_dir = auto_tag_root.join("joytag").to_string_lossy().into_owned();
    }
    if normalized.auto_tag_model_dir.trim().is_empty() {
        normalized.auto_tag_model_dir = auto_tag_root.join("models").to_string_lossy().into_owned();
    }
    Ok(normalized)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("設定ディレクトリを解決できません: {error}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("設定ディレクトリを作成できません: {error}"))?;
    Ok(config_dir.join("settings.json"))
}

fn legacy_settings_paths(current_path: &Path) -> Vec<PathBuf> {
    let Some(config_dir) = current_path.parent() else {
        return Vec::new();
    };
    let Some(parent_dir) = config_dir.parent() else {
        return Vec::new();
    };
    let Some(current_dir_name) = config_dir.file_name() else {
        return Vec::new();
    };
    ["app.caramelboard.desktop", "Caramel Board"]
        .iter()
        .filter_map(|directory_name| {
            let legacy_dir = parent_dir.join(directory_name);
            if legacy_dir.file_name() == Some(current_dir_name) {
                return None;
            }
            Some(legacy_dir.join("settings.json"))
        })
        .collect()
}

fn default_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("データディレクトリを解決できません: {error}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("データディレクトリを作成できません: {error}"))?;

    Ok(AppSettings {
        db_path: data_dir
            .join("caramel-board.sqlite")
            .to_string_lossy()
            .into_owned(),
        library_path: data_dir.join("library").to_string_lossy().into_owned(),
        setup_completed: false,
        port: 6777,
        language: default_language(),
        allow_external_network: false,
        basic_auth_enabled: false,
        basic_auth_username: String::new(),
        basic_auth_password: String::new(),
        docker_database_url: default_docker_database_url(),
        docker_storage_root: repo_root()
            .join("data/assets")
            .to_string_lossy()
            .into_owned(),
        docker_dataset_id: String::new(),
        docker_verify_files: true,
        auto_tag_enabled: false,
        auto_tag_port: default_auto_tag_port(),
        auto_tag_repo_dir: data_dir
            .join("autotag")
            .join("joytag")
            .to_string_lossy()
            .into_owned(),
        auto_tag_model_dir: data_dir
            .join("autotag")
            .join("models")
            .to_string_lossy()
            .into_owned(),
        auto_tag_threshold: default_auto_tag_threshold(),
        ffmpeg_path: String::new(),
        pdf_rasterizer_path: String::new(),
        launch_on_startup: false,
        resident_mode: default_resident_mode(),
    })
}

fn read_settings_file(path: &Path) -> Result<AppSettings, String> {
    let raw = fs::read_to_string(path).map_err(|error| {
        format!(
            "設定ファイルを読み込めません: {}: {error}",
            path.to_string_lossy()
        )
    })?;
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| format!("設定ファイルの形式が不正です: {error}"))?;
    let had_setup_field = value.get("setupCompleted").is_some();
    let mut parsed: AppSettings = serde_json::from_value(value)
        .map_err(|error| format!("設定ファイルの形式が不正です: {error}"))?;
    if !had_setup_field {
        // 旧バージョンの設定ファイルが残っている既存ユーザーはセットアップ済みとして扱う
        parsed.setup_completed = true;
    }
    Ok(parsed)
}

fn sqlite_family_size(db_path: &str) -> u64 {
    let paths = [
        PathBuf::from(db_path),
        PathBuf::from(format!("{db_path}-wal")),
        PathBuf::from(format!("{db_path}-shm")),
        PathBuf::from(format!("{db_path}-journal")),
    ];
    paths
        .iter()
        .filter_map(|path| fs::metadata(path).ok().map(|metadata| metadata.len()))
        .sum()
}

fn path_is_inside(path: &Path, parent: &Path) -> bool {
    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized_parent = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
    normalized_path.starts_with(normalized_parent)
}

fn find_legacy_settings(current_path: &Path) -> Option<AppSettings> {
    for legacy_path in legacy_settings_paths(current_path) {
        if !legacy_path.exists() {
            continue;
        }
        match read_settings_file(&legacy_path) {
            Ok(settings) if sqlite_family_size(&settings.db_path) > 0 => return Some(settings),
            Ok(_) => {}
            Err(error) => eprintln!("Legacy settings skipped: {error}"),
        }
    }
    None
}

fn merge_legacy_data_store(mut current: AppSettings, legacy: AppSettings) -> AppSettings {
    current.db_path = legacy.db_path;
    current.library_path = legacy.library_path;
    current.setup_completed = current.setup_completed || legacy.setup_completed;
    current
}

fn recover_legacy_data_store_if_needed(
    app: &AppHandle,
    current_path: &Path,
    current: AppSettings,
) -> Result<AppSettings, String> {
    let Some(legacy) = find_legacy_settings(current_path) else {
        return Ok(current);
    };
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("データディレクトリを解決できません: {error}"))?;
    let current_db_path = PathBuf::from(&current.db_path);
    let current_size = sqlite_family_size(&current.db_path);
    let legacy_size = sqlite_family_size(&legacy.db_path);
    let current_is_app_default = path_is_inside(&current_db_path, &app_data_dir);
    let current_looks_empty = current_size <= 1024 * 1024;

    if current_is_app_default && current_looks_empty && legacy_size > current_size {
        let recovered = merge_legacy_data_store(current, legacy);
        write_settings(app, &recovered)?;
        return Ok(recovered);
    }

    Ok(current)
}

fn read_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        if let Some(legacy) = find_legacy_settings(&path) {
            write_settings(app, &legacy)?;
            return normalize_settings_for_app(app, legacy);
        }
        let settings = default_settings(app)?;
        write_settings(app, &settings)?;
        return Ok(settings);
    }

    let parsed = read_settings_file(&path)?;
    let recovered = recover_legacy_data_store_if_needed(app, &path, parsed)?;
    normalize_settings_for_app(app, recovered)
}

fn write_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(&normalize_settings_for_app(app, settings.clone())?)
        .map_err(|error| format!("設定をJSON化できません: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("設定ファイルを書き込めません: {error}"))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    read_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let normalized = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &normalized)?;
    apply_app_shell_settings(&app, &normalized)?;
    Ok(normalized)
}

fn is_tray_resident(settings: &AppSettings) -> bool {
    settings.resident_mode == "tray"
}

fn apply_app_shell_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    let autostart_enabled = autolaunch
        .is_enabled()
        .map_err(|error| format!("自動起動の状態を確認できません: {error}"))?;
    if settings.launch_on_startup && !autostart_enabled {
        autolaunch
            .enable()
            .map_err(|error| format!("自動起動を有効にできません: {error}"))?;
    } else if !settings.launch_on_startup && autostart_enabled {
        autolaunch
            .disable()
            .map_err(|error| format!("自動起動を無効にできません: {error}"))?;
    }

    let tray_mode = is_tray_resident(settings);
    let tray_resident = settings.setup_completed && tray_mode;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_visible(tray_resident)
            .map_err(|error| format!("トレイ表示を切り替えられません: {error}"))?;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(tray_resident);
    }
    #[cfg(target_os = "macos")]
    {
        let activation_policy = if tray_resident {
            ActivationPolicy::Accessory
        } else {
            ActivationPolicy::Regular
        };
        app.set_activation_policy(activation_policy)
            .map_err(|error| format!("Dock表示を切り替えられません: {error}"))?;
    }
    Ok(())
}

fn apply_app_shell_settings_if_available(app: &AppHandle) {
    if let Ok(settings) = read_settings(app) {
        let _ = apply_app_shell_settings(app, &settings);
    }
}

fn server_url(settings: &AppSettings) -> String {
    format!("http://127.0.0.1:{}", settings.port)
}

fn auto_tag_url(settings: &AppSettings) -> String {
    format!("http://127.0.0.1:{}", settings.auto_tag_port)
}
