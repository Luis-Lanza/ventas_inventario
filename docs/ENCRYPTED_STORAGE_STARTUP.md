# Encrypted storage lifecycle — implementation in progress

## Current boundary

`production-encryption` explicitly enables the existing SQLCipher feature without
changing default fixture behavior. With this feature, `DatabaseState::open_owned_application`
now acquires and retains encrypted `Storage` without running plaintext startup recovery.
The preexisting root is required; setup-required, locked, and blocked installations
all deny business admission. Plaintext fixture/library openers remain unchanged.
Native lifecycle handlers and shared-connection Ready dispatch are now implemented
and registered in the shared desktop builder. Parent job-21 observed the focused
integration suite pass 10/10 and the diff check pass (exit 0). Independent static
verifier `mvwtkih1-l-bafm` found no causal blocker in that shared-business/native-guard
slice; it did not supply independent runtime or Windows desktop compilation proof. A single
DatabaseState mutex serializes transitions and business dispatch; successful
confirmation/unlock opens a fresh even admission epoch. Denied repeat lifecycle
requests cannot clear an existing write block. SQL transaction modes are preserved
explicitly when borrowing shared connections: Immediate stays Immediate and the
previous default transaction mode stays Deferred.

Envelope-backed explicit Catalog unlock and narrow application-root artifact
compatibility are now implemented, awaiting focused GREEN. This is not full feature
acceptance: broader current-revision regressions, independent verification of the
new authority/policy slice, and current Windows desktop compilation remain pending.
Credential rotation/recovery and encrypted backups remain deferred to T4.

## Contract under test

The application-data root must already exist and be safe before `StorageOwnership`
is acquired and before classification. Acquisition does not establish or create the
root. The persistent `.velay-storage.lock` is non-authoritative. Fixed files
`data.sqlite3` and `key-envelope.bin` live directly in that root, alongside,
only for operational rollback recovery, an optional `data.sqlite3-journal`.
Unknown root entries, plaintext, partial state, a missing envelope, unsafe paths,
and WAL layouts deny setup and business access without reset or migration.
Only storage positively empty of encrypted/data evidence permits setup; the exact
non-authoritative desktop artifacts listed below do not count as initialization.

Setup generates credentials in memory and returns the recovery code before any
persistent creation. Exact recovery confirmation consumes the attempt even on
mismatch. Installation confirmation and `PendingCreation::confirm` share the same
confirmation/persistence helper, including the exclusive permanent-name writable
envelope `sync_all` barrier before database creation/admission. This is not a directory-flush, replacement-publication, or
absolute hardware durability guarantee. Setup creates no directory or new ancestor;
flushing a child file is not proof of new-ancestor persistence. Establishment and
persistence of the preexisting root are environmental prerequisites under ordinary
supported local-filesystem assumptions, not guarantees supplied by provisioning.
An existing `encrypted-storage/` directory is unknown partial evidence and blocks
admission; it is never relocated, deleted, or migrated. Operational inspection now
recognizes safe final license/Catalog files and the exact empty backup directory
layout below; broader desktop runtime compatibility is not yet verified.

Locked unlock authenticates the envelope password before opening SQLite RW without
CREATE. The keyed opener must reuse the codec/profile and encrypted identity/schema
validation, permit SQLite rollback-journal recovery, and reject WAL/unknown layouts.
The strict read-only candidate opener still requires exactly two files and rejects
the ownership lock; only operational inspection recognizes non-authoritative
regular files and the narrow empty directory layout. Admission requires foreign
keys and FULL synchronous durability. The connection must close before ownership
is released. `Storage::connection` returns only a shared `&Connection` tied to
`&Storage`, preventing safe owned extraction with `mem::replace`. SQL writes
remain available through rusqlite's shared-reference methods; transaction tests
use `unchecked_transaction` without transferring connection ownership. Authenticated
SQLite recovery occurs before identity validation and may mutate storage before
rejection; byte-identical state is not promised for every operational failure.
Storage unlock does not grant Catalog administration or establish a
second JSON credential authority. Explicit Catalog unlock is a separate command
and session transition, authenticated against the active keyed installation.

