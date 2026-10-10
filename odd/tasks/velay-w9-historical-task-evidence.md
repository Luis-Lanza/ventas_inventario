# W9 Historical Backup Task Evidence

## Objective
Make the W9 historical backup-task check validate the independently verified original document version, without comparing its original digest against later task-document revisions.

## Problem and verified boundary
The current check reads the later document from `HEAD` but expects the original document's full-byte SHA-256. The original receipt is not necessarily a unified diff: original W9 explicitly admitted full untracked task bytes.

- Source commit: `d055e75d97bdb4bf3160c2065a92ee2a1ac3f1b6`.
- Direct parent: `02b89fa173ebe3f52f9506e626ae5eafd1171103`; the task path is absent there.
- Source path: `odd/tasks/backup-restore-integrity-hardening.md`.
- Original Git blob: `6a4c31d1de3d44efc7c633adca54a6a184cea39c`.
- Original full-byte SHA-256: `7bb231e22c5095e2007c15e420ad1a6a39f6dbe829080a2c16f21b0f631a72cb`.
- Historical W9 lines 1015–1017 acquire full untracked bytes; lines 1033–1043 bind task bytes and reject one-byte changes.
- Original pending index state and exact invocation are not recovered. Commit addition is not proof of that state.

The original repository was explicitly authorized for read-only inspection. Its HEAD, branch, index digest, and six preexisting untracked documents were preserved. Runtime checks must not depend on that external repository or missing objects in the Velay clone.

## Authorized scope and seam
The seam is W9's acceptance/rejection of the historical backup-task evidence, including its declared identity and original bytes. Preserve the original digest and its existing tamper contract. A portable fixture copied exactly from the verified immutable object may carry the original bytes; expected identities must remain independently anchored, not recomputed from the current document.

Allowed source surfaces:
- `src/ui/w9-evidence-audit.test.ts`.
- `test/fixtures/w9/backup-restore-integrity-hardening.original.md` (new exact historical fixture if needed).

Parent owns this feature document and its full Engram mirror. Existing `odd/tasks/velay-retail-v1.md` and `odd/tasks/velay-first-start.md` remain frozen.

## Constraints and non-goals
- No business, Rust, UI behavior, configuration, dependency, or test-discovery changes.
- No replacement of `7bb…` with a later document's digest, casts, suppressions, deleted assertions, guard bypasses, or relaxation of protected-path policy.
- No other W9 candidate-selector, restore-digest, or protected-scope repairs in this unit.
- Preserve paused Catalog readiness tests and original historical failure logs.
- No network, package installation, historical-repository writes, customer data, signing material, or VM operations.
- Expected behavioral RED is allowed. Unexpected compiler, helper, runtime, or integrity failures require STOP and preserved evidence before repair/retry.
- Commit, push, PR, and merge have not been explicitly requested. Record a pending delivery decision rather than committing implicitly.

## Tasks
- [ ] **W9-H1 — Restore original historical task-byte identity with rejection coverage.** Status: in progress; bounded independent verification is complete, native review and explicit delivery decision remain pending. Route: one bounded writer, followed by applicable independent verification and user-owned native review. Include behavior, fixture, negative tests, and this document in one future work-unit commit when explicitly authorized. Suggested message: `fix(test): bind W9 backup task evidence to its original version`.

- [x] **W9-H1-B1 — Diagnose the required 53-root versus observed 55-root discrepancy.** Read-only blocker within W9-H1, not a separate implementation unit. Status: complete. Authorized verifier `mv1tiwkp-1k-tluv` established exact current/immutable-HEAD root-set equality: 55 roots, including 53 TypeScript test files, `src/catalog.test.js`, and support file `test/react-dom.ts`. The parent's 53-root requirement was incorrect. No configuration, source expectation, or test/compiler execution changed.

## Acceptance criteria and checks
- Observe a deterministic test-first RED at the historical evidence seam, then GREEN after the minimum correction.
- Verify the exact original fixture bytes against the pre-established SHA-256 and Git blob identity.
- Reject one-byte alteration, truncation, wrong source path, wrong source revision, and substitution of a later document where meaningful at the evidence boundary.
- Preserve existing tracked/untracked tamper checks, original digest entries, assertions, and active protected-scope rejection.
- Run focused historical-evidence tests and applicable tamper tests, scoped test type checking if feasible without configuration edits, and diff/integrity checks.
- Do not run unrelated paused tests or call a focused PASS a full W9 PASS. Other candidate-selector and scope checks remain pending.
- Independent verifier and native assessment/review follow the actual candidate and runtime policy; no approval is invented.

