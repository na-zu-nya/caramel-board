const PYTORCH_CUDA_INDEX_URL: &str = "https://download.pytorch.org/whl/cu128";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AutoTagRuntimeMode {
    Cpu,
    Cuda,
    Mps,
}

impl AutoTagRuntimeMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Cuda => "cuda",
            Self::Mps => "mps",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    db_path: String,
    library_path: String,
    #[serde(default)]
    setup_completed: bool,
    #[serde(default = "default_language")]
    language: String,
    port: u16,
    allow_external_network: bool,
    basic_auth_enabled: bool,
    basic_auth_username: String,
    basic_auth_password: String,
    #[serde(default)]
    auto_tag_enabled: bool,
    #[serde(default = "default_auto_tag_use_gpu")]
    auto_tag_use_gpu: bool,
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
    #[serde(default)]
    pdf_rasterizer_path: String,
    #[serde(default)]
    launch_on_startup: bool,
    #[serde(default = "default_resident_mode")]
    resident_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataStoreInspection {
    path: String,
    exists: bool,
    has_database: bool,
    has_library: bool,
    is_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarStatus {
    running: bool,
    url: String,
    pid: Option<u32>,
    started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StandaloneMigrationItem {
    id: String,
    title: String,
    checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StandaloneMigrationStatus {
    status: String,
    db_path: String,
    current_version: Option<String>,
    latest_version: Option<String>,
    applied_count: u64,
    pending: Vec<StandaloneMigrationItem>,
    legacy_baseline: bool,
    requires_backup: bool,
    backup_path: Option<String>,
    message: String,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StandaloneMigrationProgress {
    running: bool,
    completed: bool,
    phase: String,
    message: String,
    percent: f64,
    last_log: String,
    db_path: Option<String>,
    backup_path: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoTagStatus {
    enabled: bool,
    running: bool,
    starting: bool,
    reachable: bool,
    url: String,
    log_path: String,
    uv_installed: bool,
    repository_ready: bool,
    model_ready: bool,
    ready: bool,
    gpu_available: bool,
    gpu_preference_supported: bool,
    runtime_mode: String,
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

impl Default for StandaloneMigrationProgress {
    fn default() -> Self {
        Self {
            running: false,
            completed: false,
            phase: String::from("idle"),
            message: String::new(),
            percent: 0.0,
            last_log: String::new(),
            db_path: None,
            backup_path: None,
            error: None,
        }
    }
}

#[derive(Default)]
struct ManagedSidecar {
    child: Option<Child>,
    auto_tag_child: Option<Child>,
    auto_tag_install: AutoTagInstallProgress,
    standalone_migration: StandaloneMigrationProgress,
    settings: Option<AppSettings>,
    started_at: Option<u64>,
}
