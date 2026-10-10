# Velay first-start storage bootstrap

## Objective and problem
Make a genuine first launch with an absent application-data root initialize a valid empty Velay database through the production startup interface, without weakening recovery refusal.

Windows smoke observed unavailable storage before a restart; a later restart worked. Source exploration confirms an absent-root defect, but does not establish the exclusive historical Windows cause.

## Authorization and constraints
- The user authorized a regression test and a bounded first-start correction.
- Branch: `feat/velay-retail-v1`; starting HEAD: `dde2fc6acb11a211b43f01d6dbd1d6ffa837bb73`. Initial index/worktree was clean.
- The user subsequently explicitly authorized one local work-unit commit containing only `src-tauri/src/lib.rs` and this document. Staging those two paths is authorized; push, PR, release, VM database manipulation, license changes, downloads and unrelated repairs are not.
- The old `odd/tasks/velay-retail-v1.md` ledger remains frozen; its failed postcommit repair is not retried. Its task mirror and paused W9/Catalog readiness evidence remain unchanged.
- One bounded source writer; preserve unrelated paths, source assertions, configuration and locks. Stop on unexpected implementation/tool/compiler/test failures and preserve evidence before requesting fresh permission. The intended tracer RED is explicitly expected. Harmless read-only navigation corrections are allowed; missing optional domain/ADR docs are expected per `docs/agents/domain.md`, not implementation failures.
- Code, tests and this task document use English. No suppressions, weakened tests, broad error swallowing, or warning cleanup.

## Scope and production seam
- Source and tests: `src-tauri/src/lib.rs` only.
- Behavior under test: `DatabaseState::recover_on_startup(production_database_config(root), BackupStore::new(root))`, the interface used by native setup.
- Minimal fix: enumeration `NotFound` is empty evidence only when no-follow metadata independently reports an absent root. Other errors and existing symlinks remain errors.
- Do not precreate the root before evidence inspection, modify migrations/family validation, durable restore adapters, IPC/UI, or licensing.
- Fixtures must use unique absent UUID paths below an owned temporary directory, never actual application data.

## Task and delivery strategy
- [ ] FS1 Correct genuine first-start bootstrap with observed RED/GREEN, refusal regressions, focused verification and native review; implementation, writer checks, independent verification and native review acknowledgement passed. Local commit explicitly authorized and in progress; Windows fresh-profile acceptance remains separate.
- [ ] FS1-B1 Correct only the two new tracer validation-error diagnostic mappings, then resume the intended behavioral RED before production changes. Repair and valid behavioral RED passed; technically resolved, awaiting the same work-unit commit rather than a separate delivery.

One coherent work unit, with these milestones:
1. Add only the startup-interface tracer; observe its intended unavailable-storage RED.
2. Apply the minimal correction, observe GREEN, add negative guards and run the relevant startup test module.
3. Assess/review the normalized candidate with user-owned RDD, perform the required verification/readback, and request local commit authorization if not already granted.

Delivery strategy: `ask-on-risk`. Forecast approximately 150 authored source/test changed lines plus this document, below the approximate 400-line delivery heuristic. Actual counts are pending; no committed running count yet. Commit/push approval remains separate.

## Acceptance and checks
- Genuine absent root becomes a valid, ready, empty Velay database on first startup and stays ready on reopen.
- Existing empty directories retain normal bootstrap behavior.
- Non-directory roots and dangling root symlinks remain unavailable and unchanged.
- Existing foreign-family, malformed/ambiguous evidence, active-marker/fallback and source-preservation guards continue passing.
- Permission/I/O/enumeration-entry errors retain refusal by implementation readback; no nondeterministic chmod test or new filesystem abstraction is required.
- Keep builds and fixture outputs below fresh owned `/tmp` directories. Use cached dependencies only.

Exact tracer command, once RED and once GREEN:

```sh
CARGO_TARGET_DIR="$FIRST_START_TARGET" TMPDIR="$FIRST_START_TMP" \
cargo test --manifest-path src-tauri/Cargo.toml \
  --no-default-features --locked --offline --lib \
  database_state_tests::fresh_start_with_absent_root_creates_a_valid_database \
  -- --exact
```

Then run the focused module once:

```sh
CARGO_TARGET_DIR="$FIRST_START_TARGET" TMPDIR="$FIRST_START_TMP" \
cargo test --manifest-path src-tauri/Cargo.toml \
  --no-default-features --locked --offline --lib database_state_tests::
```

Also run scoped formatting and `git diff --check`. Save command outputs, exit codes, selected test counts and source deltas. Unexpected zero-selection or wrong RED is a blocker, not success. Independent verification follows native ASSESS when required; no unrelated historical seven-test replay, W9/readiness rerun, full frontend suite or desktop build.

