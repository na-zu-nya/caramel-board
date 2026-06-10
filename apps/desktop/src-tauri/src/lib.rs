use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    env, fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "windows")]
use tauri::{
    menu::{MenuBuilder, MenuEvent},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    db_path: String,
    library_path: String,
    #[serde(default = "default_language")]
    language: String,
    port: u16,
    allow_external_network: bool,
    basic_auth_enabled: bool,
    basic_auth_username: String,
    basic_auth_password: String,
    #[serde(default = "default_docker_database_url")]
    docker_database_url: String,
    #[serde(default)]
    docker_storage_root: String,
    #[serde(default)]
    docker_dataset_id: String,
    #[serde(default)]
    docker_verify_files: bool,
    #[serde(default)]
    auto_tag_enabled: bool,
    #[serde(default = "default_auto_tag_port")]
    auto_tag_port: u16,
    #[serde(default)]
    auto_tag_repo_dir: String,
    #[serde(default)]
    auto_tag_model_dir: String,
    #[serde(default = "default_auto_tag_threshold")]
    auto_tag_threshold: f64,
    #[serde(default)]
    ffmpeg_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarStatus {
    running: bool,
    url: String,
    pid: Option<u32>,
    started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationResult {
    export_dir: String,
    db_path: String,
    stdout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerDatasetSummary {
    id: i64,
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerSourceDetection {
    available: bool,
    database_url: String,
    storage_root: String,
    storage_root_exists: bool,
    dataset_count: u64,
    stack_count: u64,
    asset_count: u64,
    datasets: Vec<DockerDatasetSummary>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoTagStatus {
    enabled: bool,
    running: bool,
    url: String,
    uv_installed: bool,
    repository_ready: bool,
    model_ready: bool,
    ready: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoTagInstallMetadata {
    model_name: String,
    model_url: String,
    download_bytes: u64,
    download_size: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoTagInstallProgress {
    running: bool,
    completed: bool,
    phase: String,
    message: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegCandidate {
    path: String,
    label: String,
    source: String,
    valid: bool,
    version: String,
    details: String,
}

impl Default for AutoTagInstallProgress {
    fn default() -> Self {
        Self {
            running: false,
            completed: false,
            phase: String::from("idle"),
            message: String::new(),
            downloaded_bytes: 0,
            total_bytes: 0,
            percent: 0.0,
            error: None,
        }
    }
}

#[derive(Default)]
struct ManagedSidecar {
    child: Option<Child>,
    auto_tag_child: Option<Child>,
    auto_tag_install: AutoTagInstallProgress,
    settings: Option<AppSettings>,
    started_at: Option<u64>,
}

fn default_docker_database_url() -> String {
    String::from("postgresql://caramel_user:caramel_pass@localhost:5432/caramel_board_db")
}

fn default_language() -> String {
    let lang = std::env::var("LANG").unwrap_or_default().to_lowercase();
    normalize_language(&lang)
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

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .components()
        .collect()
}

fn resource_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok()
}

fn packaged_resource_path(app: &AppHandle, relative: impl AsRef<Path>) -> Option<PathBuf> {
    let resource_dir = resource_dir(app)?;
    let relative = relative.as_ref();
    let candidates = [
        resource_dir.join(relative),
        resource_dir.join("_up_").join("resources").join(relative),
    ];
    candidates.into_iter().find(|path| path.exists())
}

fn resource_or_repo_path(
    app: &AppHandle,
    resource_relative: impl AsRef<Path>,
    repo_relative: impl AsRef<Path>,
) -> PathBuf {
    packaged_resource_path(app, resource_relative)
        .unwrap_or_else(|| repo_root().join(repo_relative))
}

fn bundled_node_path(app: &AppHandle) -> Option<PathBuf> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            PathBuf::from("runtime/node/node.exe"),
            PathBuf::from("runtime/node/bin/node.exe"),
        ]
    } else {
        vec![
            PathBuf::from("runtime/node/bin/node"),
            PathBuf::from("runtime/node/node"),
        ]
    };

    candidates
        .into_iter()
        .find_map(|candidate| packaged_resource_path(app, candidate))
}

fn node_command(app: &AppHandle) -> Command {
    match bundled_node_path(app) {
        Some(node) => Command::new(node),
        None => Command::new("node"),
    }
}

fn bundled_uv_path(app: &AppHandle) -> Option<PathBuf> {
    let candidate = if cfg!(target_os = "windows") {
        PathBuf::from("runtime/uv/uv.exe")
    } else {
        PathBuf::from("runtime/uv/uv")
    };
    packaged_resource_path(app, candidate)
}

fn uv_command(app: &AppHandle) -> Command {
    match bundled_uv_path(app) {
        Some(uv) => Command::new(uv),
        None => Command::new("uv"),
    }
}

fn uv_available(app: &AppHandle) -> bool {
    uv_command(app)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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
    })
}

fn read_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        let settings = default_settings(app)?;
        write_settings(app, &settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("設定ファイルを読み込めません: {error}"))?;
    let parsed = serde_json::from_str(&raw)
        .map_err(|error| format!("設定ファイルの形式が不正です: {error}"))?;
    normalize_settings_for_app(app, parsed)
}

fn write_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(&normalize_settings_for_app(app, settings.clone())?)
        .map_err(|error| format!("設定をJSON化できません: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("設定ファイルを書き込めません: {error}"))
}

fn server_url(settings: &AppSettings) -> String {
    format!("http://127.0.0.1:{}", settings.port)
}

fn auto_tag_url(settings: &AppSettings) -> String {
    format!("http://127.0.0.1:{}", settings.auto_tag_port)
}

fn listener_pids(port: u16) -> Vec<u32> {
    let output = Command::new("lsof")
        .arg(format!("-tiTCP:{port}"))
        .arg("-sTCP:LISTEN")
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

fn process_exists(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn terminate_pid(pid: u32) {
    if pid == std::process::id() {
        return;
    }

    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status();
    thread::sleep(Duration::from_millis(300));
    if process_exists(pid) {
        let _ = Command::new("kill")
            .arg("-KILL")
            .arg(pid.to_string())
            .status();
    }
}

fn terminate_listeners_on_port(port: u16, protected_pids: &[u32]) {
    for pid in listener_pids(port) {
        if protected_pids.contains(&pid) {
            continue;
        }
        terminate_pid(pid);
    }
}

fn ffmpeg_executable_names(base: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![format!("{base}.exe"), base.to_string()]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![base.to_string()]
    }
}

fn path_candidates(base: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let Ok(paths) = env::var("PATH") else {
        return candidates;
    };

    let names = ffmpeg_executable_names(base);
    for dir in env::split_paths(&paths) {
        for name in &names {
            candidates.push(dir.join(name));
        }
    }
    candidates
}

fn common_ffmpeg_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![
            PathBuf::from("/opt/homebrew/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/usr/bin/ffmpeg"),
        ]
    }
    #[cfg(target_os = "windows")]
    {
        vec![
            PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
        ]
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        vec![
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
        ]
    }
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn ffprobe_path_for_ffmpeg(ffmpeg_path: &str) -> Option<PathBuf> {
    let trimmed = ffmpeg_path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let path = Path::new(trimmed);
    let parent = path.parent()?;
    for name in ffmpeg_executable_names("ffprobe") {
        let candidate = parent.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn ffmpeg_label(path: &Path, source: &str) -> String {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| String::from("ffmpeg"));
    format!("{file_name} ({source})")
}

fn validate_ffmpeg_candidate(path: &Path, source: &str) -> FfmpegCandidate {
    let path_text = display_path(path);
    let version_output = Command::new(path)
        .arg("-hide_banner")
        .arg("-version")
        .output();

    let Ok(version_output) = version_output else {
        return FfmpegCandidate {
            path: path_text,
            label: ffmpeg_label(path, source),
            source: source.to_string(),
            valid: false,
            version: String::new(),
            details: String::from("実行できません"),
        };
    };

    if !version_output.status.success() {
        return FfmpegCandidate {
            path: path_text,
            label: ffmpeg_label(path, source),
            source: source.to_string(),
            valid: false,
            version: String::new(),
            details: String::from("FFmpeg として検証できません"),
        };
    }

    let version = String::from_utf8_lossy(&version_output.stdout)
        .lines()
        .next()
        .unwrap_or("ffmpeg")
        .trim()
        .to_string();
    let encoders_output = Command::new(path)
        .arg("-hide_banner")
        .arg("-encoders")
        .output();
    let encoders = encoders_output
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        .unwrap_or_default();
    let has_h264 = encoders.contains("libx264");
    let has_aac = encoders.contains(" aac");
    let details = match (has_h264, has_aac) {
        (true, true) => String::from("H.264 / AAC エンコード対応"),
        (true, false) => String::from("H.264 対応 / AAC は未確認"),
        (false, true) => String::from("AAC 対応 / H.264 は未確認"),
        (false, false) => String::from("実行可能 / H.264・AAC は未確認"),
    };

    FfmpegCandidate {
        path: path_text,
        label: ffmpeg_label(path, source),
        source: source.to_string(),
        valid: true,
        version,
        details,
    }
}

fn detect_ffmpeg_candidates(settings: &AppSettings) -> Vec<FfmpegCandidate> {
    let mut paths: Vec<(PathBuf, &str)> = Vec::new();
    if !settings.ffmpeg_path.trim().is_empty() {
        paths.push((PathBuf::from(settings.ffmpeg_path.trim()), "configured"));
    }
    paths.extend(
        path_candidates("ffmpeg")
            .into_iter()
            .map(|path| (path, "PATH")),
    );
    paths.extend(
        common_ffmpeg_candidates()
            .into_iter()
            .map(|path| (path, "common")),
    );

    let mut seen = BTreeSet::new();
    let mut candidates = Vec::new();
    for (path, source) in paths {
        let key = display_path(&path);
        if !seen.insert(key) {
            continue;
        }
        if source != "configured" && !path.exists() {
            continue;
        }
        candidates.push(validate_ffmpeg_candidate(&path, source));
    }
    candidates
}

fn effective_ffmpeg_path(settings: &AppSettings) -> Option<String> {
    if !settings.ffmpeg_path.trim().is_empty() {
        return Some(settings.ffmpeg_path.trim().to_string());
    }

    detect_ffmpeg_candidates(settings)
        .into_iter()
        .find(|candidate| candidate.valid)
        .map(|candidate| candidate.path)
}

fn format_bytes(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / GB)
    } else {
        format!("{:.0} MB", bytes as f64 / MB)
    }
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };

    entries
        .filter_map(Result::ok)
        .map(|entry| {
            let path = entry.path();
            match entry.metadata() {
                Ok(metadata) if metadata.is_dir() => directory_size(&path),
                Ok(metadata) => metadata.len(),
                Err(_) => 0,
            }
        })
        .sum()
}

