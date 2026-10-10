# Velay W9 historical candidates

## Objective

Add portable, tamper-rejecting validation of recovered historical material without confusing it with current pending-candidate policy or historical test execution.

## Problem and rationale

The existing R3/Catalog-named W9 wrappers acquire pending HEAD-to-worktree changes while dispatching several historical profiles. A clean tree does not supply those historical candidates. The two old failures rejected five paths against thirteen and sixteen required paths before hash validation. Do not weaken those controls to manufacture acceptance.

Original feature commits and immutable task documents were recovered. R3 and T3 task-byte hashes match their original declarations. One explicitly parent-derived payload per profile also matches its original digest. These are material identity results, not proof of the original pending index, invocation, Git configuration, or execution.

## Authorization

The user authorized **R3 only**, its focused checks, and a local work-unit commit, without push or merge. T3 implementation and live-policy changes remain unauthorized. The proposed R3 material is approximately 53,718 decoded bytes before JSON encoding; review cost was disclosed.

Source edit surfaces for this unit:

- `src/ui/w9-evidence-audit.test.ts`
- `test/fixtures/w9/gross-profit-operations-r3.derived.json`

This document is parent-owned ODD tracking, created before source writes. Its full recovery copy uses Engram topic `odd/velay-w9-historical-candidates/tasks`. Workers read it but do not edit it.

## Agreed seam and material contract

The authorized seam is historical **R3 material validation**: decoded, untrusted fixture material enters a small local module; observable acceptance or a specific rejection leaves it. It does not acquire or approve live candidates. Test behavior through this interface, not Git execution mocks or decoder internals.

Use a strict JSON schema with readable, ordered, line-sized string chunks. Concatenation must preserve every byte, newline, absent final newline, path order, and NUL delimiter. No compression, base64, minification, or formatting tricks to hide review cost. Preserve already-derived audit normalization; do not broaden it.

Trusted expectations must be independent literals, not values learned from the fixture's own metadata. Bind the derived provenance label, profile, candidate/parent revisions, source task path/blob, ordered paths, D/F representation kinds, task bytes, and payload length/digest. Reject unknown fields and changed metadata. Offline revision labels do not prove ancestry or historical execution.

Runtime validation must work without the original external clone, Git history, network, or new dependencies. Original Git objects may be read only to materialize the authorized fixture; never modify that repository or use its live worktree/index as historical evidence.

## R3 evidence anchors

- Candidate: `219c890e5db3bd5de6aa66dfe5fc60ffeef46435`
- Candidate tree: `645f26249e75eb541b956e4eee129d0087a96369`
- Derived base hypothesis (commit parent): `f303b3d470ae3db342390886cbdab1187263b59b`
- Original audit blob: `90a4800e7712efd0638492440695e6729e8b8e60`
- Task path: `odd/tasks/reporte-ganancia-operaciones-pdf.md`
- Task blob: `67e1d4fa0fa266d5f68961046b42968ff9890f9b`
- Raw task length: 2,961 bytes
- Original task SHA-256: `f9fbe3f3055903382ab8c25dd74d92488ea68e3e46757cb4b9ad01d4e4865c98`
- Normalized derived payload length: 50,757 bytes
- Original payload SHA-256: `d18c074173b55dbce142559d10486f4fa25aaa88d546955ccd48187276eea060`

Ordered representations (D = parent-to-candidate unified-zero diff; F = full candidate UTF-8 bytes):

1. D `odd/tasks/reporte-ganancia-operaciones-pdf.md`
2. F `src/commands/gross-profit-operations.ts`
3. F `src/commands/gross-profit-operations.test.ts`
4. F `src/ui/reports/gross-profit-report-flow.ts`
5. F `src/ui/reports/gross-profit-report-flow.test.ts`
6. D `src/ui/reports/gross-profit-report-screen.ts`
7. D `src/ui/reports/gross-profit-report-screen.mounted.test.ts`
8. D `src/ui/w9-evidence-audit.test.ts`

Each representation is composed as `path + NUL + representation`, then joined with NUL. Only the audit representation has the original index-line, signed task/payload digest declaration, and audit self-hash map normalization (original audit lines 916-919). Parent-tree membership is the declared derivation hypothesis, not the original index state. Canonical diff acquisition disables external diff/textconv and fixes prefixes/color; original configuration remains unproven.

