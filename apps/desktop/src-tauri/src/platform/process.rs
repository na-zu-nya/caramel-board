#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new(program);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

#[cfg(target_os = "windows")]
fn child_process_path(path: impl AsRef<Path>) -> PathBuf {
    const VERBATIM_PREFIX: &str = "\\\\?\\";
    const VERBATIM_UNC_PREFIX: &str = "\\\\?\\UNC\\";

    let path = path.as_ref();
    let raw = path.as_os_str().to_string_lossy();
    if let Some(stripped) = raw.strip_prefix(VERBATIM_UNC_PREFIX) {
        PathBuf::from(format!("\\\\{stripped}"))
    } else if let Some(stripped) = raw.strip_prefix(VERBATIM_PREFIX) {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(target_os = "windows"))]
fn child_process_path(path: impl AsRef<Path>) -> PathBuf {
    path.as_ref().to_path_buf()
}

fn child_process_path_string(path: impl AsRef<Path>) -> String {
    child_process_path(path).to_string_lossy().into_owned()
}

fn listener_pids(port: u16) -> Vec<u32> {
    let output = hidden_command("lsof")
        .arg(format!("-tiTCP:{port}"))
        .arg("-sTCP:LISTEN")
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

fn process_exists(pid: u32) -> bool {
    hidden_command("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn terminate_pid(pid: u32) {
    if pid == std::process::id() {
        return;
    }

    let _ = hidden_command("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status();
    thread::sleep(Duration::from_millis(300));
    if process_exists(pid) {
        let _ = hidden_command("kill")
            .arg("-KILL")
            .arg(pid.to_string())
            .status();
    }
}

fn terminate_listeners_on_port(port: u16, protected_pids: &[u32]) {
    for pid in listener_pids(port) {
        if protected_pids.contains(&pid) {
            continue;
        }
        terminate_pid(pid);
    }
}


fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("親ディレクトリを作成できません: {error}"))?;
    }
    Ok(())
}

fn run_command(mut command: Command, label: &str) -> Result<String, String> {
    let output = command
        .output()
        .map_err(|error| format!("{label} を実行できません: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(format!(
            "{label} が失敗しました\nstatus: {}\n{}\n{}",
            output.status, stdout, stderr
        ));
    }

    Ok(format!("{stdout}{stderr}"))
}
