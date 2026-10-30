use std::{path::Path, process::ExitCode, time::Duration};

use rusqlite::{backup::Backup, Connection, OpenFlags};

// Public synthetic fixtures, NOT production key material or password handling.
const SOURCE_KEY: &str = "synthetic-source-key-not-for-real-data";
const BACKUP_KEY: &str = "synthetic-backup-key-not-for-real-data";
const HELP: &str = "Usage: encryption-probe [--help]\nSynthetic SQLCipher/DPAPI primitive probe; no paths or passwords accepted.\n";
type Result<T> = std::result::Result<T, &'static str>;

fn main() -> ExitCode {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() == 1 && args[0] == "--help" {
        print!("{HELP}");
        return ExitCode::SUCCESS;
    }
    if !args.is_empty() {
        eprintln!("ERROR: unexpected arguments; use --help");
        return ExitCode::from(2);
    }
    match probe() {
        Ok(()) => ExitCode::SUCCESS,
        Err(stage) => {
            eprintln!("FAIL: {stage}");
            ExitCode::FAILURE
        }
    }
}

fn open(path: &Path, key: Option<&str>, create: bool) -> Result<Connection> {
    let flags = if create {
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE
    } else {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    };
    let conn = Connection::open_with_flags(path, flags).map_err(|_| "database open")?;
    if let Some(key) = key {
        conn.pragma_update(None, "key", key)
            .map_err(|_| "key setup")?;
    }
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|_| "foreign-key setup")?;
    Ok(conn)
}

fn record(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row("SELECT label FROM sample WHERE id = 1", [], |row| {
        row.get(0)
    })
}

fn validate(path: &Path, key: &str, other_key: &str) -> Result<()> {
    let conn = open(path, Some(key), false)?;
    if record(&conn).map_err(|_| "keyed data query")? != "synthetic record" {
        return Err("record mismatch");
    }
    let mut statement = conn
        .prepare("PRAGMA integrity_check")
        .map_err(|_| "integrity query")?;
    let results = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "integrity query")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| "integrity result")?;
    if results != ["ok"] {
        return Err("integrity check");
    }
    for rejected in [None, Some("synthetic-wrong-key"), Some(other_key)] {
        let denied = open(path, rejected, false)?;
        if record(&denied).is_ok() {
            return Err("unkeyed or wrong-key data query accepted");
        }
    }
    Ok(())
}

fn database_probe(workspace: &Path) -> Result<()> {
    let source_path = workspace.join("source.sqlite3");
    let backup_path = workspace.join("backup.sqlite3");
    let source = open(&source_path, Some(SOURCE_KEY), true)?;
    let version: String = source
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|_| "SQLCipher unavailable")?;
    if version.trim().is_empty() {
        return Err("SQLCipher version empty");
    }
    source
        .execute_batch("CREATE TABLE sample(id INTEGER PRIMARY KEY, label TEXT NOT NULL)")
        .map_err(|_| "synthetic schema")?;
    source
        .execute("INSERT INTO sample VALUES (1, ?1)", ["synthetic record"])
        .map_err(|_| "synthetic insert")?;
    let mut destination = open(&backup_path, Some(BACKUP_KEY), true)?;
    {
        let backup = Backup::new(&source, &mut destination).map_err(|_| "online backup init")?;
        backup
            .run_to_completion(16, Duration::from_millis(10), None)
            .map_err(|_| "online backup copy")?;
    }
    // Close every handle before reopening and before TempDir cleanup on Windows.
    destination.close().map_err(|_| "backup close")?;
    source.close().map_err(|_| "source close")?;
    validate(&source_path, SOURCE_KEY, BACKUP_KEY)?;
    validate(&backup_path, BACKUP_KEY, SOURCE_KEY)?;
    Ok(())
}

fn probe() -> Result<()> {
    let workspace = tempfile::Builder::new()
        .prefix("velay-synthetic-encryption-probe-")
        .tempdir()
        .map_err(|_| "temporary workspace creation")?;
    let result = database_probe(workspace.path()).and_then(|()| dpapi_probe());
    // Explicit cleanup reports errors; failure paths also close all SQLite handles first.
    let cleanup = workspace.close().map_err(|_| "temporary workspace cleanup");
    result?;
    cleanup?;
    println!("PASS: SQLCipher available");
    println!("PASS: encrypted database reopen, key rejection and integrity");
    println!("PASS: encrypted online backup reopen, key rejection and integrity");
    if cfg!(windows) {
        println!("PASS: DPAPI current-user round-trip and modified-blob rejection");
    } else {
        println!("SKIP: DPAPI requires Windows; Windows feasibility NOT established");
    }
    println!("PASS: temporary workspace removed");
    println!("SCOPE: backend primitives only; no application or NSIS proof");
    Ok(())
}

#[cfg(not(windows))]
fn dpapi_probe() -> Result<()> {
    Ok(())
}

#[cfg(windows)]
fn dpapi_probe() -> Result<()> {
    let key = SOURCE_KEY.as_bytes();
    let mut protected = dpapi::transform(key, true)?;
    if dpapi::transform(&protected, false)? != key {
        return Err("DPAPI round-trip mismatch");
    }
    let last = protected.last_mut().ok_or("DPAPI empty blob")?;
    *last ^= 1;
    if dpapi::transform(&protected, false).is_ok() {
        return Err("DPAPI modified blob accepted");
    }
    Ok(())
}

#[cfg(windows)]
mod dpapi {
    use super::Result;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    struct OwnedBlob(CRYPT_INTEGER_BLOB);

    impl Drop for OwnedBlob {
        fn drop(&mut self) {
            if !self.0.pbData.is_null() {
                // SAFETY: DPAPI allocated this buffer with LocalAlloc; exactly one owner frees it.
                unsafe { LocalFree(self.0.pbData.cast()) };
            }
        }
    }

    pub(super) fn transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(bytes.len()).map_err(|_| "DPAPI input size")?,
            pbData: bytes.as_ptr().cast_mut(),
        };
        let mut output = OwnedBlob(CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        });
        // SAFETY: input lives through the call; output is writable and owned by the guard.
        // No LOCAL_MACHINE flag: protection is scoped to the current Windows user.
        let success = unsafe {
            if protect {
                CryptProtectData(
                    &input,
                    null(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output.0,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    null_mut(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output.0,
                )
            }
        };
        if success == 0 {
            return Err("DPAPI operation rejected");
        }
        if output.0.pbData.is_null() || output.0.cbData == 0 {
            return Err("DPAPI empty output");
        }
        // SAFETY: successful DPAPI call provides cbData initialized bytes until guard drops.
        let result = unsafe {
            std::slice::from_raw_parts(output.0.pbData, output.0.cbData as usize).to_vec()
        };
        Ok(result)
    }
}