Read-only source repository: `/home/luis/velay/repuestos_autos-master`. Parent/worker must preserve its HEAD, branch, index, and six pre-existing untracked task documents. Current Velay baseline: `3baf51ed514e02fc5de245b4bb3bd1067f3abe61`, branch `feat/velay-retail-v1`.

## Constraints and non-goals

- Additive H2 only: preserve all existing source assertions, hashes, pathsets, legacy dispatch, R4 markers, active protected-scope checks, and accepted H1 controls/fixture.
- Do not repair the two legacy wrappers, alter the operations-task early return, or approve current pending candidates.
- No new casts, `any`, suppressions, package/configuration changes, extra test roots, or business/runtime edits.
- Preserve frozen retail and first-start ledgers and the completed H1 document/mirror.
- No full W9 rerun, paused Catalog functional tests, Windows operations, restore checks, dependency downloads, native-authority recovery, push, merge, or publication.
- Unexpected compiler/runtime/helper/integrity failure means STOP with preserved evidence; no repair or retry without fresh permission. A planned behavioral RED is distinct.
- Historical material acceptance is not full W9, business, or Windows acceptance.

## Tasks

- [ ] **H2-R3 — Implement, verify, review, and commit portable R3 material controls.** IN PROGRESS. Writer self-checks and bounded current independent verification passed. Native review and the authorized local commit remain pending. Historical RED has preserved summary evidence only; independent byte coverage excludes 28 licensing-name paths. Original failed attempts remain PARTIAL.
- [ ] **H2-T3 — Add the corresponding T3 material controls.** PENDING; not authorized. Separate reviewable work unit, preserve its original declarations and derivation label.
- [ ] **H3 — Resolve live pending-candidate policy and preserve every legacy profile before changing dispatch.** PENDING; not authorized. Decisions include clean `NO_CANDIDATE` non-proof, profile ownership, overlap/partial rejection, operations-task early return, and index-versus-baseline representation semantics.

## H2-R3 acceptance and checks

1. One positive material test observes behavioral RED against a type-correct minimal stub, then GREEN after the minimum implementation. Continue in vertical behavior slices; do not bulk-write speculative tests or report compiler/helper errors as RED.
2. Valid fixture accepts while retaining the original task and payload digests and exact task Git blob identity. Source fixture materialization reproduces the previously established payload once, without variant searches or fitting altered hashes.
3. Negative behavior covers task/payload byte tampering, truncation/newline changes, missing/extra/reordered paths, profile/revision/source/blob/kind changes, older/later task substitution, unknown fields, and fixture metadata self-authentication attempts. Establish that current Git/index state is not consulted by material acceptance; do not add a live-policy stub that fabricates candidate approval.
4. Focused cached runner: `./node_modules/.bin/tsx --test --test-name-pattern='^W9 historical R3 material' src/ui/w9-evidence-audit.test.ts`. Choose matching names. Run each planned RED/GREEN in the foreground and preserve results. At unit closure run all new R3 cases together; do not run the full W9 or paused Catalog tests.
5. Strict test types: `./node_modules/.bin/tsc --noEmit -p tsconfig.tests.json`. Preserve test discovery/configuration and the baseline root classification: 55 roots, comprising 53 TS tests, one JS test, and `test/react-dom.ts`. No arbitrary 53-root requirement.
6. `git diff --check`, no unrelated edits, unchanged legacy code/H1/assertions, and bounded before/after integrity checks for current/source repositories. Do not hide failures by reformatting or normalizing unrelated content.
7. Native review/assessment follows the current user-owned mode and exact provider envelopes. A fixture adds meaningful review workload; forecast does not authorize push/merge. Parent owns staging and commit after checks and applicable review, not the writer.

## Progress and evidence

