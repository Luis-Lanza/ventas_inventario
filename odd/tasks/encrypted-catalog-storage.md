# Encrypted Catalog storage
Objective: implement the approved offline encryption plan; branch: `feat/encrypted-catalog-storage`.
Delivery: ask-on-risk; prototype push to `origin/feat/encrypted-catalog-storage` authorized, no PR/merge/release; runners: Rust/React checks plus mandatory Windows MSVC/NSIS and DPAPI runtime proof; current host: Linux.

## Specs

- S1 — User: "no quiero incorporar servidor! necesito otras opciones". Remain offline without a server or permanent Windows service, as agreed in the subsequent plan.
- S2 — User: "quiero hacer algo mas simple!, solo quiero hacer que borrar ese archivo no reestablesca todo la contrasenia!". Deleting the legacy JSON must not reset established access; missing encryption metadata must not authorize replacement credentials.
- S3 — User: "ok ok! y como podemos cifrar el .sqlite3 para que no cualquiera pueda abrirlo!". Encrypt stored database content; copying the database alone must not allow reading its records without a key.
- S4 — User: "Una vez y “recordar en este equipo”\n\nme parece buena idea esto!, pero puede ser la misma contra no? del catalogo? o que error traeria esto? porque si alguien se lleva la base de datos en un pendrive, si no sabe la contrasenia no podra ni verla con un visor de db como dbeaver". Use the same user-facing password, with optional current-Windows-user remembered unlock; operating the application must not implicitly authorize Catalog administration.
- S5 — User: "si la contrasenia vieja, la que se hizo en el momento del backup!\n\nbien ahora teniendo en cuenta esto que desventajas, vulnerabilidades habria?". Restore backup-time password and recovery credentials, including transfer to another PC.
- S6 — User: "y si para restaurar un backup necesitamos la contrasenia acutal?". The accepted plan requires current destination password before operator replacement of an existing usable installation and verifies backup credentials before destructive replacement. Damaged/missing destination authority is not permission to bypass checks.
- S7 — User: "perfecto me parece bien esto!, creemos una rama y vamos a ello!". Authorizes the preceding plan, including data-key rotation on password change/recovery and explicit import of legacy plaintext backups, plus a feature branch and implementation. Windows feasibility is the first gate, before full implementation.

- S8 — User: "correcto tengo un vm" and "tendriamos que pushearlo a una rama para que yo lo pulee en la vm!". Prepare and push an isolated prototype on the feature branch for the user to pull and run on their Windows VM; do not claim VM proof before results arrive.

## Tasks

- T0 | S3,S4,S8 | route: delegated (context backstop) | status: in_progress | prepare isolated SQLCipher/DPAPI probe with synthetic data, local checks and Windows instructions, review and push feature branch | commit: none.
- T1 | S3,S4,S7 | route: human Windows VM execution after T0 | status: pending | validate MSVC/NSIS, SQLCipher encrypted backup and user-scoped DPAPI; Windows VM identified, results not yet available | commit: none.
- T2 | S2,S3,S4,S7 | route: delegated bounded unit | status: pending, after T1 | versioned authenticated key envelope, recovery wrapping, remembered-key adapter, and durable generation protocol | commit: none.
- T3 | S2,S3,S7 | route: delegated bounded unit | status: pending, after T2 | migrate existing plaintext data and Catalog hashes safely; establish coherent encrypted connection/admission handling | commit: none.
- T4 | S5,S6,S7 | route: delegated bounded unit | status: pending, after T3 | portable encrypted backups, legacy import, restore and key rotation with crash recovery and session invalidation | commit: none.
- T5 | S2,S4,S6,S7 | route: delegated bounded unit | status: pending, after T4 | startup unlock, remember/forget, Catalog separation and credential/recovery UI/IPC | commit: none.
- T6 | S1-S7 | route: independent verifier plus Windows acceptance | status: pending, after T5 | functional/regression/failure checks, docs and reviewable work-unit delivery | commit: none.

## Log

L1 — Original implementation-planning request: "perfecto!, entonces armemos un plan de como como funcionaria y como lo implementariamos! haz un explore y antes de implementar me dices lo que haremos".

L2 — Implementation authorization: "perfecto me parece bien esto!, creemos una rama y vamos a ello!".

L3 — Accepted proposal: SQLCipher encrypts a random data key (DEK)-protected database; a password-derived wrapping key and recovery secret each protect a copy of the DEK in an external authenticated versioned envelope. Windows user-scoped DPAPI stores an optional local copy, excluded from portable backups. Data-key rotation accompanies password change/recovery because rewrapping the same DEK does not revoke an old wrapper/backup's access to current ciphertext. Existing backups remain readable with historical credentials. This is a proposed implementation architecture, not implemented functionality.

L4 — Existing constraints: preserve Velay identity `com.velay.app`, license policy, business behavior, and restore write-admission gates. Do not introduce a license-policy expansion. Missing/corrupt metadata fails closed; do not silently initialize an existing installation. Recovery with neither password nor recovery key requires an explicit policy, never an invented bypass. Legacy plaintext import is explicit and does not claim old backups were encrypted. Encryption does not erase historical plaintext copies or protect against same-user malware/admins.

L5 — Exploration evidence: `src-tauri/Cargo.toml` uses ordinary bundled rusqlite 0.32; multiple SQLite opening/validation/backup paths need key-aware integration. Current session caches config/pending/unlocked. Backup transitions need matched database/envelope generations; DPAPI remains a cache. SQLCipher Windows feature/build feasibility is supported by official documentation but has not been executed here. Rust tests alone cannot establish DPAPI, NSIS, Windows handle or NTFS recovery behavior.

L6 — Branch created from clean `master`: `feat/encrypted-catalog-storage`. Host reports Linux. No `powershell.exe`, `pwsh`, `wine`, or `wine64` executable was found on PATH. Tracked `.github` files contain templates, no Windows workflow. No accessible Windows target has been provided. T1 cannot currently produce the agreed Windows proof. No source, dependency, credential, or database mutation has been performed; only branch and this tracking document were created.

L7 — Review workload: full feature is expected to exceed 400 authored changed lines, but a defensible count depends on T1. Resolve delivery slice strategy before implementation commits; no push, PR, merge, release, CI provisioning, or external-machine access is authorized by branch creation. Current tracking is uncommitted while the first technical gate is blocked. No functional tests were run because no source changed; no RED/GREEN evidence is claimed.

L8 — Historical blocker: Windows execution was unavailable. Do not silently substitute Linux proof for the accepted Windows gate or proceed with the full encryption integration before it passes.

L9 — User updates: "correcto tengo un vm"; "tendriamos que pushearlo a una rama para que yo lo pulee en la vm!". User will execute the prototype on their VM after pulling the feature branch. Push of this bounded prototype branch is now authorized; no PR/merge/release or remote login is implied. T0 prepares a standalone crate under `tools/encryption-probe/`, separate from application dependencies and customer data. It must clearly report skipped DPAPI on Linux, test encrypted SQLite reads/backups/reopen and current-user DPAPI on Windows, use synthetic keys/data only, and document that the standalone probe does not yet establish NSIS integration. T1 remains the full Windows feasibility gate; prepare any later installer-specific probe only after initial VM feedback. T0 forecast: roughly 250–400 authored lines excluding lockfile, no production changes. Full-feature delivery strategy remains unresolved before larger implementation slices.