fn auto_tag_download_patterns() -> &'static [&'static str] {
    &[
        "model.safetensors",
        "top_tags.txt",
        "config.json",
        "README.md",
    ]
}

fn fallback_auto_tag_metadata() -> AutoTagInstallMetadata {
    let download_bytes = 370 * 1024 * 1024;
    AutoTagInstallMetadata {
        model_name: String::from("fancyfeast/joytag"),
        model_url: String::from("https://huggingface.co/fancyfeast/joytag"),
        download_bytes,
        download_size: format_bytes(download_bytes),
    }
}

fn update_auto_tag_install_progress(
    app: &AppHandle,
    update: impl FnOnce(&mut AutoTagInstallProgress),
) {
    let state = app.state::<Mutex<ManagedSidecar>>();
    if let Ok(mut sidecar) = state.lock() {
        update(&mut sidecar.auto_tag_install);
    };
}

fn is_auto_tag_repository_ready(settings: &AppSettings) -> bool {
    Path::new(&settings.auto_tag_repo_dir)
        .join("Models.py")
        .exists()
}

fn is_auto_tag_model_ready(settings: &AppSettings) -> bool {
    let model_dir = Path::new(&settings.auto_tag_model_dir);
    model_dir.join("top_tags.txt").exists()
        && (model_dir.join("model.safetensors").exists() || model_dir.join("model.onnx").exists())
}

