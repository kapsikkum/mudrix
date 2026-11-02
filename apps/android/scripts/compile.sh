#!/usr/bin/env bash
# Compiles the app's Kotlin and prints only the errors, optionally only those in paths matching $1.
# Quicker than a full build when you only want to know whether it compiles.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=$(./gradlew :app:compileDebugKotlin -q 2>&1)
STATUS=$?
ERRORS=$(echo "$OUT" | grep -E "^e: " | grep -E "${1:-.}" || true)
if [[ -n "$ERRORS" ]]; then
  echo "$ERRORS" | sed "s#file://$(pwd)/##"
elif [[ $STATUS -ne 0 ]]; then
  echo "$OUT" | tail -30
else
  echo "compiled"
fi
exit $STATUS
