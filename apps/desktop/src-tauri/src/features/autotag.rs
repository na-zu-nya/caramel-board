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

fn auto_tag_python_version() -> &'static str {
    "3.11"
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
    auto_tag_repository_marker(Path::new(&settings.auto_tag_repo_dir)).exists()
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
        if let Some(status) = child.try_wait().ok().flatten() {
            let _ = append_auto_tag_log(
                app,
                &format!("AutoTag child exited before status check completed: {status}"),
            );
            sidecar.auto_tag_child = None;
        }
    }

    let uv_installed = uv_available(app);
    let repository_ready = is_auto_tag_repository_ready(settings);
    let model_ready = is_auto_tag_model_ready(settings);
    let ready = uv_installed && repository_ready && model_ready;
    let process_running = sidecar.auto_tag_child.is_some();
    let reachable = process_running && http_health_ok(settings.auto_tag_port);
    let running = reachable;
    let starting = process_running && !reachable;
    let message = if running {
        String::from("自動タグサービスが起動しています。")
    } else if starting {
        format!(
            "自動タグサービスを起動中です。まだ {} に接続できません。",
            auto_tag_url(settings)
        )
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
        starting,
        reachable,
        url: auto_tag_url(settings),
        log_path: auto_tag_log_path(app)
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
        uv_installed,
        repository_ready,
        model_ready,
        ready,
        message,
    }
}

fn auto_tag_repository_marker(repo_dir: &Path) -> PathBuf {
    repo_dir.join("Models.py")
}

fn auto_tag_directory_is_empty(path: &Path) -> Result<bool, String> {
    let mut entries =
        fs::read_dir(path).map_err(|error| format!("AutoTag の保存先を確認できません: {error}"))?;
    Ok(entries.next().is_none())
}

fn is_managed_auto_tag_repo_dir(app: &AppHandle, repo_dir: &Path) -> Result<bool, String> {
    Ok(is_same_path(repo_dir, &auto_tag_root(app)?.join("joytag")))
}

fn reset_managed_auto_tag_repo_dir(app: &AppHandle, repo_dir: &Path) -> Result<bool, String> {
    if !is_managed_auto_tag_repo_dir(app, repo_dir)? || !repo_dir.exists() {
        return Ok(false);
    }
    let metadata = fs::symlink_metadata(repo_dir)
        .map_err(|error| format!("AutoTag の保存先を確認できません: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Ok(false);
    }
    fs::remove_dir_all(repo_dir)
        .map_err(|error| format!("不完全な AutoTag コード保存先を削除できません: {error}"))?;
    Ok(true)
}

fn ensure_auto_tag_repository(app: &AppHandle, repo_dir: &Path) -> Result<(), String> {
    if auto_tag_repository_marker(repo_dir).exists() {
        return Ok(());
    }

    if repo_dir.exists() {
        if !repo_dir.is_dir() {
            return Err(String::from(
                "自動タグのコード保存先はフォルダを指定してください。",
            ));
        }

        if repo_dir.join(".git").is_dir() {
            let mut fetch_command = hidden_command("git");
            fetch_command
                .arg("-C")
                .arg(repo_dir)
                .arg("fetch")
                .arg("--depth")
                .arg("1")
                .arg("origin")
                .arg("HEAD");
            run_command(fetch_command, "JoyTag コードの再取得")?;

            let mut checkout_command = hidden_command("git");
            checkout_command
                .arg("-C")
                .arg(repo_dir)
                .arg("checkout")
                .arg("--force")
                .arg("FETCH_HEAD");
            run_command(checkout_command, "JoyTag コードの復元")?;

            if auto_tag_repository_marker(repo_dir).exists() {
                return Ok(());
            }
            if !reset_managed_auto_tag_repo_dir(app, repo_dir)? {
                return Err(String::from(
                    "自動タグのコード保存先に JoyTag が見つかりません。空のフォルダを選ぶか、別の保存先を指定してください。",
                ));
            }
        } else if !auto_tag_directory_is_empty(repo_dir)? {
            if reset_managed_auto_tag_repo_dir(app, repo_dir)? {
                // The default app-managed JoyTag directory can be recreated safely.
            } else {
                return Err(String::from(
                    "自動タグのコード保存先に JoyTag が見つかりません。空のフォルダを選ぶか、別の保存先を指定してください。",
                ));
            }
        }
    }

    let mut clone_command = hidden_command("git");
    clone_command
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg("https://github.com/fpgaminer/joytag.git")
        .arg(repo_dir);
    run_command(clone_command, "JoyTag コードの取得")?;

    if auto_tag_repository_marker(repo_dir).exists() {
        Ok(())
    } else {
        Err(String::from(
            "JoyTag コードの取得は完了しましたが、必要なファイルが見つかりません。",
        ))
    }
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

fn auto_tag_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(auto_tag_root(app)?.join("autotag-service.log"))
}

fn append_auto_tag_log(app: &AppHandle, message: &str) -> Result<(), String> {
    let log_path = auto_tag_log_path(app)?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("AutoTag ログ保存先を作成できません: {error}"))?;
    }
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("AutoTag ログを開けません: {error}"))?;
    writeln!(log, "[{}] {}", now_epoch_seconds(), message)
        .map_err(|error| format!("AutoTag ログを書き込めません: {error}"))
}