fn auto_tag_status_from(
    app: &AppHandle,
    sidecar: &mut ManagedSidecar,
    settings: &AppSettings,
) -> AutoTagStatus {
    if let Some(child) = sidecar.auto_tag_child.as_mut() {
        if child.try_wait().ok().flatten().is_some() {
            sidecar.auto_tag_child = None;
        }
    }

    let uv_installed = uv_available(app);
    let repository_ready = is_auto_tag_repository_ready(settings);
    let model_ready = is_auto_tag_model_ready(settings);
    let ready = uv_installed && repository_ready && model_ready;
    let running = sidecar.auto_tag_child.is_some();
    let message = if running {
        String::from("自動タグサービスが起動しています。")
    } else if ready {
        String::from("自動タグを利用できます。")
    } else if !uv_installed {
        String::from("自動タグの実行環境が見つかりません。アプリを再インストールしてください。")
    } else if !repository_ready {
        String::from("JoyTag のコードがまだ準備されていません。")
    } else {
        String::from("JoyTag のモデルがまだ準備されていません。")
    };

    AutoTagStatus {
        enabled: settings.auto_tag_enabled,
        running,
        url: auto_tag_url(settings),
        uv_installed,
        repository_ready,
        model_ready,
        ready,
        message,
    }
}

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
    Ok(SidecarStatus {
        running: sidecar.child.is_some(),
        url: server_url(settings),
        pid: sidecar.child.as_ref().map(std::process::Child::id),
        started_at: sidecar.started_at,
    })
}

fn stop_auto_tag(sidecar: &mut ManagedSidecar, settings: &AppSettings) {
    if let Some(mut child) = sidecar.auto_tag_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    terminate_listeners_on_port(settings.auto_tag_port, &[]);
}

fn auto_tag_bridge_root(app: &AppHandle) -> PathBuf {
    resource_or_repo_path(app, "integrations/joytag", "integrations/joytag")
}

