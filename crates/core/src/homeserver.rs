//! Which software a homeserver runs, asked of the server itself (never a third party) through
//! the federation version endpoint.

use std::time::Duration;

#[cfg(not(target_arch = "wasm32"))]
use std::net::IpAddr;

use serde::Serialize;
use serde_json::Value;

use crate::{
    net::{read_limited, with_timeout},
    MudrixClient, Result,
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
/// How long resolving a server name may take before it isn't contacted
#[cfg(not(target_arch = "wasm32"))]
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(3);
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

/// The port this probe may contact: the HTTPS default or the federation port.
#[cfg(not(target_arch = "wasm32"))]
fn probe_port(port: Option<&str>) -> Option<u16> {
    match port {
        None | Some("443") => Some(443),
        Some("8448") => Some(8448),
        Some(_) => None,
    }
}

/// Whether an address resolved from a public-looking name belongs to a network this probe must
/// not touch: loopback, private, link-local, unspecified, and the cloud metadata address.
#[cfg(not(target_arch = "wasm32"))]
fn is_private_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_broadcast()
                || ip.octets() == [169, 254, 169, 254]
        }
        IpAddr::V6(ip) => {
            // A mapped IPv4 address (`::ffff:127.0.0.1`) is as local as the IPv4 one
            if let Some(ip) = ip.to_ipv4_mapped() {
                return is_private_address(IpAddr::V4(ip));
            }
            let first = ip.segments()[0];
            ip.is_loopback()
                || ip.is_unspecified()
                // link-local fe80::/10 and unique-local fc00::/7
                || (first & 0xffc0) == 0xfe80
                || (first & 0xfe00) == 0xfc00
        }
    }
}

/// [`is_public_server_name`], and on native targets the name must resolve only to public
/// addresses: a public-looking name such as `127.0.0.1.nip.io` can point into the local network.
/// A browser resolves names itself and refuses private hosts there, so it keeps the name-only
/// check.
async fn is_public_server_host(server_name: &str) -> bool {
    if !is_public_server_name(server_name) {
        return false;
    }
    #[cfg(target_arch = "wasm32")]
    {
        true
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let (host, port) = split_port(server_name);
        let Some(port) = probe_port(port) else {
            return false;
        };
        let Some(addresses) =
            with_timeout(tokio::net::lookup_host((host, port)), RESOLVE_TIMEOUT).await
        else {
            return false;
        };
        let Ok(addresses) = addresses else {
            return false;
        };
        let mut any = false;
        for address in addresses {
            any = true;
            if is_private_address(address.ip()) {
                return false;
            }
        }
        // A name that resolves to nothing can't be contacted
        any
    }
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
    if !is_public_server_host(server_name).await {
        return None;
    }
    let well_known = fetch_json(&format!("https://{server_name}/.well-known/matrix/server")).await;
    let delegated = well_known
        .as_ref()
        .and_then(|w| w.get("m.server"))
        .and_then(Value::as_str);
    for host in candidates(server_name, delegated) {
        if !is_public_server_host(&host).await {
            continue;
        }
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

impl MudrixClient {
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

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn private_addresses_are_never_probed() {
        use std::net::{Ipv4Addr, Ipv6Addr};

        for bad in [
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V4(Ipv4Addr::new(10, 1, 2, 3)),
            IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1)),
            IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1)),
            IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254)),
            IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            IpAddr::V4(Ipv4Addr::BROADCAST),
            IpAddr::V6(Ipv6Addr::LOCALHOST),
            IpAddr::V6(Ipv6Addr::UNSPECIFIED),
        ] {
            assert!(is_private_address(bad), "{bad}");
        }
        for bad in ["fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"] {
            let address: IpAddr = bad.parse().unwrap();
            assert!(is_private_address(address), "{address}");
        }
        for ok in ["1.1.1.1", "2606:4700:4700::1111"] {
            let address: IpAddr = ok.parse().unwrap();
            assert!(!is_private_address(address), "{address}");
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn only_the_https_and_federation_ports_are_probed() {
        assert_eq!(probe_port(None), Some(443));
        assert_eq!(probe_port(Some("443")), Some(443));
        assert_eq!(probe_port(Some("8448")), Some(8448));
        assert_eq!(probe_port(Some("8008")), None);
        assert_eq!(probe_port(Some("9000")), None);
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
