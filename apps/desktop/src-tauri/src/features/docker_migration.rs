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

fn docker_migration_log_message(phase: &str, line: &str) -> String {
    let clean = line.trim();
    let body = clean
        .strip_prefix("[standalone-export]")
        .or_else(|| clean.strip_prefix("[standalone-import]"))
        .map(str::trim)
        .unwrap_or(clean);

    if body.is_empty() {
        return match phase {
            "export" => String::from("旧Docker版からデータを書き出しています..."),
            "import" => String::from("SQLiteへデータを取り込んでいます..."),
            _ => String::from("移行を進めています..."),
        };
    }

    match phase {
        "export" => format!("旧Docker版から書き出し中: {body}"),
        "import" => format!("SQLiteへ取り込み中: {body}"),
        _ => body.to_string(),
    }
}

fn update_docker_migration_progress(
    app: &AppHandle,
    update: impl FnOnce(&mut DockerMigrationProgress),
) {
    let state = app.state::<Mutex<ManagedSidecar>>();
    let Ok(mut sidecar) = state.lock() else {
        return;
    };
    update(&mut sidecar.docker_migration);
}

#[tauri::command]
fn docker_migration_progress(
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<DockerMigrationProgress, String> {
    let sidecar = state
        .lock()
        .map_err(|_| String::from("移行状態を確認できません"))?;
    Ok(sidecar.docker_migration.clone())
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
    let asset_subdirectories = ["files", "assets", "thumbnails", "preview", "originals"];
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
        if name.parse::<u32>().is_ok()
            && asset_subdirectories
                .iter()
                .any(|directory| entry.path().join(directory).is_dir())
        {
            return true;
        }
    }
    false
}

fn docker_storage_content_root(source_root: &Path) -> PathBuf {
    if looks_like_docker_storage(source_root) {
        return source_root.to_path_buf();
    }
    let nested_library = source_root.join("library");
    if nested_library.is_dir() {
        return nested_library;
    }
    source_root.to_path_buf()
}

fn associated_sqlite_file_exists(db_path: &str) -> bool {
    Path::new(db_path).exists()
        || PathBuf::from(format!("{db_path}-wal")).exists()
        || PathBuf::from(format!("{db_path}-shm")).exists()
        || PathBuf::from(format!("{db_path}-journal")).exists()
}

fn clear_associated_sqlite_files(db_path: &str) -> Result<(), String> {
    for path in [
        PathBuf::from(db_path),
        PathBuf::from(format!("{db_path}-wal")),
        PathBuf::from(format!("{db_path}-shm")),
        PathBuf::from(format!("{db_path}-journal")),
    ] {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "移行先のSQLite DBを削除できません: {}: {error}",
                    path.to_string_lossy()
                )
            })?;
        }
    }
    Ok(())
}

fn clear_docker_migration_target(settings: &AppSettings) -> Result<(), String> {
    clear_associated_sqlite_files(&settings.db_path)
}

fn ensure_docker_migration_target_is_empty(settings: &AppSettings) -> Result<(), String> {
    if associated_sqlite_file_exists(&settings.db_path) {
        return Err(String::from(
            "移行先のSQLite DBが既に存在します。既存データを上書きしないため、空のデータストアを選択してください。",
        ));
    }

    Ok(())
}

