# SQLCipher app build probe (T1)

This opt-in build checks SQLCipher linkage inside the application dependency graph.
It is **not encryption integration**: production connections, snapshots and restore
staging remain unkeyed/plaintext. Normal builds retain `default = []`, the existing
`desktop` feature and bundled SQLite. No real data or production migrations are used.
Velay `com.velay.app`, version 1.4.0 and licensing policy are unchanged.

## Native tests

From the repository root, with Rust and the existing locked dependencies available:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --test sqlcipher_build_probe
cargo test --manifest-path src-tauri/Cargo.toml --locked --features sqlcipher-build-probe --test sqlcipher_build_probe
```

Stop at the first failure and report the command, exit code and failing output.
Default mode runs one test (absent `cipher_version`); opt-in mode runs two
(nonempty version plus encryption primitives). Both exercise the real application
schema and family validation with plaintext snapshots, staging and reopening.
The encryption test separately creates directly keyed synthetic storage and a
distinct-key online backup, checks exact records, all integrity-check rows, and
rejects missing, wrong and swapped keys on actual queries. SQLCipher rejects
plaintext-to-keyed online backup; this probe is not a migration implementation.
Temporary storage is uniquely owned in the system temp directory; handles close
before explicit cleanup, including on Windows. No AppData paths are selected.

## Windows VM: tests, then compile/package only

Prerequisites must already be installed: Node/npm with the repository's locked
JavaScript dependencies, Rust with `x86_64-pc-windows-msvc`, MSVC C++ build tools,
Windows SDK, Perl and NASM on PATH (vendored OpenSSL). Do not install packages or
reconfigure the system as part of this procedure.

Run each command separately in PowerShell from the repository root. Check
`$LASTEXITCODE` immediately after each; stop at the first nonzero result:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --test sqlcipher_build_probe
cargo test --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --features sqlcipher-build-probe --test sqlcipher_build_probe
npm run tauri -- build --help
npm run tauri -- build --features desktop,sqlcipher-build-probe --target x86_64-pc-windows-msvc --bundles nsis -- --locked
```

Local Tauri help confirms comma-separated features, `--target`, `--bundles`, and
`--` forwarding arguments to Cargo. Bundle choices are host-specific: Linux help
does not expose NSIS; Windows help must confirm it before the build.

Expected installer location:
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`.
Report each command's exit code, warnings, and the exact generated artifact path
(or that none was produced). **NOT FOR CUSTOMER DELIVERY**: the artifact is
compile/package proof only. Do not launch Velay, run/install the installer, or
open any real database. Do not publish it as a release.

## Evidence boundary

Linux probe tests pass in both modes; Windows app linking and NSIS generation
remain pending human VM execution. Earlier standalone Windows SQLCipher/DPAPI
success is primitive evidence only, not this app/package gate.

Compatibility regressions must run in both modes:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --test sqlite_migrations --test backup_restore
cargo test --manifest-path src-tauri/Cargo.toml --locked --features sqlcipher-build-probe --test sqlite_migrations --test backup_restore
```

The opt-in run exposed a test fixture using the SQL numeric token `6_000`,
unsupported by the bundled SQLCipher parser. That fixture now uses the equivalent
`6000`; its rejection and source-preservation assertions remain unchanged. Do not
skip the test to hide a compatibility failure. Full password/envelope, DPAPI
integration, encryption migration and encrypted restore remain outside this slice.
