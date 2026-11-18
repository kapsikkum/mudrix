//! Media downloads that report progress and can be cancelled, and reads of just the start of a
//! file. The SDK only returns a finished download, so these stream the body themselves from the
//! media endpoint and use the SDK (`MudrixClient::media`) when that isn't possible.

use std::{
    collections::{HashMap, VecDeque},
    io::Read,
    time::Duration,
};

use futures_util::{future::abortable, StreamExt};
use matrix_sdk::{
    ruma::{
        api::{client::authenticated_media::get_content, Metadata},
        events::room::{EncryptedFile, MediaSource},
        MxcUri,
    },
    Client,
};
use serde::Serialize;
use serde_json::Value;

use crate::{net::with_timeout, Error, MudrixClient, Result};

/// How much of a download has arrived, in bytes
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    /// The size of the file, when the server (or the caller's hint) says
    pub total: Option<u64>,
}

/// Running downloads by the token their app gave them
#[derive(Default)]
pub(crate) struct Downloads {
    running: HashMap<String, futures_util::future::AbortHandle>,
    /// Cancels that arrived before their download started
    early_cancels: VecDeque<String>,
}

const MAX_EARLY_CANCELS: usize = 32;
/// Never reserve more than this up front, whatever size the server claims
const MAX_PREALLOCATION: u64 = 32 * 1024 * 1024;
/// The hard ceiling on one media download, whatever the event or the server claims
pub(crate) const MAX_MEDIA_BYTES: u64 = 100 * 1024 * 1024;
/// Room above a declared size for encryption padding and servers that round sizes up
const DECLARED_SIZE_SLACK: u64 = 1024 * 1024;
/// The smallest per-request cap, so a missing or tiny declared size doesn't reject small files
const MIN_MEDIA_CAP: u64 = 10 * 1024 * 1024;
const MIN_PROGRESS_STEP: u64 = 64 * 1024;
/// How long a media request may take to answer, and its body may take in total
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(not(target_arch = "wasm32"))]
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// The most bytes one download may receive: the size the event declared plus slack, kept
/// within [`MIN_MEDIA_CAP`] and the [`MAX_MEDIA_BYTES`] hard ceiling.
pub(crate) fn media_cap(declared: Option<u64>) -> u64 {
    match declared {
        Some(size) => size
            .saturating_add(DECLARED_SIZE_SLACK)
            .clamp(MIN_MEDIA_CAP, MAX_MEDIA_BYTES),
        None => MAX_MEDIA_BYTES,
    }
}

/// The error for media that would take more than `limit` bytes
pub(crate) fn media_too_large(limit: u64) -> Error {
    Error::Sdk(format!(
        "media is larger than the {} MiB limit",
        limit / (1024 * 1024)
    ))
}

/// Decrypts `ciphertext`, reading at most `limit` bytes (less when the file is shorter).
/// `prefix` says the ciphertext may be only the start of a larger file: its hash can't be
/// checked against a partial ciphertext, so the decryptor must not be told to read to the end.
fn decrypt_media(
    ciphertext: Vec<u8>,
    file: EncryptedFile,
    limit: u64,
    prefix: bool,
) -> Result<Vec<u8>> {
    let mut cursor = std::io::Cursor::new(ciphertext);
    let mut reader = matrix_sdk_crypto::AttachmentDecryptor::new(&mut cursor, file.into())
        .map_err(|e| Error::Sdk(e.to_string()))?;
    let read_limit = if prefix {
        limit
    } else {
        limit.saturating_add(1)
    };
    let mut plain = Vec::with_capacity(limit.min(MAX_PREALLOCATION) as usize);
    reader
        .by_ref()
        .take(read_limit)
        .read_to_end(&mut plain)
        .map_err(|e| Error::Sdk(e.to_string()))?;
    if plain.len() as u64 > limit {
        return Err(media_too_large(limit));
    }
    Ok(plain)
}

