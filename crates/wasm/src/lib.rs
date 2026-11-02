//! The core for the web app: carries `Rpc` calls and events between JS and the core.
//! The API itself, and its TypeScript, is generated from crates/core/src/rpc.

use js_sys::{Array, Function, Uint8Array};
use wasm_bindgen::prelude::*;
use wizardchat_core::rpc::Rpc;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default_with_config(
        tracing_wasm::WASMLayerConfigBuilder::new()
            .set_max_level(tracing::Level::WARN)
            .build(),
    );
}

#[wasm_bindgen]
pub struct Core {
    rpc: Rpc,
}

#[wasm_bindgen]
impl Core {
    /// `sink(listener, json)` receives every event
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(unchecked_param_type = "(listener: number, json: string) => void")]
        sink: Function,
    ) -> Core {
        let rpc = Rpc::new(move |listener, json| {
            let _ = sink.call2(&JsValue::NULL, &(listener as f64).into(), &json.into());
        });
        Core { rpc }
    }

    /// Resolves to `[json, ...blobs]`; rejects with the error as JSON
    #[wasm_bindgen(unchecked_return_type = "Promise<[string, ...Uint8Array[]]>")]
    pub async fn call(
        &self,
        method: String,
        this: Option<f64>,
        args: String,
        #[wasm_bindgen(unchecked_param_type = "Uint8Array[]")] blobs: Array,
    ) -> Result<Array, JsValue> {
        let args = serde_json::from_str(&args).map_err(|e| JsValue::from(e.to_string()))?;
        let blobs = blobs.iter().map(|b| Uint8Array::from(b).to_vec()).collect();
        let reply = self
            .rpc
            .call(&method, this.map(|h| h as u64), args, blobs)
            .await
            .map_err(|e| JsValue::from(e.to_json()))?;
        let out = Array::new();
        out.push(&reply.json.into());
        for blob in reply.blobs {
            out.push(&Uint8Array::from(blob.as_slice()));
        }
        Ok(out)
    }

    pub fn release(&self, handle: f64) {
        self.rpc.release(handle as u64);
    }

    pub fn cancel(&self, listener: f64) {
        self.rpc.cancel(listener as u64);
    }
}
