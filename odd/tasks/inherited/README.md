# Inherited Repuestos Autos records

These documents arrived with the Repuestos Autos fork snapshot (`73a91ed`,
2026-10-07) and describe that product's work, plans and release history. They are
kept as evidence of what the fork inherited, not as Velay's own backlog.

- **Velay's own task documents stay in `odd/tasks/`.** They were created in this
  repository after the fork import and are the only rows Velay can close.
- **Identifiers and artifacts here are the parent product's.** Lines such as
  `com.repuestosautos.app` or `Repuestos.Autos_*_x64-setup.exe` belong to Repuestos
  Autos; Velay is `productName: "Velay"` / `com.velay.app`
  (`src-tauri/tauri.conf.json:3`, `:5`).
- **Nine inherited records intentionally stay in `odd/tasks/`.** Their path and bytes
  are part of the historical evidence pinned in `src/ui/w9-evidence-audit.test.ts`
  and in `test/fixtures/w9/`: `backup-restore-integrity-hardening`,
  `catalog-access-and-profit-report`, `checkout-stock-and-details`,
  `configurable-low-stock-threshold`, `dashboard-partial-gross-profit`,
  `dashboard-realized-gross-profit`, `reporte-ganancia-operaciones-pdf`,
  `reports-movement-ledger` and `windows-desktop-build-fixes`. Moving them would
  rewrite an evidence record, so they stay put.
- **Bytes in this directory are frozen on purpose.** These are historical records, so
  cross-references inside them still name the pre-move `odd/tasks/<name>.md` layout.
  Live code and live documents point at `odd/tasks/inherited/<name>.md`.
- **Do not close, reopen or re-run these rows from this tree.** Velay has published no
  release of its own; its first delivery is tracked by `odd/tasks/velay-retail-v1.md`.

The two release records closed as superseded say so in their own `## Status` block
(`release-v1.2.0.md`, `release-v1.2.2.md`).
