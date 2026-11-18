//! New versions on GitHub: comparing versions, and finding the installer
//! among a release's files.

use serde_json::Value;

/// "v1.2.3" / "1.2.3-beta" → (1, 2, 3); None when it is not a version.
pub fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim().trim_start_matches(['v', 'V']).split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let major = parts.next()??;
    let minor = parts.next().unwrap_or(Some(0))?;
    let patch = parts.next().unwrap_or(Some(0))?;
    Some((major, minor, patch))
}

/// Whether `latest` is newer than `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    matches!((parse_version(latest), parse_version(current)), (Some(a), Some(b)) if a > b)
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub notes: String,
    /// The release's page.
    pub page: String,
    /// The Windows installer to download, when there is one.
    pub installer: Option<String>,
    pub installer_name: Option<String>,
}

/// GitHub's "latest release" answer.
pub fn parse_release(json: &str) -> Option<Release> {
    let v: Value = serde_json::from_str(json).ok()?;
    let tag = v.get("tag_name")?.as_str()?.to_string();
    parse_version(&tag)?;
    let assets = v.get("assets").and_then(Value::as_array).cloned().unwrap_or_default();
    // The NSIS installer ("…-setup.exe") first, an .msi otherwise.
    let pick = |pred: &dyn Fn(&str) -> bool| {
        assets.iter().find_map(|a| {
            let name = a.get("name")?.as_str()?;
            if !pred(&name.to_ascii_lowercase()) {
                return None;
            }
            Some((name.to_string(), a.get("browser_download_url")?.as_str()?.to_string()))
        })
    };
    let found = pick(&|n| n.ends_with("-setup.exe")).or_else(|| pick(&|n| n.ends_with(".exe"))).or_else(|| pick(&|n| n.ends_with(".msi")));
    Some(Release {
        version: tag.trim_start_matches(['v', 'V']).to_string(),
        notes: v.get("body").and_then(Value::as_str).unwrap_or("").chars().take(2000).collect(),
        page: v.get("html_url").and_then(Value::as_str).unwrap_or("").to_string(),
        installer: found.as_ref().map(|f| f.1.clone()).filter(|u| u.starts_with("https://")),
        installer_name: found.map(|f| f.0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("0.8"), Some((0, 8, 0)));
        assert_eq!(parse_version("2.0.0-beta.1"), Some((2, 0, 0)));
        assert_eq!(parse_version("latest"), None);
        assert!(is_newer("v0.9.0", "0.8.3"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(!is_newer("0.8.0", "0.8.0"));
        assert!(!is_newer("nope", "0.1.0"));
    }

    #[test]
    fn the_installer_of_a_release() {
        let json = r#"{"tag_name":"v0.9.0","html_url":"https://github.com/o/r/releases/tag/v0.9.0","body":"Novidades",
          "assets":[{"name":"Manga_0.9.0_x64_en-US.msi","browser_download_url":"https://x/a.msi"},
                    {"name":"Manga_0.9.0_x64-setup.exe","browser_download_url":"https://x/b.exe"}]}"#;
        let r = parse_release(json).unwrap();
        assert_eq!(r.version, "0.9.0");
        assert_eq!(r.installer.as_deref(), Some("https://x/b.exe"));
        assert_eq!(r.installer_name.as_deref(), Some("Manga_0.9.0_x64-setup.exe"));
        let none = parse_release(r#"{"tag_name":"v1.0.0","assets":[]}"#).unwrap();
        assert_eq!(none.installer, None);
        assert!(parse_release(r#"{"message":"Not Found"}"#).is_none());
    }
}
