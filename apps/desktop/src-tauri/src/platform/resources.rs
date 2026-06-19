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
    let repo_path = repo_root().join(repo_relative.as_ref());
    // 開発ビルドでは target/debug に残った古いリソースコピーではなく、リポジトリの最新ビルドを使う
    if cfg!(debug_assertions) && repo_path.exists() {
        return repo_path;
    }
    packaged_resource_path(app, resource_relative).unwrap_or(repo_path)
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
    if cfg!(debug_assertions) {
        return hidden_command("node");
    }

    match bundled_node_path(app) {
        Some(node) => hidden_command(child_process_path(node)),
        None => hidden_command("node"),
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
        Some(uv) => hidden_command(child_process_path(uv)),
        None => hidden_command("uv"),
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