## Progress and evidence
- Authorization: user `auitorizo` accepted the scoped W9 correction and tests; parent announced the historical-anchor unit first.
- Initial current repository: `feat/velay-retail-v1`, HEAD `efd2cb1ee0debb21836a8da9dbf1d4e8a78e15ca`, clean before this document.
- Writer: `mv1sz1yb-1i-ss6r` completed the scoped candidate: audit +62/-2, original fixture 58 lines including terminal newline.
- RED: observed exit 1, one historical-version failure and one existing candidate-tamper PASS; `/tmp/w9-h1-red.log`.
- GREEN: observed historical acceptance PASS (1 test); `/tmp/w9-h1-green.log`.
- Negative controls: 7 PASS, 0 failures, 0 skips: acceptance plus one-byte alteration, truncation, wrong path, wrong revision, wrong declared blob, and later-document substitution; `/tmp/w9-h1-negative.log`.
- Writer strict module type check and diff check: PASS; temporary `/tmp/w9-h1-tsconfig.json`, `/tmp/w9-h1-typecheck.log`. Repository compiler configuration was not changed. This is not a fresh full-program verification of the 53 TypeScript test files, JavaScript test file, and support root.
- Fixture identity: original SHA-256 and Git blob match the independently established anchors above.
- Parent spot read: source diff and negative-result log checked. Existing candidate policies, source expectations, casts, and protected-path guards were not changed. Candidate-diff tamper ran before edits only; its self-diff binding was not refreshed or rerun against the new candidate.
- Native ASSESS: unassessable because untracked files require an explicit declaration. Returned plan treats the candidate as high risk and requires an independent verifier; no review approval exists.
- Independent verifier `mv1t65rj-1j-yc9c`: PARTIAL/STOP. Focused 7/7 PASS, scoped strict type check PASS, diff check PASS, fixture SHA/blob/58 lines/newline PASS, and inverse historical-block comparison reproduced the original HEAD source exactly. Repository configurations and frozen ledgers matched HEAD/known hashes.
- Structural STOP retained as historical evidence: parent requested 53 program roots; parsing observed 55. Authorized diagnosis subsequently proved the parent conflated the 53 TypeScript test files with 55 configured roots. Both current and immutable HEAD have exactly the same root set, compiler options, and zero parsing errors; no roots were added or removed.
- Diagnostic evidence: two read-only stdin scripts exited 0. Immutable configuration and directory entries came from HEAD Git objects through a virtual read-only filesystem, using local TypeScript 5.9.3. All roots belong to HEAD and the existing before snapshot. The two new Markdown paths are not compiler roots. Configurations match HEAD and before-snapshot hashes; test `exclude: []` and base `exclude: ["src/**/*.test.ts"]` remain unchanged. Root-set equality is not proof of source-byte equality.
- Recommended remaining structural invariant: exact immutable-HEAD root-set equality, separately classifying 55 total roots and 53 TypeScript test files. This corrects a parent verification-plan error; it does not edit compiler configuration, remove files, or refresh source expectations.
- Independent evidence retained in `/tmp/w9-h1-independent-SDt6pNDh/`, including `before.json` (716 paths). No retry or fix occurred. After snapshot and remaining checks were not captured because of STOP; whole-check stability remains unverified.
- Remaining integrity verifier `mv1ty8e1-1l-0si4`: PASS, bounded independent W9-H1 verification COMPLETE by combining the original focused checks, immutable-root diagnosis, and new integrity window. Receipts: `/tmp/w9-h1-integrity-xa5ec0bk/{before,after,old-comparison,checks,result}.json`; read-only Python execution exited 0.
- New before/after snapshots match exactly across 716 paths and Git metadata. Against the old before snapshot, the only difference is this parent-owned tracking document's recorded progress updates; every source, fixture, configuration, lock, other content hash, path inventory, HEAD, index, and porcelain matches. The original PARTIAL attempt and its missing after snapshot remain unchanged.
- Verified W9 SHA-256: `401a5884476a6f2ea7c0863b032d976c25cb4fa943cf5b9484e1bd46ff2c7321`. Audit +62/-2 and original fixture identities remain unchanged; inverse historical-block comparison reproduces HEAD exactly. Existing guards, hashes, casts, suppressions, and assertions outside that block are preserved.
- Original 7-test PASS, scoped strict typecheck, and diff-check evidence was reused against matching candidate hashes, not rerun. No full W9, candidate-bound tamper, protected-boundary runtime, full-program, or Windows acceptance claim follows.
- Review switch confirmed effective/global `on`, clone-local unset. Native review preflight is next; no approval or acknowledgement exists for this candidate. This document is normalized before review freeze; later review receipts stay in memory/TODO to avoid changing the frozen candidate.
- Work-unit commit: pending explicit user request; no commit identity yet.

## Next step
Inspect native review authority for this normalized three-path work unit, declaring only the new fixture and this document as intended untracked paths. Follow the provider-owned START/consent/collection route without changing candidate files after freeze. Keep broader W9 and retail acceptance open; commit, push, PR, and merge remain unrequested.