fn start_auto_tag_if_enabled(
    app: &AppHandle,
    sidecar: &mut ManagedSidecar,
    settings: &AppSettings,
) -> Result<(), String> {
    if !settings.auto_tag_enabled || sidecar.auto_tag_child.is_some() {
        return Ok(());
    }

    terminate_listeners_on_port(settings.auto_tag_port, &[]);

    let status = auto_tag_status_from(app, sidecar, settings);
    if !status.ready {
        return Err(format!(
            "自動タグの準備が完了していません。設定の AutoTag から準備してください。\n{}",
            status.message
        ));
    }

    let bridge_root = auto_tag_bridge_root(app);
    let bridge_script = bridge_root.join("joytag_server.py");
    let requirements = bridge_root.join("requirements-server.txt");
    let mut command = uv_command(app);
    command
        .arg("run")
        .arg("--no-project")
        .arg("--with-requirements")
        .arg(requirements)
        .arg("python")
        .arg(bridge_script)
        .current_dir(&settings.auto_tag_repo_dir)
        .env("PORT", settings.auto_tag_port.to_string())
        .env("JOYTAG_REPO_DIR", &settings.auto_tag_repo_dir)
        .env("JOYTAG_MODEL_DIR", &settings.auto_tag_model_dir)
        .env("JOYTAG_FILES_ROOT", &settings.library_path)
        .env("JOYTAG_THRESHOLD", settings.auto_tag_threshold.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = command
        .spawn()
        .map_err(|error| format!("自動タグサービスを起動できません: {error}"))?;
    sidecar.auto_tag_child = Some(child);
    Ok(())
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("親ディレクトリを作成できません: {error}"))?;
    }
    Ok(())
}

fn run_command(mut command: Command, label: &str) -> Result<String, String> {
    let output = command
        .output()
        .map_err(|error| format!("{label} を実行できません: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(format!(
            "{label} が失敗しました\nstatus: {}\n{}\n{}",
            output.status, stdout, stderr
        ));
    }

    Ok(format!("{stdout}{stderr}"))
}

fn is_same_path(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn directory_is_empty(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(true);
    }
    let mut entries =
        fs::read_dir(path).map_err(|error| format!("ディレクトリを確認できません: {error}"))?;
    Ok(entries.next().is_none())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("移動先ディレクトリを作成できません: {error}"))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("移動元ディレクトリを読み込めません: {error}"))?
    {
        let entry = entry.map_err(|error| format!("移動元ファイルを確認できません: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = entry
            .metadata()
            .map_err(|error| format!("移動元ファイル情報を確認できません: {error}"))?;
        if metadata.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            if target_path.exists() {
                return Err(format!(
                    "移動先に同名ファイルが存在します: {}",
                    target_path.to_string_lossy()
                ));
            }
            fs::copy(&source_path, &target_path)
                .map_err(|error| format!("ファイルをコピーできません: {error}"))?;
        }
    }
    Ok(())
}

fn move_file_path(source: &Path, target: &Path) -> Result<(), String> {
    if is_same_path(source, target) {
        return Ok(());
    }
    ensure_parent(target)?;
    if target.exists() {
        return Err(String::from(
            "移動先のDBファイルが既に存在します。別の場所を選択してください。",
        ));
    }
    if !source.exists() {
        return Ok(());
    }
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source, target).map_err(|error| format!("DBをコピーできません: {error}"))?;
            fs::remove_file(source).map_err(|error| format!("移動元DBを削除できません: {error}"))
        }
    }
}

fn move_directory_path(source: &Path, target: &Path) -> Result<(), String> {
    if is_same_path(source, target) {
        return Ok(());
    }
    if target.exists() && !directory_is_empty(target)? {
        return Err(String::from(
            "移動先のライブラリフォルダが空ではありません。空のフォルダを選択してください。",
        ));
    }
    if !source.exists() {
        fs::create_dir_all(target)
            .map_err(|error| format!("ライブラリフォルダを作成できません: {error}"))?;
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("移動先の親ディレクトリを作成できません: {error}"))?;
    }
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_dir_recursive(source, target)?;
            fs::remove_dir_all(source)
                .map_err(|error| format!("移動元ライブラリフォルダを削除できません: {error}"))
        }
    }
}

fn detect_docker_source_for_settings(
    app: &AppHandle,
    settings: &AppSettings,
) -> Result<DockerSourceDetection, String> {
    let root = resource_or_repo_path(app, "server", "apps/server");
    let mut command = node_command(app);
    command
        .arg(root.join("scripts/detect-docker-source.mjs"))
        .current_dir(&root);

    if !settings.docker_database_url.trim().is_empty() {
        command.arg(format!(
            "--database-url={}",
            settings.docker_database_url.trim()
        ));
    }
    if !settings.docker_storage_root.trim().is_empty() {
        command.arg(format!(
            "--storage-root={}",
            settings.docker_storage_root.trim()
        ));
    }

    let output = run_command(command, "旧Docker版の検出")?;
    serde_json::from_str(output.trim())
        .map_err(|error| format!("旧Docker版の検出結果を読み取れません: {error}\n{output}"))
}