fn write_auto_tag_log_header(
    app: &AppHandle,
    settings: &AppSettings,
    runtime_mode: AutoTagRuntimeMode,
    bridge_script: &Path,
) -> Result<(), String> {
    append_auto_tag_log(
        app,
        &format!(
            "\n=== AutoTag start {} ===\nport: {}\nruntime_mode: {}\npython: {}\nbridge: {}\nrepo: {}\nmodel: {}\nfiles_root: {}\n",
            now_epoch_seconds(),
            settings.auto_tag_port,
            runtime_mode.as_str(),
            auto_tag_python_version(),
            bridge_script.to_string_lossy(),
            settings.auto_tag_repo_dir,
            settings.auto_tag_model_dir,
            settings.library_path
        ),
    )
}

fn auto_tag_runtime_marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(auto_tag_root(app)?.join("runtime-mode.txt"))
}

fn read_auto_tag_runtime_mode(app: &AppHandle) -> AutoTagRuntimeMode {
    let Ok(path) = auto_tag_runtime_marker_path(app) else {
        return AutoTagRuntimeMode::Cpu;
    };
    match fs::read_to_string(path).map(|value| value.trim().to_ascii_lowercase()) {
        Ok(value) if value == AutoTagRuntimeMode::Cuda.as_str() => AutoTagRuntimeMode::Cuda,
        Ok(value) if value == AutoTagRuntimeMode::Mps.as_str() => AutoTagRuntimeMode::Mps,
        _ => AutoTagRuntimeMode::Cpu,
    }
}

fn write_auto_tag_runtime_mode(app: &AppHandle, mode: AutoTagRuntimeMode) -> Result<(), String> {
    let path = auto_tag_runtime_marker_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("AutoTag 設定の保存先を作成できません: {error}"))?;
    }
    fs::write(path, mode.as_str())
        .map_err(|error| format!("AutoTag 実行モードを保存できません: {error}"))
}

fn nvidia_gpu_available() -> bool {
    hidden_command("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader")
        .output()
        .map(|output| output.status.success() && !output.stdout.is_empty())
        .unwrap_or(false)
}

fn prefer_cuda_auto_tag() -> bool {
    env::var("CARAMEL_AUTOTAG_PREFER_CUDA")
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            normalized == "1" || normalized == "true" || normalized == "yes"
        })
        .unwrap_or(false)
}

fn auto_tag_candidate_runtime_modes() -> Vec<AutoTagRuntimeMode> {
    let mut attempts = Vec::new();
    #[cfg(target_os = "macos")]
    attempts.push(AutoTagRuntimeMode::Mps);
    if prefer_cuda_auto_tag() && nvidia_gpu_available() {
        attempts.push(AutoTagRuntimeMode::Cuda);
    }
    attempts.push(AutoTagRuntimeMode::Cpu);
    attempts.dedup();
    attempts
}

fn auto_tag_runtime_mode_label(mode: AutoTagRuntimeMode) -> &'static str {
    match mode {
        AutoTagRuntimeMode::Cpu => "CPU",
        AutoTagRuntimeMode::Cuda => "CUDA",
        AutoTagRuntimeMode::Mps => "MPS",
    }
}

