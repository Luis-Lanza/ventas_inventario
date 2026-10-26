# Restore certainty is separate from write permission

A confirmed installation retires the old sale draft; an unknown result does not. Neither a readable database nor a familiar error code proves which database won. T3a supplies native admission and command decoding. T3b1 supplies the coordinator below; **App/consumer integration and UI/session resets remain pending in T3b2**. Neither native decoding nor an unwired coordinator implements the frontend policy.

## Confirm contract

`confirm_restore_command` keeps `{ request: { token, confirmed: true } }`. Its `restored` and `error` results add these flat fields:

| Field | Bounded values | Meaning |
| --- | --- | --- |
| `restore_certainty` | `unchanged`, `restored`, `unknown` | This confirmation was rejected before replacement; candidate installation/reopen/validation completed; or replacement identity cannot be established. |
| `write_admission` | `allowed`, `blocked` | Native admission at response construction, independent of certainty. This is not an unlock capability. |
| `cleanup_warning` | boolean | Known installation still needs cleanup, or cleanup after a known pre-install refusal failed. |

Examples:

```json
{"kind":"restored","restore_certainty":"restored","write_admission":"allowed","cleanup_warning":false}
{"kind":"restored","restore_certainty":"restored","write_admission":"blocked","cleanup_warning":true}
{"kind":"error","code":"restore_failed","message":"The restore could not be completed.","restore_certainty":"unknown","write_admission":"blocked","cleanup_warning":false}
```

- **Unchanged:** preserve the draft. Early confirmation/token/checksum/license refusals cannot establish write permission independently; the native state supplies it. A refusal while storage is already blocked stays blocked.
- **Restored:** installation, reopening and database validation have completed. Marker/stage cleanup failure cannot turn this into a generic restore failure. Retire the old draft, but honor blocked admission and retain recovery instructions/evidence.
- **Unknown:** retain the draft only as evidence, not as permission to submit it. Block mutations and show recovery guidance. Do not automatically retry restoration.

`created`, `prepared`, picker results and their requests retain their existing shapes. Generic backup/preparation errors do not gain restore metadata. Framework-level rejected/malformed IPC requests may bypass the confirm producer; the frontend treats those as unknown rather than inferring phase from text. Messages contain only bounded public copy, not native paths or recovery tokens.

## Frontend decoding and compatibility

`createBackupCommands().confirmRestore()` always returns decoded certainty, admission and warning fields. `ConfirmRestoreResponse` exposes this required metadata. Existing `BackupResponse` fixtures may omit it so dependent UI changes need not ship in T3a.

- A legacy explicit `{kind:"restored"}` remains confirmed success, but is normalized to **blocked** write admission and `cleanup_warning:false`; the warning default does not assert that cleanup was verified.
- Missing, partial, invalid or contradictory confirm metadata produces a redacted `storage_unavailable` error with **unknown/blocked/false**. In particular, an unclassified error never becomes unchanged based on its code.
- Explicit `unknown` requires blocked admission. A restored result with a cleanup warning also requires blocked admission. Error results cannot claim restored certainty.
- Prepare/picker cancellation or failure is not an attempted replacement. Their existing decoding remains separate.

## App-owned coordinator (T3b1)

`createAppOperationCoordinator(ports, confirmRestore)` in `src/ui/app-operation-coordinator.ts` is framework-independent. Create one per App lifetime, not per screen. Its 26 typed mutation methods cover checkout, corrections, inventory, onboarding, catalog metadata/schema/images, locations and catalog access. Reads, file backup creation and restore preparation are not mutation ports.

| Interface | Consumer responsibility / guarantee |
| --- | --- |
| `generation()` | Cache these stable, frozen ports for a consumer's lifetime and chained follow-ups. Each call reserves synchronously **before adapter entry**, including lazy transport, and releases only when its promise settles. |
| `confirmRestore(token)` | Exclusively reserve before entering the native adapter. Pending mutations, pending confirmation or blocked admission return resolving bounded refusals without forwarding. All mutation families refuse during confirmation. |
| `getSnapshot()` | Stable immutable snapshot until a transition: `generation`, `pendingMutations`, `restorePending`, `writeAdmission`, and retained `completion`. |
| `subscribe(listener)` | Observe transitions; unsubscribe only detaches observation. It never cancels native work or releases leases. Observer exceptions cannot change ownership or outcome classification. |