fn resolve_docker_library_path(source_root: &Path) -> Result<PathBuf, String> {
    let source = docker_storage_content_root(source_root);
    if !source.is_dir() {
        return Err(format!(
            "旧Docker版のアセットフォルダが見つかりません: {}",
            source.to_string_lossy()
        ));
    }
    Ok(source)
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
fn start_docker_migration(
    app: AppHandle,
    settings: AppSettings,
    reset_target: Option<bool>,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<DockerMigrationProgress, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    {
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "Docker版からの移行は Caramel Board を停止してから実行してください。",
            ));
        }
        if sidecar.docker_migration.running {
            return Ok(sidecar.docker_migration.clone());
        }
        sidecar.docker_migration = DockerMigrationProgress {
            running: true,
            completed: false,
            phase: String::from("detecting"),
            message: String::from("旧Docker版に接続できるか確認しています..."),
            percent: 5.0,
            last_log: String::new(),
            export_dir: None,
            db_path: Some(settings.db_path.clone()),
            error: None,
        };
    }

    let app_for_task = app.clone();
    thread::spawn(move || {
        if let Err(error) =
            run_docker_migration_task(app_for_task.clone(), settings, reset_target.unwrap_or(false))
        {
            eprintln!("Docker migration failed:\n{error}");
            update_docker_migration_progress(&app_for_task, |progress| {
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
        .map_err(|_| String::from("移行状態を確認できません"))?;
    Ok(sidecar.docker_migration.clone())
}

fn run_docker_migration_task(
    app: AppHandle,
    mut settings: AppSettings,
    reset_target: bool,
) -> Result<MigrationResult, String> {
    ensure_parent(Path::new(&settings.db_path))?;
    let detected = detect_docker_source_for_settings(&app, &settings)?;
    if !detected.available {
        return Err(format!(
            "旧Docker版に接続できません。旧Docker版を起動してから再実行してください。\n{}",
            detected.message
        ));
    }
    let source_storage_root = if detected.storage_root.trim().is_empty() {
        settings.docker_storage_root.clone()
    } else {
        detected.storage_root.clone()
    };
    if source_storage_root.trim().is_empty() {
        return Err(String::from(
            "旧Docker版のアセットフォルダを確認できません。アセットフォルダを選択してから再実行してください。",
        ));
    }
    if !detected.storage_root.trim().is_empty() {
        settings.docker_storage_root = detected.storage_root.clone();
    }
    let source_library_path = resolve_docker_library_path(Path::new(&source_storage_root))?;
    let source_library_path_string = source_library_path.to_string_lossy().into_owned();
    settings.library_path = source_library_path_string.clone();
    settings.docker_storage_root = source_library_path_string.clone();
    if reset_target {
        clear_docker_migration_target(&settings)?;
    } else {
        ensure_docker_migration_target_is_empty(&settings)?;
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
    update_docker_migration_progress(&app, |progress| {
        progress.phase = String::from("export");
        progress.message = String::from("旧Docker版からデータを書き出しています...");
        progress.percent = 15.0;
        progress.export_dir = Some(export_dir.to_string_lossy().into_owned());
    });

    let mut export_command = node_command(&app);
    export_command
        .arg(child_process_path(
            root.join("scripts/export-standalone.mjs"),
        ))
        .arg(format!("--out={}", child_process_path_string(&export_dir)))
        .arg("--force")
        .current_dir(child_process_path(&root))
        .env("DATABASE_URL", &detected.database_url);

    export_command.arg(format!("--storage-root={}", source_library_path_string));
    if !settings.docker_dataset_id.trim().is_empty() {
        export_command.arg(format!("--dataset={}", settings.docker_dataset_id.trim()));
    }
    if settings.docker_verify_files {
        export_command.arg("--verify-files");
    }

    let export_progress_app = app.clone();
    let export_output = run_command_streaming(export_command, "Docker版DB export", move |line| {
        update_docker_migration_progress(&export_progress_app, |progress| {
            progress.phase = String::from("export");
            progress.message = docker_migration_log_message("export", line);
            progress.percent = 35.0;
            progress.last_log = line.to_string();
        });
    })?;

    update_docker_migration_progress(&app, |progress| {
        progress.phase = String::from("reuse-library");
        progress.message = String::from("既存のアセットフォルダをライブラリとして設定しています...");
        progress.percent = 50.0;
    });

    update_docker_migration_progress(&app, |progress| {
        progress.phase = String::from("import");
        progress.message = String::from("SQLiteへデータを取り込んでいます...");
        progress.percent = 55.0;
    });

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
        .current_dir(child_process_path(&root));

    import_command.arg(format!("--storage-root={}", settings.library_path));
    if settings.docker_verify_files {
        import_command.arg("--verify-files");
    }

    let import_progress_app = app.clone();
    let import_output = run_command_streaming(import_command, "SQLite import", move |line| {
        update_docker_migration_progress(&import_progress_app, |progress| {
            progress.phase = String::from("import");
            progress.message = docker_migration_log_message("import", line);
            progress.percent = 75.0;
            progress.last_log = line.to_string();
        });
    })?;

    update_docker_migration_progress(&app, |progress| {
        progress.phase = String::from("db-migration");
        progress.message = String::from("SQLite DB の更新を適用しています...");
        progress.percent = 90.0;
    });
    apply_standalone_migration_blocking(&app, settings.clone())?;

    write_settings(&app, &settings)?;

    update_docker_migration_progress(&app, |progress| {
        progress.running = false;
        progress.completed = true;
        progress.phase = String::from("completed");
        progress.message = String::from("Docker版からの移行が完了しました。");
        progress.percent = 100.0;
        progress.db_path = Some(settings.db_path.clone());
        progress.error = None;
    });

    Ok(MigrationResult {
        export_dir: export_dir.to_string_lossy().into_owned(),
        db_path: settings.db_path,
        stdout: format!("{export_output}\n{import_output}"),
    })
}