fn auto_tag_dependency_command(app: &AppHandle, mode: AutoTagRuntimeMode) -> Command {
    let requirements = auto_tag_bridge_root(app).join("requirements-server.txt");
    let mut command = uv_command(app);
    command
        .arg("run")
        .arg("--no-project")
        .arg("--python")
        .arg(auto_tag_python_version());
    if mode == AutoTagRuntimeMode::Cuda {
        command
            .arg("--index")
            .arg(PYTORCH_CUDA_INDEX_URL)
            .arg("--index-strategy")
            .arg("unsafe-first-match");
    }
    command
        .arg("--with-requirements")
        .arg(child_process_path(&requirements));
    command
}

fn auto_tag_environment_check_script(mode: AutoTagRuntimeMode) -> String {
    format!(
        r#"
import flask
import huggingface_hub
import torch
import torchvision

cuda_available = torch.cuda.is_available()
mps_backend = getattr(torch.backends, "mps", None)
mps_available = bool(mps_backend and mps_backend.is_available())
requested = "{requested}"
print(f"AutoTag ready: torch={{torch.__version__}}, cuda_runtime={{torch.version.cuda}}, cuda_available={{cuda_available}}, mps_available={{mps_available}}, requested={{requested}}")
if requested == "cuda" and not cuda_available:
    raise SystemExit("CUDA PyTorch was requested but torch.cuda.is_available() is false")
if requested == "mps" and not mps_available:
    raise SystemExit("MPS PyTorch was requested but torch.backends.mps.is_available() is false")
"#,
        requested = mode.as_str()
    )
}

fn prepare_auto_tag_environment(app: &AppHandle) -> Result<String, String> {
    let mut failures = Vec::new();
    for mode in auto_tag_candidate_runtime_modes() {
        let mut command = auto_tag_dependency_command(app, mode);
        command
            .arg("--with")
            .arg("huggingface_hub")
            .arg("python")
            .arg("-c")
            .arg(auto_tag_environment_check_script(mode));

        match run_command(command, "AutoTag 実行環境の準備") {
            Ok(output) => {
                write_auto_tag_runtime_mode(app, mode)?;
                return Ok(format!(
                    "AutoTag runtime mode: {}\n{}",
                    mode.as_str(),
                    output
                ));
            }
            Err(error) => {
                failures.push(format!(
                    "{} mode failed:\n{error}",
                    auto_tag_runtime_mode_label(mode)
                ));
            }
        }
    }

    let details = failures.join("\n\n");
    eprintln!("AutoTag environment preparation failed:\n{details}");
    Err(auto_tag_environment_error_message(&details))
}

fn auto_tag_environment_error_message(details: &str) -> String {
    let lower = details.to_ascii_lowercase();
    if lower.contains("winerror 1114") || lower.contains("c10.dll") {
        return String::from(
            "AutoTag 実行環境を準備できませんでした。PyTorch の DLL を読み込めません。Microsoft Visual C++ 2015-2022 Redistributable を更新してから再試行してください。CUDA を使う場合は GPU ドライバーも更新してください。セットアップは「あとで設定する」で続行できます。",
        );
    }
    if lower.contains("no space left") || lower.contains("disk full") {
        return String::from(
            "AutoTag 実行環境を準備できませんでした。ディスク空き容量を確認してから再試行してください。セットアップは「あとで設定する」で続行できます。",
        );
    }
    if lower.contains("timed out")
        || lower.contains("connection")
        || lower.contains("network")
        || lower.contains("failed to download")
    {
        return String::from(
            "AutoTag 実行環境を準備できませんでした。ネットワーク接続を確認してから再試行してください。セットアップは「あとで設定する」で続行できます。",
        );
    }
    String::from(
        "AutoTag 実行環境を準備できませんでした。セットアップは「あとで設定する」で続行できます。必要であれば設定画面から再試行してください。",
    )
}

fn ensure_preferred_auto_tag_runtime_mode(app: &AppHandle) -> AutoTagRuntimeMode {
    let stored_mode = read_auto_tag_runtime_mode(app);

    #[cfg(target_os = "macos")]
    {
        if stored_mode == AutoTagRuntimeMode::Cpu {
            let mut command = auto_tag_dependency_command(app, AutoTagRuntimeMode::Mps);
            command
                .arg("--with")
                .arg("huggingface_hub")
                .arg("python")
                .arg("-c")
                .arg(auto_tag_environment_check_script(AutoTagRuntimeMode::Mps));

            match run_command(command, "AutoTag MPS 実行環境の確認") {
                Ok(output) => {
                    let _ = write_auto_tag_runtime_mode(app, AutoTagRuntimeMode::Mps);
                    let _ = append_auto_tag_log(
                        app,
                        &format!("AutoTag runtime upgraded to mps\n{output}"),
                    );
                    return AutoTagRuntimeMode::Mps;
                }
                Err(error) => {
                    let _ = append_auto_tag_log(
                        app,
                        &format!("AutoTag MPS check failed; keeping cpu\n{error}"),
                    );
                }
            }
        }
    }

    stored_mode
}