## Native lifecycle contract

Headless handlers `status`, `begin_setup`, `confirm_recovery`, and `unlock` live in
`commands/storage.rs`. Registered native names are `storage_status_command`,
`storage_begin_setup_command`, `storage_confirm_recovery_command`, and
`storage_unlock_command`. In feature-off builds these additive commands return
`storage_unavailable` without changing legacy storage behavior. Source registration
checks do not establish Tauri runtime compilation.

Password requests contain only `password`; confirmation requests contain only
`recovery_code`. Unknown fields are rejected and secrets are not trimmed.
Responses use `kind`: `status` with a bounded `status` string, `recovery_code` with
`recovery_code` only on successful setup initiation, `success`, or `error` with a
bounded `code`. Errors are `storage_unavailable`, `storage_denied`,
`validation_error`, and `invalid_credentials`. Status never returns a secret.
Setup status values are `setup_required`, `pending_confirmation`, `locked`,
`ready`, and `blocked`.

Tests require exact status/error serialization, memory-only setup, one-time recovery
delivery, consumed mismatched confirmation, keyed business location write/reopen,
wrong-password non-mutation, retired write admission rejection, and static native
registration. Password and confirmation request buffers are zeroized after handling.
Parent job-21 supplied the 10/10 focused GREEN result for this slice; broader
regressions and Windows desktop execution remain separate evidence.

## Encrypted transition guards

Application-selected Catalog sessions reject legacy JSON setup, confirmation,
unlock, password changes, and recovery with
the existing bounded `access_unavailable` response. Direct legacy fixture sessions
remain unchanged. Removing the JSON never enables setup. Explicit application
Catalog unlock verifies the envelope password and active installation identity;
storage unlock itself never grants Catalog authority.

The legacy single-file backup/restore protocol must be denied for owned encrypted
storage while retained for plaintext fixtures. New RED checks cover the mode
predicate and native handler guard presence; structural checks are not runtime
Tauri proof or complete backup-denial verification. Native backup creation, restore
preparation/confirmation, and both file pickers check mode before picker/token/session
or disk effects and return bounded `storage_unavailable`. The install seam separately
rejects legacy replacement for encrypted storage. Plaintext fixture support remains.
Application-selected encrypted Catalog sessions never read legacy JSON. They start
Locked and gain authority only through explicit application Catalog unlock. Legacy
credential methods remain unavailable even after successful Catalog unlock.

## Catalog authority and desktop artifact slice — GREEN candidate

`unlock_catalog_for_application` now uses the established envelope password under
DatabaseState admission. Storage must be Ready with writes admitted. Envelope
framing/context is inspected, but public context IDs alone are not authority.
Operational admission now returns a private `AdmittedConnection` pairing the keyed
connection with the exact original envelope bytes used to authenticate its DEK.
Those bytes are moved from the same authentication/open flow only after keyed
schema/identity validation succeeds; no post-admission reread creates trusted proof.
Catalog verification rejects any currently read envelope differing from that pinned
proof before password authentication. The authenticated context must also match the
active keyed connection's identity as defense in depth before session grant. No second SQLite
connection or recovery write is involved. Wrong passwords return bounded
`invalid_credentials`; locked/blocked storage and context mismatch return existing
`access_unavailable`. Neither response exposes keys, paths, SQL, or passwords.
Legacy setup/change/recovery remain denied; JSON loss cannot authorize replacement.

The mutex order is DatabaseState -> Catalog, matching business dispatch. The
database admission remains held through session grant. No plaintext password is
retained; the native adapter uses a zeroizing request buffer. No raw key is exported
and no Catalog-held mutex waits for DatabaseState. The verified temporary data key
is dropped after verification. The proof retains only bounded on-disk envelope
bytes, not a password or DEK; its connection accessor returns only a shared borrow.
The connection remains owned through Storage and closes before the ownership guard.
Candidate read-only callers retain their existing Connection-returning API. Future
credential transitions must deliberately establish a new authenticated connection/proof
pair rather than silently refresh the proof from a replaced file. This is not a
continuous filesystem-tampering monitor or session revocation mechanism.

