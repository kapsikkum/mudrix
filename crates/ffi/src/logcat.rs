//! The core's tracing output on Android, in logcat under the tag `MudrixCore`

use std::{ffi::CStr, ffi::CString, io};

use ndk_sys::android_LogPriority;
use tracing::{Level, Metadata};
use tracing_subscriber::{fmt::MakeWriter, EnvFilter};

const TAG: &CStr = c"MudrixCore";

/// logcat keeps about 4 KB of a message, so longer lines are sent in pieces
const CHUNK: usize = 4000;

/// Info in release builds; debug builds add the core and the timelines (the SDK's own timers are
/// left out, they flood logcat). `WIZARDCHAT_LOG` takes a tracing filter
pub fn init() {
    let default = if cfg!(debug_assertions) {
        "info,wizardchat_core=debug,matrix_sdk_ui=debug"
    } else {
        "info"
    };
    let filter = std::env::var("WIZARDCHAT_LOG").unwrap_or_else(|_| default.into());
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new(filter))
        .with_writer(Logcat)
        .with_ansi(false)
        .without_time()
        .try_init();
}

#[derive(Clone, Copy)]
struct Logcat;

/// One event's text; it goes to logcat when the event has been written
struct Line {
    priority: i32,
    text: Vec<u8>,
}

impl<'a> MakeWriter<'a> for Logcat {
    type Writer = Line;

    fn make_writer(&'a self) -> Line {
        Line {
            priority: android_LogPriority::ANDROID_LOG_INFO.0 as i32,
            text: Vec::new(),
        }
    }

    fn make_writer_for(&'a self, meta: &Metadata<'_>) -> Line {
        let priority = match *meta.level() {
            Level::ERROR => android_LogPriority::ANDROID_LOG_ERROR,
            Level::WARN => android_LogPriority::ANDROID_LOG_WARN,
            Level::INFO => android_LogPriority::ANDROID_LOG_INFO,
            Level::DEBUG => android_LogPriority::ANDROID_LOG_DEBUG,
            Level::TRACE => android_LogPriority::ANDROID_LOG_VERBOSE,
        };
        Line {
            priority: priority.0 as i32,
            text: Vec::new(),
        }
    }
}

impl io::Write for Line {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.text.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Drop for Line {
    fn drop(&mut self) {
        let text = String::from_utf8_lossy(&self.text);
        let mut rest = text.trim_end();
        while !rest.is_empty() {
            let mut end = rest.len().min(CHUNK);
            while !rest.is_char_boundary(end) {
                end -= 1;
            }
            let (chunk, tail) = rest.split_at(end);
            if let Ok(line) = CString::new(chunk.replace('\0', "")) {
                // SAFETY: the tag and the line are NUL-terminated and outlive the call
                unsafe { ndk_sys::__android_log_write(self.priority, TAG.as_ptr(), line.as_ptr()) };
            }
            rest = tail;
        }
    }
}
