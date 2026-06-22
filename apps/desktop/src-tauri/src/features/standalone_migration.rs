fn standalone_migration_root(app: &AppHandle) -> PathBuf {
    resource_or_repo_path(app, "server", "apps/server")
}

fn standalone_migration_script(app: &AppHandle) -> PathBuf {
    standalone_migration_root(app)
        .join("scripts")
        .join("migrate-standalone-sqlite.mjs")
}

fn parse_standalone_migration_status(raw: &str) -> Result<StandaloneMigrationStatus, String> {
    serde_json::from_str(raw.trim()).map_err(|error| {
        format!("マイグレーション状態の出力を読み取れません: {error}\n{raw}")
    })
}

fn standalone_migration_command(app: &AppHandle, settings: &AppSettings, mode: &str) -> Command {
    let root = standalone_migration_root(app);
    let script = standalone_migration_script(app);
    let mut command = node_command(app);
    command
        .arg(child_process_path(script))
        .arg(format!("--db={}", settings.db_path))
        .arg(format!("--mode={mode}"))
        .arg(format!("--app-version={}", env!("CARGO_PKG_VERSION")))
        .current_dir(child_process_path(root));
    command
}

fn standalone_migration_status_for_settings(
    app: &AppHandle,
    settings: &AppSettings,
) -> Result<StandaloneMigrationStatus, String> {
    let script = standalone_migration_script(app);
    if !script.exists() {
        return Err(String::from(
            "マイグレーションスクリプトが見つかりません。アプリを再ビルドしてください。",
        ));
    }

    let output = standalone_migration_command(app, settings, "status")
        .output()
        .map_err(|error| format!("マイグレーション状態を確認できません: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if !output.status.success() {
        return Err(format!(
            "マイグレーション状態の確認に失敗しました\nstatus: {}\n{}\n{}",
            output.status, stdout, stderr
        ));
    }
    parse_standalone_migration_status(&stdout)
}

#[tauri::command]
fn standalone_migration_status(
    app: AppHandle,
    settings: AppSettings,
) -> Result<StandaloneMigrationStatus, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    standalone_migration_status_for_settings(&app, &settings)
}

#[tauri::command]
fn standalone_migration_progress(
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<StandaloneMigrationProgress, String> {
    let sidecar = state
        .lock()
        .map_err(|_| String::from("マイグレーション状態を確認できません"))?;
    Ok(sidecar.standalone_migration.clone())
}

fn update_standalone_migration_progress<F>(app: &AppHandle, update: F)
where
    F: FnOnce(&mut StandaloneMigrationProgress),
{
    let state = app.state::<Mutex<ManagedSidecar>>();
    if let Ok(mut sidecar) = state.lock() {
        update(&mut sidecar.standalone_migration);
    };
}

fn update_standalone_migration_progress_from_line(app: &AppHandle, line: &str) {
    let parsed = serde_json::from_str::<serde_json::Value>(line).ok();
    update_standalone_migration_progress(app, |progress| {
        progress.last_log = line.to_string();
        if let Some(value) = parsed.as_ref() {
            if let Some(phase) = value.get("phase").and_then(serde_json::Value::as_str) {
                progress.phase = phase.to_string();
            }
            if let Some(message) = value.get("message").and_then(serde_json::Value::as_str) {
                progress.message = message.to_string();
            }
            if let Some(percent) = value.get("percent").and_then(serde_json::Value::as_f64) {
                progress.percent = percent;
            }
            if let Some(backup_path) = value.get("backupPath").and_then(serde_json::Value::as_str) {
                progress.backup_path = Some(backup_path.to_string());
            }
        } else {
            progress.message = line.to_string();
        }
    });
}

#[tauri::command]
fn start_standalone_migration(
    app: AppHandle,
    settings: AppSettings,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<StandaloneMigrationProgress, String> {
    let settings = normalize_settings_for_app(&app, settings)?;
    {
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "データベース更新は Caramel Board を停止してから実行してください。",
            ));
        }
        if sidecar.standalone_migration.running {
            return Ok(sidecar.standalone_migration.clone());
        }
        sidecar.standalone_migration = StandaloneMigrationProgress {
            running: true,
            completed: false,
            phase: String::from("starting"),
            message: String::from("データベース更新を開始しています..."),
            percent: 0.0,
            last_log: String::new(),
            db_path: Some(settings.db_path.clone()),
            backup_path: None,
            error: None,
        };
    }

    let app_for_task = app.clone();
    thread::spawn(move || {
        if let Err(error) = run_standalone_migration_task(app_for_task.clone(), settings) {
            eprintln!("Standalone SQLite migration failed:\n{error}");
            update_standalone_migration_progress(&app_for_task, |progress| {
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
        .map_err(|_| String::from("マイグレーション状態を確認できません"))?;
    Ok(sidecar.standalone_migration.clone())
}

fn run_standalone_migration_task(app: AppHandle, settings: AppSettings) -> Result<String, String> {
    ensure_parent(Path::new(&settings.db_path))?;
    let status = standalone_migration_status_for_settings(&app, &settings)?;
    if status.status == "history_mismatch" {
        return Err(status.error.unwrap_or(status.message));
    }
    if status.status == "ready" {
        update_standalone_migration_progress(&app, |progress| {
            progress.running = false;
            progress.completed = true;
            progress.phase = String::from("ready");
            progress.message = String::from("データベースは最新です。");
            progress.percent = 100.0;
            progress.error = None;
        });
        return Ok(String::new());
    }

    update_standalone_migration_progress(&app, |progress| {
        progress.phase = String::from("backup");
        progress.message = String::from("バックアップを作成しています...");
        progress.percent = 10.0;
    });

    let mut command = standalone_migration_command(&app, &settings, "apply");
    command.arg("--backup").arg("--json-lines");
    let progress_app = app.clone();
    let output = run_command_streaming(command, "SQLite マイグレーション", move |line| {
        update_standalone_migration_progress_from_line(&progress_app, line);
    })?;

    update_standalone_migration_progress(&app, |progress| {
        progress.running = false;
        progress.completed = true;
        progress.phase = String::from("completed");
        progress.message = String::from("データベース更新が完了しました。");
        progress.percent = 100.0;
        progress.error = None;
    });

    Ok(output)
}

fn apply_standalone_migration_blocking(
    app: &AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    {
        let state = app.state::<Mutex<ManagedSidecar>>();
        let mut sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "データベース更新は Caramel Board を停止してから実行してください。",
            ));
        }
        if sidecar.standalone_migration.running {
            return Err(String::from("データベース更新はすでに実行中です。"));
        }
        sidecar.standalone_migration = StandaloneMigrationProgress {
            running: true,
            completed: false,
            phase: String::from("starting"),
            message: String::from("データベース更新を開始しています..."),
            percent: 0.0,
            last_log: String::new(),
            db_path: Some(settings.db_path.clone()),
            backup_path: None,
            error: None,
        };
    }

    run_standalone_migration_task(app.clone(), settings)
        .map(|_| ())
        .map_err(|error| {
            update_standalone_migration_progress(app, |progress| {
                progress.running = false;
                progress.completed = false;
                progress.phase = String::from("error");
                progress.message = error.clone();
                progress.error = Some(error.clone());
            });
            error
        })
}
