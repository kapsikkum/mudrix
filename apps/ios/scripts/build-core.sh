#!/usr/bin/env bash
# Builds mudrix-core for iOS: the XCFramework, UniFFI's Swift bindings and the generated
# API (Api.gen.swift). `--debug` builds faster, unoptimised libraries for development.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PKG="$ROOT/apps/ios/MudrixCore"
OUT="$PKG/build"
PROFILE=release
PROFILE_DIR=release
if [[ "${1:-}" == "--debug" ]]; then
  PROFILE=dev
  PROFILE_DIR=debug
fi
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim)

cd "$ROOT"
for target in "${TARGETS[@]}"; do
  rustup target add "$target" >/dev/null
  IPHONEOS_DEPLOYMENT_TARGET=18.0 cargo build -p mudrix-core-ffi --lib --profile "$PROFILE" --target "$target"
done

# The bindings come from the library's metadata, read from a host build
cargo build -p mudrix-core-ffi --lib
rm -rf "$OUT" && mkdir -p "$OUT/bindings" "$OUT/headers"
cargo run -q -p mudrix-core-ffi --features bindgen --bin uniffi-bindgen -- \
  generate --library "$ROOT/target/debug/libmudrix_core_ffi.dylib" --language swift --out-dir "$OUT/bindings"
cp "$OUT/bindings/"*.h "$OUT/headers/"
cp "$OUT/bindings/mudrix_core_ffiFFI.modulemap" "$OUT/headers/module.modulemap"
cp "$OUT/bindings/mudrix_core_ffi.swift" "$PKG/Sources/MudrixCore/Bridge.gen.swift"

rm -rf "$PKG/MudrixCoreFFI.xcframework"
xcodebuild -create-xcframework \
  -library "$ROOT/target/aarch64-apple-ios/$PROFILE_DIR/libmudrix_core_ffi.a" -headers "$OUT/headers" \
  -library "$ROOT/target/aarch64-apple-ios-sim/$PROFILE_DIR/libmudrix_core_ffi.a" -headers "$OUT/headers" \
  -output "$PKG/MudrixCoreFFI.xcframework" >/dev/null

echo "MudrixCore is ready ($PROFILE_DIR)"