fn auto_tag_install_metadata_for_settings(
    app: &AppHandle,
    _settings: &AppSettings,
) -> Result<AutoTagInstallMetadata, String> {
    if !uv_available(app) {
        return Err(String::from(
            "自動タグの実行環境が見つかりません。アプリを再インストールしてください。",
        ));
    }

    let patterns_json =
        serde_json::to_string(auto_tag_download_patterns()).map_err(|error| error.to_string())?;
    let script = r#"
import json
import sys
from huggingface_hub import HfApi

repo_id = sys.argv[1]
patterns = set(json.loads(sys.argv[2]))
info = HfApi().model_info(repo_id, files_metadata=True)
total = 0
for sibling in info.siblings:
    name = sibling.rfilename
    if name in patterns:
        size = getattr(sibling, "size", None) or 0
        total += int(size)
print(json.dumps({"downloadBytes": total}))
"#;

    let mut command = uv_command(app);
    command
        .arg("run")
        .arg("--no-project")
        .arg("--with")
        .arg("huggingface_hub")
        .arg("python")
        .arg("-c")
        .arg(script)
        .arg("fancyfeast/joytag")
        .arg(patterns_json)
        .env("UV_NO_PROGRESS", "1");

    let output = command
        .output()
        .map_err(|error| format!("モデルのメタデータを取得できません: {error}"))?;

    if !output.status.success() {
        return Ok(fallback_auto_tag_metadata());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = serde_json::from_str::<serde_json::Value>(stdout.trim())
        .map_err(|_| String::from("モデルのメタデータを読み取れません"))?;
    let download_bytes = parsed
        .get("downloadBytes")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_else(|| fallback_auto_tag_metadata().download_bytes);

    Ok(AutoTagInstallMetadata {
        model_name: String::from("fancyfeast/joytag"),
        model_url: String::from("https://huggingface.co/fancyfeast/joytag"),
        download_bytes,
        download_size: format_bytes(download_bytes),
    })
}

fn prepare_auto_tag_for_settings(
    app: &AppHandle,
    settings: &AppSettings,
) -> Result<String, String> {
    if !uv_available(app) {
        return Err(String::from(
            "自動タグの実行環境が見つかりません。アプリを再インストールしてください。",
        ));
    }

    let repo_dir = PathBuf::from(&settings.auto_tag_repo_dir);
    let model_dir = PathBuf::from(&settings.auto_tag_model_dir);
    if let Some(parent) = repo_dir.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("AutoTag の保存先を作成できません: {error}"))?;
    }
    fs::create_dir_all(&model_dir)
        .map_err(|error| format!("AutoTag モデルの保存先を作成できません: {error}"))?;

    let mut logs = Vec::new();
    if !repo_dir.join("Models.py").exists() {
        let mut clone_command = Command::new("git");
        clone_command
            .arg("clone")
            .arg("--depth")
            .arg("1")
            .arg("https://github.com/fpgaminer/joytag.git")
            .arg(&repo_dir);
        logs.push(run_command(clone_command, "JoyTag コードの取得")?);
    }

    if !is_auto_tag_model_ready(settings) {
        let patterns_json = serde_json::to_string(auto_tag_download_patterns())
            .map_err(|error| error.to_string())?;
        let script = "from huggingface_hub import snapshot_download\nimport json\nimport sys\nsnapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], allow_patterns=json.loads(sys.argv[3]))\n";
        let mut model_command = uv_command(app);
        model_command
            .arg("run")
            .arg("--no-project")
            .arg("--with")
            .arg("huggingface_hub")
            .arg("python")
            .arg("-c")
            .arg(script)
            .arg("fancyfeast/joytag")
            .arg(&model_dir)
            .arg(patterns_json);
        logs.push(run_command(model_command, "JoyTag モデルの取得")?);
    }

    let requirements = auto_tag_bridge_root(app).join("requirements-server.txt");
    let mut dependency_command = uv_command(app);
    dependency_command
        .arg("run")
        .arg("--no-project")
        .arg("--with-requirements")
        .arg(requirements)
        .arg("--with")
        .arg("huggingface_hub")
        .arg("python")
        .arg("-c")
        .arg("import flask, torch, torchvision, huggingface_hub\nprint('AutoTag ready')\n");
    logs.push(run_command(dependency_command, "AutoTag 実行環境の準備")?);

    Ok(logs.join("\n"))
}

