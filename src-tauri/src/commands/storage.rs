//! Feature-selected native storage lifecycle contract.
use serde::{Deserialize, Serialize};
use crate::DatabaseState;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasswordRequest { pub password: String }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConfirmationRequest { pub recovery_code: String }

#[derive(PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StorageResponse {
    Status { status: &'static str },
    RecoveryCode { recovery_code: String },
    Success,
    Error { code: &'static str },
}

pub fn status(state: &DatabaseState) -> StorageResponse {
    #[cfg(feature = "production-encryption")]
    {
        use crate::application::storage::StorageStatus;
        match state.storage_status() {
            Ok(status) => StorageResponse::Status { status: match status {
                StorageStatus::SetupRequired => "setup_required",
                StorageStatus::PendingConfirmation => "pending_confirmation",
                StorageStatus::Locked => "locked",
                StorageStatus::Ready => "ready",
                StorageStatus::Blocked => "blocked",
            } },
            Err(error) => storage_error(error),
        }
    }
    #[cfg(not(feature = "production-encryption"))]
    { let _ = state; unavailable() }
}

pub fn begin_setup(state: &DatabaseState, request: PasswordRequest) -> StorageResponse {
    let password = zeroize::Zeroizing::new(request.password);
    #[cfg(feature = "production-encryption")]
    { state.storage_begin_setup(&password).map_or_else(storage_error, |recovery_code| StorageResponse::RecoveryCode { recovery_code }) }
    #[cfg(not(feature = "production-encryption"))]
    { let _ = (state, password); unavailable() }
}

pub fn confirm_recovery(state: &DatabaseState, request: ConfirmationRequest) -> StorageResponse {
    let recovery = zeroize::Zeroizing::new(request.recovery_code);
    #[cfg(feature = "production-encryption")]
    { state.storage_confirm_recovery(&recovery).map_or_else(storage_error, |_| StorageResponse::Success) }
    #[cfg(not(feature = "production-encryption"))]
    { let _ = (state, recovery); unavailable() }
}

pub fn unlock(state: &DatabaseState, request: PasswordRequest) -> StorageResponse {
    let password = zeroize::Zeroizing::new(request.password);
    #[cfg(feature = "production-encryption")]
    { state.storage_unlock(&password).map_or_else(storage_error, |_| StorageResponse::Success) }
    #[cfg(not(feature = "production-encryption"))]
    { let _ = (state, password); unavailable() }
}

#[cfg(feature = "production-encryption")]
fn storage_error(error: crate::application::storage::StorageError) -> StorageResponse {
    use crate::application::storage::StorageError;
    StorageResponse::Error { code: match error {
        StorageError::Denied => "storage_denied",
        StorageError::InvalidSecret => "validation_error",
        StorageError::Authentication => "invalid_credentials",
        StorageError::Ownership | StorageError::Blocked => "storage_unavailable",
    } }
}
#[cfg(not(feature = "production-encryption"))]
fn unavailable() -> StorageResponse { StorageResponse::Error { code: "storage_unavailable" } }

#[cfg(all(test, feature = "production-encryption"))]
mod encrypted_storage_integration {
    use super::*;
    use crate::commands::catalog::{self, CreateProductLocationRequest, SaveLocationSchemaRequest};
    use std::{collections::BTreeMap, fs, path::{Path, PathBuf}};
    use zeroize::Zeroizing;

    const PASSWORD: &str = "native storage integration password";
    fn password(value: &str) -> PasswordRequest { PasswordRequest { password: value.into() } }
    fn confirmation(value: &str) -> ConfirmationRequest { ConfirmationRequest { recovery_code: value.into() } }
    fn json(response: StorageResponse) -> serde_json::Value { serde_json::to_value(response).unwrap() }
    fn snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
        fs::read_dir(root).unwrap().filter_map(|entry| {
            let entry = entry.unwrap();
            if entry.file_name() == ".velay-storage.lock" { return None; }
            assert!(entry.file_type().unwrap().is_file());
            Some((entry.file_name().into(), fs::read(entry.path()).unwrap()))
        }).collect()
    }
    fn recovery(state: &DatabaseState) -> Zeroizing<String> {
        match begin_setup(state, password(PASSWORD)) {
            StorageResponse::RecoveryCode { recovery_code } => {
                assert_eq!(recovery_code.len(), 48);
                Zeroizing::new(recovery_code)
            }
            _ => panic!("begin setup must deliver the recovery code exactly once"),
        }
    }

    #[test]
    fn native_setup_confirm_business_write_and_password_reopen() {
        let root = tempfile::tempdir().unwrap();
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"setup_required"}));
        let before = snapshot(root.path());
        let code = recovery(&state);
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"pending_confirmation"}));
        assert_eq!(snapshot(root.path()), before);
        assert_eq!(json(begin_setup(&state, password(PASSWORD))), serde_json::json!({"kind":"error","code":"storage_denied"}));
        assert_eq!(snapshot(root.path()), before);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"ready"}));
        let schema = state.with_write(|db| Ok(catalog::save_location_schema(db,
            SaveLocationSchemaRequest { expected_revision: 0, segments: vec!["Rack".into()] },
        ))).unwrap();
        assert!(matches!(schema, catalog::ProductLocationResponse::SchemaSuccess { .. }));
        let created = state.with_write(|db| Ok(catalog::create_product_location(db,
            CreateProductLocationRequest { values: vec!["A1".into()] },
        ))).unwrap();
        assert!(matches!(created, catalog::ProductLocationResponse::LocationSuccess { .. }));
        drop(state);
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"locked"}));
        let before = snapshot(root.path());
        assert_eq!(state.with_read(|db| Ok(catalog::location_schema(db))).unwrap_err(), "database_unavailable");
        assert!(state.admit_write().is_err());
        assert_eq!(json(unlock(&state, password("incorrect password"))), serde_json::json!({"kind":"error","code":"invalid_credentials"}));
        assert_eq!(snapshot(root.path()), before);
        assert_eq!(json(unlock(&state, password(PASSWORD))), serde_json::json!({"kind":"success"}));
        let locations = state.with_read(|db| Ok(catalog::list_product_locations(db,
            catalog::ListProductLocationsRequest { include_inactive: false },
        ))).unwrap();
        match locations {
            catalog::ProductLocationResponse::LocationsSuccess { locations } => {
                assert_eq!(locations.len(), 1);
                assert_eq!(locations[0].values, vec!["A1"]);
            }
            _ => panic!("acknowledged business write must survive password reopen"),
        }
        let admission = state.admit_write().unwrap();
        state.block_writes();
        let called = std::cell::Cell::new(false);
        assert_eq!(state.with_admitted_write(admission, |_| { called.set(true); Ok(()) }), Err("database_unavailable".into()));
        assert!(!called.get());
        drop(state);
        root.close().unwrap();
    }

    #[test]
    fn native_exact_confirmation_consumes_attempt_without_persistence_or_secret_status() {
        let root = tempfile::tempdir().unwrap();
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        assert_eq!(json(begin_setup(&state, password("short"))), serde_json::json!({"kind":"error","code":"validation_error"}));
        let before = snapshot(root.path());
        let code = recovery(&state);
        assert_eq!(json(confirm_recovery(&state, confirmation(&format!("{} ", code.as_str())))), serde_json::json!({"kind":"error","code":"validation_error"}));
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"setup_required"}));
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"error","code":"storage_denied"}));
        assert_eq!(snapshot(root.path()), before);
        assert!(state.admit_write().is_err());
        drop(state);
        root.close().unwrap();
    }

    #[test]
    fn native_lifecycle_commands_are_registered_in_shared_desktop_builder() {
        let source = include_str!("../lib.rs");
        let builder = source.split("fn command_builder<").nth(1).unwrap()
            .split("fn desktop_command_builder").next().unwrap();
        for name in ["storage_status_command", "storage_begin_setup_command",
            "storage_confirm_recovery_command", "storage_unlock_command"] {
            assert!(builder.contains(name), "native command is not registered: {name}");
        }
    }

    #[test]
    fn encrypted_application_catalog_denies_legacy_json_authority_and_reset() {
        use crate::application::catalog::access::CatalogAccessSession;
        use crate::infrastructure::filesystem::catalog_access::CatalogAccessStore;
        for established in [false, true] {
            let root = tempfile::tempdir().unwrap();
            if established {
                let legacy = CatalogAccessSession::open(CatalogAccessStore::new(root.path()));
                legacy.begin_setup(PASSWORD).unwrap();
                legacy.finish_setup(true).unwrap();
                drop(legacy);
            }
            let before = snapshot(root.path());
            let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(root.path()));
            assert!(!session.is_authorized());
            let denied = serde_json::json!({"kind":"error","code":"access_unavailable","message":"No se pudo acceder a la configuración local del catálogo."});
            let secret = || catalog::CatalogSecretRequest { password: PASSWORD.into() };
            assert_eq!(serde_json::to_value(catalog::begin_catalog_setup(&session, secret())).unwrap(), denied);
            assert_eq!(serde_json::to_value(catalog::finish_catalog_setup(&session, catalog::CatalogConfirmationRequest { confirmed: true })).unwrap(), denied);
            assert_eq!(serde_json::to_value(catalog::unlock_catalog(&session, secret())).unwrap(), denied);
            assert_eq!(serde_json::to_value(catalog::change_catalog_password(&session,
                catalog::CatalogPasswordChangeRequest { current_password: PASSWORD.into(), new_password: "replacement password".into() })).unwrap(), denied);
            assert_eq!(serde_json::to_value(catalog::begin_catalog_recovery(&session,
                catalog::CatalogRecoveryRequest { recovery_code: "untrusted recovery".into(), new_password: "replacement password".into() })).unwrap(), denied);
            assert_eq!(serde_json::to_value(catalog::finish_catalog_recovery(&session, catalog::CatalogConfirmationRequest { confirmed: true })).unwrap(), denied);
            assert!(!session.is_authorized());
            assert_eq!(snapshot(root.path()), before);
            drop(session);
            if established {
                // Retain synthetic evidence instead of deleting credentials.
                fs::rename(root.path().join("catalog-access.json"), root.path().join("retained-catalog-access.json")).unwrap();
                let before = snapshot(root.path());
                let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(root.path()));
                assert_eq!(serde_json::to_value(catalog::begin_catalog_setup(&session, secret())).unwrap(), denied);
                assert!(!session.is_authorized());
                assert_eq!(snapshot(root.path()), before);
            }
            root.close().unwrap();
        }
    }

    #[test]
    fn encrypted_owned_storage_denies_legacy_backup_protocol_but_fixtures_preserve_it() {
        let root = tempfile::tempdir().unwrap();
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        let before = snapshot(root.path());
        assert!(!state.supports_legacy_backup(), "encrypted storage must reject the single-file backup/restore protocol");
        assert_eq!(snapshot(root.path()), before);
        drop(state);
        root.close().unwrap();
        let fixture = tempfile::tempdir().unwrap();
        let state = DatabaseState::open(crate::infrastructure::sqlite::production_database_config(fixture.path())).unwrap();
        assert!(state.supports_legacy_backup(), "existing plaintext fixture behavior must remain supported");
        drop(state);
        fixture.close().unwrap();
    }

    #[test]
    fn encrypted_native_backup_and_catalog_startup_use_mode_guards() {
        let source = include_str!("../lib.rs");
        let startup = source.split("pub fn run()").nth(1).unwrap().split("fn license_status_command").next().unwrap();
        assert!(startup.contains("CatalogAccessSession::open_for_application("));
        for (name, next) in [("fn create_backup_command(", "fn prepare_restore_command("),
            ("fn prepare_restore_command(", "fn confirm_restore_command("),
            ("fn confirm_restore_command(", "fn ")] {
            let body = source.split(name).nth(1).unwrap().split(next).next().unwrap();
            assert!(body.contains("supports_legacy_backup"), "native backup handler lacks encrypted-mode guard: {name}");
        }
    }

    // Classifier fixtures contain only synthetic, non-secret desktop artifacts.
    // Backup directories may survive previous operations, but retained files in
    // those directories are evidence, not permission to initialize encrypted data.
    fn desktop_artifacts(root: &Path) {
        fs::write(root.join("license.lic"), b"synthetic opaque license artifact").unwrap();
        fs::write(root.join("catalog-access.json"), br#"{"version":1,"password_hash":"synthetic","recovery_hash":"synthetic"}"#).unwrap();
        fs::create_dir(root.join("backup-restore")).unwrap();
        fs::create_dir(root.join("backup-restore/staging")).unwrap();
        fs::create_dir(root.join("backup-restore/snapshots")).unwrap();
    }
    fn tree_snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
        fn visit(root: &Path, directory: &Path, result: &mut BTreeMap<PathBuf, Vec<u8>>) {
            for entry in fs::read_dir(directory).unwrap() {
                let entry = entry.unwrap();
                if entry.file_name() == ".velay-storage.lock" { continue; }
                let path = entry.path();
                let relative = path.strip_prefix(root).unwrap().to_owned();
                let kind = entry.file_type().unwrap();
                assert!(!kind.is_symlink(), "snapshot never follows links");
                if kind.is_dir() {
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
    fn catalog_json(response: catalog::CatalogAccessResponse) -> serde_json::Value {
        serde_json::to_value(response).unwrap()
    }
    fn catalog_password(value: &str) -> catalog::CatalogSecretRequest {
        catalog::CatalogSecretRequest { password: value.into() }
    }

    #[test]
    fn explicit_catalog_unlock_uses_envelope_password_and_remains_separate_from_storage() {
        use crate::application::catalog::access::CatalogAccessSession;
        use crate::infrastructure::filesystem::catalog_access::CatalogAccessStore;
        let root = tempfile::tempdir().unwrap();
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        let code = recovery(&state);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(root.path()));
        assert_eq!(catalog_json(catalog::catalog_access_status(&session)), serde_json::json!({"kind":"status","status":"locked"}));
        assert!(!session.is_authorized(), "setup must not authorize Catalog");
        let before = snapshot(root.path());
        assert_eq!(catalog_json(catalog::unlock_catalog_for_application(&state, &session, catalog_password("wrong Catalog password"))),
            serde_json::json!({"kind":"error","code":"invalid_credentials","message":"La contraseña o el código de recuperación no es válido."}));
        assert!(!session.is_authorized());
        assert_eq!(snapshot(root.path()), before);
        assert_eq!(catalog_json(catalog::unlock_catalog_for_application(&state, &session, catalog_password(PASSWORD))), serde_json::json!({"kind":"success"}));
        assert!(session.is_authorized());
        assert_eq!(snapshot(root.path()), before, "Catalog unlock must not persist another authority");
        assert_eq!(catalog_json(catalog::lock_catalog(&session)), serde_json::json!({"kind":"success"}));
        assert!(!session.is_authorized());
        drop(session);
        drop(state);
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(root.path()));
        let before = snapshot(root.path());
        assert_eq!(catalog_json(catalog::unlock_catalog_for_application(&state, &session, catalog_password(PASSWORD))),
            serde_json::json!({"kind":"error","code":"access_unavailable","message":"No se pudo acceder a la configuración local del catálogo."}));
        assert!(!session.is_authorized());
        assert_eq!(snapshot(root.path()), before);
        assert_eq!(json(unlock(&state, password(PASSWORD))), serde_json::json!({"kind":"success"}));
        assert!(!session.is_authorized(), "storage unlock must not authorize Catalog");
        assert_eq!(catalog_json(catalog::unlock_catalog_for_application(&state, &session, catalog_password(PASSWORD))), serde_json::json!({"kind":"success"}));
        assert!(session.is_authorized());
        drop(session);
        drop(state);
        root.close().unwrap();
    }

    #[test]
    fn known_desktop_artifacts_are_not_encrypted_initialization_evidence() {
        let root = tempfile::tempdir().unwrap();
        desktop_artifacts(root.path());
        let before = tree_snapshot(root.path());
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"setup_required"}));
        let code = recovery(&state);
        assert_eq!(tree_snapshot(root.path()), before);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        drop(state);
        let state = DatabaseState::open_owned_application(root.path()).unwrap();
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"locked"}));
        assert_eq!(json(unlock(&state, password(PASSWORD))), serde_json::json!({"kind":"success"}));
        let after = tree_snapshot(root.path());
        for (path, bytes) in before { assert_eq!(after.get(&path), Some(&bytes)); }
        drop(state);
        root.close().unwrap();
    }

    #[test]
    fn json_loss_never_resets_envelope_authority_and_envelope_loss_still_blocks() {
        use crate::application::catalog::access::CatalogAccessSession;
        use crate::infrastructure::filesystem::catalog_access::CatalogAccessStore;
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("installation");
        fs::create_dir(&root).unwrap();
        desktop_artifacts(&root);
        let state = DatabaseState::open_owned_application(&root).unwrap();
        let code = recovery(&state);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        drop(state);
        fs::rename(root.join("catalog-access.json"), parent.path().join("retained-catalog-access.json")).unwrap();
        let state = DatabaseState::open_owned_application(&root).unwrap();
        let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(&root));
        let before = tree_snapshot(&root);
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"locked"}));
        assert_eq!(json(begin_setup(&state, password("replacement password"))), serde_json::json!({"kind":"error","code":"storage_denied"}));
        assert!(matches!(catalog::begin_catalog_setup(&session, catalog_password("replacement password")), catalog::CatalogAccessResponse::Error { code: "access_unavailable", .. }));
        assert_eq!(tree_snapshot(&root), before);
        assert_eq!(json(unlock(&state, password(PASSWORD))), serde_json::json!({"kind":"success"}));
        let before = tree_snapshot(&root);
        assert!(matches!(catalog::unlock_catalog_for_application(&state, &session, catalog_password("replacement password")), catalog::CatalogAccessResponse::Error { code: "invalid_credentials", .. }));
        assert!(!session.is_authorized());
        assert_eq!(tree_snapshot(&root), before);
        assert!(matches!(catalog::unlock_catalog_for_application(&state, &session, catalog_password(PASSWORD)), catalog::CatalogAccessResponse::Success));
        drop(session);
        drop(state);
        fs::rename(root.join("key-envelope.bin"), parent.path().join("retained-envelope.bin")).unwrap();
        let before = tree_snapshot(&root);
        let state = DatabaseState::open_owned_application(&root).unwrap();
        assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"blocked"}));
        assert_eq!(json(begin_setup(&state, password("replacement password"))), serde_json::json!({"kind":"error","code":"storage_denied"}));
        assert_eq!(tree_snapshot(&root), before);
        drop(state);
        parent.close().unwrap();
    }

    #[test]
    fn artifact_policy_blocks_unknown_legacy_partial_and_nonempty_backup_evidence() {
        for name in ["legacy.sqlite3", "data.sqlite3", "key-envelope.bin", "restore-state.json",
            "license.unfinished.tmp", ".catalog-access-unfinished.tmp", "backup-restore/staging/retained.sqlite3",
            "backup-restore/snapshots/retained.sqlite3"] {
            let root = tempfile::tempdir().unwrap();
            desktop_artifacts(root.path());
            fs::write(root.path().join(name), b"retained evidence").unwrap();
            let before = tree_snapshot(root.path());
            let state = DatabaseState::open_owned_application(root.path()).unwrap();
            assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"blocked"}), "{name}");
            assert_eq!(json(begin_setup(&state, password(PASSWORD))), serde_json::json!({"kind":"error","code":"storage_denied"}));
            assert!(state.with_read(|_| Ok(())).is_err());
            assert!(state.admit_write().is_err());
            assert_eq!(tree_snapshot(root.path()), before);
            drop(state);
            root.close().unwrap();
        }
        for name in ["unknown", "encrypted-storage", "backup-restore/unknown", "license.lic", "catalog-access.json"] {
            let root = tempfile::tempdir().unwrap();
            fs::create_dir(root.path().join("backup-restore")).unwrap();
            fs::create_dir(root.path().join(name)).unwrap();
            let before = tree_snapshot(root.path());
            let state = DatabaseState::open_owned_application(root.path()).unwrap();
            assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"blocked"}), "{name}");
            assert_eq!(tree_snapshot(root.path()), before);
            drop(state);
            root.close().unwrap();
        }
    }

    #[cfg(unix)]
    #[test]
    fn known_artifact_symlinks_are_not_allowlisted() {
        for name in ["license.lic", "catalog-access.json", "backup-restore", "backup-restore/staging", "backup-restore/snapshots"] {
            let parent = tempfile::tempdir().unwrap();
            let root = parent.path().join("installation");
            fs::create_dir(&root).unwrap();
            let target = parent.path().join("target");
            if name.starts_with("backup-restore") { fs::create_dir(&target).unwrap(); }
            else { fs::write(&target, b"retained artifact").unwrap(); }
            if name.contains('/') { fs::create_dir(root.join("backup-restore")).unwrap(); }
            std::os::unix::fs::symlink(&target, root.join(name)).unwrap();
            let state = DatabaseState::open_owned_application(&root).unwrap();
            assert_eq!(json(status(&state)), serde_json::json!({"kind":"status","status":"blocked"}), "{name}");
            assert_eq!(fs::read_link(root.join(name)).unwrap(), target);
            assert_eq!(json(begin_setup(&state, password(PASSWORD))), serde_json::json!({"kind":"error","code":"storage_denied"}));
            drop(state);
            parent.close().unwrap();
        }
    }

    #[test]
    fn catalog_unlock_rejects_an_authenticated_envelope_from_another_installation() {
        use crate::application::catalog::access::CatalogAccessSession;
        use crate::infrastructure::filesystem::catalog_access::CatalogAccessStore;
        let parent = tempfile::tempdir().unwrap();
        let first = parent.path().join("first");
        let second = parent.path().join("second");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        let state = DatabaseState::open_owned_application(&first).unwrap();
        let code = recovery(&state);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        let other = DatabaseState::open_owned_application(&second).unwrap();
        let code = recovery(&other);
        assert_eq!(json(confirm_recovery(&other, confirmation(&code))), serde_json::json!({"kind":"success"}));
        drop(other);
        fs::rename(first.join("key-envelope.bin"), parent.path().join("retained-first-envelope.bin")).unwrap();
        fs::rename(second.join("key-envelope.bin"), first.join("key-envelope.bin")).unwrap();
        let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(&first));
        let before = snapshot(&first);
        assert_eq!(catalog_json(catalog::unlock_catalog_for_application(&state, &session, catalog_password(PASSWORD))),
            serde_json::json!({"kind":"error","code":"access_unavailable","message":"No se pudo acceder a la configuración local del catálogo."}));
        assert!(!session.is_authorized());
        assert_eq!(snapshot(&first), before);
        drop(session);
        drop(state);
        parent.close().unwrap();
    }

    #[test]
    fn catalog_rejects_new_key_envelope_with_active_public_context() {
        use crate::application::catalog::access::CatalogAccessSession;
        use crate::infrastructure::{
            filesystem::catalog_access::CatalogAccessStore,
            key_envelope::{self, EnvelopeContext},
        };
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("installation");
        fs::create_dir(&root).unwrap();
        let state = DatabaseState::open_owned_application(&root).unwrap();
        let code = recovery(&state);
        assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
        drop(code);
        let original = fs::read(root.join("key-envelope.bin")).unwrap();
        // Public V1 header IDs are not proof of the admitted DEK's identity.
        let context = EnvelopeContext {
            database_id: original[11..27].try_into().unwrap(),
            generation_id: original[27..43].try_into().unwrap(),
        };
        let attacker_password = "attacker chosen password";
        let (_, forged) = key_envelope::create(
            &context, attacker_password, "attacker recovery secret",
        ).unwrap();
        fs::rename(root.join("key-envelope.bin"), parent.path().join("retained-envelope.bin")).unwrap();
        fs::write(root.join("key-envelope.bin"), forged.as_bytes()).unwrap();
        let session = CatalogAccessSession::open_for_application(CatalogAccessStore::new(&root));
        let before = snapshot(&root);
        let response = catalog::unlock_catalog_for_application(
            &state, &session, catalog_password(attacker_password),
        );
        let rejected = matches!(response, catalog::CatalogAccessResponse::Error { .. });
        let unauthorized = !session.is_authorized();
        let unchanged = snapshot(&root) == before;
        // Release all handles and remove only the fixture through its teardown
        // before the expected RED assertion, including on Windows.
        drop(session);
        drop(state);
        parent.close().unwrap();
        assert!(rejected, "a new DEK wrapped under copied public IDs must not authorize Catalog");
        assert!(unauthorized, "rejected envelope replacement must leave Catalog locked");
        assert!(unchanged, "rejected Catalog unlock must not mutate installation files");
    }

    #[test]
    fn native_catalog_unlock_uses_application_authority_adapter() {
        let source = include_str!("../lib.rs");
        let body = source.split("fn catalog_access_unlock_command(").nth(1).unwrap()
            .split("fn catalog_access_lock_command(").next().unwrap();
        assert!(body.contains("unlock_catalog_for_application"));
    }

    fn physical_count_fixture(root: &Path, encrypted: bool) -> (DatabaseState, crate::application::catalog::access::CatalogAccessSession, i64) {
        use crate::{application::catalog::{access::CatalogAccessSession, CreateCategoryInput, CreateProductInput},
            commands::onboarding, infrastructure::filesystem::catalog_access::CatalogAccessStore};
        let state = if encrypted {
            let state = DatabaseState::open_owned_application(root).unwrap();
            let code = recovery(&state);
            assert_eq!(json(confirm_recovery(&state, confirmation(&code))), serde_json::json!({"kind":"success"}));
            state
        } else {
            DatabaseState::open(crate::infrastructure::sqlite::production_database_config(root)).unwrap()
        };
        let session = if encrypted { CatalogAccessSession::open_for_application(CatalogAccessStore::new(root)) }
            else {
                let session = CatalogAccessSession::open(CatalogAccessStore::new(root));
                session.begin_setup(PASSWORD).unwrap();
                session.finish_setup(true).unwrap();
                session.lock().unwrap();
                session
            };
        let category = state.with_write(|db| onboarding::create_category(db,
            CreateCategoryInput { name: "Count category".into(), fields: vec![] },
        )).unwrap();
        let onboarding::CreateCategoryResponse::Success(category) = category else { panic!("category fixture rejected") };
        let product = state.with_write(|db| onboarding::create_product(db, CreateProductInput {
            sku: "COUNT-1".into(), name: "Count product".into(), category_id: category.category_id,
            purchase_price_centavos: Some(100), sale_price_centavos: 250, minimum_sale_price_centavos: 200,
            low_stock_threshold: Some(1), opening_quantity: 8, attribute_values: vec![],
        })).unwrap();
        let onboarding::CreateProductResponse::Success(product) = product else { panic!("product fixture rejected") };
        assert!(!session.is_authorized());
        (state, session, product.product_id)
    }
    fn physical_request(product_id: i64, password: &str, count: i64) -> crate::commands::inventory::PhysicalCountRequest {
        crate::commands::inventory::PhysicalCountRequest {
            request_id: "550e8400-e29b-41d4-a716-446655440299".into(),
            product_id, count, reason: "counted".into(), catalog_password: password.into(),
        }
    }
    fn count_facts(state: &DatabaseState, product_id: i64) -> serde_json::Value {
        use crate::commands::{inventory, movement_ledger};
        state.with_read(|db| {
            let ledger = movement_ledger::list_movement_ledger(db, movement_ledger::MovementLedgerRequest {
                from_utc: "2000-01-01T00:00:00Z".into(), to_exclusive_utc: "2100-01-01T00:00:00Z".into(),
                product_id: Some(product_id), movement_type: None, page: 1, page_size: 50,
            });
            assert!(matches!(ledger, movement_ledger::MovementLedgerResponse::Success { .. }));
            Ok(serde_json::json!({
                "products": catalog::search_products(db, catalog::SearchProductsRequest { query: "COUNT-1".into() })?,
                "ledger": ledger,
                "alerts": inventory::list_inventory_alerts_command(db)?,
            }))
        }).unwrap()
    }

    #[test]
    fn physical_count_wrong_envelope_password_denies_without_mutation_or_authority() {
        use crate::commands::inventory;
        let root = tempfile::tempdir().unwrap();
        let (state, session, product_id) = physical_count_fixture(root.path(), true);
        let before = snapshot(root.path());
        let facts = count_facts(&state, product_id);
        for supplied in ["", "wrong confirmation password"] {
            let response = inventory::confirm_physical_count_for_application(&state, &session,
                physical_request(product_id, supplied, 7)).unwrap();
            assert_eq!(serde_json::to_value(response).unwrap(), serde_json::json!({
                "kind":"error", "code":"catalog_password_invalid", "message":"The Catalog password is incorrect."
            }));
            assert!(!session.is_authorized());
            assert_eq!(snapshot(root.path()), before);
            assert_eq!(count_facts(&state, product_id), facts);
        }
        drop(session);
        drop(state);
        root.close().unwrap();
    }

    fn physical_count_success_and_replay(root: &Path, encrypted: bool) {
        use crate::commands::inventory;
        let (state, session, product_id) = physical_count_fixture(root, encrypted);
        let before = count_facts(&state, product_id);
        let response = inventory::confirm_physical_count_for_application(&state, &session,
            physical_request(product_id, PASSWORD, 7)).unwrap();
        let inventory::InventoryCommandResponse::Success(operation) = &response else { panic!("established password must confirm a count without unlocking Catalog") };
        assert!(!operation.occurred_at.is_empty());
        let response = serde_json::to_value(&response).unwrap();
        assert_eq!(response, serde_json::json!({
            "kind":"success", "request_id":"550e8400-e29b-41d4-a716-446655440299",
            "product_id":product_id, "previous_quantity":8, "quantity_delta":-1,
            "resulting_quantity":7, "occurred_at":operation.occurred_at, "note":null
        }));
        assert!(!session.is_authorized(), "password confirmation must not grant Catalog administration");
        let after = count_facts(&state, product_id);
        assert_eq!(after["products"][0]["available_quantity"], 7);
        assert_eq!(after["ledger"]["rows"].as_array().unwrap().len(), before["ledger"]["rows"].as_array().unwrap().len() + 1);
        let bytes = snapshot(root);
        let replay = inventory::confirm_physical_count_for_application(&state, &session,
            physical_request(product_id, PASSWORD, 7)).unwrap();
        assert_eq!(serde_json::to_value(replay).unwrap(), response);
        assert_eq!(count_facts(&state, product_id), after);
        assert_eq!(snapshot(root), bytes);
        let conflict = inventory::confirm_physical_count_for_application(&state, &session,
            physical_request(product_id, PASSWORD, 6)).unwrap();
        assert_eq!(serde_json::to_value(conflict).unwrap(), serde_json::json!({
            "kind":"error", "code":"request_conflict", "message":"This request ID was already used with different inventory data."
        }));
        assert_eq!(count_facts(&state, product_id), after);
        assert_eq!(snapshot(root), bytes);
        assert!(!session.is_authorized());
        drop(session);
        drop(state);
    }

    #[test]
    fn physical_count_envelope_confirmation_preserves_business_facts_and_replay() {
        let root = tempfile::tempdir().unwrap();
        physical_count_success_and_replay(root.path(), true);
        root.close().unwrap();
    }

    #[test]
    fn physical_count_plaintext_fixture_keeps_password_confirmation_and_replay() {
        let root = tempfile::tempdir().unwrap();
        physical_count_success_and_replay(root.path(), false);
        root.close().unwrap();
    }

    #[test]
    fn native_physical_count_uses_application_authority_dispatch() {
        let source = include_str!("../lib.rs");
        let body = source.split("fn confirm_physical_count_command(").nth(1).unwrap()
            .split("fn list_inventory_alerts_command(").next().unwrap();
        assert!(body.contains("confirm_physical_count_for_application"));
    }

    #[test]
    fn native_requests_reject_unknown_fields_and_preserve_exact_secrets() {
        assert!(serde_json::from_value::<PasswordRequest>(serde_json::json!({"password": PASSWORD, "extra": true})).is_err());
        assert!(serde_json::from_value::<ConfirmationRequest>(serde_json::json!({"recovery_code":"ABC", "confirmed":true})).is_err());
        let request: ConfirmationRequest = serde_json::from_value(serde_json::json!({"recovery_code":" ABC "})).unwrap();
        assert_eq!(request.recovery_code, " ABC ");
    }
}
