# Velay consistency: verified source and desktop acceptance

The requested source changes are implemented locally on `feat/velay-consistency`. Automated and independent mounted-UI evidence is complete; Windows appearance and native desktop execution have not been observed. No push, pull request, installer delivery or merge is implied.

## Observed evidence

| Check | Observed result | Evidence |
| --- | --- | --- |
| Final integrated frontend suite | 1287 passed; 0 failed/cancelled/skipped; exit 0 | `.scratch/velay-consistency/checks/t7-compatibility-integrated-01.{log,result}` |
| Test TypeScript, application TypeScript, production build | All exit 0 | `t7-compat-final-{types-tests,types-main,build}-01.{log,result}` in the same checks directory |
| T5f3 location verification | Independent 53/53 passed | Feature log L138; location snapshot `verifier.w4cmqwns/probe01.*` |
| T6 Inventory verification | Independent 37/37 passed; comparison changes only the 14 requested cases | Feature log L145; Inventory snapshot `verifier.q1kjg_wt/probe01.*` |
| T7 approved detail and viewer | Independent 48/48 passed, all five exits 0 and stderr empty | Feature log L159; detail snapshot `verifier-corrected.q_4bwgj1/probe00–04.*` |
| T7 baseline comparison | 45 cases: 19 existing cases preserved; 26 requested rules fail on the baseline and pass on the corrected candidate | Detail snapshot `corrected-differential-results.json` and raw stdout/stderr |

The canonical history, earlier native/Rust checks, per-unit independent verification, failed runs and explicit corrective authorizations are retained in `odd/tasks/velay-consistency.md`. Earlier failures are not erased by the final pass. The two Catalog clock fixtures now control only their mocked motion deadlines; the original causes of the earlier isolated timing failures were not established.

Independent snapshots remain under the explicitly authorized `/tmp/velay-{location,inventory,detail}-verification-01a1831d` roots. They contain code/test/dependency copies and probe evidence, not customer databases. Their hashes and original Git status were checked during each verification; later metadata/documentation commits are not new application changes.

## Review and delivery boundaries

- Latest source work units: `55b10c7` (locations), `85383cb` (Inventory), `62d592b` (approved product detail). Earlier units are listed in the feature document.
- Each normalized native assessment returned `reviewDue=false` for its own committed range. Named high-risk items still received separate independent verification.
- Reminder-selected cumulative targets exceeded the native reviewer context budget before authority creation. They are **not approved native reviews**; no receipt or acknowledgement is claimed for them.
- The final frontend suite excludes the pre-existing `test:w9` evidence audit by the repository's ordinary `npm test` script. It is not a new exclusion introduced for this feature.
- JSDOM metrics, mocked IPC and a Vite build do not prove real browser pixels, Tauri IPC execution or Windows focus behavior. Earlier native checks do not establish a Windows desktop run.
- Publishing, building/delivering an installer and merging require a separate explicit decision. No destination or credentials are assumed.

## Windows acceptance checklist

Use an authorized Windows checkout/build of this branch with disposable test data. Do not use customer databases, credentials or licenses in screenshots or shared evidence. Do not perform restore/deletion experiments against real data. If no Windows environment is available, record acceptance as pending rather than inventing a pass.

| Area | Manual observation | Status |
| --- | --- | --- |
| Notifications | Routine action success/failure appears once in the existing notification host; required-field validation remains next to its field | Pending |
| Accepted refresh | Entry/count, sale and correction acceptance refresh affected stock/alerts/history while retaining applied filters and drafts | Pending |
| Inventory entry | Sidebar opens all stock even with an alert cue; Dashboard's explicit **Ver en Inventario** opens alerts | Pending |
| Inventory photos | Table/gallery contain safe images, preserve usable placeholders, and do not require Catalog unlock | Pending |
| Modal dismissal | Ready Cerrar/Volver, Escape and backdrop reverse the same frame; opening Escape is immediate; pending blocks unsafe dismissal | Pending |
| Source and focus | Source stays measurable but transparent; close restores the correct control without jumping to a reused operation or stale source | Pending |
| Catalog and locations | Nested editor draft survives child cancellation; assigned-location refusal keeps the exact explanation and unchanged row | Pending |
| Approved detail A | From list and checkout: image left, facts/prices right, attributes below, no clipping at the application's supported minimum size and the Windows display scale in use | Pending |
| Detail data | List uses browse facts; checkout uses the added-line snapshot, not the edited final sale price; no editable fields or sale action in detail | Pending |
| Nested image viewer | Loading/unavailable/error remain readable; image fits without cropping; closing returns focus to its image button, then to the original detail source | Pending |
| Checkout ownership | Quantity/payment draft remains unchanged after detail/viewer dismissal; checkout can close again after read-only presentation retirement | Pending |
| Restore policy | Only in a disposable, separately authorized test environment: cancellation/unchanged failure preserves the sale draft; confirmed success retires it; unknown recovery retains guidance/write restrictions | Pending |

Check the normal window and the minimum size supported by the application, including keyboard-only operation and the user's actual Windows display scale. Observe reduced-motion behavior and resizing without treating them as new animation policies.

## Record the result

Record the source commit, Windows/app version, display scale, window size, exercised checklist rows, PASS/FAIL and a minimal reproduction for failures. Redact sensitive information from screenshots. An unexercised row stays pending.

The implementation is not declared Windows-accepted until this evidence exists. The next decision is whether a human will perform this checklist in an authorized Windows environment, or explicitly defer that acceptance while retaining the local verified source.
