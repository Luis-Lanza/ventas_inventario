//! Isolated encrypted candidates; see docs/ENCRYPTED_STORAGE_CANDIDATE.md.
//! Not installation publication, credential reset, or business write admission.
use super::{DataKey, EnvelopeContext, UnlockSecret, ENCODED_LENGTH};
use crate::infrastructure::sqlite::{initialize_encrypted_candidate, validate_restored_database};
use argon2::password_hash::rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OpenFlags};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use zeroize::Zeroizing;

const DATABASE: &str = "data.sqlite3";
const ENVELOPE: &str = "key-envelope.bin";

/// Deliberately excludes raw SQLite errors, paths, SQL and secret material.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum CandidateError {
    Blocked,
    InvalidSecret,
    RandomUnavailable,
    Authentication,
    Sqlite,
    Io,
}
type Result<T> = std::result::Result<T, CandidateError>;

/// The recovery secret must be delivered before any future production activation.
/// No Debug/Clone implementation: it contains plaintext recovery credentials.
pub(crate) struct CreatedCandidate {
    pub(crate) context: EnvelopeContext,
    pub(crate) recovery: Zeroizing<String>,
}

/// Explicitly create a candidate in an existing, empty, absolute directory.
/// Caller must exclude concurrent namespace changes. Failures retain all artifacts;
/// they do not authorize deletion, retry-overwrite, or installation activation.
pub(crate) fn create_candidate(root: &Path, password: &str) -> Result<CreatedCandidate> {
    create_with_checkpoint(root, password, |step| {
        #[cfg(test)]
        if FAIL_AT.with(|at| at.get() == Some(step)) {
            return Err(CandidateError::Io);
        }
        let _ = step;
        Ok(())
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CreationStep {
    EnvelopeWritten,
    DatabaseReserved,
    SchemaInitialized,
    IdentityCommitted,
}

fn create_with_checkpoint(
    root: &Path,
    password: &str,
    checkpoint: impl Fn(CreationStep) -> Result<()>,
) -> Result<CreatedCandidate> {
    safe_root(root)?;
    if fs::read_dir(root)
        .map_err(|_| CandidateError::Io)?
        .next()
        .is_some()
    {
        return Err(CandidateError::Blocked);
    }
    super::validate_secret(password).map_err(|_| CandidateError::InvalidSecret)?;
    let mut context = EnvelopeContext {
        database_id: [0; 16],
        generation_id: [0; 16],
    };
    OsRng
        .try_fill_bytes(&mut context.database_id)
        .map_err(|_| CandidateError::RandomUnavailable)?;
    OsRng
        .try_fill_bytes(&mut context.generation_id)
        .map_err(|_| CandidateError::RandomUnavailable)?;
    let mut recovery_bytes = Zeroizing::new([0; 24]);
    OsRng
        .try_fill_bytes(recovery_bytes.as_mut())
        .map_err(|_| CandidateError::RandomUnavailable)?;
    let recovery = hex(recovery_bytes.as_ref());
    let (key, envelope) =
        super::create(&context, password, &recovery).map_err(|_| CandidateError::Authentication)?;
    let mut envelope_file = exclusive_file(&root.join(ENVELOPE))?;
    envelope_file
        .write_all(envelope.as_bytes())
        .map_err(|_| CandidateError::Io)?;
    envelope_file.sync_all().map_err(|_| CandidateError::Io)?;
    drop(envelope_file);
    checkpoint(CreationStep::EnvelopeWritten)?;
    drop(exclusive_file(&root.join(DATABASE))?);
    checkpoint(CreationStep::DatabaseReserved)?;

    // No CREATE flag: the only file SQLite may open is the exclusive reservation.
    let mut db =
        Connection::open_with_flags(root.join(DATABASE), OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|_| CandidateError::Sqlite)?;
    apply_key(&db, &key)?;
    connection_profile(&db)?;
    let mode: String = db
        .query_row("PRAGMA journal_mode = DELETE", [], |r| r.get(0))
        .map_err(|_| CandidateError::Sqlite)?;
    if mode != "delete" {
        return Err(CandidateError::Blocked);
    }
    initialize_encrypted_candidate(&mut db).map_err(|_| CandidateError::Sqlite)?;
    checkpoint(CreationStep::SchemaInitialized)?;
    let transaction = db.transaction().map_err(|_| CandidateError::Sqlite)?;
    transaction.execute_batch(
        "CREATE TABLE encrypted_candidate_identity (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            database_id BLOB NOT NULL CHECK(typeof(database_id) = 'blob' AND length(database_id) = 16),
            generation_id BLOB NOT NULL CHECK(typeof(generation_id) = 'blob' AND length(generation_id) = 16)
        );"
    ).map_err(|_| CandidateError::Sqlite)?;
    transaction
        .execute(
            "INSERT INTO encrypted_candidate_identity VALUES (1, ?1, ?2)",
            params![
                context.database_id.as_slice(),
                context.generation_id.as_slice()
            ],
        )
        .map_err(|_| CandidateError::Sqlite)?;
    transaction.commit().map_err(|_| CandidateError::Sqlite)?;
    db.close().map_err(|_| CandidateError::Sqlite)?;
    // File-data flush only; not a parent-directory/installation durability claim.
    OpenOptions::new()
        .write(true)
        .open(root.join(DATABASE))
        .and_then(|file| file.sync_all())
        .map_err(|_| CandidateError::Io)?;
    checkpoint(CreationStep::IdentityCommitted)?;
    open_candidate(root, UnlockSecret::Password(password))?
        .close()
        .map_err(|_| CandidateError::Sqlite)?;
    Ok(CreatedCandidate { context, recovery })
}

/// Authenticate and validate a closed candidate, returning a READ_ONLY connection.
/// Never repairs, migrates, creates files, or falls back to setup. Callers must
/// maintain exclusive namespace ownership until this connection is closed.
pub(crate) fn open_candidate(root: &Path, secret: UnlockSecret<'_>) -> Result<Connection> {
    safe_root(root)?;
    let mut count = 0;
    for entry in fs::read_dir(root).map_err(|_| CandidateError::Io)? {
        let entry = entry.map_err(|_| CandidateError::Io)?;
        count += 1;
        if count > 2 || (entry.file_name() != DATABASE && entry.file_name() != ENVELOPE) {
            return Err(CandidateError::Blocked);
        }
        if !safe_metadata(&entry.path())?.is_file() {
            return Err(CandidateError::Blocked);
        }
    }
    if count != 2 || safe_metadata(&root.join(DATABASE))?.len() == 0 {
        return Err(CandidateError::Blocked);
    }
    if safe_metadata(&root.join(ENVELOPE))?.len() != ENCODED_LENGTH as u64 {
        return Err(CandidateError::Blocked);
    }
    let mut bytes = Vec::with_capacity(ENCODED_LENGTH + 1);
    File::open(root.join(ENVELOPE))
        .map_err(|_| CandidateError::Io)?
        .take((ENCODED_LENGTH + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| CandidateError::Io)?;
    if bytes.len() != ENCODED_LENGTH {
        return Err(CandidateError::Blocked);
    }
    // These header IDs are untrusted until envelope authentication succeeds.
    let context = EnvelopeContext {
        database_id: bytes[11..27]
            .try_into()
            .map_err(|_| CandidateError::Blocked)?,
        generation_id: bytes[27..43]
            .try_into()
            .map_err(|_| CandidateError::Blocked)?,
    };
    let key =
        super::unlock(&bytes, &context, secret).map_err(|_| CandidateError::Authentication)?;
    let db = Connection::open_with_flags(root.join(DATABASE), OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| CandidateError::Sqlite)?;
    apply_key(&db, &key)?;
    connection_profile(&db)?;
    let mode: String = db
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .map_err(|_| CandidateError::Sqlite)?;
    if mode != "delete" {
        return Err(CandidateError::Blocked);
    }
    validate_restored_database(&db).map_err(|_| CandidateError::Blocked)?;
    let ids: (Vec<u8>, Vec<u8>) = db.query_row(
        "SELECT database_id, generation_id FROM encrypted_candidate_identity WHERE singleton = 1",
        [], |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| CandidateError::Blocked)?;
    let count: i64 = db
        .query_row(
            "SELECT count(*) FROM encrypted_candidate_identity",
            [],
            |r| r.get(0),
        )
        .map_err(|_| CandidateError::Blocked)?;
    if count != 1 || ids.0 != context.database_id || ids.1 != context.generation_id {
        return Err(CandidateError::Blocked);
    }
    Ok(db)
}

fn apply_key(db: &Connection, key: &DataKey) -> Result<()> {
    // SQLCipher raw-key syntax (32 bytes / 64 hex digits); never a passphrase.
    // Our buffers are wiped; rusqlite/SQLite may retain internal copies.
    let mut encoded = Zeroizing::new(String::with_capacity(67));
    encoded.push_str("x'");
    encoded.push_str(&hex(key.0.as_ref()));
    encoded.push('\'');
    db.pragma_update(None, "key", encoded.as_str())
        .map_err(|_| CandidateError::Sqlite)?;
    let version: String = db
        .query_row("PRAGMA cipher_version", [], |r| r.get(0))
        .map_err(|_| CandidateError::Blocked)?;
    if !version.starts_with("4.") {
        return Err(CandidateError::Blocked);
    }
    // Pin the on-disk codec profile before any schema or page access.
    db.execute_batch("PRAGMA cipher_compatibility = 4; PRAGMA cipher_memory_security = ON;")
        .map_err(|_| CandidateError::Sqlite)?;
    for (query, expected) in [
        ("PRAGMA cipher_page_size", "4096"),
        ("PRAGMA cipher_use_hmac", "1"),
        ("PRAGMA cipher_memory_security", "1"),
    ] {
        let actual: String = db
            .query_row(query, [], |r| r.get(0))
            .map_err(|_| CandidateError::Blocked)?;
        if actual != expected {
            return Err(CandidateError::Blocked);
        }
    }
    Ok(())
}

fn connection_profile(db: &Connection) -> Result<()> {
    db.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY; PRAGMA synchronous = FULL;",
    )
    .map_err(|_| CandidateError::Sqlite)?;
    for (query, expected) in [
        ("PRAGMA foreign_keys", 1_i64),
        ("PRAGMA temp_store", 2),
        ("PRAGMA synchronous", 2),
    ] {
        let actual: i64 = db
            .query_row(query, [], |r| r.get(0))
            .map_err(|_| CandidateError::Sqlite)?;
        if actual != expected {
            return Err(CandidateError::Blocked);
        }
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> Zeroizing<String> {
    const DIGITS: &[u8; 16] = b"0123456789ABCDEF";
    let mut result = Zeroizing::new(String::with_capacity(bytes.len() * 2));
    for byte in bytes {
        result.push(DIGITS[(byte >> 4) as usize] as char);
        result.push(DIGITS[(byte & 15) as usize] as char);
    }
    result
}

fn safe_root(root: &Path) -> Result<()> {
    if !root.is_absolute()
        || root
            .as_os_str()
            .as_encoded_bytes()
            .split(|b| *b == b'/' || (cfg!(windows) && *b == b'\\'))
            .any(|part| part == b"." || part == b"..")
    {
        return Err(CandidateError::Blocked);
    }
    for ancestor in root.ancestors() {
        if !safe_metadata(ancestor)?.is_dir() {
            return Err(CandidateError::Blocked);
        }
    }
    Ok(())
}

fn safe_metadata(path: &Path) -> Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path).map_err(|_| CandidateError::Blocked)?;
    if metadata.is_symlink() {
        return Err(CandidateError::Blocked);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(CandidateError::Blocked);
        }
    }
    Ok(metadata)
}

fn exclusive_file(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|_| CandidateError::Io)
}

