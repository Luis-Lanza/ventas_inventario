# Accepted-mutation refresh (S2)

`App` owns `createAcceptedMutations()` for its lifetime. It holds subscriptions, not cached data, writes, timers, or notification policy. Readers unsubscribe on teardown. Standalone Inventory/Sales own local instances; other screens accept optional injection. Accepted writes invalidate saved domains once; rejected writes and image-picker cancellation do not. Read failures never authorize replaying a write or withdrawing success.

## Operation → reader matrix

| Accepted event owner | Refreshed mounted views | Freshness on remount / skipped reads |
| --- | --- | --- |
| Inventory entry/count | Applied Inventory browse, Inventory alerts, App sidebar (`stock`) | Other destinations read on mount; no invented stock arithmetic |
| Sales adapter, after App-owned session accepts its original token | Sales applied browse before Nueva venta, sidebar, any newly mounted Inventory (`stock`); mounted History retained list (`sales`) | Receipt/request identity stay session-owned; late completion while Sales is absent invalidates current readers once. Nueva venta still starts the existing all-products first page read |
| History correction interaction: return/cancel | Authoritative detail, retained list using applied dates, sidebar and mounted stock readers | Immutable original sale/payments and saved-correction retry guard remain. Late success invalidates App readers without reviving old detail or publishing a retired screen's notice |
| Catalog product metadata/threshold | Sidebar (`stock`); existing category records, applied browse and selected detail reload | Metadata invalidates immediately even if later location assignment fails. Partial failure refreshes saved browse but keeps the unsaved location draft/recovery lock |
| Catalog archive/reactivate | Sidebar for products only; existing category records and applied browse; accepted lifecycle facts remain in detail | Category-only lifecycle skips sidebar stock reads |
| Catalog category name/schema | Existing category records, applied browse and selected detail | Partial schema success/name failure refreshes saved browse, keeps recovery guidance; no stock invalidation |
| Catalog product image choose/remove | Existing revision-checked browse, detail and thumbnails | No sidebar read: stock/alert count unchanged. Cancellation/rejection does not invalidate |
| Product primary-location assignment | Existing product browse and selected detail on full success | Failed assignment invalidates no location effect; already saved metadata still refreshes independently |
| Location management schema/create/activate/deactivate/delete | Existing local flow consumes authoritative accepted schema/location/delete result | In-use refusal changes no readers. Product picker rereads on editor entry; other destinations mount fresh. No stock/sidebar read |
| Onboarding create product (including partial location failure) | Sidebar (`stock`) as soon as product persists; existing local draft/category transitions | No repeated creation after assignment failure; other readers mount fresh |
| Onboarding create category | Existing local category flow/select; retains product draft | No stock/sidebar read |
| Dashboard | Mounted `stock` listener reloads its atomic report, including periods, alerts and missing-cost facts | Subscribes before initial IPC; late sale/correction acceptance retires old report responses. No report cache |
| Movement ledger | Mounted `stock` listener rereads applied filters/product/page, not editable drafts | Skips the ledger while gross-profit mode is applied; does not refetch product options. Pending export retains its original request owner; previously retired exports stay retired |
| Gross-profit report | Mounted `sales` listener rereads summary and applied operations page with new read identities | Preserves applied dates/page and unsent date/type drafts; skips stock-only metadata/inventory events. In-flight export is neither restarted nor retired by data refresh |

## Context and async ownership

Inventory, Sales and Catalog keep applied browse requests separate from editable toolbar fields. Mutation refresh retains submitted query/category/stock/activity/page and table/gallery presentation, without applying unsent edits. The shared refresh reducer reuses the existing request-ID reducer; toolbar edits during refresh do not discard authoritative freshness. New submitted searches supersede refresh and old completions cannot overwrite them. Unmount retires screen reads.

Dashboard and report listeners attach before their initial reads. Events before attachment are covered by the ensuing authoritative initial read; events during a read start a newer request. Gross-profit read ownership also locks captured pager callbacks synchronously until the new operations read settles, without moving a page back to 1. Report refresh preserves pending export ownership and never issues a new export.

History uses an independent retained-list request identity, so list refresh cannot cancel detail reload or force navigation. New applied date ranges retire old list refreshes; unsent dates remain visible. Read failure clears stale retained rows and offers the existing list retry. Correction acceptance guards remain independent of detail refresh success.

## Review slices and exclusions

Suggested work units: (1) Inventory/App seam and public regressions; (2) Sales/History and accepted late delivery; (3) Catalog/onboarding and shared refresh reducer extraction; (4) late Dashboard/report readers and page-preserving profit transition. Notifications in the same success handlers must be merged without changing their existing classification/messages or adding a second invalidation owner.

Restoration/session reset belongs to T3; navigation/thumbnails to T6. No restoration prop, backend change, modal redesign, or notification-policy change is included. Windows runtime evidence remains separate from mounted mocked-IPC checks.