## Progress and evidence
- Read-only exploration complete: task `mv1mmawx-18-3fzj`; absent root is rejected before SQLite can create it. Parent spot-check confirmed the enumeration error path.
- Existing integration fresh-start coverage precreates the root and misses the defect.
- Linux `--lib` uses test-only durable filesystem support; passing tests do not prove Windows fixed-NTFS crash durability.
- FS1 is in progress. Writer `mv1mrarq-19-yhtx` stopped before any edits/tests because optional `docs/adr` discovery returned a missing-directory diagnostic. Preserved evidence: `/tmp/velay-first-start-writer-CMnr4X/logs/preflight-stop.txt`; no exit/timing was exposed for that discovery call.
- Parent separately checked the repository's domain-doc contract: absent optional docs are explicitly expected. Read-only path discovery found no relevant CONTEXT/ADR documents. Resume the authorized unit without repeating the invalid search or creating documentation. Genuine implementation failures still require STOP.
- Source and old ledger stayed unchanged during the initial navigation stop; task-document progress updates are parent-owned.
- Continuation `mv1mve0g-1a-p483` added only the startup tracer: `src-tauri/src/lib.rs` +63/-0. Production helper is unchanged.
- The attempted RED command exited 101 after 37 seconds with two E0599 errors at `lib.rs:492` and `:534`: the tracer calls `to_string()` on `BackupValidationError`, which derives Debug but not Display. Compilation failed before any tests ran; this is NOT behavioral RED.
- Preserved artifacts: `/tmp/velay-first-start-writer-CMnr4X/resume/`, including `red.log`, `red-result.txt`, baseline, stopped diff, stop state and handoff. No retry or production correction was performed.
- Current source SHA-256: `b9b954d5780cde35e53292e2e3744d1dc7e5926996abff88924ff8fa7f6bd818`; frozen old ledger remains `661e54213654f9d634963f54dfe112f96829b38d2807debd33b3cc9b5e446e8b`. Index is empty; only the authorized source and new task document differ from HEAD.
- Parent read back the stopped diff, raw compiler log and elapsed/exit receipt. The user explicitly authorized correcting the two new tracer diagnostic mappings and resuming RED/GREEN. Use the existing Debug representation; retain validation and every assertion. Do not add Display to production error types or change the valid rusqlite mapping. The earlier failed attempt remains preserved and is not reclassified as behavioral RED.
- GREEN, guard-module run, diff-check and scoped formatting were not executed during the failed attempt. No warning diagnostics were observed in that failed compile; it remains a compiler failure, not runtime PASS.
- Completed continuation `mv1nc1eu-1b-sr5g`: diagnostic-only repair +2/-2, then genuine tracer RED selected 1/failed 1 (`database_unavailable`, exit 101, 6 seconds), followed by minimum production correction and GREEN selected 1/passed 1 (exit 0, 3 seconds).
- Relevant startup module: 22 selected/22 passed/0 ignored (exit 0, 208 seconds). Four new startup-interface regressions cover absent root, existing empty root, regular-file refusal/byte preservation, and Unix dangling-link refusal/preservation. All existing assertions remain unchanged.
- All three Cargo runs reported three existing dead_code warnings, without suppression. `git diff --check` passed; scoped formatting was deliberate structural readback, not an automated rustfmt PASS.
- Source delta from HEAD: +153/-1, including helper +12/-1 and four tests +141/-0. Current source SHA-256: `ce677b74931ab7cc350fb399733bacebe968b06e1cdcc56b08b72e78b488ebce`.
- Evidence: `/tmp/velay-first-start-writer-CMnr4X/repair/`; earlier navigation/compiler-failure artifacts are unchanged. Writer preserved index, parent documents, old ledger, configuration and locks. Parent read back the full source diff and detailed handoff.
- Initial native ASSESS was unassessable because the new document had not been declared; its risk-gated plan required independent verification. INSPECT then explicitly selected only this document and `src-tauri/src/lib.rs`.
- Native review: medium tier, 239 frozen authored changed lines, consolidated `review-reliability` lens, lineage `review-7c53ae3fd3a709f0`; approved on the last captured event. Exact acknowledgement returned `authority: burned` and `native-approved-acknowledgement-completed` for target `sha256:39c3b8ce5b804690b4554120594c45566d84d74bc4fa65bda2123837b484710f`, consumed revision `sha256:cd934f853ad5180f8f5706db34ef776c66e0b6d2cc7a4eb750211eaf424267ea`. This is review audit authority, not a Git commit or publication permission.
- Independent verifier `mv1nm2gx-1c-49db` passed the exact tracer spot check (1/1, exit 0, wall 2 seconds) and full relevant startup module (22/22, exit 0, wall 206 seconds), plus diff-check. Both Cargo runs retained three existing dead_code warnings. No contract blocker was found.
- Independent receipts: `/tmp/velay-first-start-independent-i4QtLk/`; baseline/final comparison preserved 736 tracked/task/writer-evidence hashes, branch/HEAD/index/status. Parent spot-checked current source/old-ledger/task hashes after verifier settlement; source remains `ce677b74931ab7cc350fb399733bacebe968b06e1cdcc56b08b72e78b488ebce`.
- This document was frozen at SHA-256 `0cb10b0695f53ff4a2d2bae735cb57d85de617ac1f81180b7bb866498d77529d` during review/verification. The current passive progress update is parent-owned after acknowledgement and verifier settlement; it is not falsely attributed to the frozen native candidate or independent baseline. Source has not changed since review.
- Windows fresh-profile acceptance, permission/I/O functional coverage and native crash durability remain unproven. Full frontend/desktop/monorepo suites were outside this bounded fix and not run; formatting remains structural readback. No commit or publication occurred.
- Six existing headless integration `dead_code` warnings are historical; report actual diagnostics without suppressing or assuming the same count for library tests.
- Native review, independent verification (if required), Windows fresh-profile acceptance, and local commit remain pending.

## Next step
Create the explicitly authorized local Conventional Commit containing only the bounded source fix/tests and this task document, with no push. Parent read-only preflight confirmed the expected branch/HEAD, empty index, exact source hash, no active hooks/commit-signing configuration and no filters on either path. Preserve review/evidence identity and do not query the burned lineage again. Record the observed work-unit commit after creation and close the technical tasks truthfully; the postcommit receipt is passive bookkeeping, not another authorized commit. Windows fresh-profile acceptance and all broader retail-V1 gaps remain open.
