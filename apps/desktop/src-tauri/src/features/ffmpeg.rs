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

#[tauri::command]
fn detect_ffmpeg(settings: AppSettings) -> Vec<FfmpegCandidate> {
    detect_ffmpeg_candidates(&normalize_settings(settings))
}
