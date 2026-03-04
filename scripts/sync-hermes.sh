#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_DIR="$ROOT_DIR/third_party/hermes"

if [[ ! -d "$HERMES_DIR/.git" ]]; then
  echo "Expected Hermes submodule at $HERMES_DIR" >&2
  echo "Initialize it first: git submodule add <hermes-url> third_party/hermes" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  SHA="$1"
  git -C "$HERMES_DIR" fetch --all
  git -C "$HERMES_DIR" checkout "$SHA"
else
  git -C "$HERMES_DIR" pull --ff-only
fi

echo "Hermes submodule is now at:"
git -C "$HERMES_DIR" rev-parse HEAD

echo "Next: run scripts/regen-bindings.sh and then cargo test/build."
