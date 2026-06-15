const PYTORCH_CUDA_INDEX_URL: &str = "https://download.pytorch.org/whl/cu128";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AutoTagRuntimeMode {
    Cpu,
    Cuda,
}

impl AutoTagRuntimeMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Cuda => "cuda",
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
struct DockerStorageResolution {
    resolved: String,
    adjusted: bool,
    matched: bool,
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