`completion` is `{id, result}`: the ID advances only when a forwarded confirmation settles, including a transport rejection normalized to unknown/blocked. Local busy/blocked refusals neither create a completion nor erase existing evidence. Returned decoded results preserve identity; the snapshot retains a frozen copy. Later App ownership must consume each completion ID once for session/readers and action notifications, even if Backup has unmounted.

- **Known restored:** advance generation, retiring every saved old port. New ports forward only if admitted; cleanup-warning restoration advances generation but remains blocked.
- **Unchanged:** keep the generation and existing admission; native blocked admission can close it, never reopen a previously blocked coordinator.
- **Unknown:** retain the generation as evidence, block writes and retain completion. Getters, subscriptions and blind confirmation retries cannot unlock it. There is no local unlock method.

Mutation refusals use the existing `persistence_failure` shape, except catalog access uses `access_unavailable`; messages are bounded Spanish guidance. These are not fabricated successes. A local confirmation refusal describes that local non-forwarded request, not certainty about another pending native attempt: App must use the retained completion for replacement decisions.

T3b2 still must wire every owned consumer, retire the sale draft **and receipt only on confirmed restoration**, invalidate readers/alert request identities, preserve evidence on unknown, and render durable recovery guidance. This module does not implement those UI effects or promise native cancellation on unmount.

## Native admission boundary

`DatabaseState::with_write` captures an even admission epoch **before** waiting for the database mutex, then checks it under that same mutex before invoking the mutation callback. Replacement publishes an odd, closed epoch before closing the live connection. Checked advancement prevents wraparound; stale admissions never become valid again within the process.

The command path keeps admission closed through marker and stage cleanup. A proven clean installation opens only its new epoch. Known installation with a cleanup warning and identity-uncertain recovery remain closed. `with_read` is unchanged: only an already validated, ready connection is readable, so validated reads/snapshots can remain available while writes are blocked. Reading, navigation and license changes do not clear the guard. Poisoned locking does not grant access.

The image picker captures admission before its await and supplies that same admission to persistence. Other mutation wrappers continue using the shared `with_write` seam. Their existing error translation may collapse native refusal to `persistence_failure`; this loses specificity but does not execute the refused callback. There is no new error-code migration across UI decoders.

This is **not** an end-to-end fence for arbitrary external IPC requests that have not reached native admission. No transport generation fields were added to every mutation envelope.

## Startup and retained evidence

Only successfully classified startup recovery/revalidation constructs a newly admitted state. Calling startup is not itself success. Existing family, schema, foreign-key and recovery-evidence guards remain authoritative.

In particular, an active marker together with `restore-state.json.previous-*` sidecars is rejected by `has_ambiguous_recovery_artifacts`, even if canonical storage happens to validate. T3a's initial startup test incorrectly expected that fixture to unblock; its failed attempt is retained, and the corrected test expects refusal without deleting evidence. A separate clean-completion fixture tests successful startup admission. Marker cleanup warnings can therefore require assistance rather than guaranteeing that a restart alone will fix them.

There is no frontend unlock command. Do not erase markers, sidecars or protective sources merely to make recovery appear successful.

## Verification boundary

Default-feature Rust tests exercise the real `DatabaseState` and command coordinator against isolated temporary databases. Existing fault seams prove marker/stage cleanup behavior; a test-only pre-mutex rendezvous makes a queued write deterministic. The delayed-selection probe exercises the same native admission API, not a live OS dialog.

Desktop wrappers require the desktop feature and platform dependencies. Default-feature tests and mocked TypeScript invocation do not prove the Tauri desktop wrapper, Windows durability/installer behavior, or App/session lifetime coordination. Native GREEN and full validation must be reported separately; see `.scratch/velay-consistency/checks/t3a-*` for durable attempt evidence.
