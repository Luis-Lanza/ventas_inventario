//! Cooperative application ownership, not storage initialization authority.
use std::{
    fmt,
    fs::{self, File, OpenOptions, TryLockError},
    path::Path,
};

const LOCK_FILE: &str = ".velay-storage.lock";

/// Owns the OS lock; must outlive every database connection using the installation.
/// Never cloned or exposed as a raw file handle.
pub struct StorageOwnership {
    _file: File,
}

#[derive(Debug, PartialEq, Eq)]
pub enum OwnershipError {
    InUse,
    Unavailable,
}

impl fmt::Display for OwnershipError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InUse => "storage_in_use",
            Self::Unavailable => "storage_unavailable",
        })
    }
}
impl std::error::Error for OwnershipError {}

impl StorageOwnership {
    /// Acquire ownership of an existing application-data directory without waiting.
    pub fn acquire(root: &Path) -> Result<Self, OwnershipError> {
        // Equivalent directory spellings must contend on the same OS file, not
        // independently hashed names. Hostile namespace replacement is excluded.
        let root = root
            .canonicalize()
            .map_err(|_| OwnershipError::Unavailable)?;
        if !root.is_dir() {
            return Err(OwnershipError::Unavailable);
        }
        let path = root.join(LOCK_FILE);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if !regular_lock_file(&metadata) => {
                return Err(OwnershipError::Unavailable)
            }
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err(OwnershipError::Unavailable),
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};
            // Do not permit deletion while an owner/contender holds this file.
            options.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE);
        }
        let file = options
            .open(path)
            .map_err(|_| OwnershipError::Unavailable)?;
        if !regular_lock_file(&file.metadata().map_err(|_| OwnershipError::Unavailable)?) {
            return Err(OwnershipError::Unavailable);
        }
        match file.try_lock() {
            Ok(()) => Ok(Self { _file: file }),
            Err(TryLockError::WouldBlock) => Err(OwnershipError::InUse),
            Err(TryLockError::Error(_)) => Err(OwnershipError::Unavailable),
        }
    }
}

fn regular_lock_file(metadata: &fs::Metadata) -> bool {
    if !metadata.is_file() || metadata.is_symlink() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes()
            & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT
            != 0
        {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_lock_contents_are_preserved_and_never_mean_owned() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(LOCK_FILE);
        fs::write(&path, b"non-authoritative retained bytes").unwrap();
        let owner = StorageOwnership::acquire(root.path()).unwrap();
        assert!(matches!(
            StorageOwnership::acquire(root.path()),
            Err(OwnershipError::InUse)
        ));
        drop(owner);
        assert_eq!(
            fs::read(&path).unwrap(),
            b"non-authoritative retained bytes"
        );
        drop(StorageOwnership::acquire(root.path()).unwrap());
        assert_eq!(fs::read(path).unwrap(), b"non-authoritative retained bytes");
        root.close().unwrap();
    }

    #[test]
    fn missing_root_or_nonregular_lock_fails_without_repair() {
        let root = tempfile::tempdir().unwrap();
        let absent = root.path().join("absent");
        assert!(matches!(
            StorageOwnership::acquire(&absent),
            Err(OwnershipError::Unavailable)
        ));
        assert!(!absent.exists());
        let path = root.path().join(LOCK_FILE);
        fs::create_dir(&path).unwrap();
        fs::write(path.join("retained"), b"evidence").unwrap();
        assert!(matches!(
            StorageOwnership::acquire(root.path()),
            Err(OwnershipError::Unavailable)
        ));
        assert_eq!(fs::read(path.join("retained")).unwrap(), b"evidence");
        root.close().unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn junction_directory_alias_contends_on_the_same_owner() {
        let root = tempfile::tempdir().unwrap();
        let real = root.path().join("real");
        let alias = root.path().join("alias");
        fs::create_dir(&real).unwrap();
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&alias)
            .arg(&real)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "junction creation failed: {:?}",
            output
        );
        let owner = StorageOwnership::acquire(&real).unwrap();
        assert!(matches!(
            StorageOwnership::acquire(&alias),
            Err(OwnershipError::InUse)
        ));
        drop(owner);
        drop(StorageOwnership::acquire(&alias).unwrap());
        root.close().unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn directory_alias_contends_but_lock_symlink_is_not_followed() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let real = root.path().join("real");
        let alias = root.path().join("alias");
        fs::create_dir(&real).unwrap();
        symlink(&real, &alias).unwrap();
        let owner = StorageOwnership::acquire(&real).unwrap();
        assert!(matches!(
            StorageOwnership::acquire(&alias),
            Err(OwnershipError::InUse)
        ));
        drop(owner);
        let invalid = root.path().join("invalid");
        fs::create_dir(&invalid).unwrap();
        let target = root.path().join("evidence");
        fs::write(&target, b"retained").unwrap();
        symlink(&target, invalid.join(LOCK_FILE)).unwrap();
        assert!(matches!(
            StorageOwnership::acquire(&invalid),
            Err(OwnershipError::Unavailable)
        ));
        assert_eq!(fs::read(target).unwrap(), b"retained");
        root.close().unwrap();
    }

    #[test]
    fn exclusive_owner_blocks_second_handle_and_releases_on_drop() {
        let root = tempfile::tempdir().unwrap();
        let first = StorageOwnership::acquire(root.path()).unwrap();
        assert!(matches!(
            StorageOwnership::acquire(root.path()),
            Err(OwnershipError::InUse)
        ));
        assert!(matches!(
            StorageOwnership::acquire(&root.path().join(".")),
            Err(OwnershipError::InUse)
        ));
        drop(first);
        let next = StorageOwnership::acquire(root.path()).unwrap();
        drop(next);
        root.close().unwrap();
    }
}
