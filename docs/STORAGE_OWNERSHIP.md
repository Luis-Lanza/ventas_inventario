# Application storage ownership

Desktop startup and `bootstrap-demo` now share a cooperative, nonblocking OS lock. This is an ownership prerequisite, **not encrypted startup**, initialization authority, or a power-loss durability guarantee.

## Contract

- Desktop creates the application-data directory if absent, then acquires ownership **before** database classification/recovery and Catalog initialization.
- The persistent `.velay-storage.lock` belongs to that directory, outside encrypted candidate directories. Its contents are never truncated and it is never removed as stale. Presence alone says nothing about setup, credentials, recovery, or whether a process owns storage.
- `File::try_lock` holds the lock through a private, non-cloneable file handle. Contention reports `storage_in_use`; other acquisition failures report `storage_unavailable`. Startup stops rather than opening SQLite without ownership.
- `DatabaseStateInner` retains ownership even when database recovery returns unavailable. Its connection field is dropped before the ownership field. Existing database mutexes, admission epochs, and backup-before-database lock ordering are unchanged.
- `bootstrap-demo` acquires the same directory lock before opening its existing database and retains it until its connection closes. Close Velay before running it. Help and argument parsing do not acquire ownership.
- Directory aliases resolve to the same lock. Windows handles disallow deletion sharing while open. Normal process exit or forced termination releases the OS lock without deleting the lock file.

This is cooperative exclusion, not a hostile-filesystem sandbox. Do not delete/replace the lock while a process runs. Arbitrary database-file hardlinks/symlinks across different storage directories, hostile namespace races, network-filesystem semantics, external SQLite clients, and direct library/fixture openers are outside this protocol. No application data is deleted or reset by this change.

## Toolchain

The crate declares Rust **1.89 or newer**, where standard-library file locking became stable. No dependency versions changed. The implementation maps to Windows `LockFileEx` and Unix `flock` through Rust. Linux checks use the installed compiler; declaring the floor is not evidence of a complete build on exactly Rust 1.89.

## Focused verification

Use synthetic temporary fixtures only; do not launch Velay or bootstrap against real AppData.

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib infrastructure::filesystem::storage_ownership::tests -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib database_state_tests::owned_ -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --locked --test storage_ownership -- --test-threads=1
```

The subprocess fixture is intentionally ignored by the ordinary test harness and explicitly executed by its parent test. That parent verifies exclusion while the child owns storage, then reacquisition after normal exit and forced termination. Guard tests verify persistent contents, fail-closed acquisition errors, and directory aliases (Unix symlink or Windows junction). Startup tests cover denial before database creation, retained invalid-database evidence, and ownership lifetime. CLI checks assert exit codes, exact output, and unchanged database bytes on rejection.

Windows acceptance remains required. In PowerShell, record `rustc --version`, `git rev-parse HEAD`, each command's summary and `$LASTEXITCODE`. Run the commands above, then:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml --locked --features desktop
$LASTEXITCODE
```

Windows junction/handle behavior and desktop compilation cannot be inferred from Linux passes. No installer execution is required for this unit.

## Known baseline issue and scope

Before CLI ownership integration, a first `bootstrap-demo` invocation loaded the synthetic catalog successfully, but a second process refused that completed fixture with `database is not the recognized pristine bootstrap state`. The compatibility test preserves this observed baseline; the existing in-memory idempotency test does not prove CLI reopen idempotency. This unit does not fix that separate issue.

Encrypted setup/unlock, credential sessions, backups/restore/fresh-DEK rotation, and envelope-before-first-business-ack persistence remain unfinished. Ownership tests and successful SQLite calls do not establish power-loss persistence ordering or full encrypted-product readiness.
