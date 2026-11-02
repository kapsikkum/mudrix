#!/bin/sh
# The app's version is the monorepo's (root package.json), without any pre-release suffix
set -e
version=$(plutil -extract version raw -o - "$SRCROOT/../../package.json")
plutil -replace CFBundleShortVersionString -string "${version%%-*}" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"