fn download_auto_tag_model_with_progress(
    app: &AppHandle,
    settings: &AppSettings,
    total_bytes: u64,
) -> Result<(), String> {
    if is_auto_tag_model_ready(settings) {
        return Ok(());
    }

    let model_dir = PathBuf::from(&settings.auto_tag_model_dir);
    fs::create_dir_all(&model_dir)
        .map_err(|error| format!("AutoTag モデルの保存先を作成できません: {error}"))?;
    let patterns_json =
        serde_json::to_string(auto_tag_download_patterns()).map_err(|error| error.to_string())?;
    let script = r#"
import json
import sys
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id=sys.argv[1],
    local_dir=sys.argv[2],
    allow_patterns=json.loads(sys.argv[3]),
)
"#;

    let mut child = uv_command(app)
        .arg("run")
        .arg("--no-project")
        .arg("--with")
        .arg("huggingface_hub")
        .arg("python")
        .arg("-c")
        .arg(script)
        .arg("fancyfeast/joytag")
        .arg(&model_dir)
        .arg(patterns_json)
        .env("UV_NO_PROGRESS", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("JoyTag モデルのダウンロードを開始できません: {error}"))?;

    let stderr = child.stderr.take();
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                let _ = line;
            }
        });
    }

    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("JoyTag モデルのダウンロード状態を確認できません: {error}"))?
        {
            if !status.success() {
                return Err(format!(
                    "JoyTag モデルのダウンロードが失敗しました: {status}"
                ));
            }
            break;
        }

        let downloaded_bytes = directory_size(&model_dir);
        let percent = if total_bytes > 0 {
            ((downloaded_bytes as f64 / total_bytes as f64) * 100.0).clamp(0.0, 99.0)
        } else {
            0.0
        };
        update_auto_tag_install_progress(app, |progress| {
            progress.downloaded_bytes = downloaded_bytes;
            progress.percent = percent;
            progress.message = format!(
                "モデルをダウンロードしています... {} / {}",
                format_bytes(downloaded_bytes),
                format_bytes(total_bytes)
            );
        });

        thread::sleep(Duration::from_secs(1));
    }

    update_auto_tag_install_progress(app, |progress| {
        progress.downloaded_bytes = total_bytes;
        progress.percent = 100.0;
    });
    Ok(())
}

fn run_auto_tag_install_task(
    app: AppHandle,
    mut settings: AppSettings,
    metadata: AutoTagInstallMetadata,
) -> Result<(), String> {
    update_auto_tag_install_progress(&app, |progress| {
        progress.phase = String::from("repository");
        progress.message = String::from("自動タグのコードを準備しています...");
    });

    let repo_dir = PathBuf::from(&settings.auto_tag_repo_dir);
    let model_dir = PathBuf::from(&settings.auto_tag_model_dir);
    if let Some(parent) = repo_dir.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("AutoTag の保存先を作成できません: {error}"))?;
    }
    fs::create_dir_all(&model_dir)
        .map_err(|error| format!("AutoTag モデルの保存先を作成できません: {error}"))?;

    if !repo_dir.join("Models.py").exists() {
        if repo_dir.exists() {
            return Err(String::from(
                "自動タグのコード保存先に JoyTag が見つかりません。空のフォルダを選ぶか、別の保存先を指定してください。",
            ));
        }
        let mut clone_command = Command::new("git");
        clone_command
            .arg("clone")
            .arg("--depth")
            .arg("1")
            .arg("https://github.com/fpgaminer/joytag.git")
            .arg(&repo_dir);
        run_command(clone_command, "JoyTag コードの取得")?;
    }

    update_auto_tag_install_progress(&app, |progress| {
        progress.phase = String::from("model");
        progress.total_bytes = metadata.download_bytes;
        progress.message = format!(
            "モデルをダウンロードしています... 0 MB / {}",
            metadata.download_size
        );
    });
    download_auto_tag_model_with_progress(&app, &settings, metadata.download_bytes)?;

    update_auto_tag_install_progress(&app, |progress| {
        progress.phase = String::from("environment");
        progress.message = String::from("自動タグの実行環境を準備しています...");
    });

    let requirements = auto_tag_bridge_root(&app).join("requirements-server.txt");
    let mut dependency_command = uv_command(&app);
    dependency_command
        .arg("run")
        .arg("--no-project")
        .arg("--with-requirements")
        .arg(requirements)
        .arg("--with")
        .arg("huggingface_hub")
        .arg("python")
        .arg("-c")
        .arg("import flask, torch, torchvision, huggingface_hub\nprint('AutoTag ready')\n");
    run_command(dependency_command, "AutoTag 実行環境の準備")?;

    settings.auto_tag_enabled = true;
    write_settings(&app, &settings)?;
    update_auto_tag_install_progress(&app, |progress| {
        progress.running = false;
        progress.completed = true;
        progress.phase = String::from("completed");
        progress.message =
            String::from("自動タグのインストールが完了しました。自動タグを有効にしました。");
        progress.percent = 100.0;
        progress.error = None;
    });
    Ok(())
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    read_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let normalized = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn detect_ffmpeg(settings: AppSettings) -> Vec<FfmpegCandidate> {
    detect_ffmpeg_candidates(&normalize_settings(settings))
}