fn start_auto_tag_if_enabled(
    app: &AppHandle,
    sidecar: &mut ManagedSidecar,
    settings: &AppSettings,
) -> Result<(), String> {
    append_auto_tag_log(
        app,
        &format!(
            "AutoTag start check: enabled={}, existing_child={}",
            settings.auto_tag_enabled,
            sidecar.auto_tag_child.is_some()
        ),
    )?;

    if !settings.auto_tag_enabled {
        append_auto_tag_log(app, "AutoTag start skipped: auto_tag_enabled=false")?;
        return Ok(());
    }

    if sidecar.auto_tag_child.is_some() {
        append_auto_tag_log(app, "AutoTag start skipped: child process already exists")?;
        return Ok(());
    }

    terminate_listeners_on_port(settings.auto_tag_port, &[]);

    let status = auto_tag_status_from(app, sidecar, settings);
    if !status.ready {
        append_auto_tag_log(
            app,
            &format!(
                "AutoTag start blocked: ready=false, uv_installed={}, repository_ready={}, model_ready={}, message={}",
                status.uv_installed, status.repository_ready, status.model_ready, status.message
            ),
        )?;
        return Err(format!(
            "自動タグの準備が完了していません。設定の AutoTag から準備してください。\n{}",
            status.message
        ));
    }

    let bridge_root = auto_tag_bridge_root(app);
    let bridge_script = bridge_root.join("joytag_server.py");
    let runtime_mode = ensure_preferred_auto_tag_runtime_mode(app);
    write_auto_tag_log_header(app, settings, runtime_mode, &bridge_script)?;
    let log_path = auto_tag_log_path(app)?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("AutoTag ログ保存先を作成できません: {error}"))?;
    }
    let stdout = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("AutoTag ログを開けません: {error}"))?;
    let stderr = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("AutoTag ログを開けません: {error}"))?;
    let mut command = auto_tag_dependency_command(app, runtime_mode);
    command
        .arg("python")
        .arg(child_process_path(&bridge_script))
        .current_dir(&settings.auto_tag_repo_dir)
        .env("PORT", settings.auto_tag_port.to_string())
        .env("JOYTAG_REPO_DIR", &settings.auto_tag_repo_dir)
        .env("JOYTAG_MODEL_DIR", &settings.auto_tag_model_dir)
        .env("JOYTAG_FILES_ROOT", &settings.library_path)
        .env("JOYTAG_DEVICE", runtime_mode.as_str())
        .env("JOYTAG_THRESHOLD", settings.auto_tag_threshold.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let child = command
        .spawn()
        .map_err(|error| format!("自動タグサービスを起動できません: {error}"))?;
    append_auto_tag_log(
        app,
        &format!("AutoTag child spawned: pid={}", child.id()),
    )?;
    sidecar.auto_tag_child = Some(child);
    Ok(())
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
    ensure_auto_tag_repository(app, &repo_dir)?;

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
            .arg(child_process_path(&model_dir))
            .arg(patterns_json);
        logs.push(run_command(model_command, "JoyTag モデルの取得")?);
    }

    logs.push(prepare_auto_tag_environment(app)?);

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
        .arg(child_process_path(&model_dir))
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

    ensure_auto_tag_repository(&app, &repo_dir)?;

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

    prepare_auto_tag_environment(&app)?;

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
            let message = auto_tag_environment_error_message(&error);
            eprintln!("AutoTag install failed:\n{error}");
            update_auto_tag_install_progress(&app_for_task, |progress| {
                progress.running = false;
                progress.completed = false;
                progress.phase = String::from("error");
                progress.message = message.clone();
                progress.error = Some(message);
            });
        }
    });

    let sidecar = state
        .lock()
        .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
    Ok(sidecar.auto_tag_install.clone())
}