#[cfg(test)]
thread_local! {
    static FAIL_AT: std::cell::Cell<Option<CreationStep>> = const { std::cell::Cell::new(None) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::sqlite::CURRENT_SCHEMA_VERSION;
    use std::fs;
    use tempfile::tempdir;

    const PASSWORD: &str = "candidate password";

    fn snapshot(root: &Path) -> std::collections::BTreeMap<String, Vec<u8>> {
        fs::read_dir(root)
            .unwrap()
            .map(|entry| {
                let entry = entry.unwrap();
                (
                    entry.file_name().into_string().unwrap(),
                    fs::read(entry.path()).unwrap(),
                )
            })
            .collect()
    }

    #[test]
    fn wrong_credentials_and_unkeyed_reads_leave_artifacts_unchanged() {
        let root = tempdir().unwrap();
        create_candidate(root.path(), PASSWORD).unwrap();
        let before = snapshot(root.path());
        for secret in [
            UnlockSecret::Password("wrong password"),
            UnlockSecret::Recovery("wrong recovery"),
        ] {
            assert!(matches!(
                open_candidate(root.path(), secret),
                Err(CandidateError::Authentication)
            ));
            assert_eq!(before, snapshot(root.path()));
        }
        let db = Connection::open_with_flags(
            root.path().join(DATABASE),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        assert!(db
            .query_row("SELECT count(*) FROM sqlite_schema", [], |r| r
                .get::<_, i64>(0))
            .is_err());
        db.close().unwrap();
        assert_eq!(before, snapshot(root.path()));
    }

    #[test]
    fn invalid_password_or_nonempty_destination_never_creates_or_overwrites() {
        let root = tempdir().unwrap();
        for password in ["short", &"x".repeat(1025)] {
            assert!(matches!(
                create_candidate(root.path(), password),
                Err(CandidateError::InvalidSecret)
            ));
            assert!(snapshot(root.path()).is_empty());
        }
        assert!(create_candidate(&root.path().join("absent"), PASSWORD).is_err());
        assert!(!root.path().join("absent").exists());
        assert!(create_candidate(Path::new("."), PASSWORD).is_err());
        fs::write(root.path().join("legacy.sqlite3"), b"retained evidence").unwrap();
        let before = snapshot(root.path());
        assert!(matches!(
            create_candidate(root.path(), PASSWORD),
            Err(CandidateError::Blocked)
        ));
        assert_eq!(before, snapshot(root.path()));
    }

    #[test]
    fn missing_malformed_and_extra_artifacts_deny_without_repair() {
        let source = tempdir().unwrap();
        create_candidate(source.path(), PASSWORD).unwrap();
        let original = snapshot(source.path());
        for case in 0..9 {
            let root = tempdir().unwrap();
            for (name, bytes) in &original {
                fs::write(root.path().join(name), bytes).unwrap();
            }
            match case {
                0 => fs::remove_file(root.path().join(ENVELOPE)).unwrap(),
                1 => fs::remove_file(root.path().join(DATABASE)).unwrap(),
                2 => fs::write(
                    root.path().join(ENVELOPE),
                    &original[ENVELOPE][..ENCODED_LENGTH - 1],
                )
                .unwrap(),
                3 => {
                    let mut bytes = original[ENVELOPE].clone();
                    bytes.push(0);
                    fs::write(root.path().join(ENVELOPE), bytes).unwrap();
                }
                4 => {
                    let mut bytes = original[ENVELOPE].clone();
                    bytes[8] = 99;
                    fs::write(root.path().join(ENVELOPE), bytes).unwrap();
                }
                5 => fs::write(root.path().join(DATABASE), []).unwrap(),
                6 => fs::write(
                    root.path().join("data.sqlite3-journal"),
                    b"retained journal",
                )
                .unwrap(),
                7 => fs::write(root.path().join("data.sqlite3-wal"), b"retained wal").unwrap(),
                8 => {
                    let mut bytes = original[ENVELOPE].clone();
                    bytes[43 + 40] ^= 1; // Password-slot ciphertext.
                    fs::write(root.path().join(ENVELOPE), bytes).unwrap();
                }
                _ => unreachable!(),
            }
            let before = snapshot(root.path());
            assert!(
                open_candidate(root.path(), UnlockSecret::Password(PASSWORD)).is_err(),
                "case {case}"
            );
            assert!(
                create_candidate(root.path(), PASSWORD).is_err(),
                "case {case}"
            );
            assert_eq!(before, snapshot(root.path()), "case {case}");
        }
    }

    #[test]
    fn foreign_envelope_and_authenticated_identity_mismatch_are_rejected() {
        let first = tempdir().unwrap();
        let second = tempdir().unwrap();
        create_candidate(first.path(), PASSWORD).unwrap();
        let other = create_candidate(second.path(), PASSWORD).unwrap();
        fs::copy(second.path().join(ENVELOPE), first.path().join(ENVELOPE)).unwrap();
        let before = snapshot(first.path());
        assert!(open_candidate(first.path(), UnlockSecret::Password(PASSWORD)).is_err());
        assert_eq!(before, snapshot(first.path()));

        // Manufacture a cryptographically readable but context-mismatched fixture.
        let bytes = fs::read(second.path().join(ENVELOPE)).unwrap();
        let key =
            super::super::unlock(&bytes, &other.context, UnlockSecret::Password(PASSWORD)).unwrap();
        let db = Connection::open_with_flags(
            second.path().join(DATABASE),
            OpenFlags::SQLITE_OPEN_READ_WRITE,
        )
        .unwrap();
        apply_key(&db, &key).unwrap();
        db.execute(
            "UPDATE encrypted_candidate_identity SET generation_id = zeroblob(16)",
            [],
        )
        .unwrap();
        db.close().unwrap();
        let before = snapshot(second.path());
        assert!(matches!(
            open_candidate(second.path(), UnlockSecret::Password(PASSWORD)),
            Err(CandidateError::Blocked)
        ));
        assert_eq!(before, snapshot(second.path()));
    }

    #[test]
    fn interrupted_creation_preserves_incomplete_evidence_and_blocks_retry() {
        for step in [
            CreationStep::EnvelopeWritten,
            CreationStep::DatabaseReserved,
            CreationStep::SchemaInitialized,
        ] {
            let root = tempdir().unwrap();
            FAIL_AT.with(|at| at.set(Some(step)));
            let result = create_candidate(root.path(), PASSWORD);
            FAIL_AT.with(|at| at.set(None));
            assert!(matches!(result, Err(CandidateError::Io)));
            let before = snapshot(root.path());
            assert!(!before.is_empty());
            assert!(open_candidate(root.path(), UnlockSecret::Password(PASSWORD)).is_err());
            assert!(create_candidate(root.path(), PASSWORD).is_err());
            assert_eq!(before, snapshot(root.path()));
            root.close().unwrap();
        }
    }

    #[test]
    fn failure_after_final_commit_retains_a_valid_candidate_not_reset_authority() {
        let root = tempdir().unwrap();
        FAIL_AT.with(|at| at.set(Some(CreationStep::IdentityCommitted)));
        let result = create_candidate(root.path(), PASSWORD);
        FAIL_AT.with(|at| at.set(None));
        assert!(matches!(result, Err(CandidateError::Io)));
        let before = snapshot(root.path());
        open_candidate(root.path(), UnlockSecret::Password(PASSWORD))
            .unwrap()
            .close()
            .unwrap();
        assert!(create_candidate(root.path(), PASSWORD).is_err());
        assert_eq!(before, snapshot(root.path()));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_roots_ancestors_and_artifacts_are_rejected_without_writes() {
        use std::os::unix::fs::symlink;
        let parent = tempdir().unwrap();
        let empty = tempdir().unwrap();
        let alias = parent.path().join("alias");
        symlink(empty.path(), &alias).unwrap();
        assert!(create_candidate(&alias, PASSWORD).is_err());
        assert!(snapshot(empty.path()).is_empty());
        let root = empty.path().join("candidate");
        fs::create_dir(&root).unwrap();
        create_candidate(&root, PASSWORD).unwrap();
        assert!(
            open_candidate(&alias.join("candidate"), UnlockSecret::Password(PASSWORD)).is_err()
        );
        let original = empty.path().join("retained-envelope");
        fs::rename(root.join(ENVELOPE), &original).unwrap();
        symlink(&original, root.join(ENVELOPE)).unwrap();
        let before = snapshot(&root);
        assert!(open_candidate(&root, UnlockSecret::Password(PASSWORD)).is_err());
        assert_eq!(before, snapshot(&root));
    }

    #[cfg(windows)]
    #[test]
    fn windows_junction_denies_create_and_open_without_touching_target() {
        let parent = tempdir().unwrap();
        let target = tempdir().unwrap();
        let alias = parent.path().join("alias");
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&alias)
            .arg(target.path())
            .output()
            .unwrap();
        assert!(output.status.success(), "junction fixture failed");
        assert!(create_candidate(&alias, PASSWORD).is_err());
        assert!(snapshot(target.path()).is_empty());
        create_candidate(target.path(), PASSWORD).unwrap();
        let before = snapshot(target.path());
        assert!(open_candidate(&alias, UnlockSecret::Password(PASSWORD)).is_err());
        assert_eq!(before, snapshot(target.path()));
        fs::remove_dir(&alias).unwrap();
        parent.close().unwrap();
        target.close().unwrap();
    }

    #[test]
    fn create_close_and_reopen_current_empty_schema_with_both_credentials() {
        let root = tempdir().unwrap();
        let created = create_candidate(root.path(), "candidate password").unwrap();
        assert_eq!(created.recovery.len(), 48);
        assert!(created
            .recovery
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b)));
        let ciphertext = fs::read(root.path().join("data.sqlite3")).unwrap();
        assert_ne!(&ciphertext[..16], b"SQLite format 3\0");
        assert_eq!(
            fs::read(root.path().join("key-envelope.bin"))
                .unwrap()
                .len(),
            super::super::ENCODED_LENGTH
        );
        for secret in [
            UnlockSecret::Password("candidate password"),
            UnlockSecret::Recovery(&created.recovery),
        ] {
            let db = open_candidate(root.path(), secret).unwrap();
            assert_eq!(
                db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                CURRENT_SCHEMA_VERSION
            );
            assert_eq!(
                db.query_row("SELECT count(*) FROM products", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                0
            );
            let ids: (Vec<u8>, Vec<u8>) = db.query_row("SELECT database_id, generation_id FROM encrypted_candidate_identity WHERE singleton = 1", [], |r| Ok((r.get(0)?,r.get(1)?))).unwrap();
            assert_eq!(ids.0, created.context.database_id);
            assert_eq!(ids.1, created.context.generation_id);
            assert!(db
                .execute("INSERT INTO categories(name) VALUES ('must not write')", [])
                .is_err());
            db.close().unwrap();
        }
        assert_eq!(
            ciphertext,
            fs::read(root.path().join("data.sqlite3")).unwrap()
        );
        root.close().unwrap();
    }
}
