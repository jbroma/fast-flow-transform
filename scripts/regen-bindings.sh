#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat <<MSG
Bridge binding regeneration is project-specific.

Recommended contract for this repo:
1. Ensure third_party/hermes points to the target commit.
2. Regenerate any bridge-generated files (e.g. crates/hermes/src/parser/generated_ffi.rs,
   crates/fft/src/hparser/generated_cvt.rs) using your chosen generator workflow.
3. Run verification:
   - cargo test -p fft_strip
   - cargo test -p fft_pass

This script is intentionally a guardrail placeholder so extraction can standardize
regeneration behavior in one place.
MSG