/// Decides which chunks are worth reporting: about every percent, and not below 64 KB
struct Throttle {
    step: u64,
    next: u64,
}

impl Throttle {
    fn new(total: Option<u64>) -> Self {
        Throttle {
            step: (total.unwrap_or(0) / 100).max(MIN_PROGRESS_STEP),
            next: 0,
        }
    }

    fn due(&mut self, received: u64) -> bool {
        if received < self.next {
            return false;
        }
        self.next = received + self.step;
        true
    }
}

/// The path of a download on the homeserver, authenticated or the legacy open one
fn download_path(authenticated: bool, server: &str, media_id: &str) -> Vec<String> {
    let prefix: [&str; 4] = if authenticated {
        ["_matrix", "client", "v1", "media"]
    } else {
        ["_matrix", "media", "v3", ""]
    };
    prefix
        .iter()
        .filter(|s| !s.is_empty())
        .map(|s| (*s).to_owned())
        .chain([
            "download".to_owned(),
            server.to_owned(),
            media_id.to_owned(),
        ])
        .collect()
}

/// The `Range` header for the first `length` bytes
fn range_header(length: u64) -> String {
    format!("bytes=0-{}", length.saturating_sub(1))
}

impl MudrixClient {
    /// Downloads a message's media (decrypting it if needed), reporting how much has arrived.
    /// `token` is picked by the caller and unique per download; `cancel_media_download` with it
    /// ends the download with [`Error::Cancelled`]. `size_hint` (the size in the event) stands
    /// in for the total when the server doesn't send a length a browser may read.
    pub async fn download_media(
        &self,
        source: Value,
        size_hint: Option<u64>,
        token: &str,
        mut on_progress: impl FnMut(DownloadProgress),
    ) -> Result<Vec<u8>> {
        let (task, handle) = abortable(self.fetch_media(source, None, size_hint, &mut on_progress));
        {
            let mut downloads = self.downloads.lock().unwrap();
            if let Some(at) = downloads.early_cancels.iter().position(|t| t == token) {
                downloads.early_cancels.remove(at);
                return Err(Error::Cancelled);
            }
            downloads.running.insert(token.to_owned(), handle);
        }
        let result = task.await;
        self.downloads.lock().unwrap().running.remove(token);
        result.unwrap_or(Err(Error::Cancelled))
    }

    /// Stops the download that was started with `token`
    pub fn cancel_media_download(&self, token: &str) {
        let mut downloads = self.downloads.lock().unwrap();
        match downloads.running.remove(token) {
            Some(handle) => handle.abort(),
            None => {
                downloads.early_cancels.push_back(token.to_owned());
                if downloads.early_cancels.len() > MAX_EARLY_CANCELS {
                    downloads.early_cancels.pop_front();
                }
            }
        }
    }

    /// The first `length` bytes of a message's media (all of it when it is shorter). The fetch
    /// is ranged and only that prefix is read, encrypted or not, so a head of a large file stays
    /// cheap: an encrypted file's ciphertext prefix decrypts on its own, as AES-CTR counts its
    /// keystream from the start.
    pub async fn media_head(&self, source: Value, length: u64) -> Result<Vec<u8>> {
        if length == 0 {
            return Ok(Vec::new());
        }
        if length > MAX_MEDIA_BYTES {
            return Err(Error::Sdk(format!(
                "can't read {length} bytes of media at once; the limit is {MAX_MEDIA_BYTES}"
            )));
        }
        self.fetch_media(source, Some(length), None, &mut |_| {})
            .await
    }

