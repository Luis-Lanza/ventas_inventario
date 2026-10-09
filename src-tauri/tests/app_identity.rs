use std::{fs, path::PathBuf};

use repuestos_autos::infrastructure::{filesystem::BackupStore, sqlite::{
    default_application_database_config, open_database, open_existing_database,
    production_database_config,
}};
use repuestos_autos::DatabaseState;
use rusqlite::Connection;

fn temporary_directory() -> PathBuf {
    let root = std::env::temp_dir().join(format!("velay-identity-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn application_root_and_canonical_filename_are_isolated() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert_eq!(config["productName"], "Velay");
    assert_eq!(config["identifier"], "com.velay.app");
    assert_eq!(config["app"]["windows"][0]["title"], "Velay");
    assert_eq!(production_database_config("synthetic-root").path(), PathBuf::from("synthetic-root/velay.sqlite3"));
    assert!(default_application_database_config().unwrap().path().ends_with("com.velay.app/velay.sqlite3"));
}

#[test]
fn fresh_startup_is_empty_and_retains_family_on_reopen() {
    assert_eq!(repuestos_autos::identity::SQLITE_APPLICATION_ID, i64::from(u32::from_be_bytes(*b"VLAY")));
    let root = temporary_directory();
    let config = production_database_config(&root);
    for _ in 0..2 {
        let state = DatabaseState::recover_on_startup(config.clone(), &BackupStore::new(&root));
        assert_eq!(state.with_read(|connection| {
            let family = connection.query_row("PRAGMA application_id", [], |row| row.get::<_, i64>(0)).unwrap();
            let counts = connection.query_row("SELECT (SELECT COUNT(*) FROM products), (SELECT COUNT(*) FROM categories)", [], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))).unwrap();
            Ok((family, counts))
        }), Ok((i64::from(u32::from_be_bytes(*b"VLAY")), (0, 0))));
    }
    assert!(open_existing_database(&config).is_ok());
}

#[test]
fn bootstrap_default_uses_velay_root_and_refuses_foreign_storage() {
    let root = temporary_directory();
    let config = production_database_config(root.join("com.velay.app"));
    drop(open_database(&config).unwrap());
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_bootstrap-demo"))
        .env("APPDATA", &root).env("XDG_DATA_HOME", &root).env("HOME", &root)
        .output().unwrap();
    // Current empty production catalogs are not the automotive demo's recognized
    // pristine state; reaching this refusal proves the default Velay file was opened.
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("refused: database is not the recognized pristine bootstrap state"));
    for family in [0, 1234] {
        Connection::open(config.path()).unwrap().pragma_update(None, "application_id", family).unwrap();
        let before = fs::read(config.path()).unwrap();
        let rejected = std::process::Command::new(env!("CARGO_BIN_EXE_bootstrap-demo"))
            .arg("--database").arg(config.path()).output().unwrap();
        assert!(!rejected.status.success());
        assert_eq!(fs::read(config.path()).unwrap(), before);
    }
}

#[test]
fn existing_empty_sqlite_file_is_not_adopted_as_fresh_storage() {
    let root = temporary_directory();
    let config = production_database_config(&root);
    fs::write(config.path(), []).unwrap();
    assert!(open_database(&config).is_err());
    assert_eq!(fs::read(config.path()).unwrap(), Vec::<u8>::new());
}

#[test]
fn existing_foreign_and_unmarked_canonical_files_are_rejected_unchanged() {
    for (family, current_schema) in [(0, false), (1234, false), (0, true), (1234, true)] {
        let root = temporary_directory();
        let config = production_database_config(&root);
        if current_schema {
            drop(open_database(&config).unwrap());
        }
        let connection = Connection::open(config.path()).unwrap();
        connection.execute_batch("CREATE TABLE foreign_data (value TEXT); INSERT INTO foreign_data VALUES ('keep');").unwrap();
        connection.pragma_update(None, "application_id", family).unwrap();
        drop(connection);
        let before = fs::read(config.path()).unwrap();
        assert!(open_database(&config).is_err());
        assert!(open_existing_database(&config).is_err());
        let state = DatabaseState::recover_on_startup(config.clone(), &BackupStore::new(&root));
        assert_eq!(state.with_read(|_| Ok(())), Err("database_unavailable".into()));
        assert_eq!(fs::read(config.path()).unwrap(), before);
    }
}
