//! The `img://` scheme: remote photos and logos, cached on disk.
//!
//! The web side writes `img://localhost/<encodeURIComponent(url)>` (see `platform.img`).
//! This handler decodes the original URL and, if it is https on an allowed host:
//! 1. serves `<app cache folder>/img/<sha256(url)>` if that file exists;
//! 2. else downloads it (rustls), saves it there and serves it;
//! 3. else (offline, or the server said no) answers 404, so the page shows its fallback.
//!
//! Every answer carries `Access-Control-Allow-Origin: *` and the image's Content-Type, so
//! images can be drawn on a canvas with `crossOrigin = "anonymous"` and saved as a picture.

use std::sync::OnceLock;
use std::time::Duration;

use percent_encoding::percent_decode_str;
use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::http::{Method, Request, Response, StatusCode, header};
use tauri::{AppHandle, Manager, Runtime, UriSchemeResponder};

use crate::store::write_atomic;

/// The only hosts the app fetches images from.
pub const HOSTS: [&str; 5] = [
    "a.espncdn.com",
    "raw.githubusercontent.com",
    "github.com",
    "objects.githubusercontent.com",
    "upload.wikimedia.org",
];

/// Biggest image the app will download and cache.
const MAX_BYTES: usize = 15 * 1024 * 1024;

/// Images never run scripts, even if someone opens one as a page.
const IMAGE_CSP: &str = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

/// Entry point for the async scheme: answers on Tauri's async runtime, off the main thread.
pub fn handle<R: Runtime>(
    app: AppHandle<R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    tauri::async_runtime::spawn(async move {
        let response = serve(&app, &request).await;
        responder.respond(response);
    });
}

async fn serve<R: Runtime>(app: &AppHandle<R>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let method = request.method();
    if method == Method::OPTIONS {
        return plain(StatusCode::NO_CONTENT, "");
    }
    if method != Method::GET && method != Method::HEAD {
        return plain(StatusCode::METHOD_NOT_ALLOWED, "only GET and HEAD");
    }
    let head = method == Method::HEAD;

    let Some(source) = source_url(request.uri().path()) else {
        return plain(StatusCode::BAD_REQUEST, "no image URL");
    };
    let Some(url) = allowed(&source) else {
        return plain(StatusCode::FORBIDDEN, "host not allowed");
    };
    let file = match app.path().app_cache_dir() {
        Ok(dir) => dir.join("img").join(cache_name(&source)),
        Err(e) => {
            eprintln!("img: no cache folder: {e}");
            return plain(StatusCode::INTERNAL_SERVER_ERROR, "no cache folder");
        }
    };

    if let Ok(bytes) = tokio::fs::read(&file).await {
        let kind = sniff(&bytes).unwrap_or("application/octet-stream");
        return image(kind, bytes, head);
    }

    match download(url).await {
        Ok((kind, bytes)) => {
            if let Err(e) = write_atomic(&file, &bytes).await {
                eprintln!("img: could not cache {source}: {e}");
            }
            image(&kind, bytes, head)
        }
        Err(why) => {
            eprintln!("img: {source}: {why}");
            plain(StatusCode::NOT_FOUND, "image not available offline")
        }
    }
}

/// `/https%3A%2F%2Fa.espncdn.com%2F...` -> `https://a.espncdn.com/...`
pub(crate) fn source_url(path: &str) -> Option<String> {
    let raw = path.strip_prefix('/').unwrap_or(path);
    if raw.is_empty() {
        return None;
    }
    let decoded = percent_decode_str(raw).decode_utf8().ok()?;
    Some(decoded.into_owned())
}

/// The parsed URL if it is plain https on one of [`HOSTS`] (no login, no odd port).
pub(crate) fn allowed(source: &str) -> Option<Url> {
    let url = Url::parse(source).ok()?;
    let ok = url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.host_str().is_some_and(|host| HOSTS.contains(&host));
    ok.then_some(url)
}

/// Cache file name: the hex SHA-256 of the original URL.
pub(crate) fn cache_name(source: &str) -> String {
    Sha256::digest(source.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // reqwest is built without a crypto provider; ring is the app's one.
            // `Err` only means one is installed already.
            let _ = rustls::crypto::ring::default_provider().install_default();
            let redirects = reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 {
                    attempt.error("too many redirects")
                } else if attempt.url().scheme() != "https" {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            });
            reqwest::Client::builder()
                .user_agent(concat!("MockDraft2027/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(30))
                .redirect(redirects)
                .build()
                .map_err(|e| eprintln!("img: no HTTP client: {e}"))
                .ok()
        })
        .as_ref()
}

