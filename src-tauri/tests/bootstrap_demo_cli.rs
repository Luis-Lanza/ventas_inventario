use repuestos_autos::infrastructure::sqlite::{create_snapshot, open_seeded_catalog};
use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

fn run(database: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_bootstrap-demo"))
        .arg("--database")
        .arg(database)
        .output()
        .unwrap()
}

#[test]
fn bootstrap_cli_reopens_complete_catalog_without_mutation_and_rejects_fts_tampering() {
    let root = tempfile::tempdir().unwrap();
    let database = root.path().join("demo.sqlite3");
    let source = open_seeded_catalog().unwrap();
    create_snapshot(&source, &database).unwrap();
    source.close().unwrap();

    let loaded = run(&database);
    assert_eq!(loaded.status.code(), Some(0));
    assert!(loaded.stderr.is_empty());
    assert_eq!(
        loaded.stdout,
        b"Loaded demo catalog: 8 categories added, 98 products added, 1 product reactivated.\n"
    );
    let connection = rusqlite::Connection::open(&database).unwrap();
    let content: String = connection
        .query_row(
            "SELECT content FROM catalog_product_search WHERE rowid = 2",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(content, "buj-001 bujia archivada bujias  ");
    connection.close().unwrap();

    let before = fs::read(&database).unwrap();
    let repeated = run(&database);
    assert_eq!(
        repeated.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&repeated.stderr)
    );
    assert!(repeated.stderr.is_empty());
    assert_eq!(
        repeated.stdout,
        b"Demo catalog is already complete; no changes were made.\n"
    );
    assert_eq!(fs::read(&database).unwrap(), before);

    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute(
            "UPDATE catalog_product_search SET content = ?1 WHERE rowid = 2",
            ["buj-001 bujia archivada bujias "],
        )
        .unwrap();
    connection.close().unwrap();
    let tampered = fs::read(&database).unwrap();
    let refused = run(&database);
    assert_eq!(refused.status.code(), Some(1));
    assert!(refused.stdout.is_empty());
    assert_eq!(
        refused.stderr,
        b"bootstrap-demo: refused: database is not the recognized pristine bootstrap state\n"
    );
    assert_eq!(fs::read(&database).unwrap(), tampered);
    root.close().unwrap();
}
