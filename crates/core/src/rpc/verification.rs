//! `VerificationFlow`: verifying a device or user

use super::{Listener, Subscription};
use crate::{VerificationFlow, VerificationStatus};

rpc_methods! {
    VerificationFlow(this: VerificationFlow) {
        prop fn otherUserId() -> String {
            Ok(this.other_user_id())
        }

        prop fn isSelfVerification() -> bool {
            Ok(this.is_self_verification())
        }

        /// Calls `listener` with every step until done or cancelled.
        watch fn watch(listener: Listener<VerificationStatus>) -> Subscription {
            Ok(listener.clone().watch(async move { this.watch(|status| listener.emit(&status)).await }))
        }

        call fn accept() -> () {
            this.accept().await
        }

        call fn startSas() -> () {
            this.start_sas().await
        }

        call fn acceptSas() -> () {
            this.accept_sas().await
        }

        call fn confirm() -> () {
            this.confirm().await
        }

        call fn mismatch() -> () {
            this.mismatch().await
        }

        call fn cancel() -> () {
            this.cancel().await
        }
    }
}
