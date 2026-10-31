# Inspect encrypted storage generations without reset or fallback

`filesystem::generation_store::inspect(root)` is an inert structural reader of a caller-supplied dedicated absolute root. It never discovers AppData, writes, opens SQLite, decrypts, cleans up, or authorizes mutation. This T2 slice supports S2/S3/S7 and later S9/T7; encrypted startup/initialization remain unimplemented.

## Outcomes and trust

- `Empty`: an existing, genuinely empty directory only. An absent root blocks.
- `Selected`: private construction, read-only context and fixed artifact paths.
  This means **structurally matched**, not authenticated or a usable database.
- `Err(Blocked)`: bounded constant error; no paths, file contents or keys exposed.
  Never infer reset permission from this outcome.

Disk-provided IDs remain untrusted after framing checks. Future callers must authenticate the envelope with credentials and validate the keyed SQLCipher database before admission. Checksums/digests detect corruption only: attackers can recompute them. There is no anti-rollback anchor; complete old pairs remain structurally acceptable. No key material is returned.

## Prospective on-disk V1 format

All offsets are zero-based byte ranges, with an exact 113-byte `current.bin`.
This code-owned layout is the contract for the next publisher; no publisher exists.

| Range | Meaning |
|---|---|
| 0..16 | ASCII `VELAY-GEN-SELECT` (format/domain discriminator) |
| 16..17 | version byte `1` |
| 17..33 | raw 16-byte database ID |
| 33..49 | raw 16-byte generation ID |
| 49..81 | SHA-256 of exact immutable `key-envelope.bin` bytes |
| 81..113 | SHA-256 of selector bytes 0..81 (corruption checksum) |

Root entries are only `current.bin` and generation directories named by exactly 32 lowercase hexadecimal digits encoding the raw generation ID, without prefix. There are no arbitrary paths, timestamps, length fields or newest-generation rules.
Each directory contains exactly `data.sqlite3` and `key-envelope.bin`. The database is nonempty, regular and opaque: never read/hashed, and legitimate mutations remain selectable. The immutable envelope is exactly existing 219-byte V1, checked through unlock's shared pre-KDF framing/version/profile/context validation.

Retained directories must also have those two regular artifacts, nonempty database,
and envelope framing matching their directory ID and the selected database ID.
Their envelope digests are not recorded; they are never candidates for fallback.
Missing/corrupt current selection blocks even if retained artifacts are well formed.
Any incomplete directory, unknown name, temporary publication file, journal/WAL,
or extra artifact blocks. This deliberately closed-file layout is not yet suitable
for runtime SQLite integration; future admission must define sidecar handling.

## Bounds and filesystem assumptions

Inspection streams at most 128 accepted root entries per pass (including selector), rejecting on the 129th, and rejects on the third entry per generation. No unbounded collection occurs. Fixed-size selector/envelope reads use `Read::take(cap + 1)`; no database reads or KDF.

Root must be absolute without literal `.`/`..` components. Root ancestors, generation directories and artifacts reject symlinks; Windows also rejects `FILE_ATTRIBUTE_REPARSE_POINT`, including junctions. Unknown paths are not followed.
These checks do **not** defend against adversarial namespace mutation or promise TOCTOU safety. Callers must exclude cooperative publishers. Returned paths are not immutable handles or authority; hard links and same-user/admin attacks are not prevented.

## Verification and next slice

Tests use real temporary filesystem fixtures, synthetic opaque database bytes,
and real envelopes. Rejected fixtures retain entries and bytes unchanged. Linux
symlink checks are executable here. A Windows-only junction test covers the root,
an ancestor and a selected generation using synthetic temporary directories and
`cmd.exe /d /c mklink /J` with fixed names or generated hexadecimal IDs. It does
not request elevation and fails rather than silently skipping if junction creation
is unavailable. It removes only its fixture links and verifies target contents
remain unchanged. Windows execution remains pending; adding the test is not proof
that it passes there. Selector magic/version rejection is also exercised with a
recomputed checksum. No Windows durability or power-loss claim follows from these
tests.

The next publisher must establish closed-file flushing, generation-directory
barriers, durable selector commit, retained recovery evidence, and explicit
interruption/reconciliation rules on actual supported Windows filesystems.
Temporary/partial evidence currently blocks without deletion. Publication faults,
NTFS barriers, reconciliation, initialization, credential authentication, keyed
DB validation, DPAPI persistence, backups and runtime integration remain deferred.
