//! Writes the generated APIs for every app (`npm run core:types`): TypeScript for the web, Swift for
//! iOS and Kotlin for Android. `-- dump` prints the reflected types instead, for working on the
//! generators.

use std::{fs, path::Path};

fn main() {
    if std::env::args().nth(1).as_deref() == Some("dump") {
        print!("{}", wizardchat_core::rpc::typegen::dump());
        return;
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let outputs = [
        (
            "apps/web/src/core/rpc/api.gen.ts",
            wizardchat_core::rpc::typegen::typescript(),
        ),
        (
            "apps/ios/WizardChatCore/Sources/WizardChatCore/Api.gen.swift",
            wizardchat_core::rpc::typegen::swift(),
        ),
        (
            "apps/android/core/src/main/kotlin/org/wizardchat/core/Api.gen.kt",
            wizardchat_core::rpc::typegen::kotlin(),
        ),
    ];
    for (path, source) in outputs {
        fs::write(root.join(path), source).unwrap_or_else(|e| panic!("writing {path}: {e}"));
    }
}
