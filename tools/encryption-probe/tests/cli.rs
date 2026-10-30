use std::process::Command;

const HELP: &str = "Usage: encryption-probe [--help]\nSynthetic SQLCipher/DPAPI primitive probe; no paths or passwords accepted.\n";

#[test]
fn help_does_not_create_workspace() {
    let cwd = tempfile::tempdir().unwrap();
    let missing = cwd.path().join("missing-temp-root");
    let output = Command::new(env!("CARGO_BIN_EXE_encryption-probe"))
        .arg("--help")
        .current_dir(cwd.path())
        .env("TMPDIR", &missing)
        .env("TMP", &missing)
        .env("TEMP", &missing)
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0));
    assert_eq!(output.stdout, HELP.as_bytes());
    assert!(output.stderr.is_empty());
    assert_eq!(std::fs::read_dir(cwd.path()).unwrap().count(), 0);
}

#[test]
fn unexpected_arguments_are_rejected_without_touching_targets() {
    let cwd = tempfile::tempdir().unwrap();
    let target = cwd.path().join("synthetic.sqlite3");
    std::fs::write(&target, b"synthetic sentinel").unwrap();
    for args in [
        vec![target.as_os_str()],
        vec![std::ffi::OsStr::new("--unknown")],
        vec![std::ffi::OsStr::new("--help"), target.as_os_str()],
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_encryption-probe"))
            .args(args)
            .current_dir(cwd.path())
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(output.stderr, b"ERROR: unexpected arguments; use --help\n");
        assert_eq!(std::fs::read(&target).unwrap(), b"synthetic sentinel");
        assert_eq!(std::fs::read_dir(cwd.path()).unwrap().count(), 1);
    }
}

#[test]
fn probe_validates_primitives_and_cleans_workspace() {
    let root = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_encryption-probe"))
        .env("TMPDIR", root.path())
        .env("TMP", root.path())
        .env("TEMP", root.path())
        .current_dir(root.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0));
    let dpapi = if cfg!(windows) {
        "PASS: DPAPI current-user round-trip and modified-blob rejection\n"
    } else {
        "SKIP: DPAPI requires Windows; Windows feasibility NOT established\n"
    };
    assert_eq!(
        output.stdout,
        format!("PASS: SQLCipher available\nPASS: encrypted database reopen, key rejection and integrity\nPASS: encrypted online backup reopen, key rejection and integrity\n{dpapi}PASS: temporary workspace removed\nSCOPE: backend primitives only; no application or NSIS proof\n").as_bytes()
    );
    assert!(output.stderr.is_empty(), "{:?}", output.stderr);
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
}
