//! Link embed cards from embeds.now, so every app can show a rich card (post text, images, video)
//! for links to sites that don't allow embedding (X, Instagram, TikTok, Reddit, ...).
//!
//! `https://embeds.now/<host>/<path>` answers a bot with a page holding Open Graph tags and a
//! Discord Components V2 card as JSON. Everything in it is third-party data: it is reduced to the
//! small, plain [`LinkEmbedCard`] here, with every URL checked and every size capped, so apps
//! never see raw HTML or anything they would have to distrust.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use url::{Host, Url};

use crate::{
    net::{read_limited, with_timeout},
    Error, Result,
};

const EMBEDS_HOST: &str = "embeds.now";
const BOT_USER_AGENT: &str = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_BODY: usize = 256 * 1024;
const MAX_INPUT_URL: usize = 2000;
const MAX_MEDIA_URL: usize = 2048;
const MAX_BLOCKS: usize = 16;
const MAX_GALLERY: usize = 10;
const MAX_BUTTONS: usize = 5;
const MAX_TEXT: usize = 4000;
const MAX_DESCRIPTION: usize = 1000;
const MAX_LABEL: usize = 80;
const MAX_SERVICE: usize = 64;
const COMPONENT_SCRIPT_ID: &str = "discord:component-embed";

const PRIVATE_SUFFIXES: [&str; 9] = [
    ".local",
    ".internal",
    ".lan",
    ".home.arpa",
    ".localhost",
    ".localdomain",
    ".intranet",
    ".corp",
    ".private",
];