Parent job-28 passed the unchanged attack regression within 18 integration tests,
nine lifecycle tests plus the intentional subprocess fixture, 11 candidate tests,
and diff check (exit 0). Independent targeted static readback `mvx9e3ws-s-m23v`
confirmed the exact authenticated-open proof pairing and found no residual causal
defect in that bounded correction; this is not independent runtime or Windows proof.
Physical-count confirmation is the next integration slice below.

Actual writer evidence:

- `application/license/mod.rs`: final regular `license.lic`; atomic temporary
  `license.<UUID>.tmp` is not needed for normal startup and remains blocked.
- `infrastructure/filesystem/catalog_access.rs`: final regular
  `catalog-access.json`; temporary `.catalog-access-<UUID>.tmp` remains blocked.
- `commands/backup.rs`: `backup-restore/staging` and `backup-restore/snapshots`.
  The narrow compatibility policy accepts only the safe existing
  `backup-restore` directory and these optional empty child directories, never
  retained backup files or unknown children.
- `infrastructure/filesystem/backup_store.rs`: `restore-state.json` is replacement
  evidence, not non-authoritative configuration, and remains blocked.

The two final license/JSON files are opaque, non-authoritative regular artifacts:
the storage classifier must not parse their contents or change license policy.
They and the narrowly recognized empty directories do not count as initialized
storage. All symlink/reparse, wrong-type, legacy database, partial encrypted state,
unknown entries, and retained `encrypted-storage/` layouts remain blocked. No
additional application-root configuration metadata was established by inspection.
The closed candidate's exact-two-file contract must remain unchanged.

Parent job-23 compiled and observed RED: 13 passed, four failed, exit 101 after
16 seconds. Failures were explicit Catalog status/authority, JSON-loss behavior,
positive desktop artifact compatibility, and native Catalog adapter wiring. The
three new negative tests already passed on the fail-closed baseline; they were not
seven observed RED failures. Parent job-26 subsequently passed all 17 integration
tests plus remaining business regressions and diff check (exit 0). That result did
not cover same-context/new-DEK replacement. Independent verification subsequently
identified a High security blocker: the old helper authenticated a replaced envelope,
discarded its key, and compared only public IDs. An attacker could create a new DEK
under those same IDs and grant Catalog using an attacker-selected password.

Parent job-27 reproduced the attack through the real Catalog handler: the exact
`catalog_rejects_new_key_envelope_with_active_public_context` test compiled and
failed (0 passed, 1 failed, exit 101 after nine seconds), reporting that a new DEK
wrapped under copied public IDs must not authorize Catalog. That regression is
unchanged. The new admission-time envelope proof is the bounded GREEN candidate;
prior 17/17 is not acceptance of this correction.

## Physical-count password confirmation — GREEN candidate

The physical-count command requires password confirmation, not an unlocked Catalog
administration session. `confirm_physical_count_for_application` now verifies the
password through the fixed, private admission-time envelope proof for owned encrypted
storage, while plaintext fixtures retain their legacy Catalog password verifier.
The native handler uses this adapter after its unchanged license check.

Password verification and mutation share one existing write admission and mutex
hold. The ordinary-write and count paths reuse the same epoch/write-block gate and
test rendezvous. The count path does not reenter DatabaseState and does not grant,
lock, or otherwise change Catalog administration authority. Shared command logic
retains verification-before-request-validation ordering, bounded error mapping,
idempotency/replay handling, and the existing Immediate transaction adapter.
The request password is moved into a zeroizing buffer and dropped immediately after
verification; no password or DEK is retained.

