# Create and reopen an encrypted candidate

This opt-in, crate-private adapter prepares an **inactive candidate**, not an installed database. It creates an empty current-schema SQLCipher database with its authenticated key envelope, closes it, then authenticates and reopens it read-only. Application startup and default builds are unchanged.

**Status:** The original eight candidate tests passed on Linux and Windows at `670a938` (tracker L54). The memory-only setup prerequisite adds three tests: the worker reported 11/11 passing on Linux after an earlier serial timeout; Windows execution of these additions remains pending. Independent static inspection found no blocking issue in either bounded subunit, but supplied no independent runtime approval. This is not production encryption or durable installation provisioning.

## Contract

`key_envelope::encrypted_database` is compiled only with the existing `sqlcipher-build-probe` feature. It does not expose raw keys or add dependencies.

| Entry point | Result | Preconditions |
| --- | --- | --- |
| `create_candidate(root, password)` | Context IDs and a zeroizing recovery-secret string; no open handle | Explicit creation intent, existing empty absolute directory, cooperative exclusive ownership |
| `open_candidate(root, secret)` | Validated read-only SQLite connection | Complete closed candidate; password or recovery secret; continued cooperative namespace exclusion |

A successful create generates independent random database/generation IDs, a random DEK through the existing envelope core, and 24 random recovery bytes encoded as 48 uppercase hexadecimal characters. Password semantics remain the envelope's exact 8–1024 UTF-8 bytes. Recovery unlock does **not** change a password, rotate a key, or authorize Catalog administration.

The fixed candidate layout is:

```text
<dedicated candidate directory>/
  data.sqlite3
  key-envelope.bin
```

The generation inspector remains unchanged and inactive for this layout: there is no selector or installation publication operation.

## Creation and authentication

1. Reject nonempty, missing, relative, symlink or Windows reparse-point roots and unsafe ancestors. Never overwrite existing entries.
2. Exclusively create the 219-byte envelope and database reservation. Errors retain artifacts rather than deleting evidence or retrying setup.
3. Apply the private 32-byte DEK using SQLCipher raw-key hexadecimal syntax **before schema access**. Reject unavailable/non-v4 SQLCipher; select the v4 codec profile and check page size, HMAC and memory-security settings.
4. Use rollback-journal `DELETE` mode, `synchronous=FULL`, `temp_store=MEMORY` and foreign keys. Initialize the existing current empty business schema without modifying its migration bodies.
5. Commit a candidate-only encrypted identity table containing both context IDs. Explicitly close SQLite, flush the database file, and authenticate a read-only reopen before returning credentials.

On reopen, reject unknown entries and SQLite sidecars before opening SQLite. Read at most envelope length plus one byte; authenticate the envelope before database access. Header IDs are untrusted until that authentication succeeds. Then validate database family, schema, integrity and foreign keys through the existing validator, and compare the encrypted identity with the authenticated envelope IDs. No migration or repair occurs.

The returned connection is opened with `SQLITE_OPEN_READ_ONLY`, never `CREATE`. The caller is responsible for closing it. Wrong credentials, missing/corrupt artifacts and mismatches do not authorize fresh initialization.

## Failure boundaries

| Observed state | Outcome |
| --- | --- |
| Existing empty directory and explicit create request | Candidate creation is allowed; not evidence of installation history |
| Surviving partial envelope/database/schema | Open and repeated create are rejected; artifacts retained |
| Complete identity committed, but create later returns an error | A valid pair may still reopen with the password; create remains rejected |
| Missing metadata from a nonempty candidate | Rejected, never reset |
| Any journal/WAL/unknown entry | Rejected without cleanup or automatic recovery |

An error is **not** a promise that no files changed. The legacy `create_candidate` contract still returns recovery credentials only after creation; losing that response can lose recovery delivery.

## Memory-only setup prerequisite (T7a foundation)

`prepare_creation(password)` now generates the same context, DEK, envelope and recovery secret entirely in memory. It takes no path and performs no filesystem operations. `PendingCreation::recovery()` lends the secret for delivery. Dropping the pending attempt abandons it without persistent credentials; key and recovery buffers are zeroizing.

`PendingCreation::confirm(root, recovery)` consumes the attempt. An exact recovery-string match is required (no case folding or whitespace normalization); mismatch returns `InvalidSecret` before filesystem access. Confirmation rechecks the existing safe, empty destination and then reuses the candidate persistence path, including exclusive final-name creation and successful writable-file `sync_all` before database creation. Existing or partial evidence returns an error and is never overwritten or reset. Failure consumes the attempt and may retain partial evidence, as with legacy candidate creation.

This is the shared creation prerequisite, not registered native setup or desktop admission. It does not yet implement startup ownership/classification, keyed RW recovery, Catalog guards or business-write admission. The future application seam must retain ownership through confirmation and connection lifetime, deliver recovery before accepting confirmation, and fail closed after any persistence error. The legacy candidate API and strict read-only reopen remain available unchanged.

`sync_all`, successful SQLCipher transactions, explicit close, and these tests do **not** prove parent-directory persistence across power loss. Loss of every newly created namespace artifact cannot be distinguished from an unused empty directory by this adapter. Production provisioning/recognition and matched-pair publication remain unresolved. `DELETE` journal mode here is not a substitute Windows namespace durability barrier.

Caller exclusion is a precondition, not a filesystem CAS or cross-process lock. Path checks do not defeat hostile concurrent namespace swaps or hard-link attacks. Same-user/admin compromise and complete historical-pair rollback remain outside the accepted threat boundary. Our temporary key/recovery buffers are zeroizing; this does not guarantee erasure of SQLite/rusqlite internal copies, swap, crash dumps, or every plaintext page in process memory.

## Focused checks

Only disposable synthetic data is used; do not run the application or installer against customer data.

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --features sqlcipher-build-probe --lib infrastructure::key_envelope::encrypted_database::tests -- --test-threads=1
```

For Windows PowerShell, avoid wrapping a long command manually:

```powershell
$cargoArgs = @(
  'test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked',
  '--features', 'sqlcipher-build-probe', '--lib',
  'infrastructure::key_envelope::encrypted_database::tests',
  '--', '--test-threads=1'
)
cargo @cargoArgs
$LASTEXITCODE
```

The Windows junction fixture must execute successfully; it is not silently skipped. Handle closure and actual Windows behavior require Windows results, not inference from Linux. Source transport to the VM requires separate branch-specific publishing authorization.

Startup integration, writable business admission, DPAPI persistence, password reset, key rotation, backup/restore and durable activation are intentionally absent. See [the envelope contract](ENCRYPTED_STORAGE_ENVELOPE.md) and [feature tracking](../odd/tasks/encrypted-catalog-storage.md).
