//! Platforms without native capture yet: the webview's own picker is used instead

use super::{Session, Sink, Source};

pub const AUDIO: bool = false;

pub fn supported() -> bool {
    false
}

pub fn sources(_width: usize, _height: usize) -> Result<Vec<Source>, String> {
    Err("unsupported".into())
}

pub fn start(_id: &str, _audio: bool, _sink: Sink) -> Result<Box<dyn Session>, String> {
    Err("unsupported".into())
}
