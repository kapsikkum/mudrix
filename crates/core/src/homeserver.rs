//! Which software a homeserver runs, asked of the server itself (never a third party) through
//! the federation version endpoint.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::{
    net::{read_limited, with_timeout},
    Result, WizardClient,
};

/// What `/_matrix/federation/v1/version` says a server runs
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct HomeserverSoftware {
    /// "Synapse", "Tuwunel", ...
    pub name: String,
    /// Empty when the server hides it
    pub version: String,
}

const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
const MAX_BODY: usize = 64 * 1024;
const MAX_FIELD_CHARS: usize = 64;
const PRIVATE_SUFFIXES: [&str; 8] = [
    ".local",
    ".localhost",
    ".internal",
    ".lan",
    ".home",
    ".test",
    ".invalid",
    ".example",
];

/// `host:port` with the port, if any, split off
fn split_port(server_name: &str) -> (&str, Option<&str>) {
    match server_name.rsplit_once(':') {
        Some((host, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => {
            (host, Some(port))
        }
        _ => (server_name, None),
    }
}

/// A public server name we are willing to contact. A user ID can carry any server name, so this
/// keeps a profile view from making the app probe localhost, private networks or raw IPs.
/// (A public name can still resolve to a private address; the browser build is protected by
/// the browser, a native build is not.)
pub(crate) fn is_public_server_name(server_name: &str) -> bool {
    let (host, port) = split_port(server_name);
    if let Some(port) = port {
        match port.parse::<u32>() {
            Ok(1..=65535) if port.len() <= 5 => {}
            _ => return false,
        }
    }
    if host.is_empty() || host.len() > 253 {
        return false;
    }
    let host = host.to_ascii_lowercase();
    let labels: Vec<&str> = host.split('.').collect();
    let valid_label = |label: &&str| {
        let bytes = label.as_bytes();
        let edge = |b: &u8| b.is_ascii_lowercase() || b.is_ascii_digit();
        !bytes.is_empty()
            && bytes.len() <= 63
            && bytes.first().is_some_and(edge)
            && bytes.last().is_some_and(edge)
            && bytes.iter().all(|b| edge(b) || *b == b'-')
    };
    if labels.len() < 2 || !labels.iter().all(valid_label) {
        return false;
    }
    let is_ipv4 = labels.len() == 4
        && labels
            .iter()
            .all(|l| !l.is_empty() && l.bytes().all(|b| b.is_ascii_digit()));
    !is_ipv4 && !PRIVATE_SUFFIXES.iter().any(|s| host.ends_with(s))
}

/// Where to ask, in order: the host `/.well-known/matrix/server` delegates to (8448 when it names
/// no port, then the name itself), then the server name and its 8448.
fn candidates(server_name: &str, delegated: Option<&str>) -> Vec<String> {
    let mut hosts = Vec::new();
    if let Some(delegated) = delegated.filter(|d| is_public_server_name(d)) {
        if split_port(delegated).1.is_some() {
            hosts.push(delegated.to_owned());
        } else {
            hosts.push(format!("{delegated}:8448"));
            hosts.push(delegated.to_owned());
        }
    }
    hosts.push(server_name.to_owned());
    hosts.push(format!("{}:8448", split_port(server_name).0));
    let mut seen = Vec::new();
    hosts.retain(|h| {
        let new = !seen.contains(h);
        seen.push(h.clone());
        new
    });
    hosts
}

fn clip(text: &str) -> String {
    text.trim().chars().take(MAX_FIELD_CHARS).collect()
}

fn parse_version_response(body: &Value) -> Option<HomeserverSoftware> {
    let server = body.get("server")?;
    let name = clip(server.get("name")?.as_str()?);
    if name.is_empty() {
        return None;
    }
    Some(HomeserverSoftware {
        name,
        version: server
            .get("version")
            .and_then(Value::as_str)
            .map(clip)
            .unwrap_or_default(),
    })
}

pub(crate) async fn fetch_json(url: &str) -> Option<Value> {
    #[cfg(not(target_arch = "wasm32"))]
    let builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    // The browser decides about redirects and cookies for a cross-site request
    #[cfg(target_arch = "wasm32")]
    let builder = reqwest::Client::builder();
    let client = builder.build().ok()?;
    let request = async {
        let response = client.get(url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let body = read_limited(response, MAX_BODY).await.ok()?;
        serde_json::from_slice::<Value>(&body).ok()
    };
    with_timeout(request, REQUEST_TIMEOUT).await.flatten()
}

/// How long `discover` waits for the software before it answers without it.
const DISCOVER_SOFTWARE_TIMEOUT: Duration = Duration::from_secs(3);

/// What `server_name` runs, for the sign-in screen: gives up sooner than [`lookup`].
pub(crate) async fn lookup_quickly(server_name: &str) -> Option<HomeserverSoftware> {
    with_timeout(lookup(server_name), DISCOVER_SOFTWARE_TIMEOUT)
        .await
        .flatten()
}

/// The server name in what someone typed (`matrix.org`, `https://matrix.org/`, `Matrix.org:8448`),
/// lowercase and without scheme, path and user info; `None` when nothing is left.
pub(crate) fn server_name_of(input: &str) -> Option<String> {
    let input = input.trim();
    let rest = input
        .split_once("://")
        .map_or(input, |(_, rest)| rest)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    let host = rest.rsplit_once('@').map_or(rest, |(_, host)| host);
    (!host.is_empty()).then(|| host.to_ascii_lowercase())
}

/// Asks the server what it runs. Servers that refuse cross-site requests (a browser build),
/// hide their version or are unreachable have no answer.
pub(crate) async fn lookup(server_name: &str) -> Option<HomeserverSoftware> {
    if !is_public_server_name(server_name) {
        return None;
    }
    let well_known = fetch_json(&format!("https://{server_name}/.well-known/matrix/server")).await;
    let delegated = well_known
        .as_ref()
        .and_then(|w| w.get("m.server"))
        .and_then(Value::as_str);
    for host in candidates(server_name, delegated) {
        let url = format!("https://{host}/_matrix/federation/v1/version");
        if let Some(software) = fetch_json(&url)
            .await
            .as_ref()
            .and_then(parse_version_response)
        {
            return Some(software);
        }
    }
    None
}

impl WizardClient {
    /// The software and version the server named `server_name` runs, from its federation
    /// version endpoint, or `None` when it can't be asked. A browser can only ask servers that
    /// allow cross-site requests; native apps can ask any public server.
    pub async fn homeserver_software(
        &self,
        server_name: &str,
    ) -> Result<Option<HomeserverSoftware>> {
        Ok(lookup(&server_name.trim().to_ascii_lowercase()).await)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn server_names_are_cut_out_of_what_was_typed() {
        assert_eq!(server_name_of("matrix.org").as_deref(), Some("matrix.org"));
        assert_eq!(
            server_name_of(" Matrix.ORG ").as_deref(),
            Some("matrix.org")
        );
        assert_eq!(
            server_name_of("https://chat.example.org:8448/path?x=1").as_deref(),
            Some("chat.example.org:8448")
        );
        assert_eq!(
            server_name_of("http://me@localhost:8008").as_deref(),
            Some("localhost:8008")
        );
        assert_eq!(server_name_of("  "), None);
        assert_eq!(server_name_of("https://"), None);
    }

    #[test]
    fn only_public_dns_names_are_contacted() {
        for ok in [
            "matrix.org",
            "Example.COM",
            "chat.example.org:8448",
            "a-b.c.de",
        ] {
            assert!(is_public_server_name(ok), "{ok}");
        }
        for bad in [
            "",
            "localhost",
            "localhost:8008",
            "192.168.1.5",
            "10.0.0.1:8448",
            "[::1]",
            "[::1]:8448",
            "nas.local",
            "server.internal",
            "foo.test",
            "matrix.org:0",
            "matrix.org:70000",
            "matrix.org:",
            "-bad.example.org",
            "bad-.example.org",
            "a..b.org",
            "user@matrix.org",
            "matrix.org/path",
            "matrix.org:80:80",
        ] {
            assert!(!is_public_server_name(bad), "{bad}");
        }
    }

    #[test]
    fn candidates_follow_the_delegation_then_the_name() {
        assert_eq!(
            candidates("example.org", None),
            ["example.org", "example.org:8448"]
        );
        assert_eq!(
            candidates("example.org", Some("matrix.example.org")),
            [
                "matrix.example.org:8448",
                "matrix.example.org",
                "example.org",
                "example.org:8448"
            ]
        );
        assert_eq!(
            candidates("example.org", Some("matrix.example.org:443")),
            ["matrix.example.org:443", "example.org", "example.org:8448"]
        );
        assert_eq!(
            candidates("example.org:8448", Some("localhost:8448")),
            ["example.org:8448"]
        );
        assert_eq!(
            candidates("example.org:9000", None),
            ["example.org:9000", "example.org:8448"]
        );
    }

    #[test]
    fn version_responses_are_trimmed_and_bounded() {
        assert_eq!(
            parse_version_response(
                &json!({ "server": { "name": " Synapse ", "version": "1.2.3 " } })
            ),
            Some(HomeserverSoftware {
                name: "Synapse".into(),
                version: "1.2.3".into()
            })
        );
        assert_eq!(
            parse_version_response(&json!({ "server": { "name": "Tuwunel" } })),
            Some(HomeserverSoftware {
                name: "Tuwunel".into(),
                version: String::new()
            })
        );
        assert_eq!(
            parse_version_response(&json!({ "server": { "name": "  " } })),
            None
        );
        assert_eq!(
            parse_version_response(&json!({ "server": { "name": 3 } })),
            None
        );
        assert_eq!(parse_version_response(&json!({})), None);
        let long = "x".repeat(200);
        let parsed = parse_version_response(&json!({ "server": { "name": long } })).unwrap();
        assert_eq!(parsed.name.chars().count(), MAX_FIELD_CHARS);
    }
}