- Authorization: user accepted R3 implementation, focused tests, and local commit after the scoped plan; no source writes yet at document creation.
- Prior read-only evidence: task hashes 2/2 MATCH; derived payload hashes 2/2 MATCH; parent Git preservation checks matched. Engram observations 4822 (task bytes), 4829 (derived payloads), and 4840 (plan) hold details.
- Planning-only internal bookkeeping SyntaxError occurred before tool calls and was not replayed; it changed no source or review authority.
- Worker `mv1y10io-1s-rcoz`: PARTIAL / STOP before source writes; no authorized source file was written.
- Evidence directory: `/tmp/velay-w9-h2-r3-writer-20260720/`; original failed helper and failure record preserved.
- `node --check snapshot.mjs`: PASS. `node snapshot.mjs before`: FAIL with ENOTDIR accessing the historical source `.git/index`. Do not report this as behavioral RED.
- Initial inspection: 716 tracked paths and the one parent-owned untracked task document; expected current HEAD/branch.
- Complete BEFORE snapshot was not persisted; preservation of the six historical untracked document bytes was not established. No final integrity comparison or retrospective PASS.
- RED/GREEN, fixture materialization, focused cases, strict types, structural checks, review, and local commit: NOT RUN / PENDING.
- Read-only native ASSESS: UNASSESSABLE because untracked scope lacks an explicit declaration. Its returned high-risk fallback requires an independent verifier. No scope/review authority repair or START attempted.
- Independent verifier `mv1y64dh-1t-ldk7`: CURRENT post-state checks PASS; overall H2-R3 remains PARTIAL / STOP. Current Velay HEAD/branch/index match; tracked working/index diffs are empty; only this task document is untracked; R3 fixture is absent.
- Historical current HEAD/branch/index and exact six untracked document paths match supplied expectations. Git resolved the linked worktree index correctly. This does not reconstruct their missing earlier byte-preservation window.
- Preserved evidence confirmed: `snapshot.mjs` 1,881 bytes and `failure.log` 655 bytes. The failure record corroborates the original error; no helper inspection, execution, correction, or retry occurred.
- All source/tests/compiler/fixture/review/commit outcomes remain pending. Native ASSESS remains unassessable; no authority or intended-untracked declaration repair was attempted.
- Fresh user authorization: correct only temporary-helper Git administrative-path discovery using Git, preserve the original helper/failure record, and resume the same R3 unit only after a complete, verified new BEFORE. Any new unexpected failure still requires STOP and fresh permission.
- Resumed worker `mv1ymy7l-1u-xtbb`: INTERACTION REQUIRED before helper/source writes. Phase A found both hardcoded `.git/index` and `cwd+'/.git/config'`; index-only correction cannot complete the linked-worktree snapshot. No new runtime failure occurred.
- Git-resolved index discovery passed for both repositories. Original helper SHA-256: `e674b7868f7deb26a4a829364248b1acacb1e96c90de877d2658f7e5725cc22f`; original failure record SHA-256: `b0bd0c010237504b323751dbaa74b4ee9a2ce45904b7b838c983f0d5d77f8bb0`. Original artifacts remain unchanged.
- At the worker's interaction boundary, additional configuration-path correction required approval. The human subsequently selected the exact closed `approve` answer: correct index AND configuration discovery through Git in a separately named helper inside the owned evidence directory, leaving all other helper logic unchanged (Engram 4860).
- The user then asked for status (no implementation occurred during that read-only reply) and explicitly requested continuation. This does not add any source surfaces, native review consent, publication, or T3/H3 authority.
- Corrected helper, complete new BEFORE, source implementation, RED/GREEN, required checks, and commit remain unobserved / NOT RUN at this tracking update.
- Repeated required read-only ASSESS remains unassessable for the undeclared untracked document; its high-risk independent-verifier requirement remains applicable before unit acceptance. No review/scope repair or source candidate approval occurred.
- Writer continuation `mv1zkguh-1v-081p`: COMPLETED writer-scoped work only. No staging, native review, or commit occurred.
- Phase A: `snapshot.git-paths-fixed.mjs` changes only Git-resolved index/config discovery. Syntax, actual administrative paths, persisted `before-resume.json`, and its verification passed; original helper/failure hashes remained unchanged.
- New window: 717 to 718 current files, only authorized source/fixture changes; parent document, H1, unrelated bytes, index/config/refs, historical metadata and all six raw historical document hashes matched. This closes only the NEW window, not the original failed attempt.
- Parent spot-check read `verification-results.txt` and the integrity report. Positive exact-selection RED was an intentional stub AssertionError, followed by GREEN 1/1; focused closure was 11/11, including 137 rejection attempts. Earlier/later substitutions are explicitly synthetic.
- Writer strict types and diff check passed. Original source byte prefix, 36 test names, 230 assertions and exact 55-root HEAD/parser equality were preserved; zero new casts/any/suppressions reported. Independent confirmation remains pending.
- Source audit: append-only 262 lines. Fixture: 630 readable lines, 64,678 encoded bytes, SHA-256 `bc52a0b98de6446057f8095d1fb17bc24943938729f7ff693a7496a55cf8b5cc`; decoded task/payload 2,961/50,757 bytes match original hashes and task blob. The 892-line source/fixture review workload is intrinsic lossless historical material, not extra implementation scope.
- Evidence: `/tmp/velay-w9-h2-r3-writer-20260720/verification-results.txt`, `materialization.json`, `final-integrity.json`, and new BEFORE/AFTER snapshots. Full W9, old legacy/H1 executions, paused Catalog, Windows, staging, native review, and commit deliberately not run by the writer.
- Post-writer ASSESS remains unassessable because intended untracked paths lack declaration; its high-risk fallback requires independent verification. No authority repair or candidate approval inferred.
- Independent verifier `mv200xej-1w-cf3v`: PARTIAL / STOP. Its owned `/tmp/velay-w9-r3-independent-0TmclZ/window.mjs:8:144` transcribed the current index anchor without its leading `1`. Actual digest `1203b3fa1864596ef9a95bed07fc604d4909e80504ef0b16d68543a9bce1587d` matches the supplied anchor; this is a helper error, not observed index drift.
- Parent read the complete 10-line helper and confirmed that incorrect literal. Preserve `window.mjs` and `before.log`; no correction/retry performed. No completed independent BEFORE or AFTER exists.
- Independent observations: current HEAD/branch and original writer-helper/failure hash assertions passed; Git status contained only the authorized audit and untracked document/fixture, historical untracked inventory was six expected paths. No repository writes occurred.
- Focused tests, strict types, roots/AST, fixture identities, rejection coverage, diff check and internal writer-window verification remain independently NOT RUN / UNVERIFIED. Writer-reported PASS remains distinct from independent acceptance.
- Fresh closed human answer `approve` authorizes only the independent helper's missing leading `1` correction in a new copy and continuation of the originally planned read-only independent checks (Engram 4888). It grants no R3 source change, other helper repair, configuration change or native authority operation.
- Independent retry and its complete fresh baseline/check outcomes have NOT been observed yet. Preserve the first independent failed attempt without retrospective PASS.
- Independent continuation `mv21c0rj-1x-12y6`: bounded current R3 PASS. The corrected helper inserts exactly one leading `1`; original helper/log preserved. Fresh baseline and AFTER matched; focused 11/11, strict types once, diff check and independent material/structural checks passed.
- Independent AST/source checks: exact immutable HEAD byte prefix, original ordering, 36 names and 230 assertions; new suffix 262 lines without casts/any/suppressions. Exact 55-root HEAD/parser equality retained. Strict schema and independent literals at audit lines 2313-2379; synthetic substitution labeling at 2550-2559.
- Independent fixture validation confirmed all eight representations against immutable historical objects/canonical diffs, original normalization only, exact task/payload/blob identities and encoded fixture hash. The 137 negative attempts were statically counted in the ten rejection tests whose actual execution passed.
- Independent window coverage: 690 hashed current files and 28 explicitly listed licensing-name exclusions; current document, frozen ledgers, H1, R3 files, metadata and six historical raw document hashes matched. No full 718-file byte claim; historical tracked worktree bytes were not hashed.
- Independent internal comparison of the writer's NEW 717-to-718 snapshot pair passed, including older writer-document preservation. This later parent document was frozen separately during independent verification.
- Prior raw RED/GREEN runner output was unavailable in the owned writer evidence directory. The preserved summary corroborates the writer's reported historical RED/GREEN only; independent current GREEN is directly observed. No historical RED was recreated or independently observed.
- A parent reply to the verifier's raw-log question returned `query is unavailable`. One real-boundary status read showed the task already completed; no reply retry or alternate delivery occurred. Final handoff independently stated the raw-log limitation.
- Independent evidence: `/tmp/velay-w9-r3-independent-0TmclZ/` (`preflight.json`, `before.json`, `after.json`, `focused.log`, `types.log`, `diff-check.log`, `checks.json`, `checks.log`, `before-resume.log`, `after-resume.log`). No source defects found. Native review, staging, commit and broader acceptance remain pending.
- Work-unit commit identity: PENDING.

## Next step

Inspect native review authority over the completed, verified and normalized R3 work-unit candidate. Include only this parent-owned document and the R3 fixture as intended untracked paths, with the tracked source diff. Follow the provider's exact selection, offered START, consent, forecast, collect and acknowledgement continuations; do not infer review consent from implementation/helper grants. Preserve the frozen candidate during review and commit locally only after applicable approval. No automatic repair of unexpected failures. T3/H3, full W9 acceptance, push and merge remain outside this grant.
