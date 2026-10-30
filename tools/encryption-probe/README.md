# Run the isolated encryption primitive probe

This T0 prototype supports S3/S4/S8 feasibility exploration only. It does **not** encrypt Velay, implement password/recovery policy, or validate the application's complete backup/restore protocol. Existing DatabaseState and restore helpers are untouched. Windows/MSVC, DPAPI runtime and NSIS acceptance remain T1 gates; this crate creates no installer and proves no NSIS integration.

## Windows VM quick path

Use synthetic data only. Do not supply passwords, real keys, customer paths or database files. No arguments other than `--help` are accepted. From the repository root after pulling the feature branch:

1. Have Rust stable with the `x86_64-pc-windows-msvc` host toolchain, Visual Studio Build Tools with **Desktop development with C++**, MSVC and Windows SDK installed. Vendored OpenSSL additionally needs Perl (for example Strawberry Perl) and NASM on PATH. Use Developer PowerShell for VS; no external SQLite/OpenSSL installation is intended.
2. Check the environment and execute these commands one at a time. The first build downloads dependencies and compiles vendored OpenSSL/SQLCipher; allow several minutes.

```powershell
rustc -vV
cargo -V
cl
perl -v
nasm -v
cargo test --manifest-path tools/encryption-probe/Cargo.toml --locked
$LASTEXITCODE
cargo run --manifest-path tools/encryption-probe/Cargo.toml --locked -- --help
$LASTEXITCODE
cargo run --manifest-path tools/encryption-probe/Cargo.toml --locked
$LASTEXITCODE
cargo fmt --manifest-path tools/encryption-probe/Cargo.toml -- --check
$LASTEXITCODE
```

If a prerequisite is missing or a command fails, stop and return that command's output; do not try the production application against real data.

## Expected result and what to return

Tests: three passing public CLI tests. Help prints usage and creates no probe workspace. Invalid arguments exit 2 with a fixed error, without reading/writing the supplied target. A successful Windows run exits 0 and prints:

```text
PASS: SQLCipher available
PASS: encrypted database reopen, key rejection and integrity
PASS: encrypted online backup reopen, key rejection and integrity
PASS: DPAPI current-user round-trip and modified-blob rejection
PASS: temporary workspace removed
SCOPE: backend primitives only; no application or NSIS proof
```

Return the commands, complete stdout/stderr (including build errors), exit codes, `rustc -vV` and Windows version. Do not return any real database or secret. Normal probe stdout contains only fixed outcome lines; stderr is empty on success. Failures exit 1 with a fixed stage label, never raw database errors, keys or temporary paths. Cargo's own build diagnostics are separate from probe output.

On Linux, the DPAPI line is instead `SKIP: DPAPI requires Windows; Windows feasibility NOT established`. Linux success is not Windows acceptance. No global Windows PASS is emitted.

## What the checks actually exercise

- Exact rusqlite 0.32.1 with `bundled-sqlcipher-vendored-openssl`, isolated manifest and lockfile; no production dependency changes.
- Nonempty actual `cipher_version`, synthetic on-disk records reopened with the source key, actual record queries denied with no key, a wrong key and the backup key; `integrity_check` must return exactly `ok`.
- SQLite online backup into a separately keyed encrypted destination, all handles closed, then the same checks with the intended backup key (including rejection of the source key). This tests primitives, not generation/envelope durability or crash recovery.
- Windows-only DPAPI protection without LOCAL_MACHINE, round-trip of a public synthetic fixture and rejection after blob modification. Allocated DPAPI buffers are freed with LocalFree. This does not test another Windows user, portability, remembered unlock integration or production key lifecycle.

Only a unique `tempfile` workspace is used; no AppData or application database discovery occurs. Handles close before explicit removal on Windows. Tests use their own temporary roots and sentinel files; no customer data. `target/` is locally ignored build output. A process crash or OS cleanup failure can leave synthetic temporary files: report the failure, never point cleanup at customer directories.

## Next step

Send the VM results to the orchestrator. Do not treat this prototype as full feature completion or proceed to production integration before the Windows feasibility gate is resolved.
