fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP_APP").is_some() {
        tauri_build::build();
        sign_copied_macos_runtime();
    }
}

#[cfg(target_os = "macos")]
fn sign_copied_macos_runtime() {
    use std::path::PathBuf;
    use std::process::Command;

    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo did not set OUT_DIR"));
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("OUT_DIR does not contain the Cargo profile directory");
    let node = profile_dir.join("runtime/node/bin/node");

    if !node.is_file() {
        panic!("Tauri did not copy the bundled Node runtime to {}", node.display());
    }

    let status = Command::new("codesign")
        .args(["--force", "--sign", "-"])
        .arg(&node)
        .status()
        .expect("failed to execute codesign for the copied Node runtime");
    if !status.success() {
        panic!("failed to sign copied Node runtime at {}", node.display());
    }
}

#[cfg(not(target_os = "macos"))]
fn sign_copied_macos_runtime() {}