#[tauri::command]
fn autotag_status(
    app: AppHandle,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AutoTagStatus, String> {
    let settings = read_settings(&app)?;
    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    Ok(auto_tag_status_from(&app, &mut sidecar, &settings))
}

#[tauri::command]
fn autotag_install_metadata(
    app: AppHandle,
    settings: AppSettings,
) -> Result<AutoTagInstallMetadata, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    auto_tag_install_metadata_for_settings(&app, &settings)
}

#[tauri::command]
fn autotag_install_progress(
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AutoTagInstallProgress, String> {
    let sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    Ok(sidecar.auto_tag_install.clone())
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

    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    if sidecar.child.is_some() {
        return status_from(&mut sidecar, &settings);
    }
    terminate_listeners_on_port(settings.port, &[]);

    let server_root = resource_or_repo_path(&app, "server", "apps/server");
    let server_entry = server_root.join("dist/entry.node.mjs");
    if !server_entry.exists() {
        return Err(String::from(
            "Caramel Board の起動に必要なファイルが見つかりません。先にアプリをビルドしてください。",
        ));
    }

    ensure_parent(Path::new(&settings.db_path))?;
    fs::create_dir_all(&settings.library_path)
        .map_err(|error| format!("ライブラリディレクトリを作成できません: {error}"))?;

    let client_dist = resource_or_repo_path(&app, "client/dist", "apps/client/dist");
    let mut command = node_command(&app);
    command
        .arg(server_entry)
        .current_dir(&server_root)
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
        .env("STATIC_ROOT", client_dist)
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
        .env("CARAMEL_BASIC_AUTH_PASSWORD", &settings.basic_auth_password)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(ffmpeg_path) = effective_ffmpeg_path(&settings) {
        command.env("FFMPEG_PATH", &ffmpeg_path);
        if let Some(ffprobe_path) = ffprobe_path_for_ffmpeg(&ffmpeg_path) {
            command.env("FFPROBE_PATH", ffprobe_path);
        }
    }

    let child = command
        .spawn()
        .map_err(|error| format!("Caramel Board を起動できません: {error}"))?;
    sidecar.child = Some(child);
    sidecar.settings = Some(settings.clone());
    sidecar.started_at = Some(now_epoch_seconds());

    if let Err(error) = start_auto_tag_if_enabled(&app, &mut sidecar, &settings) {
        eprintln!("AutoTag start skipped: {error}");
    }

    status_from(&mut sidecar, &settings)
}

#[tauri::command]
fn stop_sidecar(
    app: AppHandle,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<SidecarStatus, String> {
    let settings = read_settings(&app)?;
    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;

    if let Some(mut child) = sidecar.child.take() {
        child
            .kill()
            .map_err(|error| format!("Caramel Board を停止できません: {error}"))?;
        let _ = child.wait();
    }
    terminate_listeners_on_port(settings.port, &[]);
    stop_auto_tag(&mut sidecar, &settings);
    sidecar.started_at = None;
    status_from(&mut sidecar, &settings)
}

#[tauri::command]
fn prepare_autotag(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AutoTagStatus, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() || sidecar.auto_tag_child.is_some() {
            return Err(String::from(
                "AutoTag の準備は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    write_settings(&app, &settings)?;
    prepare_auto_tag_for_settings(&app, &settings)?;

    let mut sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    Ok(auto_tag_status_from(&app, &mut sidecar, &settings))
}

#[tauri::command]
fn start_autotag_install(
    app: AppHandle,
    settings: AppSettings,
    metadata: AutoTagInstallMetadata,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AutoTagInstallProgress, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    {
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() || sidecar.auto_tag_child.is_some() {
            return Err(String::from(
                "自動タグのインストールは Caramel Board を停止してから実行してください。",
            ));
        }
        if sidecar.auto_tag_install.running {
            return Ok(sidecar.auto_tag_install.clone());
        }
        sidecar.auto_tag_install = AutoTagInstallProgress {
            running: true,
            completed: false,
            phase: String::from("starting"),
            message: String::from("自動タグのインストールを開始しています..."),
            downloaded_bytes: 0,
            total_bytes: metadata.download_bytes,
            percent: 0.0,
            error: None,
        };
    }

    write_settings(&app, &settings)?;
    let app_for_task = app.clone();
    thread::spawn(move || {
        if let Err(error) = run_auto_tag_install_task(app_for_task.clone(), settings, metadata) {
            update_auto_tag_install_progress(&app_for_task, |progress| {
                progress.running = false;
                progress.completed = false;
                progress.phase = String::from("error");
                progress.message = error.clone();
                progress.error = Some(error);
            });
        }
    });

    let sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    Ok(sidecar.auto_tag_install.clone())
}

#[tauri::command]
fn import_database(
    app: AppHandle,
    source_path: String,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AppSettings, String> {
    let settings = read_settings(&app)?;
    let sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    if sidecar.child.is_some() {
        return Err(String::from(
            "DB import は Caramel Board を停止してから実行してください。",
        ));
    }

    let target = PathBuf::from(&settings.db_path);
    ensure_parent(&target)?;
    fs::copy(source_path, target).map_err(|error| format!("DBをインポートできません: {error}"))?;
    Ok(settings)
}

#[tauri::command]
fn export_database(app: AppHandle, target_path: String) -> Result<(), String> {
    let settings = read_settings(&app)?;
    let source = PathBuf::from(&settings.db_path);
    if !source.exists() {
        return Err(String::from(
            "エクスポート対象のSQLite DBがまだ存在しません。",
        ));
    }

    let target = PathBuf::from(target_path);
    ensure_parent(&target)?;
    fs::copy(source, target).map_err(|error| format!("DBをエクスポートできません: {error}"))?;
    Ok(())
}

#[tauri::command]
fn move_database(
    app: AppHandle,
    target_path: String,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app)?;
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "DBの移動は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    let source = PathBuf::from(&settings.db_path);
    let target = PathBuf::from(target_path);
    move_file_path(&source, &target)?;
    settings.db_path = target.to_string_lossy().into_owned();
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn move_library(
    app: AppHandle,
    target_path: String,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app)?;
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "ライブラリの移動は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    let source = PathBuf::from(&settings.library_path);
    let target = PathBuf::from(target_path);
    move_directory_path(&source, &target)?;
    settings.library_path = target.to_string_lossy().into_owned();
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn detect_docker_source(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<DockerSourceDetection, String> {
    let settings = normalize_settings(settings);
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "旧Docker版の検出は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    detect_docker_source_for_settings(&app, &settings)
}

#[tauri::command]
fn migrate_from_docker(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<MigrationResult, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "Docker版からの移行は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    write_settings(&app, &settings)?;
    ensure_parent(Path::new(&settings.db_path))?;
    let detected = detect_docker_source_for_settings(&app, &settings)?;
    if !detected.available {
        return Err(format!(
            "旧Docker版に接続できません。旧Docker版を起動してから再実行してください。\n{}",
            detected.message
        ));
    }

    let root = resource_or_repo_path(&app, "server", "apps/server");
    let migration_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("一時ディレクトリを解決できません: {error}"))?
        .join("docker-migrations");
    fs::create_dir_all(&migration_root)
        .map_err(|error| format!("一時ディレクトリを作成できません: {error}"))?;
    let export_dir = migration_root.join(format!("export-{}", now_epoch_seconds()));

    let mut export_command = node_command(&app);
    export_command
        .arg(root.join("scripts/export-standalone.mjs"))
        .arg(format!("--out={}", export_dir.to_string_lossy()))
        .arg("--force")
        .current_dir(&root)
        .env("DATABASE_URL", &detected.database_url);

    if !detected.storage_root.trim().is_empty() {
        export_command.arg(format!("--storage-root={}", detected.storage_root));
    }
    if !settings.docker_dataset_id.trim().is_empty() {
        export_command.arg(format!("--dataset={}", settings.docker_dataset_id.trim()));
    }
    if settings.docker_verify_files {
        export_command.arg("--verify-files");
    }

    let export_output = run_command(export_command, "Docker版DB export")?;

    let mut import_command = node_command(&app);
    import_command
        .arg(root.join("scripts/import-standalone-sqlite.mjs"))
        .arg(format!("--input={}", export_dir.to_string_lossy()))
        .arg(format!("--db={}", settings.db_path))
        .arg("--force")
        .current_dir(&root);

    if !settings.library_path.trim().is_empty() {
        import_command.arg(format!("--storage-root={}", settings.library_path));
    }
    if settings.docker_verify_files {
        import_command.arg("--verify-files");
    }

    let import_output = run_command(import_command, "SQLite import")?;

    Ok(MigrationResult {
        export_dir: export_dir.to_string_lossy().into_owned(),
        db_path: settings.db_path,
        stdout: format!("{export_output}\n{import_output}"),
    })
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

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn handle_tray_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "show_settings" => show_settings_window(app),
        "quit" => {
            stop_sidecar_on_exit(app);
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg(target_os = "windows")]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show_settings", "Settings")
        .separator()
        .text("quit", "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Caramel Board")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_tray_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_settings_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn setup_tray(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(ManagedSidecar::default()))
        .setup(setup_tray)
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
            migrate_from_docker
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
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
