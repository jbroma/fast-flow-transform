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

fn main() {
    emit_cpp_runtime_link();
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

    let dst = cmake::Config::new(&hermes_root)
        .build_target("hermesSupport")
        .build();
    println!(
        "cargo:rustc-link-search={}/build/lib/Support",
        dst.display()
    );
    println!("cargo:rustc-link-lib=hermesSupport");
    println!(
        "cargo:rustc-link-search={}/build/external/dtoa",
        dst.display()
    );
    println!("cargo:rustc-link-lib=dtoa");
}