Four new focused tests cover wrong-password exact errors plus unchanged file/public
business facts, correct-password stock/movement results without Catalog unlock,
exact replay and conflicting-payload non-mutation, plaintext fixture preservation,
and structural native adapter wiring. They use public onboarding/search/ledger and
inventory handlers, not raw SQL storage inspection. The mutation counter observable
is the public movement ledger, with installation-byte snapshots also unchanged on
denial/replay. Native wiring remains a source check, not Tauri runtime proof.

Parent job-29 observed RED: compilation succeeded, 19 passed and three failed,
exit 101 after 24 seconds. Failures were native dispatch wiring, correct envelope
password confirmation, and wrong-password error mapping (`persistence_failure`
instead of `catalog_password_invalid`). Plaintext preservation already passed.
The implementation now awaits the focused 22-test GREEN; current runtime/Windows
execution and independent verification are not inferred from this code change.

## Verification handoff

Production startup RED (parent job-17): the authorized `encrypted_storage_integration`
command compiled and exited 101, with two expected failures: fresh startup allowed
business reads and missing-root startup created the root. The startup routing
correction and fixture/exclusion preservation passed in parent job-18: startup 3/3,
lifecycle 9 passed plus one intentional child fixture, and diff check passed.

Parent job-19 captured native lifecycle RED: compilation succeeded, four passed and
three failed. Parent job-20 captured guard RED: compilation succeeded, four passed
and six failed. The six failures were the intended lifecycle/registration and guard
scaffolds. Parent job-21 subsequently passed 10/10 with diff check, exit 0.
The Catalog/artifact GREEN candidate uses the same exact focused command:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --no-default-features --features production-encryption --lib encrypted_storage_integration
```

Broader regression targets for the changed borrowing seams are `command_seam`,
`confirm_sale_application`, `confirm_sale_use_case`, `inventory_commands`,
`inventory_sqlite`, `product_onboarding`, `post_sale_commands`, `post_sale_lifecycle`,
`product_locations`, `catalog_maintenance_commands`, and `catalog_access`.
No parser, validation, idempotency payload, SQL statement, or response mapping was
changed in those mechanical borrowing adaptations.

The parent observed RED against the rejecting scaffold: exit 101 after eight
seconds, six failed lifecycle tests and one ignored subprocess fixture; compilation
succeeded. All six failures were the intended rejected acquisition.

The parent then observed the extraction regression RED (job-13): exit 101,
0 passed/1 failed after eight seconds, with `keyed connection survived after
storage ownership was released`. The exploit extracted the keyed connection via
`mem::replace`, dropped Storage, successfully queried the connection, and found
ownership available to a contender.

After changing the API to shared access, that exploit is statically
unrepresentable. It has been replaced with
`connection_api_returns_only_a_shared_borrow_tied_to_storage`, a direct method
function-pointer type contract; this is test migration, not a claim that the
unchanged exploit passed. All six existing lifecycle cases and hot-journal
assertions remain intact.

Parent direct-root RED (job-15) exited 101: eight passed, one failed, one ignored.
Only `confirmed_setup_uses_only_fixed_files_in_preexisting_root_without_nested_directory`
failed, at the no-nested-directory assertion. Missing-root refusal already passed;
inspection confirms `StorageOwnership` canonicalizes an existing root rather than
creating it. The lifecycle now also checks root safety before lock creation.
Existing lifecycle paths have been adapted without removing recovery assertions.

Parent: run the corrected lifecycle for GREEN (no competing runner was launched):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --features production-encryption --lib application::storage
```

Then preserve the existing candidate contract:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --features sqlcipher-build-probe --lib infrastructure::key_envelope::encrypted_database
```

The lifecycle suite includes a subprocess that exits with a live transaction,
requires an actual rollback-journal header, verifies wrong-password non-mutation,
and checks acknowledged rows survive authenticated keyed recovery. Its ignored
child is explicitly invoked by the parent test. The original lifecycle and
subprocess recovery passed on Linux in parent job-11; the shared-reference
correction, direct-root changes, and current Windows behavior require verification.
Desktop integration and independent verification remain pending. These checks are not
power-loss or independent verification.
