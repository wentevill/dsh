use dsh_desktop::lifecycle::{ServerProcess, StartError, StartSpec, parse_web_url};
use std::fs::{create_dir_all, write};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
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
        dsh_home: std::env::temp_dir().join("dsh-desktop-home"),
        ready_timeout: timeout,
        shutdown_grace: Duration::from_millis(300),
        readiness_probe: |_| true,
    }
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
