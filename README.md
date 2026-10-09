# Velay

Offline desktop point-of-sale and inventory application for small/medium Bolivian retail stores: one store, one PC, and prices in bolivianos (`Bs`). Built with React, Tauri 2, Rust, and SQLite.

This repository is an independent fork of Repuestos Autos, which is maintained elsewhere. Velay has its own application, storage, backup, and license identity; it does not import or migrate the old product's databases, backups, or licenses. Licensing remains perpetual and offline per PC; see [deployment and licensing](docs/DEPLOYMENT_AND_LICENSING.md).

## Scope and implementation status

The inherited sales/inventory core retains negotiated pricing, minimum-price validation, atomic sale confirmation, replay protection, stock movements, returns, cancellations, and profit adjustments. This is not a cloud, multi-terminal, multi-branch, fiscal invoicing, purchasing/credit, or fractional-unit system. Catalog import is deferred.

The retail V1 work is still in progress. Zero opening stock is implemented: creation persists a zero balance without an opening movement, and a positive stock receipt is required before sale. Optional purchase cost at creation and editing is implemented and covered by deterministic tests: blank means unknown (`NULL`), not zero; supplied costs must be positive safe centavo values. Ordinary metadata edits preserve unknown cost; clearing a known current cost makes it unknown, without backfilling historical sales. Positive sub-Bs prices (T5a), including Bs 0.50 and Bs 0.01, are implemented for creation and stock receipts with deterministic payload coverage; catalog editing and negotiated sales retain their existing positive-centavo rules and separator syntax. Stock-alert shortcut navigation (T5b) is implemented with deterministic mounted tests: dashboard and cued-sidebar shortcuts select Alerts and send an alert-filtered browse request, including re-entry after local filter changes; ordinary uncued Inventory navigation retains All Stock and recovery refuses the shortcut. Navigation-retained sale drafts (T6) are implemented with deterministic mounted App and standalone StrictMode tests: draft inputs, payments, validation, pending confirmation and full receipts survive screen navigation in one app-owned, in-memory sale session. Confirmation locks synchronously; retries retain the exact frozen request identity until a meaningful edit, and correlated accepted results deliver notices and inventory refresh once, even away from Sales. Descartar borrador and Nueva venta reset the session; application exit discards memory and quiets late UI effects, but cannot guarantee cancellation of a native sale already submitted. Nothing is stored across application restart; native desktop/Windows acceptance remains pending. Unified catalog-session authorization has deterministic verification, but native desktop IPC verification remains blocked by missing system prerequisites. Sales retain unknown cost snapshots, and reports disclose missing costs without inventing margin; later current-cost changes do not rewrite historical snapshots. The development demo catalog still contains inherited auto-parts examples.

The narrow retailer UX (T6) uses generic product copy and counts in Sales. Category forms distinguish **Definición de atributos de la categoría** (name, type, required status and options) from **Valores de atributos del producto** (stored product values). Catalog and product creation remain separate existing destinations; no sidebar consolidation or variant engine is included.

### Verification limits

Linux deterministic frontend/backend checks and a Vite build are development evidence, not Windows release acceptance. The first T1b shared React-contract repair reduced application TypeScript diagnostics from 87 across 11 files to 44 across 10 files: positional children, native-element tag inference, and four exact action data attributes are repaired, with strict compile-use fixtures and mounted regressions. The next T1b repair uses generic read-only browser projections without manufacturing Inventory revisions, costs or attributes; Catalog callbacks retain native revision authority and Sales retains rich nullable-cost snapshots. The third T1b caller-contract repair supplies named optional Backup/Sale props, optional Dashboard wrapper children, a nullable mutable History invoker ref, the unchanged typed recovery allowlist, and explicit primary access/secondary password-save intent. That repair reduced application diagnostics from 30 across 8 files to 14 across 3 files. The fourth T1b local-typing repair validates actual location template names (retaining custom stored schemas), supplies precise React events and named optional Gross Profit props, and removes only unreachable loading comparisons inside the ready/empty ledger pager. Application `tsc --noEmit` now passes with zero diagnostics (14 → 0); an explicit strict whole-App import fixture also passes without filtering diagnostics. The latest sequential checks passed 35 focused local-screen tests, 553 general frontend tests, the limited dedicated test typecheck, and a Vite build (78 modules, fresh temporary output). Custom-schema/native-revision selection, invalid-date refusal and deferred ledger pagination bounds have mounted coverage. The earlier Catalog thumbnail readiness failure remains an unresolved acceptance blocker: original focused 156/1 and general 546/1 failures are retained despite isolated 157/0 and 547/0 reruns and the controlled diagnostic fixture's 1/0 pass; the cause is still unknown. This latest passing run does not close that blocker or establish retail V1 acceptance. W9 still has its last observed 24 passed / 6 failed and remains pending a separate fork-policy repair. The dedicated test typecheck passed, but its inherited configuration excludes `.test.ts` files; the shared mounted, browser and screen-caller contract tests therefore compile scoped TypeScript fixtures explicitly in memory using application strict options; this does not repair whole-suite test typechecking coverage. Native browser/desktop visual acceptance and Windows installer, offline activation, update, and restore acceptance remain pending. Do not treat the manual checklists below as executed results.

Shared action outcomes use [action notifications](docs/action-notifications.md); validation and recovery guidance remain inline.

## Run on Fedora 43

### 1. Install system dependencies

Tauri needs a C toolchain, WebKitGTK 4.1, and the Linux desktop development libraries:

```bash
sudo dnf check-update
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
sudo dnf group install "c-development"
```

These package names follow the [Tauri 2 prerequisites for Fedora](https://v2.tauri.app/start/prerequisites/). Fedora 43 provides both `webkit2gtk4.1-devel` and `libappindicator-gtk3-devel`.

### 2. Install Node.js and Rust

Install Node.js with npm. Fedora 43's standard `nodejs` package provides Node.js 22.22.2, which satisfies this repository's lockfile (`^22.22.2`, `^24.15.0`, or `>=26`):

```bash
sudo dnf install nodejs npm
node --version
npm --version
```

Install the stable Rust toolchain with [rustup](https://rustup.rs/) if `cargo` is not already available:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable
rustc --version
cargo --version
```

### 3. Install project dependencies

From the repository root:

```bash
npm ci
```

### 4. Start the desktop application

```bash
npm run tauri:dev
```

This command starts Vite automatically, builds the Rust desktop target with the required `desktop` feature, and opens the **Velay** window. The first Rust build can take several minutes.

Do not start `npm run dev` separately. That command serves only the web frontend; native Tauri commands such as catalog, sales, inventory, and backup are unavailable there.

## Disposable manual smoke test

Use an isolated XDG data directory so the smoke test cannot modify your normal local database:

```bash
SMOKE_DATA_DIR="$(mktemp -d)"
XDG_DATA_HOME="$SMOKE_DATA_DIR" npm run tauri:dev
```

After the application exits, remove only the temporary directory created above:

```bash
rm -rf -- "$SMOKE_DATA_DIR"
unset SMOKE_DATA_DIR
```

While the application is running, verify this minimum path:

- [ ] The window opens at the desktop layout and can be resized down to 960×640.
- [ ] The sidebar exposes the bounded operational `Métricas`, `Ventas`, `Inventario`, `Catálogo`, `Alta de productos`, `Historial de ventas`, and `Copia y restauración`.
- [ ] Keyboard navigation shows a visible focus indicator and activates each destination.
- [ ] Create a category and product, then confirm that the product is discoverable from Sales and Inventory.
- [ ] Record an inventory operation and confirm that the displayed stock changes.
- [ ] Add the product to a sale, enter a valid `Bs` payment, and confirm the sale once.
- [ ] Confirm that the persisted sale summary shows the sale-time facts and that `Nueva venta` returns to a clean draft.
- [ ] Confirm that the sale appears in Sales History.
- [ ] Create a backup only after test data exists. Skip destructive restore unless the disposable data directory is still active.

## Normal local data

Running `npm run tauri:dev` without the temporary `XDG_DATA_HOME` uses the normal Tauri application-data directory. On a default Fedora installation, the SQLite database is expected at:

```text
~/.local/share/com.velay.app/velay.sqlite3
```

If `XDG_DATA_HOME` is configured, replace `~/.local/share` with that value. On Windows, the canonical database is `%APPDATA%\com.velay.app\velay.sqlite3`. Back up the Velay application-data directory before manually testing restore behavior; do not copy an old-product database into it.

Velay databases and backups carry SQLite `application_id` `VLAY` (`0x564C4159`, decimal `1447838041`). This is a family discriminator, not authentication. Old Repuestos Autos, foreign, and unmarked databases/backups are not supported; renaming a file does not make it compatible. Use the in-app backup/restore workflow for Velay data, not a compatibility conversion.

The license product is `com.velay.app`, with envelope family `velay-license` and Velay domain separation. Old-product licenses are rejected even though the signing keys are unchanged. Technical Cargo/npm package names remain inherited; they are not the customer-facing identity.

## Development demo catalog bootstrap

Before loading demo data, create and verify an in-app backup from **Copia y restauración**. The development-only command is not exposed through the production UI or Tauri IPC, never deletes or replaces data, and refuses any missing, unexpected, user-populated, partial, or incomplete database without mutation.

On Windows, run this from the repository root:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin bootstrap-demo -- --database "$env:APPDATA\com.velay.app\velay.sqlite3"
```

The explicit `--database` path is optional; the default resolves `%APPDATA%\com.velay.app\velay.sqlite3`. A successful first run preserves the two shipped records, reactivates `BUJ-001`, and adds 8 categories plus 98 deterministic products for exactly 10 active categories and 100 active products. A complete recognized state is safely idempotent. See [docs/bootstrap-demo-catalog.md](docs/bootstrap-demo-catalog.md) for refusal, rollback, and invariant details.

## Useful checks

```bash
# Show the detected Tauri, Rust, Node.js, and Linux dependencies.
npx tauri info

# Verify the frontend and TypeScript build.
npm test
npm run typecheck:tests
npx tsc --noEmit
npm run build
```

To prove that test-only type errors fail the dedicated check without changing repository files, run this isolated configuration check. It must report `TS2322` and clean up its temporary directory:

```bash
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT
printf 'const intentionalTypeError: string = 42;\n' > "$tmp_dir/intentional.test.ts"
printf '{"extends":"%s/tsconfig.tests.json","include":["%s/intentional.test.ts"]}\n' "$PWD" "$tmp_dir" > "$tmp_dir/tsconfig.json"
npx tsc --project "$tmp_dir/tsconfig.json" --noEmit
```

If Tauri reports a missing WebKitGTK package, verify Fedora can resolve the required native library:

```bash
pkg-config --modversion webkit2gtk-4.1
```
