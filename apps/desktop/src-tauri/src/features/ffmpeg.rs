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
        let mut candidates = Vec::new();
        if let Some(app_data) = env::var_os("APPDATA") {
            candidates.push(
                PathBuf::from(app_data).join(r"Caramel Board\tools\ffmpeg\bin\ffmpeg.exe"),
            );
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data).join(r"Caramel Board\tools\ffmpeg\bin\ffmpeg.exe"),
            );
        }
        candidates.extend([
            PathBuf::from(r"C:\tools\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
        ]);
        candidates
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        vec![
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
        ]
    }
}

fn common_pdf_rasterizer_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![
            PathBuf::from("/opt/homebrew/bin/pdftocairo"),
            PathBuf::from("/usr/local/bin/pdftocairo"),
            PathBuf::from("/usr/bin/pdftocairo"),
        ]
    }
    #[cfg(target_os = "windows")]
    {
        let mut candidates = Vec::new();
        if let Some(app_data) = env::var_os("APPDATA") {
            let tools_root = PathBuf::from(app_data).join(r"Caramel Board\tools\poppler");
            candidates.push(tools_root.join(r"Library\bin\pdftocairo.exe"));
            candidates.push(tools_root.join(r"bin\pdftocairo.exe"));
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            let tools_root = PathBuf::from(local_app_data).join(r"Caramel Board\tools\poppler");
            candidates.push(tools_root.join(r"Library\bin\pdftocairo.exe"));
            candidates.push(tools_root.join(r"bin\pdftocairo.exe"));
        }
        candidates.extend([
            PathBuf::from(r"C:\msys64\mingw64\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\msys64\ucrt64\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\tools\poppler\Library\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\tools\poppler\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\poppler\Library\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\poppler\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\Program Files\poppler\Library\bin\pdftocairo.exe"),
            PathBuf::from(r"C:\Program Files\poppler\bin\pdftocairo.exe"),
        ]);
        candidates
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        vec![
            PathBuf::from("/usr/bin/pdftocairo"),
            PathBuf::from("/usr/local/bin/pdftocairo"),
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
    let version_output = hidden_command(path)
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
    let encoders_output = hidden_command(path)
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

fn pdf_rasterizer_label(path: &Path, source: &str) -> String {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| String::from("pdftocairo"));
    format!("{file_name} ({source})")
}

fn validate_pdf_rasterizer_candidate(path: &Path, source: &str) -> FfmpegCandidate {
    let path_text = display_path(path);
    let version_output = hidden_command(path).arg("-v").output();

    let Ok(version_output) = version_output else {
        return FfmpegCandidate {
            path: path_text,
            label: pdf_rasterizer_label(path, source),
            source: source.to_string(),
            valid: false,
            version: String::new(),
            details: String::from("実行できません"),
        };
    };

    if !version_output.status.success() {
        return FfmpegCandidate {
            path: path_text,
            label: pdf_rasterizer_label(path, source),
            source: source.to_string(),
            valid: false,
            version: String::new(),
            details: String::from("pdftocairo として検証できません"),
        };
    }

    let version_text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&version_output.stdout),
        String::from_utf8_lossy(&version_output.stderr)
    );
    let version = version_text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("pdftocairo")
        .trim()
        .to_string();

    FfmpegCandidate {
        path: path_text,
        label: pdf_rasterizer_label(path, source),
        source: source.to_string(),
        valid: true,
        version,
        details: String::from("PDF ページ変換対応"),
    }
}

fn detect_pdf_rasterizer_candidates(settings: &AppSettings) -> Vec<FfmpegCandidate> {
    let mut paths: Vec<(PathBuf, &str)> = Vec::new();
    if !settings.pdf_rasterizer_path.trim().is_empty() {
        paths.push((
            PathBuf::from(settings.pdf_rasterizer_path.trim()),
            "configured",
        ));
    }
    paths.extend(
        path_candidates("pdftocairo")
            .into_iter()
            .map(|path| (path, "PATH")),
    );
    paths.extend(
        common_pdf_rasterizer_candidates()
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
        candidates.push(validate_pdf_rasterizer_candidate(&path, source));
    }
    candidates
}

fn effective_pdf_rasterizer_path(settings: &AppSettings) -> Option<String> {
    if !settings.pdf_rasterizer_path.trim().is_empty() {
        return Some(settings.pdf_rasterizer_path.trim().to_string());
    }

    detect_pdf_rasterizer_candidates(settings)
        .into_iter()
        .find(|candidate| candidate.valid)
        .map(|candidate| candidate.path)
}

#[tauri::command]
fn detect_ffmpeg(settings: AppSettings) -> Vec<FfmpegCandidate> {
    detect_ffmpeg_candidates(&normalize_settings(settings))
}

#[tauri::command]
fn detect_pdf_rasterizer(settings: AppSettings) -> Vec<FfmpegCandidate> {
    detect_pdf_rasterizer_candidates(&normalize_settings(settings))
}