/// A link's embed card
#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LinkEmbedCard {
    /// The site's name ("X/Twitter", "Instagram")
    pub service: String,
    /// The link's canonical address, as the service reports it
    pub url: String,
    /// The card's accent color, `0xRRGGBB`
    pub accent: Option<u32>,
    pub blocks: Vec<LinkEmbedBlock>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LinkEmbedBlock {
    /// Text in Discord's markdown (`**bold**`, `[label](url)`, `-# small line`), with an optional
    /// small picture beside it (an avatar, a cover)
    Text {
        markdown: String,
        thumbnail: Option<LinkEmbedMedia>,
    },
    /// Pictures and videos, in order
    Gallery {
        items: Vec<LinkEmbedMedia>,
    },
    Separator,
    /// Link buttons
    Buttons {
        buttons: Vec<LinkEmbedButton>,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LinkEmbedMedia {
    /// An `https` address
    pub url: String,
    pub kind: LinkEmbedMediaKind,
    pub description: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum LinkEmbedMediaKind {
    Image,
    Video,
    Audio,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LinkEmbedButton {
    pub label: String,
    /// An `https` address
    pub url: String,
}

/// The embed card for a link, or `None` when the service has none (unsupported or unavailable
/// links, links that can't be sent to it, answers it gave without a card). Fails only when the
/// service couldn't be reached in time.
///
/// Works without a Matrix session. In the browser the request is subject to CORS and a page
/// can't pose as a bot, so it is expected to fail there; it never waits longer than 8 seconds.
pub async fn link_embed(url: String) -> Result<Option<LinkEmbedCard>> {
    let Some(link) = EmbedLink::new(&url) else {
        return Ok(None);
    };
    let Some(page) = fetch_page(&link.request).await? else {
        return Ok(None);
    };
    Ok(parse_page(&page, &link.canonical))
}

/// A link that may be sent to the service
#[derive(Debug, PartialEq)]
struct EmbedLink {
    /// The link without its fragment
    canonical: String,
    /// The service's address for it
    request: String,
}

impl EmbedLink {
    fn new(input: &str) -> Option<Self> {
        let input = input.trim();
        if input.len() > MAX_INPUT_URL {
            return None;
        }
        let mut url = Url::parse(input).ok()?;
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
        {
            return None;
        }
        let Some(Host::Domain(host)) = url.host() else {
            return None;
        };
        let host = host.to_ascii_lowercase();
        if !is_public_domain(&host) {
            return None;
        }
        url.set_fragment(None);
        let mut request = format!("https://{EMBEDS_HOST}/{host}{}", url.path());
        if let Some(query) = url.query() {
            request.push('?');
            request.push_str(query);
        }
        Some(EmbedLink {
            canonical: url.into(),
            request,
        })
    }
}

/// A DNS name on the public internet (not an address, `localhost` or a local-network name)
fn is_public_domain(host: &str) -> bool {
    if host.len() > 253 || !host.contains('.') {
        return false;
    }
    if PRIVATE_SUFFIXES
        .iter()
        .any(|suffix| host.ends_with(suffix) || host == &suffix[1..])
    {
        return false;
    }
    let mut labels = host.split('.').peekable();
    while let Some(label) = labels.next() {
        let valid = !label.is_empty()
            && label.len() <= 63
            && label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if !valid {
            return false;
        }
        // "1.2.3.4"-like names are addresses whatever the URL parser made of them
        if labels.peek().is_none() && label.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
    }
    true
}

/// The service's page for a link; `None` for everything but a plain HTML answer
async fn fetch_page(request_url: &str) -> Result<Option<String>> {
    // Redirects (the service's way of saying "no card") must not be followed; the browser decides
    // about those itself. No cookie store is enabled, and no `Referer` is sent.
    #[cfg(not(target_arch = "wasm32"))]
    let builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    #[cfg(target_arch = "wasm32")]
    let builder = reqwest::Client::builder();
    let client = builder
        .build()
        .map_err(|e| Error::Sdk(format!("link embed: {e}")))?;
    let request = async {
        let response = client
            .get(request_url)
            .header(reqwest::header::USER_AGENT, BOT_USER_AGENT)
            .header(reqwest::header::ACCEPT, "text/html")
            .send()
            .await
            .map_err(|e| Error::Sdk(format!("link embed: {e}")))?;
        if response.status() != reqwest::StatusCode::OK {
            return Ok(None);
        }
        let is_html = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                value
                    .trim_start()
                    .to_ascii_lowercase()
                    .starts_with("text/html")
            });
        if !is_html {
            return Ok(None);
        }
        let body = read_limited(response, MAX_BODY)
            .await
            .map_err(|e| Error::Sdk(format!("link embed: {e}")))?;
        Ok(Some(String::from_utf8_lossy(&body).into_owned()))
    };
    with_timeout(request, REQUEST_TIMEOUT)
        .await
        .unwrap_or_else(|| Err(Error::Sdk("link embed: timed out".into())))
}

fn parse_page(html: &str, link: &str) -> Option<LinkEmbedCard> {
    let lower = html.to_ascii_lowercase();
    let meta = Meta::scan(html, &lower);
    let service = meta
        .get("og:site_name")
        .map(|name| single_line(name, MAX_SERVICE))
        .filter(|name| !name.is_empty())
        .or_else(|| {
            let host = Url::parse(link).ok()?.host_str()?.to_owned();
            Some(host.strip_prefix("www.").unwrap_or(&host).to_owned())
        })?;
    let url = meta
        .get("og:url")
        .and_then(clean_url)
        .unwrap_or_else(|| link.to_owned());

    let component = script_json(html, &lower);
    let (accent, blocks) = match component.as_ref().and_then(parse_component) {
        Some(parsed) => parsed,
        None => (
            meta.get("theme-color").and_then(parse_hex_color),
            open_graph_blocks(&meta)?,
        ),
    };
    Some(LinkEmbedCard {
        service,
        url,
        accent,
        blocks,
    })
}

/// The card's accent and blocks; `None` when it has no block worth showing
fn parse_component(root: &Value) -> Option<(Option<u32>, Vec<LinkEmbedBlock>)> {
    let component = root.get("component")?;
    let accent = component
        .get("accent_color")
        .and_then(Value::as_u64)
        .filter(|color| *color <= 0xFF_FFFF)
        .map(|color| color as u32);
    let mut blocks = Vec::new();
    match component.get("components").and_then(Value::as_array) {
        Some(children) if component.get("type").and_then(Value::as_u64) == Some(17) => {
            for child in children {
                push_block(&mut blocks, parse_child(child));
            }
        }
        _ => push_block(&mut blocks, parse_child(component)),
    }
    while matches!(blocks.last(), Some(LinkEmbedBlock::Separator)) {
        blocks.pop();
    }
    blocks.truncate(MAX_BLOCKS);
    if blocks.is_empty() {
        return None;
    }
    Some((accent, blocks))
}

fn push_block(blocks: &mut Vec<LinkEmbedBlock>, block: Option<LinkEmbedBlock>) {
    match block {
        // A separator starts nothing and doubles nothing
        Some(LinkEmbedBlock::Separator)
            if blocks.is_empty() || matches!(blocks.last(), Some(LinkEmbedBlock::Separator)) => {}
        Some(block) => blocks.push(block),
        None => {}
    }
}

fn parse_child(child: &Value) -> Option<LinkEmbedBlock> {
    match child.get("type")?.as_u64()? {
        9 => {
            let markdown = join_texts(child.get("components"));
            if markdown.is_empty() {
                return None;
            }
            let thumbnail = child
                .get("accessory")
                .filter(|accessory| accessory.get("type").and_then(Value::as_u64) == Some(11))
                .and_then(parse_media);
            Some(LinkEmbedBlock::Text {
                markdown,
                thumbnail,
            })
        }
        10 => {
            let markdown = clean_text(child.get("content")?.as_str()?, MAX_TEXT);
            (!markdown.trim().is_empty()).then_some(LinkEmbedBlock::Text {
                markdown,
                thumbnail: None,
            })
        }
        12 => {
            let items: Vec<_> = child
                .get("items")?
                .as_array()?
                .iter()
                .filter_map(parse_media)
                .take(MAX_GALLERY)
                .collect();
            (!items.is_empty()).then_some(LinkEmbedBlock::Gallery { items })
        }
        14 => Some(LinkEmbedBlock::Separator),
        1 => {
            let buttons: Vec<_> = child
                .get("components")?
                .as_array()?
                .iter()
                .filter_map(parse_button)
                .take(MAX_BUTTONS)
                .collect();
            (!buttons.is_empty()).then_some(LinkEmbedBlock::Buttons { buttons })
        }
        _ => None,
    }
}

/// The text displays of a section, one per line
fn join_texts(components: Option<&Value>) -> String {
    let texts: Vec<&str> = components
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| part.get("type").and_then(Value::as_u64) == Some(10))
        .filter_map(|part| part.get("content")?.as_str())
        .collect();
    let joined = clean_text(&texts.join("\n"), MAX_TEXT);
    if joined.trim().is_empty() {
        String::new()
    } else {
        joined
    }
}

/// A gallery item or thumbnail: `{ "media": { "url" }, "description" }`
fn parse_media(item: &Value) -> Option<LinkEmbedMedia> {
    let url = clean_url(item.get("media")?.get("url")?.as_str()?)?;
    let description = item
        .get("description")
        .and_then(Value::as_str)
        .map(|text| single_line(text, MAX_DESCRIPTION))
        .filter(|text| !text.is_empty());
    Some(LinkEmbedMedia {
        kind: media_kind(&url),
        url,
        description,
    })
}

fn parse_button(button: &Value) -> Option<LinkEmbedButton> {
    if button.get("type")?.as_u64()? != 2 {
        return None;
    }
    let url = clean_url(button.get("url")?.as_str()?)?;
    let host = Url::parse(&url).ok()?.host_str()?.to_owned();
    if host == EMBEDS_HOST || host.ends_with(&format!(".{EMBEDS_HOST}")) {
        return None;
    }
    let label = single_line(button.get("label")?.as_str()?, MAX_LABEL);
    (!label.is_empty()).then_some(LinkEmbedButton { label, url })
}

/// Cards for pages that have Open Graph tags but no component card
fn open_graph_blocks(meta: &Meta) -> Option<Vec<LinkEmbedBlock>> {
    let title = meta
        .get("og:title")
        .map(|text| single_line(text, MAX_TEXT))
        .filter(|text| !text.is_empty());
    let description = meta
        .get("og:description")
        .map(|text| clean_text(text, MAX_TEXT))
        .filter(|text| !text.trim().is_empty());
    let mut blocks = Vec::new();
    let markdown = match (title, description) {
        (Some(title), Some(description)) => Some(format!("**{title}**\n{description}")),
        (Some(title), None) => Some(format!("**{title}**")),
        (None, Some(description)) => Some(description),
        (None, None) => None,
    };
    if let Some(markdown) = markdown {
        blocks.push(LinkEmbedBlock::Text {
            markdown: clean_text(&markdown, MAX_TEXT),
            thumbnail: None,
        });
    }
    let video = ["og:video:secure_url", "og:video", "og:video:url"]
        .into_iter()
        .find_map(|key| meta.get(key).and_then(clean_url));
    let media = match video {
        Some(url) => Some(LinkEmbedMedia {
            kind: media_kind(&url),
            url,
            description: None,
        }),
        None => ["og:image:secure_url", "og:image", "og:image:url"]
            .into_iter()
            .find_map(|key| meta.get(key).and_then(clean_url))
            .map(|url| LinkEmbedMedia {
                kind: LinkEmbedMediaKind::Image,
                url,
                description: meta
                    .get("og:image:alt")
                    .map(|text| single_line(text, MAX_DESCRIPTION))
                    .filter(|text| !text.is_empty()),
            }),
    };
    if let Some(media) = media {
        blocks.push(LinkEmbedBlock::Gallery { items: vec![media] });
    }
    (!blocks.is_empty()).then_some(blocks)
}

/// The kind of file a media URL points to, from its path's extension
fn media_kind(url: &str) -> LinkEmbedMediaKind {
    let extension = Url::parse(url)
        .ok()
        .and_then(|url| {
            let name = url.path().rsplit('/').next()?.to_ascii_lowercase();
            name.rsplit_once('.')
                .map(|(_, extension)| extension.to_owned())
        })
        .unwrap_or_default();
    match extension.as_str() {
        "mp4" | "m4v" | "webm" | "mov" => LinkEmbedMediaKind::Video,
        "mp3" | "m4a" | "aac" | "ogg" | "wav" | "opus" => LinkEmbedMediaKind::Audio,
        _ => LinkEmbedMediaKind::Image,
    }
}

/// An address an app may load or open: `https`, a public host, no credentials, not too long
fn clean_url(raw: impl AsRef<str>) -> Option<String> {
    let raw = raw.as_ref().trim();
    if raw.len() > MAX_MEDIA_URL {
        return None;
    }
    let url = Url::parse(raw).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let Some(Host::Domain(host)) = url.host() else {
        return None;
    };
    if !is_public_domain(host) {
        return None;
    }
    let url = String::from(url);
    (url.len() <= MAX_MEDIA_URL).then_some(url)
}

fn is_unsafe_char(c: char) -> bool {
    // Controls (but not the newline) and the characters that reorder text or hide it
    (c.is_control() && c != '\n')
        || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}

/// Text without control characters, cut to `limit` characters (the last one `…` when cut)
fn clean_text(text: &str, limit: usize) -> String {
    let mut out = String::new();
    for (count, c) in text.chars().filter(|c| !is_unsafe_char(*c)).enumerate() {
        if count == limit {
            out.pop();
            out.push('…');
            return out;
        }
        out.push(c);
    }
    out
}

/// Like [`clean_text`], on one line, whitespace collapsed
fn single_line(text: &str, limit: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    clean_text(&flat, limit).trim().to_owned()
}

fn parse_hex_color(value: impl AsRef<str>) -> Option<u32> {
    let hex = value.as_ref().trim().strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    u32::from_str_radix(hex, 16).ok()
}

/// The JSON of the page's `<script id="discord:component-embed">`
fn script_json(html: &str, lower: &str) -> Option<Value> {
    let mut from = 0;
    while let Some(found) = lower[from..].find("<script") {
        let start = from + found;
        let (attributes, body_start) = parse_tag(html, start + "<script".len())?;
        from = body_start;
        if !attributes
            .iter()
            .any(|(name, value)| name == "id" && value == COMPONENT_SCRIPT_ID)
        {
            continue;
        }
        let end = lower[body_start..].find("</script")?;
        return serde_json::from_str(&html[body_start..body_start + end]).ok();
    }
    None
}

/// The attributes of the tag whose name ended at `from`, and where the tag ends. Names are
/// lowercased; values are as written, with quotes removed.
fn parse_tag(html: &str, from: usize) -> Option<(Vec<(String, String)>, usize)> {
    let bytes = html.as_bytes();
    let mut attributes = Vec::new();
    let mut i = from;
    loop {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        if bytes.get(i)? == &b'>' {
            return Some((attributes, i + 1));
        }
        let name_start = i;
        while i < bytes.len()
            && !bytes[i].is_ascii_whitespace()
            && !matches!(bytes[i], b'=' | b'>' | b'/')
        {
            i += 1;
        }
        let name = html[name_start..i].to_ascii_lowercase();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let mut value = String::new();
        if bytes.get(i) == Some(&b'=') {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            match bytes.get(i)? {
                quote @ (b'"' | b'\'') => {
                    let start = i + 1;
                    let length = html[start..].find(*quote as char)?;
                    value = html[start..start + length].to_owned();
                    i = start + length + 1;
                }
                _ => {
                    let start = i;
                    while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                        i += 1;
                    }
                    value = html[start..i].to_owned();
                }
            }
        }
        if !name.is_empty() {
            attributes.push((name, value));
        }
    }
}

