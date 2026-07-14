/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use std::env;
use std::path::{Path, PathBuf};

fn emit_cpp_runtime_link() {
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=c++");
    } else if cfg!(target_os = "linux") {
        println!("cargo:rustc-link-lib=stdc++");
    }
}

fn is_msvc_target() -> bool {
    matches!(env::var("CARGO_CFG_TARGET_ENV").as_deref(), Ok("msvc"))
}

/// Apply `patches/hermes-simple-ilist-empty-bases.patch` to the bundled llvh
/// so MSVC actually performs Empty Base Optimization across `simple_ilist`'s
/// two empty bases. Same change being upstreamed at facebook/hermes#2012; we
/// ship it as a patch file applied at build time until that PR lands and we
/// can bump the submodule pin past it.
///
/// The patch (a) adds the `LLVM_DECLARE_EMPTY_BASES` macro to llvh's
/// `Compiler.h` (mirroring the existing `HERMES_EMPTY_BASES` one layer up;
/// llvh cannot depend on Hermes), and (b) tags `simple_ilist` with that
/// macro. Without it MSVC pads each of `simple_ilist`'s two empty bases with
/// one byte and pointer-aligns the result, shifting the embedded `Sentinel`
/// member from offset 0 to offset 8. Code that takes `&simple_ilist` and
/// treats it as `&Sentinel` (such as the Rust FFI iterator in
/// `crates/hermes/src/parser/node.rs`) then iterates with the wrong head
/// address: linked-list pointers stored by C++ point at `&Sentinel`, but the
/// Rust side compares against `&simple_ilist`, so the circular list never
/// terminates and the iterator dereferences the sentinel as if it were a
/// real node. Manifests as `STATUS_ACCESS_VIOLATION 0xC0000005` during AST
/// traversal on Windows. See facebook/hermes#2012 for the full diagnosis.
///
/// Behavior on Hermes submodule bumps:
/// - Bump that doesn't touch the patched files: idempotency check sees no
///   marker, `git apply` runs cleanly, build proceeds.
/// - Bump that includes the upstream fix (Hermes#2012 merged): idempotency
///   check sees `LLVM_DECLARE_EMPTY_BASES simple_ilist` already present and
///   returns early. The patch becomes unnecessary and can be removed at the
///   maintainer's leisure.
/// - Bump that changes the patched files in some other way: `git apply`
///   fails with non-zero exit and we panic. Intentional — silently skipping
///   would produce an unpatched binary that AVs at runtime, which is worse
///   than a build error. The panic message points the maintainer at the
///   patch file and at Hermes#2012 so the resolution path is obvious.
///
/// Gated on `is_msvc_target()` because GCC and Clang already collapse the
/// empty bases without the attribute — Linux and macOS builds skip this
/// entirely.
fn ensure_msvc_empty_bases_patch(hermes_root: &Path) {
    if !is_msvc_target() {
        return;
    }

    let target_path = hermes_root.join("external/llvh/include/llvh/ADT/simple_ilist.h");
    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"),
    );
    let patch_file = manifest_dir.join("../../patches/hermes-simple-ilist-empty-bases.patch");

    println!("cargo:rerun-if-changed={}", patch_file.display());
    println!("cargo:rerun-if-changed={}", target_path.display());

    let original = std::fs::read_to_string(&target_path).unwrap_or_else(|err| {
        panic!(
            "MSVC build requires a patched llvh simple_ilist.h, but reading {} failed: {}",
            target_path.display(),
            err
        )
    });
    // Idempotency check accepts either marker:
    //   - `LLVM_DECLARE_EMPTY_BASES simple_ilist` is the macro-based form used
    //     by the upstreamed facebook/hermes#2012 patch (mirroring the
    //     HERMES_EMPTY_BASES pattern one layer up).
    //   - `__declspec(empty_bases) simple_ilist` is the earlier inline form
    //     this patch originally shipped with; recognized for backward compat
    //     so existing patched checkouts keep building without a submodule
    //     re-init.
    // A match means the file is already patched in this checkout or upstream
    // Hermes has landed the fix and we no longer need this hook.
    if original.contains("LLVM_DECLARE_EMPTY_BASES simple_ilist")
        || original.contains("__declspec(empty_bases) simple_ilist")
    {
        return;
    }

    if !patch_file.exists() {
        panic!(
            "MSVC build expects {} but the file is missing — was patches/ pruned?",
            patch_file.display()
        );
    }

    // Skip canonicalize() — on Windows it returns the `\\?\` extended-length
    // form which `git apply` rejects with "can't open patch". The path is
    // already absolute (manifest_dir joined with a relative tail), and git
    // resolves `..` components fine.
    let output = std::process::Command::new("git")
        .arg("apply")
        .arg("--whitespace=nowarn")
        .arg(&patch_file)
        .current_dir(hermes_root)
        .output()
        .unwrap_or_else(|err| {
            panic!(
                "could not invoke `git apply` for the MSVC simple_ilist patch: {} (is git on PATH?)",
                err
            )
        });

    if !output.status.success() {
        // Cargo runs build scripts of independent crates in parallel, so
        // `crates/hermes/build.rs` and `crates/fft_support/build.rs` race on
        // applying the same patch. The idempotency check earlier may have
        // observed the file as unpatched while a sibling patcher was still
        // mid-apply; by the time we run our own `git apply` the file is
        // patched and git rejects ours. Re-read the file and skip silently
        // if the attribute is now present — that's a successful race loss,
        // not a real failure.
        if let Ok(after) = std::fs::read_to_string(&target_path) {
            if after.contains("LLVM_DECLARE_EMPTY_BASES simple_ilist")
                || after.contains("__declspec(empty_bases) simple_ilist")
            {
                return;
            }
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        panic!(
            "Applying {} failed.\n\
             stderr:\n{}\nstdout:\n{}\n\
             This usually means the bundled Hermes submodule was bumped and\n\
             external/llvh/include/llvh/ADT/simple_ilist.h no longer matches the\n\
             patch's expected context. To resolve:\n\
             \n\
               1. If the upstream fix (facebook/hermes#2012) has landed in the new\n\
                  submodule pin, this patch is unnecessary — delete the patch file\n\
                  and the `ensure_msvc_empty_bases_patch` calls in build.rs.\n\
             \n\
               2. Otherwise, regenerate the patch against the new submodule revision\n\
                  and overwrite patches/hermes-simple-ilist-empty-bases.patch.",
            patch_file.display(),
            stderr.trim(),
            stdout.trim(),
        );
    }
}

