# Release v1.2.0

## Status
**Inherited record — closed as superseded on 2026-11-14 by owner decision.** This document arrived with the Repuestos Autos fork snapshot and records that other product's release work, not Velay's: it pins identifier `com.repuestosautos.app`, while Velay is `productName: "Velay"` with identifier `com.velay.app` (`src-tauri/tauri.conf.json:3`, `:5`). In the parent's own published line (`Luis-Lanza/repuestos_autos`) version `1.2.0` was never built, tagged or published — the line jumps `v1.1.1` → `v1.2.1`. R1 stands as recorded. R2 and R3 are dropped, not verified, and stay unchecked on purpose: that evidence was never observed and must not be backfilled. Velay itself has published no release at all; its first delivery is tracked by `odd/tasks/velay-retail-v1.md`. Do not re-run or reopen this document.

## Objective
Prepare and publish the Inventory and Windows-logo feature release from merged master `ff4aebd`, with a Windows NSIS installer and preserved customer data.

## Decisions and authority
- Maintainer approved version `1.2.0` (latest published release is `v1.1.1`). Never reuse or move an existing version tag.
- Maintainer chose no Authenticode signing; Windows security warnings are expected.
- Preserve identifier `com.repuestosautos.app`.
- Maintainer explicitly authorized the version-preparation commit and push. Tag/publication authority and successful Windows artifact/update verification remain required before release delivery.
- Do not uninstall or reset customer data. Before customer delivery, require verified backup on fixed NTFS and user-observed in-place update smoke over the previous installed version.

## Tasks
- [x] R1 Align application and Cargo versions to 1.2.0 on `chore/release-1.2.0` and verify static metadata consistency. Committed and pushed as `ed70185` (`chore(release): align application version to 1.2.0`); independent metadata verification passed.
- [ ] **DROPPED (superseded 2026-11-14)** R2 Generate and identify the Windows NSIS installer; verify backup and in-place smoke (launch, data, license, Catalog access, Sales, Inventory, Reports, icons).
- [ ] **DROPPED (superseded 2026-11-14)** R3 After explicit delivery authority and successful smoke, create an immutable annotated tag and GitHub Release with the verified Windows installer attached.

## Evidence and limitations
- Existing remote master is `ff4aebd078269ad29fce8118bbc75962732b0e5f`; latest published/tagged release is `v1.1.1`.
- Inventory and logo acceptance were confirmed by the maintainer for development packaging; release-version build and update smoke are separate requirements.
- R1 static metadata verification: Tauri config, root Cargo package, and root Cargo.lock package report `1.2.0`; the application identifier remains `com.repuestosautos.app`. No dependency versions were changed. No Windows build was performed or claimed.
- Agent Linux desktop build prerequisites are unavailable; Windows packaging must be performed on Windows.
- No installer for 1.2.0, release tag, or published release exists yet.
