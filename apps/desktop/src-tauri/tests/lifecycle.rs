use dsh_desktop::lifecycle::{
    ServerProcess, StartError, StartSpec, parse_web_url, private_runtime_path,
};
use std::ffi::OsStr;
use std::fs::{create_dir_all, write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[test]
fn parses_the_existing_loopback_startup_line() {
    assert_eq!(
        parse_web_url("dsh web: http://127.0.0.1:43123\n").unwrap(),
        "http://127.0.0.1:43123",
    );
}

#[test]
fn rejects_non_loopback_and_malformed_startup_lines() {
    assert!(parse_web_url("dsh web: http://localhost:43123\n").is_err());
    assert!(parse_web_url("dsh web: http://127.0.0.1:0\n").is_err());
    assert!(parse_web_url("listening on 127.0.0.1:43123\n").is_err());
}

fn fixture_script(name: &str, body: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("dsh-desktop-test-{}", std::process::id()));
    create_dir_all(&root).unwrap();
    let path = root.join(name);
    write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    let mut permissions = std::fs::metadata(&path).unwrap().permissions();
    permissions.set_mode(0o700);
    std::fs::set_permissions(&path, permissions).unwrap();
    path
}

fn spec(script: PathBuf, timeout: Duration) -> StartSpec {
    StartSpec {
        node: PathBuf::from("/bin/sh"),
        cli: script,
        package_bin: PathBuf::from("/private/runtime/app/node_modules/.bin"),
        dsh_home: std::env::temp_dir().join("dsh-desktop-home"),
        ready_timeout: timeout,
        shutdown_grace: Duration::from_millis(300),
        readiness_probe: |_| true,
    }
}

#[test]
fn private_runtime_path_precedes_every_inherited_entry() {
    let path = private_runtime_path(
        Path::new("/private/runtime/node/bin/node"),
        Path::new("/private/runtime/app/node_modules/.bin"),
        Some(OsStr::new("/host/bin:/usr/bin")),
    )
    .unwrap();
    let entries = std::env::split_paths(&path).collect::<Vec<_>>();
    assert_eq!(entries[0], PathBuf::from("/private/runtime/node/bin"));
    assert_eq!(
        entries[1],
        PathBuf::from("/private/runtime/app/node_modules/.bin")
    );
    assert_eq!(entries[2], PathBuf::from("/host/bin"));
    assert_eq!(entries[3], PathBuf::from("/usr/bin"));
}

#[test]
fn child_resolves_bare_pnpm_from_the_private_package_bin() {
    let root =
        std::env::temp_dir().join(format!("dsh-desktop-private-pnpm-{}", std::process::id()));
    let package_bin = root.join("node_modules/.bin");
    create_dir_all(&package_bin).unwrap();
    let pnpm = package_bin.join("pnpm");
    write(
        &pnpm,
        "#!/bin/sh\ntrap 'exit 0' TERM\necho 'dsh web: http://127.0.0.1:43125'\nwhile :; do :; done\n",
    )
    .unwrap();
    let mut permissions = std::fs::metadata(&pnpm).unwrap().permissions();
    permissions.set_mode(0o700);
    std::fs::set_permissions(&pnpm, permissions).unwrap();
    let cli = fixture_script("private-pnpm-cli.sh", "exec pnpm");
    let mut start = spec(cli, Duration::from_secs(1));
    start.package_bin = package_bin;

    let mut server = ServerProcess::start(start).unwrap();
    assert_eq!(server.origin(), "http://127.0.0.1:43125");
    server.shutdown().unwrap();
}

#[test]
fn reports_a_child_that_exits_before_the_web_server_is_ready() {
    let script = fixture_script("early-exit.sh", "echo startup-failed >&2; exit 7");
    let error = ServerProcess::start(spec(script, Duration::from_secs(1))).unwrap_err();
    assert!(matches!(error, StartError::EarlyExit { code: Some(7), .. }));
    assert!(error.to_string().contains("startup-failed"));
}

#[test]
fn times_out_and_terminates_a_child_that_never_becomes_ready() {
    let script = fixture_script(
        "timeout.sh",
        "trap 'exit 0' TERM; while :; do sleep 1; done",
    );
    let error = ServerProcess::start(spec(script, Duration::from_millis(80))).unwrap_err();
    assert!(matches!(error, StartError::ReadyTimeout { .. }));
}

#[test]
fn owns_and_gracefully_stops_the_ready_child() {
    let port = 43123;
    let script = fixture_script(
        "ready.sh",
        &format!(
            "trap 'exit 0' TERM; echo 'dsh web: http://127.0.0.1:{port}'; while :; do sleep 1; done"
        ),
    );
    let mut server = ServerProcess::start(spec(script, Duration::from_secs(1))).unwrap();
    assert_eq!(server.origin(), format!("http://127.0.0.1:{port}"));
    server.shutdown().unwrap();
    assert!(server.has_exited());
}

#[test]
fn does_not_accept_the_startup_line_until_the_reported_port_listens() {
    let script = fixture_script(
        "not-listening.sh",
        "trap 'exit 0' TERM; echo 'dsh web: http://127.0.0.1:43124'; while :; do sleep 1; done",
    );
    let mut start = spec(script, Duration::from_millis(80));
    start.readiness_probe = |_| false;
    let error = ServerProcess::start(start).unwrap_err();
    assert!(matches!(error, StartError::ReadyTimeout { .. }));
}