fn cmake_profile_dir() -> &'static str {
    let profile = env::var("PROFILE").unwrap_or_default();
    let debug = env::var("DEBUG").unwrap_or_default();

    match (profile.as_str(), debug.as_str()) {
        ("debug", _) => "Debug",
        ("release" | "bench", "true") => "RelWithDebInfo",
        _ => "Release",
    }
}

fn emit_link_search(path: PathBuf) {
    println!("cargo:rustc-link-search=native={}", path.display());

    if is_msvc_target() {
        println!(
            "cargo:rustc-link-search=native={}",
            path.join(cmake_profile_dir()).display()
        );
    }
}

fn emit_static_link(lib: &str) {
    println!("cargo:rustc-link-lib=static={lib}");
}

fn is_hermes_root(path: &Path) -> bool {
    path.join("CMakeLists.txt").exists()
        && path.join("include").exists()
        && path.join("lib").exists()
        && path.join("external").exists()
}

fn detect_hermes_root() -> PathBuf {
    if let Some(path) = env::var_os("HERMES_SOURCE_DIR") {
        let candidate = PathBuf::from(path);
        if is_hermes_root(&candidate) {
            return candidate;
        }
    }

    let manifest_dir =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));

    let standalone_root = manifest_dir.join("../../hermes");
    if is_hermes_root(&standalone_root) {
        return standalone_root;
    }

    for ancestor in manifest_dir.ancestors() {
        let candidate = ancestor.join("hermes");
        if is_hermes_root(&candidate) {
            return candidate;
        }
    }

    panic!("Unable to locate Hermes sources. Set HERMES_SOURCE_DIR or initialize hermes.");
}

fn configure_target_specific_cmake(config: &mut cmake::Config) {
    let target = env::var("TARGET").unwrap_or_default();

    if target.ends_with("-musl") {
        // Hermes cross-compilation docs recommend the lightweight Unicode
        // backend when ICU is unavailable in musl toolchains.
        config.define("HERMES_UNICODE_LITE", "ON");
        config.define("CMAKE_TRY_COMPILE_TARGET_TYPE", "STATIC_LIBRARY");
        config.define("CMAKE_SIZEOF_VOID_P", "8");
        config.cflag("-D_LARGEFILE64_SOURCE");
        config.cxxflag("-D_LARGEFILE64_SOURCE");
    }

    match target.as_str() {
        // Cross builds inherit the host processor here, so pin Boost.Context
        // to the ARM64 ELF backend instead of letting it default to x86_64.
        "aarch64-unknown-linux-gnu" | "aarch64-unknown-linux-musl" => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_ABI", "aapcs");
            config.define("BOOST_CONTEXT_ASSEMBLER", "gas");
        }
        "aarch64-pc-windows-msvc" => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_IMPLEMENTATION", "winfib");
        }
        _ => {}
    }
}

fn main() {
    emit_cpp_runtime_link();
    let hermes_root = detect_hermes_root();

    ensure_msvc_empty_bases_patch(&hermes_root);

    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("include").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("lib").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("external").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("cmake").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("CMakeLists.txt").display()
    );

    // Build sourceMap library because it depends on everything we depend on here
    // via the hermesParser library.
    let mut config = cmake::Config::new(&hermes_root);
    configure_target_specific_cmake(&mut config);

    let dst = config.build_target("hermesSourceMap").build();

    emit_link_search(dst.join("build/lib/Parser"));
    emit_link_search(dst.join("build/lib/Platform/Unicode"));
    emit_link_search(dst.join("build/lib/SourceMap"));
    emit_link_search(dst.join("build/lib/Regex"));
    emit_link_search(dst.join("build/lib/AST"));
    emit_link_search(dst.join("build/lib/Support"));
    emit_link_search(dst.join("build/external/dtoa"));
    emit_link_search(dst.join("build/external/llvh/lib/Support"));

    // GNU ld resolves static libraries left-to-right, so dependencies must
    // come after the Hermes libraries that reference them.
    emit_static_link("hermesSourceMap");
    emit_static_link("hermesParser");
    emit_static_link("hermesAST");
    emit_static_link("hermesRegex");
    emit_static_link("hermesPlatformUnicode");
    emit_static_link("hermesSupport");
    emit_static_link("LLVHSupport");
    emit_static_link("dtoa");
}
