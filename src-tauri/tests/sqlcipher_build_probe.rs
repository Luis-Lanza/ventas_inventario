#[cfg(feature = "sqlcipher-build-probe")]
use std::{path::Path, time::Duration};

use repuestos_autos::infrastructure::sqlite::{
    create_snapshot, database_config, open_database, open_seeded_catalog, stage_and_validate,
    validate_restored_database, CURRENT_SCHEMA_VERSION,
};
#[cfg(feature = "sqlcipher-build-probe")]
use rusqlite::{backup::Backup, OpenFlags};
use rusqlite::{Connection, OptionalExtension};

fn integrity(connection: &Connection) {
    let mut statement = connection.prepare("PRAGMA integrity_check").unwrap();
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(rows, ["ok"]);
}

fn records(connection: &Connection) -> Vec<(i64, String, String)> {
    connection
        .prepare("SELECT id, sku, name FROM products ORDER BY id")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

#[test]
fn capability_and_real_schema_plaintext_snapshot_compatibility() {
    let workspace = tempfile::tempdir().unwrap();
    {
        let seeded = open_seeded_catalog().unwrap();
        let version: Option<String> = seeded
            .query_row("PRAGMA cipher_version", [], |row| row.get(0))
            .optional()
            .unwrap();
        if cfg!(feature = "sqlcipher-build-probe") {
            assert!(!version.unwrap().trim().is_empty());
        } else {
            assert_eq!(version, None);
        }
        let expected = vec![
            (1, "FLT-001".into(), "Filtro de aceite".into()),
            (2, "BUJ-001".into(), "Bujia archivada".into()),
        ];
        assert_eq!(records(&seeded), expected);
        let snapshot = workspace.path().join("snapshot.sqlite3");
        assert_eq!(
            create_snapshot(&seeded, &snapshot).unwrap().schema_version,
            CURRENT_SCHEMA_VERSION
        );
        let stage = workspace.path().join("stage.sqlite3");
        assert_eq!(
            stage_and_validate(&snapshot, &stage)
                .unwrap()
                .schema_version,
            CURRENT_SCHEMA_VERSION
        );
        for path in [&snapshot, &stage] {
            assert!(std::fs::read(path)
                .unwrap()
                .starts_with(b"SQLite format 3\0"));
            let reopened = open_database(&database_config(path)).unwrap();
            validate_restored_database(&reopened).unwrap();
            assert_eq!(records(&reopened), expected);
            integrity(&reopened);
        }
        let fresh =
            open_database(&database_config(workspace.path().join("fresh.sqlite3"))).unwrap();
        validate_restored_database(&fresh).unwrap();
        assert!(records(&fresh).is_empty());
    }
    workspace.close().unwrap();
}

// Public synthetic keys only: not a password/envelope implementation.
#[cfg(feature = "sqlcipher-build-probe")]
const SOURCE_KEY: &str = "synthetic-app-source-key";
#[cfg(feature = "sqlcipher-build-probe")]
const BACKUP_KEY: &str = "synthetic-app-backup-key";

#[cfg(feature = "sqlcipher-build-probe")]
fn keyed(path: &Path, key: Option<&str>, create: bool) -> Connection {
    let flags = if create {
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE
    } else {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    };
    let connection = Connection::open_with_flags(path, flags).unwrap();
    if let Some(key) = key {
        connection.pragma_update(None, "key", key).unwrap();
    }
    connection
        .pragma_update(None, "foreign_keys", true)
        .unwrap();
    connection
}

#[cfg(feature = "sqlcipher-build-probe")]
#[test]
fn encrypted_synthetic_records_and_distinct_key_online_backup() {
    let workspace = tempfile::tempdir().unwrap();
    let source_path = workspace.path().join("encrypted.sqlite3");
    let backup_path = workspace.path().join("encrypted-backup.sqlite3");
    {
        // SQLCipher does not support plaintext-to-keyed online backup. This
        // separate primitive test creates encrypted storage directly, not a migration.
        let source = keyed(&source_path, Some(SOURCE_KEY), true);
        source
            .execute_batch("CREATE TABLE sample(id INTEGER PRIMARY KEY, label TEXT NOT NULL)")
            .unwrap();
        source
            .execute(
                "INSERT INTO sample VALUES (?1, ?2)",
                rusqlite::params![1, "synthetic record"],
            )
            .unwrap();
        let mut destination = keyed(&backup_path, Some(BACKUP_KEY), true);
        Backup::new(&source, &mut destination)
            .unwrap()
            .run_to_completion(128, Duration::from_millis(1), None)
            .unwrap();
    }
    for (path, key, other) in [
        (&source_path, SOURCE_KEY, BACKUP_KEY),
        (&backup_path, BACKUP_KEY, SOURCE_KEY),
    ] {
        let reopened = keyed(path, Some(key), false);
        let mut statement = reopened
            .prepare("SELECT id, label FROM sample ORDER BY id")
            .unwrap();
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(rows, [(1, "synthetic record".into())]);
        integrity(&reopened);
        for rejected in [None, Some("synthetic-wrong-key"), Some(other)] {
            let denied = keyed(path, rejected, false);
            assert!(denied
                .query_row("SELECT label FROM sample WHERE id = 1", [], |row| row
                    .get::<_, String>(0))
                .is_err());
        }
    }
    workspace.close().unwrap();
}
