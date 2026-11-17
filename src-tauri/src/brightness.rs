// The screen's brightness, for screens Windows can dim (a laptop's): through
// WMI, asked of PowerShell (no window). External monitors usually answer
// nothing, and the island hides the slider.

#[tauri::command]
pub async fn brightness_get() -> Option<u8> {
    let out = run("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness").await?;
    out.trim().parse().ok()
}

#[tauri::command]
pub async fn brightness_set(value: u8) -> bool {
    let v = value.min(100);
    run(&format!(
        "Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{Timeout=0;Brightness={v}}} | Out-Null; 'ok'"
    ))
    .await
    .is_some()
}

async fn run(script: &str) -> Option<String> {
    let mut cmd = tokio::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}