/// Downloads an image. Returns its Content-Type (sniffed from the bytes, else the
/// server's `image/*` type) and the bytes. Anything that isn't an image is refused, so an
/// error page never lands in the cache.
async fn download(url: Url) -> Result<(String, Vec<u8>), String> {
    let client = client().ok_or("no HTTP client")?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("server answered {status}"));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err("image too big".into());
    }
    let declared = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| v.starts_with("image/"));

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("download cut off: {e}"))?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("image too big".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("empty answer".into());
    }

    let kind = sniff(&bytes)
        .map(str::to_string)
        .or(declared)
        .ok_or("not an image")?;
    Ok((kind, bytes))
}

/// Image type from the first bytes of the file.
pub(crate) fn sniff(bytes: &[u8]) -> Option<&'static str> {
    let at = |range: std::ops::Range<usize>| bytes.get(range);
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.starts_with(b"RIFF") && at(8..12) == Some(b"WEBP") {
        return Some("image/webp");
    }
    if at(4..8) == Some(b"ftyp") && matches!(at(8..12), Some(b"avif") | Some(b"avis")) {
        return Some("image/avif");
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some("image/x-icon");
    }
    if bytes.starts_with(b"BM") && bytes.len() > 26 {
        return Some("image/bmp");
    }
    if looks_like_svg(bytes) {
        return Some("image/svg+xml");
    }
    None
}

/// An SVG starts (after a byte-order mark and blank space) with `<svg`, an XML
/// declaration, a comment or an SVG doctype, and is not an HTML page.
fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(4096)];
    let text = String::from_utf8_lossy(head).to_ascii_lowercase();
    let text = text.trim_start_matches('\u{feff}').trim_start();
    let opens_right = ["<svg", "<?xml", "<!--", "<!doctype svg"]
        .iter()
        .any(|start| text.starts_with(start));
    opens_right && text.contains("<svg") && !text.contains("<html")
}

fn image(kind: &str, bytes: Vec<u8>, head: bool) -> Response<Vec<u8>> {
    let body = if head { Vec::new() } else { bytes };
    respond(StatusCode::OK, kind, body)
        .map(|mut response| {
            let headers = response.headers_mut();
            headers.insert(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("public, max-age=31536000, immutable"),
            );
            headers.insert(
                header::CONTENT_SECURITY_POLICY,
                header::HeaderValue::from_static(IMAGE_CSP),
            );
            response
        })
        .unwrap_or_else(|_| plain(StatusCode::INTERNAL_SERVER_ERROR, "bad image type"))
}

fn plain(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    let mut response = respond(
        status,
        "text/plain; charset=utf-8",
        message.as_bytes().to_vec(),
    )
    .unwrap_or_else(|_| Response::new(Vec::new()));
    // A miss while offline must not stick: try again next time.
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
}

fn respond(
    status: StatusCode,
    kind: &str,
    body: Vec<u8>,
) -> Result<Response<Vec<u8>>, tauri::http::Error> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, kind)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_the_original_url() {
        let path = "/https%3A%2F%2Fa.espncdn.com%2Fi%2Fheadshots%2Fcollege-football%2Fplayers%2Ffull%2F4870906.png%3Fw%3D350";
        assert_eq!(
            source_url(path).as_deref(),
            Some(
                "https://a.espncdn.com/i/headshots/college-football/players/full/4870906.png?w=350"
            )
        );
        assert_eq!(source_url("/"), None);
    }

    #[test]
    fn only_https_on_listed_hosts() {
        assert!(allowed("https://a.espncdn.com/i/teamlogos/ncaa/500/194.png").is_some());
        assert!(allowed("https://upload.wikimedia.org/x.svg").is_some());
        assert!(allowed("http://a.espncdn.com/x.png").is_none());
        assert!(allowed("https://evil.example/x.png").is_none());
        assert!(allowed("https://a.espncdn.com.evil.example/x.png").is_none());
        assert!(allowed("https://user:pw@a.espncdn.com/x.png").is_none());
        assert!(allowed("https://a.espncdn.com:8443/x.png").is_none());
        assert!(allowed("file:///etc/passwd").is_none());
        assert!(allowed("not a url").is_none());
    }

    #[test]
    fn cache_name_is_sha256_hex() {
        assert_eq!(
            cache_name("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sniffs_common_image_types() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(sniff(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff(b"GIF89a...."), Some("image/gif"));
        assert_eq!(sniff(b"\0\0\0\x1cftypavif...."), Some("image/avif"));
        assert_eq!(
            sniff(b"\xEF\xBB\xBF  <?xml version=\"1.0\"?><svg xmlns=\"x\"/>"),
            Some("image/svg+xml")
        );
        assert_eq!(
            sniff(b"<svg viewBox=\"0 0 1 1\"></svg>"),
            Some("image/svg+xml")
        );
        assert_eq!(sniff(b"<!DOCTYPE html><html><svg/></html>"), None);
        assert_eq!(sniff(b"404: Not Found"), None);
    }
}
