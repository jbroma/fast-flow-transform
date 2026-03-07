/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use std::env;
use std::path::PathBuf;

fn is_hermes_root(path: &PathBuf) -> bool {
    path.join("CMakeLists.txt").exists()
        && path.join("include").exists()
        && path.join("lib").exists()
        && path.join("external").exists()
}

fn detect_hermes_root() -> PathBuf {
    if let Some(path) = env::var_os("HERMES_SOURCE_DIR") {
        return PathBuf::from(path);
    }

    let manifest_dir =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));

    let standalone_root = manifest_dir.join("../../third_party/hermes");
    if is_hermes_root(&standalone_root) {
        return standalone_root;
    }

    for ancestor in manifest_dir.ancestors() {
        let candidate = ancestor.join("third_party/hermes");
        if is_hermes_root(&candidate) {
            return candidate;
        }
    }

    panic!(
        "Unable to locate Hermes sources. Set HERMES_SOURCE_DIR or initialize third_party/hermes."
    );
}

fn main() {
    let hermes_root = detect_hermes_root();

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
    let dst = cmake::Config::new(&hermes_root)
        .build_target("hermesSourceMap")
        .build();

    println!("cargo:rustc-link-search={}/build/lib/Parser", dst.display());
    println!(
        "cargo:rustc-link-search={}/build/lib/Platform/Unicode",
        dst.display()
    );
    println!(
        "cargo:rustc-link-search={}/build/lib/SourceMap",
        dst.display()
    );
    println!("cargo:rustc-link-search={}/build/lib/Regex", dst.display());
    println!("cargo:rustc-link-search={}/build/lib/AST", dst.display());
    println!(
        "cargo:rustc-link-search={}/build/lib/Support",
        dst.display()
    );
    println!(
        "cargo:rustc-link-search={}/build/external/dtoa",
        dst.display()
    );
    println!(
        "cargo:rustc-link-search={}/build/external/llvh/lib/Support",
        dst.display()
    );

    println!("cargo:rustc-link-lib=hermesSourceMap");
    println!("cargo:rustc-link-lib=hermesAST");
    println!("cargo:rustc-link-lib=hermesRegex");
    println!("cargo:rustc-link-lib=hermesParser");
    println!("cargo:rustc-link-lib=hermesPlatformUnicode");
    println!("cargo:rustc-link-lib=hermesSupport");
    println!("cargo:rustc-link-lib=LLVHSupport");
    println!("cargo:rustc-link-lib=dtoa");
}
