fn detect_docker_source_for_settings(
    app: &AppHandle,
    settings: &AppSettings,
) -> Result<DockerSourceDetection, String> {
    let root = resource_or_repo_path(app, "server", "apps/server");
    let mut command = node_command(app);
    command
        .arg(child_process_path(
            root.join("scripts/detect-docker-source.mjs"),
        ))
        .current_dir(child_process_path(&root));

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

#[tauri::command]
fn resolve_docker_storage_root(path: String) -> Result<DockerStorageResolution, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Ok(DockerStorageResolution {
            resolved: path,
            adjusted: false,
            matched: false,
        });
    }

    let candidates = vec![
        root.clone(),
        root.join("assets"),
        root.join("data").join("assets"),
        root.join("data"),
        root.join("files"),
        root.join("library"),
    ];

    for candidate in candidates {
        if !candidate.is_dir() {
            continue;
        }
        if looks_like_docker_storage(&candidate) {
            let adjusted = !is_same_path(&candidate, &root);
            return Ok(DockerStorageResolution {
                resolved: candidate.to_string_lossy().into_owned(),
                adjusted,
                matched: true,
            });
        }
    }

    Ok(DockerStorageResolution {
        resolved: root.to_string_lossy().into_owned(),
        adjusted: false,
        matched: false,
    })
}

fn looks_like_docker_storage(path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.parse::<u32>().is_ok() && entry.path().join("files").is_dir() {
            return true;
        }
    }
    false
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
        .arg(child_process_path(
            root.join("scripts/export-standalone.mjs"),
        ))
        .arg(format!("--out={}", child_process_path_string(&export_dir)))
        .arg("--force")
        .current_dir(child_process_path(&root))
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
        .arg(child_process_path(
            root.join("scripts/import-standalone-sqlite.mjs"),
        ))
        .arg(format!(
            "--input={}",
            child_process_path_string(&export_dir)
        ))
        .arg(format!("--db={}", settings.db_path))
        .arg("--force")
        .current_dir(child_process_path(&root));

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
