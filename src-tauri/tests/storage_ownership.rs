use repuestos_autos::infrastructure::filesystem::storage_ownership::OwnershipError;
use repuestos_autos::infrastructure::{
    filesystem::storage_ownership::StorageOwnership,
    sqlite::{create_snapshot, open_seeded_catalog},
};
use std::{
    fs,
    path::Path,
    process::{Child, Command, Output, Stdio},
};

struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
#[ignore = "subprocess fixture; executed explicitly by the parent test"]
fn owner_child_process() {
    use std::io::{Read, Write};
    let root = std::env::var_os("VELAY_TEST_OWNERSHIP_ROOT").expect("fixture root");
    let _owner = StorageOwnership::acquire(Path::new(&root)).unwrap();
    println!("OWNER_READY");
    std::io::stdout().flush().unwrap();
    std::io::stdin().read_exact(&mut [0_u8; 1]).unwrap();
}

#[test]
fn separate_process_excludes_parent_and_releases_after_exit_or_kill() {
    use std::io::{BufRead, BufReader, Write};
    use std::sync::mpsc;
    use std::time::Duration;
    for killed in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let evidence = root.path().join("retained-evidence");
        fs::write(&evidence, b"not reset or recovery authority").unwrap();
        let mut child = ChildGuard(
            Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "owner_child_process",
                    "--ignored",
                    "--nocapture",
                    "--test-threads=1",
                ])
                .env("VELAY_TEST_OWNERSHIP_ROOT", root.path())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .unwrap(),
        );
        let stdout = child.0.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().take(20) {
                if line.unwrap().contains("OWNER_READY") {
                    let _ = tx.send(());
                }
            }
        });
        rx.recv_timeout(Duration::from_secs(10))
            .expect("child did not acquire ownership");
        assert!(matches!(
            StorageOwnership::acquire(root.path()),
            Err(OwnershipError::InUse)
        ));
        if killed {
            child.0.kill().unwrap();
        } else {
            child.0.stdin.take().unwrap().write_all(b"q").unwrap();
        }
        let status = child.0.wait().unwrap();
        reader.join().unwrap();
        assert_eq!(status.success(), !killed);
        let owner = StorageOwnership::acquire(root.path()).unwrap();
        drop(owner);
        assert!(root.path().join(".velay-storage.lock").is_file());
        assert_eq!(
            fs::read(evidence).unwrap(),
            b"not reset or recovery authority"
        );
        root.close().unwrap();
    }
}

fn fixture(root: &Path) -> std::path::PathBuf {
    let path = root.join("fixture.sqlite3");
    let source = open_seeded_catalog().unwrap();
    create_snapshot(&source, &path).unwrap();
    source.close().unwrap();
    path
}

fn bootstrap(path: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_bootstrap-demo"))
        .arg("--database")
        .arg(path)
        .output()
        .unwrap()
}

#[test]
fn bootstrap_cli_obeys_owner_before_any_database_mutation() {
    let root = tempfile::tempdir().unwrap();
    let database = fixture(root.path());
    let before = fs::read(&database).unwrap();
    let owner = StorageOwnership::acquire(root.path()).unwrap();
    let output = bootstrap(&database);
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert_eq!(output.stderr, b"bootstrap-demo: storage_in_use\n");
    assert_eq!(before, fs::read(&database).unwrap());
    drop(owner);
}

#[test]
fn bootstrap_cli_preserves_load_and_idempotent_reopen() {
    let root = tempfile::tempdir().unwrap();
    let database = fixture(root.path());
    let loaded = bootstrap(&database);
    assert_eq!(loaded.status.code(), Some(0));
    assert!(loaded.stderr.is_empty());
    assert_eq!(
        loaded.stdout,
        b"Loaded demo catalog: 8 categories added, 98 products added, 1 product reactivated.\n"
    );
    let before = fs::read(&database).unwrap();
    let repeated = bootstrap(&database);
    assert_eq!(repeated.status.code(), Some(0));
    assert!(repeated.stderr.is_empty());
    assert_eq!(
        repeated.stdout,
        b"Demo catalog is already complete; no changes were made.\n"
    );
    assert_eq!(before, fs::read(&database).unwrap());
    let owner = StorageOwnership::acquire(root.path()).unwrap();
    drop(owner);
    root.close().unwrap();
}
