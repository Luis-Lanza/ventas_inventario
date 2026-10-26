const KIND = { CANCELLED: "cancelled", SELECTED: "selected", CREATED: "created", PREPARED: "prepared", RESTORED: "restored", ERROR: "error" } as const;
const ERROR_CODE = { STORAGE_UNAVAILABLE: "storage_unavailable", DESTINATION_EXISTS: "destination_exists", UNSUPPORTED_DESTINATION: "unsupported_destination", DESTINATION_TOKEN_INVALID: "destination_token_invalid", DESTINATION_TOKEN_EXPIRED: "destination_token_expired", SOURCE_TOKEN_INVALID: "source_token_invalid", SOURCE_TOKEN_EXPIRED: "source_token_expired", INVALID_BACKUP: "invalid_backup", UNSUPPORTED_SCHEMA: "unsupported_schema", CONFIRMATION_REQUIRED: "confirmation_required", TOKEN_INVALID: "token_invalid", TOKEN_EXPIRED: "token_expired", RESTORE_FAILED: "restore_failed", RECOVERY_FAILED: "recovery_failed", DATABASE_UNAVAILABLE: "database_unavailable", LICENSE_REQUIRED: "license_required" } as const;

export interface BackupSummary { file_name: string; created_at_unix_seconds: number; size_bytes: number; schema_version: number; durability_warning: boolean; cleanup_warning: boolean; }
export interface RestoreSummary { token: string; size_bytes: number; schema_version: number; }
export interface RestoreOutcome {
  restore_certainty: "unchanged" | "restored" | "unknown";
  write_admission: "allowed" | "blocked";
  cleanup_warning: boolean;
}
export type PathSelection = { kind: typeof KIND.CANCELLED } | { kind: typeof KIND.SELECTED; token: string };
// Optional metadata preserves existing fixtures/consumers; confirmRestore always supplies it.
export type BackupResponse = { kind: typeof KIND.CREATED; summary: BackupSummary } | { kind: typeof KIND.PREPARED; summary: RestoreSummary } | ({ kind: typeof KIND.RESTORED } & Partial<RestoreOutcome>) | BackupError;
export interface BackupError extends Partial<RestoreOutcome> { kind: typeof KIND.ERROR; code: (typeof ERROR_CODE)[keyof typeof ERROR_CODE]; message: string; }
export type ConfirmRestoreResponse = ({ kind: typeof KIND.RESTORED } | BackupError) & RestoreOutcome;
type Invoke = (command: string, payload: Record<string, unknown>) => Promise<unknown>;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const publicCode = (value: unknown) => Object.values(ERROR_CODE).find((code) => code === value);
function error(value: unknown): BackupError {
  const code = (record(value) ? publicCode(value.code) : undefined) ?? ERROR_CODE.STORAGE_UNAVAILABLE;
  const message = code === ERROR_CODE.DESTINATION_EXISTS ? "A backup already exists at that destination."
    : code === ERROR_CODE.INVALID_BACKUP ? "The selected backup is invalid."
    : code === ERROR_CODE.UNSUPPORTED_SCHEMA ? "The selected backup schema is unsupported."
    : code === ERROR_CODE.CONFIRMATION_REQUIRED ? "Restore confirmation is required."
    : code === ERROR_CODE.TOKEN_INVALID ? "The restore confirmation is invalid."
    : code === ERROR_CODE.TOKEN_EXPIRED ? "The restore confirmation has expired."
    : code === ERROR_CODE.RESTORE_FAILED ? "The restore could not be completed."
    : code === ERROR_CODE.DATABASE_UNAVAILABLE ? "The database is unavailable."
    : code === ERROR_CODE.LICENSE_REQUIRED ? "A valid license is required to restore a backup."
    : "Backup storage is unavailable.";
  return { kind: KIND.ERROR, code, message };
}
const selection = (value: unknown): PathSelection | BackupError => record(value) && value.kind === KIND.SELECTED && typeof value.token === "string" && value.token.length > 0 ? { kind: KIND.SELECTED, token: value.token } : record(value) && value.kind === KIND.CANCELLED ? { kind: KIND.CANCELLED } : error(value);
function response(value: unknown): BackupResponse {
  if (record(value) && value.kind === KIND.CREATED && typeof value.file_name === "string" && typeof value.created_at_unix_seconds === "number" && typeof value.size_bytes === "number" && typeof value.schema_version === "number" && typeof value.durability_warning === "boolean" && typeof value.cleanup_warning === "boolean") {
    return { kind: KIND.CREATED, summary: { file_name: value.file_name, created_at_unix_seconds: value.created_at_unix_seconds, size_bytes: value.size_bytes, schema_version: value.schema_version, durability_warning: value.durability_warning, cleanup_warning: value.cleanup_warning } };
  }
  if (record(value) && value.kind === KIND.PREPARED && typeof value.token === "string" && typeof value.size_bytes === "number" && typeof value.schema_version === "number") {
    return { kind: KIND.PREPARED, summary: { token: value.token, size_bytes: value.size_bytes, schema_version: value.schema_version } };
  }
  return record(value) && value.kind === KIND.RESTORED ? { kind: KIND.RESTORED } : error(value);
}
function unknownRestore(): ConfirmRestoreResponse {
  return { ...error(null), restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false };
}
function confirmResponse(value: unknown): ConfirmRestoreResponse {
  if (!record(value)) return unknownRestore();
  // Legacy explicit success proves restoration, but says nothing about write admission.
  if (value.kind === KIND.RESTORED && !["restore_certainty", "write_admission", "cleanup_warning"].some((key) => key in value)) {
    return { kind: KIND.RESTORED, restore_certainty: "restored", write_admission: "blocked", cleanup_warning: false };
  }
  const { restore_certainty, write_admission, cleanup_warning } = value;
  if ((restore_certainty !== "unchanged" && restore_certainty !== "restored" && restore_certainty !== "unknown")
      || (write_admission !== "allowed" && write_admission !== "blocked") || typeof cleanup_warning !== "boolean") return unknownRestore();
  if (restore_certainty === "unknown" && write_admission !== "blocked") return unknownRestore();
  if (value.kind === KIND.RESTORED && restore_certainty === "restored" && (!cleanup_warning || write_admission === "blocked")) {
    return { kind: KIND.RESTORED, restore_certainty, write_admission, cleanup_warning };
  }
  if (value.kind === KIND.ERROR && publicCode(value.code) !== undefined && restore_certainty !== "restored") {
    return { ...error(value), restore_certainty, write_admission, cleanup_warning };
  }
  return unknownRestore();
}

export function createBackupCommands(invoke: Invoke) {
  const call = (command: string, payload: Record<string, unknown>) => invoke(command, payload).then(response).catch(error);
  return {
    chooseBackupDestination: () => invoke("choose_backup_destination_command", {}).then(selection).catch(error),
    chooseRestoreSource: () => invoke("choose_restore_source_command", {}).then(selection).catch(error),
    createBackup: (destinationToken: string) => call("create_backup_command", { request: { destination_token: destinationToken } }),
    prepareRestore: (sourceToken: string) => call("prepare_restore_command", { request: { source_token: sourceToken } }),
    confirmRestore: (token: string) => invoke("confirm_restore_command", { request: { token, confirmed: true } }).then(confirmResponse).catch(unknownRestore),
  };
}
const tauriInvoke: Invoke = async (command, payload) => (await import("@tauri-apps/api/core")).invoke(command, payload);
export const backupCommands = createBackupCommands(tauriInvoke);