    async fn fetch_media(
        &self,
        source: Value,
        head: Option<u64>,
        size_hint: Option<u64>,
        on_progress: &mut impl FnMut(DownloadProgress),
    ) -> Result<Vec<u8>> {
        let parsed: MediaSource = serde_json::from_value(source.clone())
            .map_err(|e| Error::InvalidId(format!("media source: {e}")))?;
        let (uri, file) = match &parsed {
            MediaSource::Plain(uri) => (uri.clone(), None),
            MediaSource::Encrypted(file) => (file.url.clone(), Some(file.clone())),
        };
        // The event's own size (plus slack) bounds the whole download; a head only ever reads
        // the range it asks for, whatever the file's full size is.
        let cap = media_cap(size_hint);
        let range = head;
        let Some(response) = open_download(self.sdk(), &uri, range).await else {
            let mut bytes = self.media(source, None).await?;
            if let Some(head) = head {
                bytes.truncate(head.min(bytes.len() as u64) as usize);
            }
            let size = bytes.len() as u64;
            on_progress(DownloadProgress {
                received: size,
                total: Some(size),
            });
            return Ok(bytes);
        };
        // A length the server already announces beyond the cap is refused before any body is
        // read. A ranged response may legitimately be longer than the prefix we will read.
        let announced = response.content_length();
        if range.is_none() && announced.is_some_and(|length| length > cap) {
            return Err(media_too_large(cap));
        }
        let total = if range.is_some() {
            None
        } else {
            announced.or(size_hint)
        };
        let mut body = Vec::with_capacity(total.unwrap_or(0).min(MAX_PREALLOCATION) as usize);
        let mut stream = Box::pin(response.bytes_stream());
        let mut throttle = Throttle::new(total);
        on_progress(DownloadProgress { received: 0, total });
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| Error::Sdk(e.to_string()))?;
            match range {
                Some(head) => {
                    let room = (head as usize).saturating_sub(body.len());
                    body.extend_from_slice(&chunk[..room.min(chunk.len())]);
                    if body.len() as u64 >= head {
                        break;
                    }
                }
                None => {
                    if body.len() as u64 + chunk.len() as u64 > cap {
                        return Err(media_too_large(cap));
                    }
                    body.extend_from_slice(&chunk);
                }
            }
            if throttle.due(body.len() as u64) {
                on_progress(DownloadProgress {
                    received: body.len() as u64,
                    total,
                });
            }
        }
        drop(stream);
        // A head decrypts only its prefix; the whole file is checked against its hash.
        let mut body = match file {
            Some(file) => decrypt_media(body, *file, head.unwrap_or(cap), head.is_some())?,
            None => body,
        };
        if let Some(head) = head {
            body.truncate(head as usize);
        }
        let size = body.len() as u64;
        on_progress(DownloadProgress {
            received: size,
            total: Some(size),
        });
        Ok(body)
    }
}