/// The `<meta>` tags of a page's head, keyed by `property` (or `name`)
struct Meta(Vec<(String, String)>);

impl Meta {
    fn scan(html: &str, lower: &str) -> Self {
        // Only the head: the component script comes after it, and its JSON isn't markup
        let head = lower.find("<script").unwrap_or(lower.len());
        let head = lower[..head].find("</head").unwrap_or(head);
        let mut tags = Vec::new();
        let mut from = 0;
        while from < head {
            let Some(found) = lower[from..head].find("<meta") else {
                break;
            };
            let start = from + found + "<meta".len();
            let Some((attributes, end)) = parse_tag(html, start) else {
                break;
            };
            from = end;
            let key = attributes
                .iter()
                .find(|(name, _)| name == "property")
                .or_else(|| attributes.iter().find(|(name, _)| name == "name"));
            let content = attributes.iter().find(|(name, _)| name == "content");
            if let (Some((_, key)), Some((_, content))) = (key, content) {
                tags.push((key.to_ascii_lowercase(), decode_entities(content)));
            }
        }
        Meta(tags)
    }

    /// The first non-empty value of `key`
    fn get(&self, key: &str) -> Option<&String> {
        self.0
            .iter()
            .find(|(name, value)| name == key && !value.trim().is_empty())
            .map(|(_, value)| value)
    }
}

