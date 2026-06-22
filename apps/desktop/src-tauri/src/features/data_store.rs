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

fn clear_directory_contents(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if !path.is_dir() {
        return Err(String::from("選択された場所はフォルダではありません。"));
    }
    for entry in fs::read_dir(path)
        .map_err(|error| format!("データストアフォルダの中身を確認できません: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("データストア内の項目を確認できません: {error}"))?;
        let entry_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("データストア内の項目種別を確認できません: {error}"))?;
        if file_type.is_dir() && !file_type.is_symlink() {
            fs::remove_dir_all(&entry_path).map_err(|error| {
                format!(
                    "データストア内のフォルダを削除できません: {}: {error}",
                    entry_path.to_string_lossy()
                )
            })?;
        } else {
            fs::remove_file(&entry_path).map_err(|error| {
                format!(
                    "データストア内のファイルを削除できません: {}: {error}",
                    entry_path.to_string_lossy()
                )
            })?;
        }
    }
    Ok(())
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
fn inspect_data_store(path: String) -> Result<DataStoreInspection, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Ok(DataStoreInspection {
            path,
            exists: false,
            has_database: false,
            has_library: false,
            is_empty: true,
        });
    }
    if !root.is_dir() {
        return Err(String::from("選択された場所はフォルダではありません。"));
    }
    let has_database = root.join("caramel-board.sqlite").is_file();
    let library_dir = root.join("library");
    let has_library = library_dir.is_dir();
    let is_empty = directory_is_effectively_empty(&root)?;
    Ok(DataStoreInspection {
        path: root.to_string_lossy().into_owned(),
        exists: true,
        has_database,
        has_library,
        is_empty,
    })
}

fn directory_is_effectively_empty(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(true);
    }
    let entries =
        fs::read_dir(path).map_err(|error| format!("ディレクトリを確認できません: {error}"))?;
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(String::from) else {
            return Ok(false);
        };
        // Caramel Board が自分で作るファイルや OS の隠しファイルは「実質空」扱いにする
        if name == "settings.json"
            || name == "caramel-board.sqlite"
            || name == "caramel-board.sqlite-shm"
            || name == "caramel-board.sqlite-wal"
            || name == "caramel-board.sqlite-journal"
            || name == "library"
            || name == ".DS_Store"
            || name.starts_with("._")
        {
            continue;
        }
        return Ok(false);
    }
    Ok(true)
}

#[tauri::command]
fn apply_data_store(
    app: AppHandle,
    root_path: String,
    reset_existing: Option<bool>,
    setup_completed: Option<bool>,
    carry_existing_data: Option<bool>,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app)?;
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "データストアの設定は Caramel Board を停止してから実行してください。",
            ));
        }
    }

    let root = PathBuf::from(&root_path);
    let reset_existing = reset_existing.unwrap_or(false);
    let setup_completed = setup_completed.unwrap_or(true);
    let carry_existing_data = carry_existing_data.unwrap_or(true);

    if reset_existing && root.exists() {
        clear_directory_contents(&root)?;
    } else {
        fs::create_dir_all(&root)
            .map_err(|error| format!("データストアフォルダを作成できません: {error}"))?;
    }

    let new_db = root.join("caramel-board.sqlite");
    let new_library = root.join("library");

    let old_db = PathBuf::from(&settings.db_path);
    let old_library = PathBuf::from(&settings.library_path);

    // DB: 旧パスにファイルがあり、新パスが空ならコピー移動。新パスに既にあれば既存を採用。
    if carry_existing_data
        && !is_same_path(&old_db, &new_db)
        && old_db.is_file()
        && !new_db.exists()
    {
        move_file_path(&old_db, &new_db)?;
    } else if !new_db.exists() {
        ensure_parent(&new_db)?;
    }

    // Library: 同様に新パスが未存在 or 空のときだけ移動。
    let new_library_ready = new_library.is_dir() && !directory_is_empty(&new_library)?;
    if carry_existing_data
        && !is_same_path(&old_library, &new_library)
        && old_library.is_dir()
        && !new_library_ready
    {
        move_directory_path(&old_library, &new_library)?;
    } else {
        fs::create_dir_all(&new_library)
            .map_err(|error| format!("ライブラリフォルダを作成できません: {error}"))?;
    }

    settings.db_path = new_db.to_string_lossy().into_owned();
    settings.library_path = new_library.to_string_lossy().into_owned();
    settings.setup_completed = setup_completed;
    let normalized = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &normalized)?;
    apply_app_shell_settings(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn complete_setup(app: AppHandle) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app)?;
    settings.setup_completed = true;
    let normalized = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &normalized)?;
    apply_app_shell_settings(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn reset_setup(
    app: AppHandle,
    state: State<'_, Mutex<ManagedSidecar>>,
) -> Result<AppSettings, String> {
    {
        let sidecar = state
            .lock()
            .map_err(|_| String::from("Caramel Board の状態を確認できません"))?;
        if sidecar.child.is_some() {
            return Err(String::from(
                "セットアップのやり直しは Caramel Board を停止してから実行してください。",
            ));
        }
    }
    let mut settings = read_settings(&app)?;
    settings.setup_completed = false;
    let normalized = normalize_settings_for_app(&app, settings)?;
    write_settings(&app, &normalized)?;
    apply_app_shell_settings(&app, &normalized)?;
    Ok(normalized)
}