/// Starts the download of an `mxc://` file from the homeserver; `None` when it can't be started
/// this way (the caller then uses the SDK).
async fn open_download(
    client: &Client,
    uri: &MxcUri,
    range: Option<u64>,
) -> Option<reqwest::Response> {
    let (server, media_id) = uri.parts().ok()?;
    let versions = client.supported_versions().await.ok()?;
    let authenticated = get_content::v1::Request::PATH_BUILDER.is_supported(&versions);
    let mut url = client.homeserver();
    url.path_segments_mut()
        .ok()?
        .pop_if_empty()
        .extend(download_path(authenticated, server.as_str(), media_id));
    // Redirects could hand the access token to another host, and a request without a deadline
    // could hang forever; the timeout also covers reading the body.
    #[cfg(not(target_arch = "wasm32"))]
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .ok()?;
    // The browser decides about redirects for a fetch
    #[cfg(target_arch = "wasm32")]
    let http = reqwest::Client::builder().build().ok()?;
    for attempt in 0..2 {
        let mut request = http.get(url.clone());
        if authenticated {
            request = request.bearer_auth(client.access_token()?);
        }
        if let Some(length) = range {
            request = request.header(reqwest::header::RANGE, range_header(length));
        }
        let response = with_timeout(request.send(), REQUEST_TIMEOUT).await?.ok()?;
        if response.status().is_success() {
            return Some(response);
        }
        // An expired token: any request of the SDK's own refreshes it, then try again
        if attempt == 0 && response.status() == reqwest::StatusCode::UNAUTHORIZED {
            let _ = client.whoami().await;
            continue;
        }
        return None;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_prefixes_decrypt_without_the_whole_files_hash() {
        use matrix_sdk_crypto::AttachmentEncryptor;

        let plain = b"the start of a file that is much larger than this prefix".to_vec();
        let mut cursor = std::io::Cursor::new(plain.clone());
        let mut encryptor = AttachmentEncryptor::new(&mut cursor);
        let mut ciphertext = Vec::new();
        encryptor.read_to_end(&mut ciphertext).unwrap();
        let info = encryptor.finish();
        let file = EncryptedFile::new(
            "mxc://example.org/abc".into(),
            info.encryption_info,
            info.hashes,
        );

        // The ciphertext prefix a head request fetches decrypts on its own; the hash can't be
        // checked against a prefix, so it must not be (that would reject every head).
        let head = 16;
        let decrypted =
            decrypt_media(ciphertext[..head].to_vec(), file.clone(), head as u64, true).unwrap();
        assert_eq!(decrypted, plain[..head]);

        // A whole download is checked against the hash, and a tampered one is refused.
        let full = decrypt_media(
            ciphertext.clone(),
            file.clone(),
            ciphertext.len() as u64,
            false,
        )
        .unwrap();
        assert_eq!(full, plain);
        let mut tampered = ciphertext;
        tampered[0] ^= 1;
        assert!(decrypt_media(tampered, file, 1000, false).is_err());
    }

    #[test]
    fn download_caps_follow_the_declared_size_up_to_the_hard_ceiling() {
        assert_eq!(media_cap(None), MAX_MEDIA_BYTES);
        assert_eq!(media_cap(Some(0)), MIN_MEDIA_CAP);
        assert_eq!(media_cap(Some(5 * 1024 * 1024)), MIN_MEDIA_CAP);
        assert_eq!(media_cap(Some(50 * 1024 * 1024)), 51 * 1024 * 1024);
        assert_eq!(media_cap(Some(100 * 1024 * 1024)), MAX_MEDIA_BYTES);
        assert_eq!(media_cap(Some(u64::MAX)), MAX_MEDIA_BYTES);
    }

    #[test]
    fn progress_is_reported_about_every_percent() {
        let mut throttle = Throttle::new(Some(100_000_000));
        let due: Vec<u64> = (0..=100)
            .map(|i| i * 500_000)
            .filter(|n| throttle.due(*n))
            .collect();
        assert_eq!(due.len(), 51);
        assert_eq!(due[0], 0);
        assert_eq!(due[1], 1_000_000);
    }

    #[test]
    fn small_and_unknown_sizes_report_every_64_kb() {
        for total in [None, Some(1000)] {
            let mut throttle = Throttle::new(total);
            assert!(throttle.due(0));
            assert!(!throttle.due(16 * 1024));
            assert!(!throttle.due(65_535));
            assert!(throttle.due(65_536));
            assert!(!throttle.due(65_540));
        }
    }

    #[test]
    fn download_paths_follow_the_media_api_in_use() {
        assert_eq!(
            download_path(true, "example.org", "abc"),
            [
                "_matrix",
                "client",
                "v1",
                "media",
                "download",
                "example.org",
                "abc"
            ]
        );
        assert_eq!(
            download_path(false, "example.org", "abc"),
            ["_matrix", "media", "v3", "download", "example.org", "abc"]
        );
    }

    #[test]
    fn range_asks_for_the_first_bytes() {
        assert_eq!(range_header(65_536), "bytes=0-65535");
        assert_eq!(range_header(1), "bytes=0-0");
        assert_eq!(range_header(0), "bytes=0-0");
    }
}
