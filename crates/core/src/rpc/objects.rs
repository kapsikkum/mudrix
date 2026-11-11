//! How the core's objects appear to apps

use std::sync::Mutex;

use futures_channel::mpsc::UnboundedSender;
use serde_json::{json, Value};

use super::RpcObject;
use crate::{
    CallSession, Error, PendingLogin, QrLoginControl, Result, RoomFilter, RoomTimeline,
    VerificationFlow, WizardClient,
};

impl RpcObject for WizardClient {
    const CLASS: &'static str = "WizardClient";
    fn props(&self) -> Value {
        json!({ "userId": self.user_id(), "session": self.session().ok() })
    }
}

impl RpcObject for RoomTimeline {
    const CLASS: &'static str = "RoomTimeline";
}

impl RpcObject for VerificationFlow {
    const CLASS: &'static str = "VerificationFlow";
    fn props(&self) -> Value {
        json!({
            "otherUserId": self.other_user_id(),
            "isSelfVerification": self.is_self_verification(),
        })
    }
}

impl RpcObject for CallSession {
    const CLASS: &'static str = "CallSession";
    fn props(&self) -> Value {
        json!({
            "roomId": self.room_id(),
            "serviceUrl": self.service_url(),
            "identity": self.identity(),
            "rang": self.rang(),
        })
    }
}

impl RpcObject for QrLoginControl {
    const CLASS: &'static str = "QrLoginControl";
}

/// A sign-in waiting for its redirect; finishing or aborting uses it up
pub struct PendingLoginCell {
    url: String,
    login: Mutex<Option<PendingLogin>>,
}

impl PendingLoginCell {
    pub fn new(login: PendingLogin) -> Self {
        PendingLoginCell {
            url: login.url().to_owned(),
            login: Mutex::new(Some(login)),
        }
    }

    pub fn take(&self) -> Result<PendingLogin> {
        self.login
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| Error::Sdk("this sign-in already finished".into()))
    }

    pub fn url(&self) -> &str {
        &self.url
    }
}

impl RpcObject for PendingLoginCell {
    const CLASS: &'static str = "PendingLogin";
    fn props(&self) -> Value {
        json!({ "url": self.url })
    }
}

/// The filter input of a running room list
pub struct RoomList(pub UnboundedSender<RoomFilter>);

impl RoomList {
    pub fn set_filter(&self, filter: RoomFilter) {
        let _ = self.0.unbounded_send(filter);
    }
}
