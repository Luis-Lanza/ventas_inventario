//! Owned encrypted lifecycle contract. Desktop activation is a subsequent unit.
use crate::infrastructure::{
    filesystem::storage_ownership::StorageOwnership,
    key_envelope::{
        encrypted_database::{self, AdmittedConnection, CandidateError, PendingCreation},
        UnlockSecret,
    },
};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StorageStatus {
    SetupRequired,
    PendingConfirmation,
    Locked,
    Ready,
    Blocked,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StorageError {
    Ownership,
    Denied,
    InvalidSecret,
    Authentication,
    Blocked,
}

type Result<T> = std::result::Result<T, StorageError>;

/// No connection extraction: borrowed access cannot outlive storage ownership.
/// Field order deliberately closes SQLite before releasing the ownership guard.
pub(crate) struct Storage {
    connection: Option<AdmittedConnection>,
    pending: Option<PendingCreation>,
    status: StorageStatus,
    root: PathBuf,
    _ownership: StorageOwnership,
}

impl Storage {
    pub(crate) fn acquire(root: &Path) -> Result<Self> {
        Self::acquire_owned(root).map_err(|_| StorageError::Ownership)
    }

    /// Preserve the existing desktop ownership error contract without a second lock.
    pub(crate) fn acquire_owned(root: &Path) -> std::result::Result<Self,
        crate::infrastructure::filesystem::storage_ownership::OwnershipError> {
        use crate::infrastructure::filesystem::storage_ownership::OwnershipError;
        // Reject missing/unsafe roots before ownership can create the lock file.
        encrypted_database::safe_root(root).map_err(|_| OwnershipError::Unavailable)?;
        let ownership = StorageOwnership::acquire(root)?;
        let status = match encrypted_database::installation_is_empty(root) {
            Ok(true) => StorageStatus::SetupRequired,
            Ok(false) => StorageStatus::Locked,
            Err(_) => StorageStatus::Blocked,
        };
        Ok(Self {
            connection: None,
            pending: None,
            status,
            root: root.to_owned(),
            _ownership: ownership,
        })
    }

    pub(crate) fn status(&self) -> StorageStatus {
        self.status
    }

    pub(crate) fn begin_setup(&mut self, password: &str) -> Result<&str> {
        if self.status != StorageStatus::SetupRequired {
            return Err(StorageError::Denied);
        }
        let pending = encrypted_database::prepare_creation(password).map_err(map_error)?;
        self.pending = Some(pending);
        self.status = StorageStatus::PendingConfirmation;
        self.pending.as_ref().map(PendingCreation::recovery).ok_or(StorageError::Blocked)
    }

    pub(crate) fn confirm_setup(&mut self, recovery: &str) -> Result<()> {
        if self.status != StorageStatus::PendingConfirmation {
            return Err(StorageError::Denied);
        }
        // Take first, so every confirmation failure consumes the attempt.
        let pending = self.pending.take().ok_or(StorageError::Blocked)?;
        self.status = StorageStatus::Blocked;
        let created = match pending.confirm_installation(&self.root, recovery) {
            Ok(created) => created,
            Err(CandidateError::InvalidSecret) => {
                self.status = StorageStatus::SetupRequired;
                return Err(StorageError::InvalidSecret);
            }
            Err(error) => return Err(map_error(error)),
        };
        // Recovery was delivered before persistence, not exported after admission.
        let connection = encrypted_database::open_operational(
            &self.root, UnlockSecret::Recovery(&created.recovery),
        ).map_err(map_error)?;
        self.connection = Some(connection);
        self.status = StorageStatus::Ready;
        Ok(())
    }

    pub(crate) fn unlock(&mut self, password: &str) -> Result<()> {
        if self.status != StorageStatus::Locked {
            return Err(StorageError::Denied);
        }
        match encrypted_database::open_operational(&self.root, UnlockSecret::Password(password)) {
            Ok(connection) => {
                self.connection = Some(connection);
                self.status = StorageStatus::Ready;
                Ok(())
            }
            Err(CandidateError::Authentication | CandidateError::InvalidSecret) => {
                Err(StorageError::Authentication)
            }
            Err(error) => {
                self.status = StorageStatus::Blocked;
                Err(map_error(error))
            }
        }
    }

    /// Verify Catalog credentials against this installation, without granting it.
    pub(crate) fn verify_password(&self, password: &str) -> Result<()> {
        if self.status != StorageStatus::Ready { return Err(StorageError::Denied); }
        self.connection.as_ref().ok_or(StorageError::Denied)?
            .verify_password(&self.root, password).map_err(map_error)
    }

    /// Shared access prevents extracting the owned keyed connection with mem::replace.
    /// Storage admission only; callers must independently enforce Catalog authority.
    pub(crate) fn connection(&self) -> Result<&Connection> {
        if self.status != StorageStatus::Ready {
            return Err(StorageError::Denied);
        }
        self.connection.as_ref().map(AdmittedConnection::connection).ok_or(StorageError::Denied)
    }
}

fn map_error(error: CandidateError) -> StorageError {
    match error {
        CandidateError::InvalidSecret => StorageError::InvalidSecret,
        CandidateError::Authentication => StorageError::Authentication,
        _ => StorageError::Blocked,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::BTreeMap, fs, path::PathBuf};
    use zeroize::Zeroizing;

    const PASSWORD: &str = "storage lifecycle password";
    const DIRECTORY: &str = "encrypted-storage";

    // Ignore only the existing non-authoritative ownership file. Compare every
    // other directory and byte, including SQLite sidecars, through the filesystem.
    fn snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
        fn visit(root: &Path, path: &Path, result: &mut BTreeMap<PathBuf, Vec<u8>>) {
            for entry in fs::read_dir(path).unwrap() {
                let entry = entry.unwrap();
                if entry.file_name() == ".velay-storage.lock" {
                    continue;
                }
                let path = entry.path();
                let relative = path.strip_prefix(root).unwrap().to_owned();
                if entry.file_type().unwrap().is_dir() {
                    result.insert(relative, Vec::new());
                    visit(root, &path, result);
                } else {
                    result.insert(relative, fs::read(path).unwrap());
                }
            }
        }
        let mut result = BTreeMap::new();
        visit(root, root, &mut result);
        result
    }

    #[test]
    fn missing_root_is_refused_without_creating_storage_or_lock() {
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("absent-app-data");
        let before = snapshot(parent.path());
        let refused = Storage::acquire(&root).is_err();
        assert!(refused, "missing application-data root must be refused before ownership acquisition");
        assert!(!root.exists(), "acquisition must not create the application-data root");
        assert_eq!(before, snapshot(parent.path()));
        parent.close().unwrap();
    }

    #[test]
    fn confirmed_setup_uses_only_fixed_files_in_preexisting_root_without_nested_directory() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::acquire(root.path()).unwrap();
        assert_eq!(storage.status(), StorageStatus::SetupRequired);
        let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
        assert!(snapshot(root.path()).is_empty());
        storage.confirm_setup(&recovery).unwrap();
        assert_eq!(storage.status(), StorageStatus::Ready);
        let entries: std::collections::BTreeSet<_> = fs::read_dir(root.path())
            .unwrap()
            .map(|entry| {
                let entry = entry.unwrap();
                assert!(entry.file_type().unwrap().is_file(), "setup must create no nested directory");
                entry.file_name()
            })
            .collect();
        let expected: std::collections::BTreeSet<_> = [
            ".velay-storage.lock", "data.sqlite3", "key-envelope.bin",
        ].into_iter().map(std::ffi::OsString::from).collect();
        assert_eq!(entries, expected);
        assert!(!root.path().join("encrypted-storage").exists());
        assert_ne!(&fs::read(root.path().join("data.sqlite3")).unwrap()[..16], b"SQLite format 3\0");
        assert!(!fs::read(root.path().join("key-envelope.bin")).unwrap().is_empty());
        drop(storage);
        root.close().unwrap();
    }

    #[test]
    fn connection_api_returns_only_a_shared_borrow_tied_to_storage() {
        // Replaces the observed runtime extraction exploit: mem::replace now
        // requires mutable access that this API cannot supply. Check the method
        // directly, not a wrapper that could coerce &mut Connection to &Connection.
        let _: for<'a> fn(&'a Storage) -> Result<&'a Connection> = Storage::connection;
    }

    #[test]
    fn empty_setup_denies_business_and_consumes_mismatched_confirmation_without_writes() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::acquire(root.path()).unwrap();
        assert_eq!(storage.status(), StorageStatus::SetupRequired);
        assert!(matches!(storage.connection(), Err(StorageError::Denied)));
        assert_eq!(storage.unlock(PASSWORD), Err(StorageError::Denied));
        assert_eq!(storage.begin_setup("short"), Err(StorageError::InvalidSecret));
        assert_eq!(storage.status(), StorageStatus::SetupRequired);
        let before = snapshot(root.path());
        let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
        assert_eq!(storage.status(), StorageStatus::PendingConfirmation);
        assert_eq!(before, snapshot(root.path()));
        assert!(matches!(storage.connection(), Err(StorageError::Denied)));
        assert_eq!(storage.confirm_setup(&format!("{} ", recovery.as_str())), Err(StorageError::InvalidSecret));
        assert_eq!(storage.status(), StorageStatus::SetupRequired);
        assert_eq!(storage.confirm_setup(&recovery), Err(StorageError::Denied));
        assert_eq!(before, snapshot(root.path()));
        drop(storage);
        root.close().unwrap();
    }

    #[test]
    fn confirmed_setup_commits_keyed_rw_and_password_reopens_without_reset() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::acquire(root.path()).unwrap();
        let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
        storage.confirm_setup(&recovery).unwrap();
        assert_eq!(storage.status(), StorageStatus::Ready);
        assert_eq!(storage.begin_setup(PASSWORD), Err(StorageError::Denied));
        assert_eq!(storage.confirm_setup(&recovery), Err(StorageError::Denied));
        let db = storage.connection().unwrap();
        for (pragma, expected) in [("PRAGMA foreign_keys", 1), ("PRAGMA synchronous", 2)] {
            assert_eq!(db.query_row(pragma, [], |r| r.get::<_, i64>(0)).unwrap(), expected);
        }
        let transaction = db.unchecked_transaction().unwrap();
        transaction.execute("INSERT INTO categories(name) VALUES (?1)", ["committed encrypted category"]).unwrap();
        transaction.commit().unwrap();
        assert_ne!(&fs::read(root.path().join("data.sqlite3")).unwrap()[..16], b"SQLite format 3\0");
        drop(storage);
        let mut storage = Storage::acquire(root.path()).unwrap();
        assert_eq!(storage.status(), StorageStatus::Locked);
        assert!(matches!(storage.connection(), Err(StorageError::Denied)));
        let before = snapshot(root.path());
        assert_eq!(storage.unlock("incorrect password"), Err(StorageError::Authentication));
        assert_eq!(storage.status(), StorageStatus::Locked);
        assert_eq!(before, snapshot(root.path()));
        storage.unlock(PASSWORD).unwrap();
        assert_eq!(storage.status(), StorageStatus::Ready);
        assert_eq!(storage.connection().unwrap().query_row("SELECT count(*) FROM categories WHERE name = ?1", ["committed encrypted category"], |r| r.get::<_, i64>(0)).unwrap(), 1);
        drop(storage);
        root.close().unwrap();
    }

    #[test]
    fn unknown_plaintext_and_partial_evidence_block_setup_and_preserve_bytes() {
        for case in 0..5 {
            let root = tempfile::tempdir().unwrap();
            match case {
                0 => fs::write(root.path().join("legacy.sqlite3"), b"SQLite format 3\0retained").unwrap(),
                1 => {
                    fs::write(root.path().join("data.sqlite3"), b"retained database without envelope").unwrap();
                }
                2 => { fs::create_dir(root.path().join(DIRECTORY)).unwrap(); }
                3 => {
                    fs::write(root.path().join("key-envelope.bin"), b"corrupt envelope").unwrap();
                }
                _ => fs::write(root.path().join("unknown"), b"retained").unwrap(),
            }
            let before = snapshot(root.path());
            let mut storage = Storage::acquire(root.path()).unwrap();
            assert_eq!(storage.status(), StorageStatus::Blocked, "case {case}");
            assert_eq!(storage.begin_setup(PASSWORD), Err(StorageError::Denied));
            assert_eq!(storage.confirm_setup("not a recovery code"), Err(StorageError::Denied));
            assert_eq!(storage.unlock(PASSWORD), Err(StorageError::Denied));
            assert!(matches!(storage.connection(), Err(StorageError::Denied)));
            assert_eq!(before, snapshot(root.path()));
            drop(storage);
            root.close().unwrap();
        }
    }

    #[test]
    fn missing_established_envelope_and_wal_never_become_setup_permission() {
        for missing_envelope in [true, false] {
            let root = tempfile::tempdir().unwrap();
            let mut storage = Storage::acquire(root.path()).unwrap();
            let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
            storage.confirm_setup(&recovery).unwrap();
            drop(storage);
            if missing_envelope {
                // Relocate evidence inside this synthetic fixture; never delete it.
                fs::rename(root.path().join("key-envelope.bin"), root.path().join("retained-envelope")).unwrap();
            } else {
                fs::write(root.path().join("data.sqlite3-wal"), b"unknown WAL evidence").unwrap();
            }
            let before = snapshot(root.path());
            let mut storage = Storage::acquire(root.path()).unwrap();
            assert_eq!(storage.status(), StorageStatus::Blocked);
            assert_eq!(storage.begin_setup(PASSWORD), Err(StorageError::Denied));
            assert_eq!(storage.unlock(PASSWORD), Err(StorageError::Denied));
            assert!(matches!(storage.connection(), Err(StorageError::Denied)));
            assert_eq!(before, snapshot(root.path()));
            drop(storage);
            root.close().unwrap();
        }
    }

    #[test]
    #[ignore = "process-exit fixture invoked only by hot_journal_recovers_after_process_exit"]
    fn hot_journal_child() {
        let path = std::env::var_os("VELAY_STORAGE_TEST_ROOT").unwrap();
        let mut storage = Storage::acquire(Path::new(&path)).unwrap();
        storage.unlock(PASSWORD).unwrap();
        let db = storage.connection().unwrap();
        db.execute_batch("PRAGMA cache_size = 5;").unwrap();
        let transaction = db.unchecked_transaction().unwrap();
        for index in 0..2000 {
            transaction.execute("INSERT INTO categories(name) VALUES (?1)", [format!("uncommitted-{index}-{}", "x".repeat(4000))]).unwrap();
        }
        // Exit without SQLite rollback, Connection drop, or ownership cleanup.
        std::process::exit(0);
    }

    #[test]
    fn hot_journal_recovers_after_process_exit() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::acquire(root.path()).unwrap();
        let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
        storage.confirm_setup(&recovery).unwrap();
        storage.connection().unwrap().execute("INSERT INTO categories(name) VALUES ('acknowledged')", []).unwrap();
        drop(storage);
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "application::storage::tests::hot_journal_child", "--ignored", "--nocapture"])
            .env("VELAY_STORAGE_TEST_ROOT", root.path())
            .output().unwrap();
        assert!(output.status.success(), "child stdout: {}; stderr: {}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
        let journal = fs::read(root.path().join("data.sqlite3-journal")).unwrap();
        assert!(journal.len() > 512);
        assert_eq!(&journal[..8], &[0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7]);
        let before = snapshot(root.path());
        let mut storage = Storage::acquire(root.path()).unwrap();
        assert_eq!(storage.status(), StorageStatus::Locked);
        assert_eq!(storage.unlock("wrong password"), Err(StorageError::Authentication));
        assert_eq!(storage.status(), StorageStatus::Locked);
        assert_eq!(before, snapshot(root.path()));
        storage.unlock(PASSWORD).unwrap();
        assert_eq!(storage.connection().unwrap().query_row("SELECT count(*) FROM categories", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        assert_eq!(storage.connection().unwrap().query_row("SELECT name FROM categories", [], |r| r.get::<_, String>(0)).unwrap(), "acknowledged");
        drop(storage);
        root.close().unwrap();
    }

    #[test]
    fn ownership_excludes_contenders_before_classification_and_until_ready_connection_drops() {
        let root = tempfile::tempdir().unwrap();
        let mut storage = Storage::acquire(root.path()).unwrap();
        assert!(matches!(Storage::acquire(root.path()), Err(StorageError::Ownership)));
        let recovery = Zeroizing::new(storage.begin_setup(PASSWORD).unwrap().to_owned());
        assert!(matches!(Storage::acquire(root.path()), Err(StorageError::Ownership)));
        storage.confirm_setup(&recovery).unwrap();
        let before = snapshot(root.path());
        assert!(matches!(Storage::acquire(root.path()), Err(StorageError::Ownership)));
        assert_eq!(before, snapshot(root.path()));
        drop(storage);
        let mut reopened = Storage::acquire(root.path()).unwrap();
        reopened.unlock(PASSWORD).unwrap();
        assert_eq!(reopened.status(), StorageStatus::Ready);
        drop(reopened);
        root.close().unwrap();
    }
}
