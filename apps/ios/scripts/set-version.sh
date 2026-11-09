#!/bin/sh
# The app's version is the monorepo's (root package.json), without any pre-release suffix.
# The build number matches Android's versionCode: 26.12.2-next.1 -> 26120201, 26.12.2 -> 26120299
set -e
version=$(plutil -extract version raw -o - "$SRCROOT/../../package.json")
release=${version%%-*}
major=${release%%.*}
rest=${release#*.}
minor=${rest%%.*}
patch=${rest#*.}
case "$version" in
  *-next.*) next=${version##*-next.} ;;
  *) next=99 ;;
esac
build=$((major * 1000000 + minor * 10000 + patch * 100 + next))
plutil -replace CFBundleShortVersionString -string "$release" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"
plutil -replace CFBundleVersion -string "$build" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"
