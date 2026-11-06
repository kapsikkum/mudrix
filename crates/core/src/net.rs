//! Plain HTTP helpers for the few requests that aren't Matrix client-server calls.

use std::{future::Future, time::Duration};

use futures_util::{
    future::{select, Either},
    StreamExt,
};

/// Runs `future`, giving up after `limit` (`None`). Works in the browser, where `Instant` doesn't.
pub(crate) async fn with_timeout<F: Future>(future: F, limit: Duration) -> Option<F::Output> {
    let future = std::pin::pin!(future);
    let timer = std::pin::pin!(matrix_sdk::sleep::sleep(limit));
    match select(future, timer).await {
        Either::Left((output, _)) => Some(output),
        Either::Right(_) => None,
    }
}

/// The first `limit` bytes of a response body; the rest is never downloaded.
pub(crate) async fn read_limited(
    response: reqwest::Response,
    limit: usize,
) -> reqwest::Result<Vec<u8>> {
    let mut body = Vec::new();
    let mut stream = Box::pin(response.bytes_stream());
    while body.len() < limit {
        let Some(chunk) = stream.next().await else {
            break;
        };
        body.extend_from_slice(&chunk?);
    }
    body.truncate(limit);
    Ok(body)
}
