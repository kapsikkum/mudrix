//! Receives the browser's redirect at the end of an OAuth or SSO sign-in on a local port.

use std::{collections::HashMap, sync::Mutex, time::Duration};

use serde::Deserialize;
use tauri::{AppHandle, Url};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

/// What the browser tab shows afterwards, in the app's language and theme
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    signed_in_title: String,
    signed_in_body: String,
    failed_title: String,
    failed_body: String,
    background: String,
    foreground: String,
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// `color` if it is a plain CSS colour, else `fallback`
fn css_color<'a>(color: &'a str, fallback: &'a str) -> &'a str {
    if !color.is_empty()
        && color
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "#(),. %".contains(c))
    {
        color
    } else {
        fallback
    }
}

impl Page {
    fn render(&self, target: &str) -> String {
        let url = Url::parse(&format!("http://127.0.0.1{target}")).ok();
        let param = |name: &str| {
            url.as_ref().and_then(|url| {
                url.query_pairs()
                    .find(|(key, _)| key == name)
                    .map(|(_, value)| value.into_owned())
            })
        };
        let succeeded =
            param("error").is_none() && (param("code").is_some() || param("loginToken").is_some());
        let (title, body, detail) = if succeeded {
            (&self.signed_in_title, &self.signed_in_body, None)
        } else {
            let detail = param("error_description").or_else(|| param("error"));
            (&self.failed_title, &self.failed_body, detail)
        };
        let detail = detail
            .map(|detail| format!("<p class=d>{}</p>", escape(&detail)))
            .unwrap_or_default();
        format!(
            "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\">\
<title>WizardChat</title><style>body{{margin:0;min-height:100vh;display:flex;flex-direction:column;\
align-items:center;justify-content:center;text-align:center;padding:0 24px;box-sizing:border-box;\
background:{};color:{};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}}\
h1{{font-size:22px;margin:0 0 8px}}p{{margin:0;opacity:.8}}.d{{margin-top:12px;font-size:13px;opacity:.6}}</style>\
<h1>{}</h1><p>{}</p>{detail}",
            css_color(&self.background, "#1c1c30"),
            css_color(&self.foreground, "#e8e8f0"),
            escape(title),
            escape(body),
        )
    }
}

static LISTENERS: Mutex<Option<HashMap<u16, (TcpListener, Page)>>> = Mutex::new(None);

/// Starts listening; the redirect URI is `http://127.0.0.1:<port>/callback`
#[tauri::command]
pub async fn loopback_listen(page: Page) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    LISTENERS
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(port, (listener, page));
    Ok(port)
}

/// Waits for the redirect, brings the app back to the front and returns the redirect's full URL
#[tauri::command]
pub async fn loopback_wait(app: AppHandle, port: u16) -> Result<String, String> {
    let (listener, page) = LISTENERS
        .lock()
        .unwrap()
        .as_mut()
        .and_then(|l| l.remove(&port))
        .ok_or("not listening")?;
    tokio::time::timeout(Duration::from_secs(15 * 60), async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buf = vec![0; 8192];
            let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
            let request = String::from_utf8_lossy(&buf[..n]);
            let target = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/");
            if !target.starts_with("/callback") {
                let _ = stream
                    .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .await;
                continue;
            }
            let html = page.render(target);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
                html.len()
            );
            let _ = stream.write_all(response.as_bytes()).await;
            crate::focus_main(&app);
            return Ok(format!("http://127.0.0.1:{port}{target}"));
        }
    })
    .await
    .map_err(|_| "timed out".to_string())?
}

/// Stops listening without a redirect (sign-in cancelled)
#[tauri::command]
pub fn loopback_cancel(port: u16) {
    if let Some(listeners) = LISTENERS.lock().unwrap().as_mut() {
        listeners.remove(&port);
    }
}