/// Attribute values as text: the five named entities and numeric ones
fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let decoded = rest.find(';').filter(|end| *end <= 10).and_then(|end| {
            let entity = &rest[1..end];
            let c = match entity {
                "amp" => '&',
                "lt" => '<',
                "gt" => '>',
                "quot" => '"',
                "apos" => '\'',
                _ => {
                    let number = entity.strip_prefix('#')?;
                    let code = match number.strip_prefix(['x', 'X']) {
                        Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                        None => number.parse().ok()?,
                    };
                    char::from_u32(code)?
                }
            };
            Some((c, end + 1))
        });
        match decoded {
            Some((c, length)) => {
                out.push(c);
                rest = &rest[length..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const X_PAGE: &str = include_str!("link_embed/fixtures/x.html");
    const X: &str = include_str!("link_embed/fixtures/x.json");
    const INSTAGRAM: &str = include_str!("link_embed/fixtures/instagram.json");
    const REDDIT: &str = include_str!("link_embed/fixtures/reddit.json");
    const MASTODON: &str = include_str!("link_embed/fixtures/mastodon.json");
    const SPOTIFY: &str = include_str!("link_embed/fixtures/spotify.json");
    const SPOTIFY_TRACK: &str = include_str!("link_embed/fixtures/spotifyTrack.json");
    const UNSUPPORTED: &str = include_str!("link_embed/fixtures/unsupported.html");

    const LINK: &str = "https://example.com/post/1";

    fn page(json: &str) -> String {
        format!(
            r#"<!DOCTYPE html><html><head><meta property="og:site_name" content="Example"/><script id="discord:component-embed" type="application/json">{json}</script></head></html>"#
        )
    }

    fn card(json: &str) -> LinkEmbedCard {
        parse_page(&page(json), LINK).expect("a card")
    }

    fn component(children: &str) -> String {
        format!(r#"{{"component":{{"type":17,"accent_color":255,"components":[{children}]}}}}"#)
    }

    fn texts(card: &LinkEmbedCard) -> Vec<&str> {
        card.blocks
            .iter()
            .filter_map(|block| match block {
                LinkEmbedBlock::Text { markdown, .. } => Some(markdown.as_str()),
                _ => None,
            })
            .collect()
    }

    fn gallery(card: &LinkEmbedCard) -> &[LinkEmbedMedia] {
        card.blocks
            .iter()
            .find_map(|block| match block {
                LinkEmbedBlock::Gallery { items } => Some(items.as_slice()),
                _ => None,
            })
            .unwrap_or_default()
    }

    fn buttons(card: &LinkEmbedCard) -> Vec<&LinkEmbedButton> {
        card.blocks
            .iter()
            .flat_map(|block| match block {
                LinkEmbedBlock::Buttons { buttons } => buttons.iter().collect(),
                _ => Vec::new(),
            })
            .collect()
    }

    #[test]
    fn x_post_has_text_with_avatar_video_and_button() {
        let card = parse_page(X_PAGE, "https://x.com/fallback").expect("a card");
        assert_eq!(card.service, "X/Twitter");
        assert_eq!(
            card.url,
            "https://x.com/JesseCohenInv/status/2120962452137431338"
        );
        assert_eq!(card.accent, Some(1_940_464));
        assert_eq!(card.blocks.len(), 3);
        let LinkEmbedBlock::Text {
            markdown,
            thumbnail: Some(avatar),
        } = &card.blocks[0]
        else {
            panic!("text with an avatar first: {:?}", card.blocks[0]);
        };
        assert!(markdown
            .starts_with("**[Jesse Cohen (@JesseCohenInv)](https://x.com/JesseCohenInv)**\n"));
        assert!(markdown.contains("\n-# 12 November 2026\n"));
        assert_eq!(avatar.kind, LinkEmbedMediaKind::Image);
        assert_eq!(avatar.description.as_deref(), Some("Jesse Cohen"));
        let video = &gallery(&card)[0];
        assert_eq!(video.kind, LinkEmbedMediaKind::Video);
        assert!(video.url.starts_with("https://video.twimg.com/"));
        assert_eq!(
            buttons(&card)[0],
            &LinkEmbedButton {
                label: "Open on X".into(),
                url: "https://x.com/JesseCohenInv/status/2120962452137431338".into()
            }
        );
        // The same card from the bare JSON
        assert_eq!(card.blocks, self::card(X).blocks);
    }

    #[test]
    fn instagram_keeps_bare_text_and_video_and_drops_the_donate_button() {
        let card = card(INSTAGRAM);
        assert_eq!(texts(&card), ["**@mellythesciencegeek**"]);
        assert_eq!(gallery(&card)[0].kind, LinkEmbedMediaKind::Video);
        assert_eq!(
            gallery(&card)[0].url,
            "https://embeds.now/media/ig/Df7kllksYsl/1.mp4"
        );
        assert!(matches!(card.blocks[2], LinkEmbedBlock::Separator));
        let buttons = buttons(&card);
        assert_eq!(buttons.len(), 1);
        assert_eq!(buttons[0].label, "Open on Instagram");
        assert_eq!(card.accent, Some(15_436_852));
    }

    #[test]
    fn reddit_gallery_has_all_ten_images() {
        let card = card(REDDIT);
        let items = gallery(&card);
        assert_eq!(items.len(), 10);
        assert!(items
            .iter()
            .all(|item| item.kind == LinkEmbedMediaKind::Image
                && item.url.starts_with("https://i.redd.it/")));
        assert_eq!(buttons(&card).len(), 1);
    }

    #[test]
    fn mastodon_has_an_avatar_and_a_video() {
        let card = card(MASTODON);
        assert!(matches!(
            &card.blocks[0],
            LinkEmbedBlock::Text {
                thumbnail: Some(avatar),
                ..
            } if avatar.description.as_deref() == Some("Mastodon (@Mastodon)")
        ));
        assert_eq!(gallery(&card)[0].kind, LinkEmbedMediaKind::Video);
        assert_eq!(
            buttons(&card)[0].url,
            "https://mastodon.social/@Mastodon/116839714185151652"
        );
    }

    #[test]
    fn spotify_album_keeps_both_buttons() {
        let card = card(SPOTIFY);
        assert!(matches!(
            &card.blocks[0],
            LinkEmbedBlock::Text {
                thumbnail: Some(cover),
                ..
            } if cover.description.as_deref() == Some("Everybody Scream Tour Live cover")
        ));
        let labels: Vec<_> = buttons(&card).iter().map(|b| b.label.clone()).collect();
        assert_eq!(labels, ["Open on Spotify", "See artist"]);
        let track = self::card(SPOTIFY_TRACK);
        assert_eq!(track.blocks.len(), 3);
        assert_eq!(gallery(&track)[0].kind, LinkEmbedMediaKind::Video);
    }

    #[test]
    fn redirect_pages_and_pages_without_a_card_are_none() {
        assert_eq!(parse_page(UNSUPPORTED, LINK), None);
        assert_eq!(parse_page("", LINK), None);
        assert_eq!(
            parse_page("<html><head><title>Hi</title></head></html>", LINK),
            None
        );
        // Broken and empty cards
        assert_eq!(parse_page(&page("{not json"), LINK), None);
        assert_eq!(parse_page(&page("{}"), LINK), None);
        assert_eq!(
            parse_page(&page(&component(r#"{"type":99},{"type":14}"#)), LINK),
            None
        );
    }

    #[test]
    fn open_graph_tags_make_a_card_without_the_component() {
        let html = r##"<html><head>
            <meta property="og:site_name" content="Blog &amp; Co"/>
            <meta property="og:url" content="https://blog.example/p?a=1&amp;b=2"/>
            <meta property="og:title" content="A &quot;title&quot;"/>
            <meta property="og:description" content='Line one -> two'/>
            <meta name="theme-color" content="#1d9bf0"/>
            <meta property="og:image" content="https://blog.example/cover.jpg"/>
            <meta property="og:image:alt" content="A cover"/>
            </head><body><script id="discord:component-embed">{"component":{"type":17}}</script></body></html>"##;
        let card = parse_page(html, LINK).expect("a card");
        assert_eq!(card.service, "Blog & Co");
        assert_eq!(card.url, "https://blog.example/p?a=1&b=2");
        assert_eq!(card.accent, Some(0x1d9bf0));
        assert_eq!(texts(&card), ["**A \"title\"**\nLine one -> two"]);
        assert_eq!(
            gallery(&card),
            [LinkEmbedMedia {
                url: "https://blog.example/cover.jpg".into(),
                kind: LinkEmbedMediaKind::Image,
                description: Some("A cover".into())
            }]
        );
    }

    #[test]
    fn open_graph_video_wins_over_the_poster_image() {
        let html = r#"<head><meta property="og:title" content="Clip"/>
            <meta property="og:image" content="https://cdn.example/poster.jpg"/>
            <meta property="og:video" content="http://cdn.example/clip.mp4"/>
            <meta property="og:video:secure_url" content="https://cdn.example/clip.mp4"/></head>"#;
        let card = parse_page(html, "https://www.example.com/clip").expect("a card");
        assert_eq!(card.service, "example.com");
        assert_eq!(card.url, "https://www.example.com/clip");
        assert_eq!(gallery(&card)[0].url, "https://cdn.example/clip.mp4");
        assert_eq!(gallery(&card)[0].kind, LinkEmbedMediaKind::Video);
        assert_eq!(
            parse_page(
                r#"<head><meta property="og:type" content="x"/></head>"#,
                LINK
            ),
            None
        );
    }

    #[test]
    fn malicious_cards_are_cleaned() {
        let big = "x".repeat(10_000);
        let gallery_items: String = (0..100)
            .map(|i| format!(r#"{{"media":{{"url":"https://cdn.example/{i}.png"}}}}"#))
            .collect::<Vec<_>>()
            .join(",");
        let blocks: String = (0..40)
            .map(|i| format!(r#"{{"type":10,"content":"block {i}"}}"#))
            .collect::<Vec<_>>()
            .join(",");
        let json = component(&format!(
            r#"{{"type":9,"components":[{{"type":10,"content":"a\u0007b\tc\r\nd\u202eE{big}"}}],
                "accessory":{{"type":11,"media":{{"url":"http://cdn.example/a.png"}}}}}},
            {{"type":12,"items":[{{"media":{{"url":"http://cdn.example/a.mp4"}}}},
                {{"media":{{"url":"javascript:alert(1)"}}}},
                {{"media":{{"url":"https://user:pw@cdn.example/a.png"}}}},
                {{"media":{{"url":"https://127.0.0.1/a.png"}}}},
                {{"media":{{"url":"https://localhost/a.png"}}}},
                {{"media":{{"url":"https://cdn.example/{long}.png"}}}},
                {gallery_items}]}},
            {{"type":1,"components":[
                {{"type":2,"style":5,"url":"javascript:alert(1)","label":"Evil"}},
                {{"type":2,"style":5,"url":"http://example.com/","label":"Plain"}},
                {{"type":2,"style":5,"url":"https://embeds.now/go/support","label":"Donate"}},
                {{"type":2,"style":5,"url":"https://www.embeds.now/x","label":"Donate"}},
                {{"type":2,"style":2,"custom_id":"x","label":"No url"}},
                {{"type":2,"style":5,"url":"https://a.example/1","label":"1"}},
                {{"type":2,"style":5,"url":"https://a.example/2","label":"2"}},
                {{"type":2,"style":5,"url":"https://a.example/3","label":"3"}},
                {{"type":2,"style":5,"url":"https://a.example/4","label":"4"}},
                {{"type":2,"style":5,"url":"https://a.example/5","label":"5"}},
                {{"type":2,"style":5,"url":"https://a.example/6","label":"6"}}]}},
            {blocks}"#,
            long = "a".repeat(3000),
        ));
        let json = json.replace("accent_color\":255", "accent_color\":16777216");
        let card = card(&json);
        assert_eq!(card.accent, None);
        assert_eq!(card.blocks.len(), MAX_BLOCKS);
        let LinkEmbedBlock::Text {
            markdown,
            thumbnail,
        } = &card.blocks[0]
        else {
            panic!("text first");
        };
        assert_eq!(markdown.chars().count(), MAX_TEXT);
        assert!(markdown.ends_with('…'));
        assert!(markdown.starts_with("abc\ndE"));
        assert_eq!(*thumbnail, None);
        let items = gallery(&card);
        assert_eq!(items.len(), MAX_GALLERY);
        assert!(
            items
                .iter()
                .all(|item| item.url.starts_with("https://cdn.example/")
                    && item.url.ends_with(".png"))
        );
        let buttons = buttons(&card);
        assert_eq!(buttons.len(), MAX_BUTTONS);
        assert!(buttons
            .iter()
            .all(|b| b.url.starts_with("https://a.example/")));
    }

    #[test]
    fn accent_and_separators() {
        let json = |color: &str| {
            format!(
                r#"{{"component":{{"type":17,"accent_color":{color},"components":[{{"type":14}},{{"type":10,"content":"hi"}},{{"type":14}},{{"type":14}},{{"type":14}}]}}}}"#
            )
        };
        let card = card(&json("16777215"));
        assert_eq!(card.accent, Some(0xFF_FFFF));
        // Separators neither lead, double nor trail
        assert_eq!(card.blocks.len(), 1);
        assert_eq!(self::card(&json("-1")).accent, None);
        assert_eq!(self::card(&json("1.5")).accent, None);
    }

    #[test]
    fn media_kinds_follow_the_extension() {
        use media_kind as kind;
        assert_eq!(
            kind("https://a.example/v.MP4?x=.png"),
            LinkEmbedMediaKind::Video
        );
        assert_eq!(kind("https://a.example/v.webm"), LinkEmbedMediaKind::Video);
        assert_eq!(kind("https://a.example/v.mov"), LinkEmbedMediaKind::Video);
        assert_eq!(kind("https://a.example/s.opus"), LinkEmbedMediaKind::Audio);
        assert_eq!(kind("https://a.example/s.m4a"), LinkEmbedMediaKind::Audio);
        assert_eq!(kind("https://a.example/i.jpg"), LinkEmbedMediaKind::Image);
        assert_eq!(kind("https://a.example/avatar"), LinkEmbedMediaKind::Image);
        assert_eq!(kind("https://a.mp4/avatar"), LinkEmbedMediaKind::Image);
    }

    #[test]
    fn text_is_cut_on_character_boundaries() {
        assert_eq!(clean_text("héllo", 10), "héllo");
        assert_eq!(clean_text("héllo", 5), "héllo");
        assert_eq!(clean_text("héllo wörld", 5), "héll…");
        assert_eq!(clean_text("日本語のテキスト", 3), "日本…");
        assert_eq!(single_line("  a\nb \r\n c ", 20), "a b c");
    }

    #[test]
    fn script_parsing_survives_odd_markup() {
        let html = r#"<script src=x></script><SCRIPT type='application/json' ID='discord:component-embed'>{"component":{"type":17,"components":[{"type":10,"content":"hi </b>"}]}}</SCRIPT>"#;
        let json = script_json(html, &html.to_ascii_lowercase()).expect("json");
        let (_, blocks) = parse_component(&json).expect("blocks");
        assert_eq!(
            blocks,
            [LinkEmbedBlock::Text {
                markdown: "hi </b>".into(),
                thumbnail: None
            }]
        );
        assert_eq!(
            script_json(
                "<script id=\"discord:component-embed\">{",
                "<script id=\"discord:component-embed\">{"
            ),
            None
        );
        assert_eq!(script_json("<script id=\"x\" ", "<script id=\"x\" "), None);
    }

    #[test]
    fn links_are_validated() {
        for bad in [
            "http://x.com/a",
            "https://127.0.0.1/a",
            "https://0x7f.1/a",
            "https://[::1]/a",
            "https://192.168.1.2/a",
            "https://localhost/a",
            "https://intranet/a",
            "https://printer.local/a",
            "https://nas.internal/a",
            "https://box.lan/a",
            "https://router.home.arpa/a",
            "https://app.localhost/a",
            "https://user@x.com/a",
            "https://user:pw@x.com/a",
            "https://x.com:8443/a",
            "https://x.com../a",
            "https://1.2.3.999/a",
            "ftp://x.com/a",
            "javascript:alert(1)",
            "x.com/a",
            "",
        ] {
            assert_eq!(EmbedLink::new(bad), None, "{bad}");
        }
        let too_long = format!("https://x.com/{}", "a".repeat(MAX_INPUT_URL));
        assert_eq!(EmbedLink::new(&too_long), None);
        // The default port is the same as none
        assert!(EmbedLink::new("https://x.com:443/a").is_some());
    }

    #[test]
    fn requests_keep_the_path_and_query() {
        let link = EmbedLink::new("https://X.com/User/status/1?s=20&t=a%20b#frag").unwrap();
        assert_eq!(link.canonical, "https://x.com/User/status/1?s=20&t=a%20b");
        assert_eq!(
            link.request,
            "https://embeds.now/x.com/User/status/1?s=20&t=a%20b"
        );
        let bare = EmbedLink::new("  https://WWW.Instagram.com  ").unwrap();
        assert_eq!(bare.request, "https://embeds.now/www.instagram.com/");
        let encoded = EmbedLink::new("https://bsky.app/profile/x/post/3?q=%E3%81%82").unwrap();
        assert_eq!(
            encoded.request,
            "https://embeds.now/bsky.app/profile/x/post/3?q=%E3%81%82"
        );
        let slashes = EmbedLink::new("https://x.com//a//").unwrap();
        assert_eq!(slashes.request, "https://embeds.now/x.com//a//");
        assert!(!bare.request.contains("embeds.now//"));
    }

    #[test]
    fn entities_decode() {
        assert_eq!(
            decode_entities("a &amp; b &lt;&gt; &#39;x&#x27; &#65;"),
            "a & b <> 'x' A"
        );
        assert_eq!(
            decode_entities("&bogus; & &#xZZ; &amp"),
            "&bogus; & &#xZZ; &amp"
        );
    }
}
