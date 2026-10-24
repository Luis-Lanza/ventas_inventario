# Velay interaction consistency
Objective: implement accepted notification, refresh and modal corrections. Branch: feat/velay-consistency; base: 6c75e6b.
Delivery: feature-branch-chain with local work-unit commits; no push/PR/merge. Checks: mounted public UI tests, both TypeScript checks, npm test/build; isolated fixtures only.

## Specs
S1 — "Las notifaciones revisa donde mas falta implementarlas!, ya no quiero mas errores o confirmaciones en la pantalla principal!, TODAS deben ser notificaciones como las que estan implemntadas". Clarification: "Esas las consevamos junto al campo pa!" applies to required-field/invalid-price and equivalent field validations. Action outcomes use the existing notification host; no duplicate main-screen result banners. Destructive consent dialogs, persisted receipts and durable recovery instructions are not transient result banners.
S2 — "El stock sin actualizar despues de entrada o conteo debemos revisar si ocurre en otro lugar por ejemplo al cancelar una venta que se cambia automaticamente a cancelado o que al relizar una venta igual se acutalice el stock (visualemnte) en tiempo real, creo que hay otros lugares donde debemos corregir que se actualice el frontend en tiempo real!". Accepted mutations refresh affected visible readers, including stock/alerts/history/list status and relevant catalog/metrics/report readers. Preserve applied context, drafts, accepted request identity and stale-response guards. No sockets/timers/cloud implied.
S3 — "debemos normalizar la animacion de los modals! en todos debe ser la misma de ser posible crear un componente para que no tengamos este problema de que algunas si desaparece el boton en otras no cierra dando click afuera o no hace la animacion con cuando se cierra con scape!". Reuse current actual-frame driver and sole focus manager behind a shared lifecycle. Hide source without removing geometry; permitted Volver/Escape/backdrop use one reverse-close route; pending blocks unsafe dismissal. Checkout is the user's clarified Sales target; persisted receipt remains Nueva venta-only. Animation never controls persistence.
S4 — "igual inventario no deberia abrirse automaticamente en alertas! deberia abrise pudiendo ver todo el stock" and "Aqui no se ven las imagenes cargadas de los productos!". Sidebar Inventory opens all stock; preserve explicit Dashboard alert shortcut. Reuse existing operational thumbnails without Catalog-unlock prerequisite or invented backend revision.
S5 — Selected restore policy: "Descartarlo solo si la restauración tiene éxito"; user reaffirmed "osea si me parece correcto mi decision". Warn before restoring; invalidate pre-restore sale draft only after confirmed success. Cancellation/failure before data replacement preserves it. Unknown recovery is not confirmed success; guard pending operations and retain recovery instructions.
S6 — "el boton de ver detalles de un producto hay que reformular como se ve haciendo mockups! y tambien hacerle una animacion como todos los modals!". Mockup approval precedes implementation; cover list and checkout entries plus nested image viewer. No unapproved final design implementation.
S7 — Original Alta/Catalog requirements in L1: hide category and captured Editar sources during transformation; duplicate-SKU notification; editor backdrop close; animated rounded product-archive confirmation; assigned-location refusal notification preserving the explanation. No backend business-rule changes.

## Tasks
- T1 | S1,S7 | delegated isolated writer | in_progress | Global action-outcome notification policy and producers/tests/docs; field validation retained. Risk: item3 (shared notification behavior). Commit: pending.
- T2 | S2 | delegated isolated writer | in_progress | Small accepted-mutation invalidation module with actual Inventory/Sales/History/Catalog consumers; preserve context and guard late reads. Exclude restoration (T3). Risk: item4 (async invalidation and stale completions). Commit: pending.
- T3 | S2,S5 | delegated after T2 | pending | Restore success resets App sale session/read models, warns before replacement; cancel/pre-replacement failure preserves draft. Risk: item1 (restoration state) and item4 (pending work). Commit: pending.
- T4 | S3,S7 | delegated | pending | Common animated-modal lifecycle with checkout pilot and source hiding/reverse-close tests. Risk: item3 (shared dialog contracts). Commit: pending.
- T5 | S3,S7 | delegated after T4 | pending | Migrate Inventory/onboarding/editors/archive/location/history/restore families; preserve explicit close policies and nested confirmations. Risk: item3 (shared callers). Commit: pending.
- T6 | S4 | delegated | pending | All-stock sidebar entry and operational Inventory thumbnails with stale-page guards. Commit: pending.
- T7 | S6 | mockup proposal then human approval | pending | Propose product-detail mockup, implement only after approval using common modal. Commit: pending.
- T8 | S1-S7 | parent + risk-gated verifier | pending | Integrated checks, native review when due, evidence and Windows acceptance handoff. Commit: pending.

## Log
L1 — Original user report verbatim:
```
ALTA DE PRODUCTOS

1. La animacion en crear categoria (dentro de alta de productos) la animacion es correcta pero el boton de crear categoria debe desaparecer para que la animacion si de a entender que el boton se esta combirtiendo en el modal tal como hicimos en ventas!
2. Al crear un producto con SKU repetido me aparece SKU already exists. pero arriba del todo!, yo quiero que aparezca como notificacion en color rojo como las que tenemos que aparecen en la esquina superior derecha!


INVENTARIO
1. Al realizar una entrada de stock el stock no se actualiza automaticamente visualmente!, tengo que darle a buscar de nuevo o entrar en otro lado y volver a salir para que se actualicen los datos de stock y alertas!
2. Lo mismo para conteo, para que se actualice tengo que darle a buscar de nuevo!
3. igual inventario no deberia abrirse automaticamente en alertas! deberia abrise pudiendo ver todo el stock
4. Aqui no se ven las imagenes cargadas de los productos!


CATALOGO
1. En catalogo igual el boton de editar deberia desaparecer con la animacion y tambien deberia poder cerrarce haciendo click afuera
2. ademas dentro del modal de editar hay otro modal cuando se presiona en archivar!, este modal no tiene animacion y tampoco esta con el nuevo estilo redondeado que tiene toda la APP!
3. cuando se quiere desactivar una ubicaion aparece este mensaje: Esta ubicación está asignada a un producto. Para desactivarla o eliminarla, quitá la asignación desde la edición del producto y después volvé a intentarlo.
pero ahora deberia aparecer como notificacion igual en la esquina superior derecha! como hacemos con otras secciones!


VENTAS
1. el modal no puede cerrarse haciendo click afuera del modal y cuando se cierra con scape no hace la animacion!, esto debemos normalizar para todas las animaciones! deben ser la misma! porque aqui parece como que cada una es diferente y no estamos usando el mismo componente! 

2. el boton de ver detalles de un producto hay que reformular como se ve haciendo mockups! y tambien hacerle una animacion como todos los modals!

cachas?
```
L2 — Prior constraint: "aun no hagas nada de codigo solo dime hallazgos y planteamientos". Read-only exploration completed; authorizations below now permit bounded implementation, not publishing.
L3 — Broader scope: "1. Las notifaciones revisa donde mas falta implementarlas!, ya no quiero mas errores o confirmaciones en la pantalla principal!, TODAS deben ser notificaciones como las que estan implemntadas\n2. El stock sin actualizar despues de entrada o conteo debemos revisar si ocurre en otro lugar por ejemplo al cancelar una venta que se cambia automaticamente a cancelado o que al relizar una venta igual se acutalice el stock (visualemnte) en tiempo real, creo que hay otros lugares donde debemos corregir que se actualice el frontend en tiempo real!\n\n\nalgo importante! debemos normalizar la animacion de los modals! en todos debe ser la misma de ser posible crear un componente para que no tengamos este problema de que algunas si desaparece el boton en otras no cierra dando click afuera o no hace la animacion con cuando se cierra con scape!, como podemos hacer esto!!!  \n\nvamos explorando esto nuevo!"
L4 — User: "Esas las consevamos junto al campo pa!". Restore choice: "Descartarlo solo si la restauración tiene éxito", reaffirmed "hagamos eso entonces1" / "osea si me parece correcto mi decision".
L5 — User requested implementation proposal: "okey entonces plantiemos la implementacion de todo lo que hablamos!". After the eight-unit proposal, authorized start: "ok! comencemos?". Selected "Rama de feature con unidades encadenadas (recomendado)". No push/merge authorized.
L6 — Read-only source audit: Inventory saves refresh alerts but not browse; history detail reloads but list retains old status; Catalog/History mutations omit App alert callbacks; restore lacks App reset. Checkout DOES hide its trigger (parent corrected explorer error), but Escape bypasses reverse and backdrop does not close. Browser/Windows reproduction remains unavailable; source findings are not runtime reproduction. Require deterministic RED before fixing reported behavior, then GREEN. Most readers remount on navigation; avoid a global store or overbroad reload. No customer data/license operations.
L7 — Forecast: multi-unit feature clearly exceeds400 authored lines (rough estimate1500-2500 excluding mockup artifacts); feature-branch-chain chosen. Cohesive ~400line units advisory, not a cap: never omit tests or minify. T1/T2 are independent behaviors but overlap screen files, so use isolated same-clone worktrees and integrate only after each returns. T3 depends on T2; T4/T5 follow. Parent owns tracking/mirror/commits; workers read specs through Tasks and return S# coverage. Functional checks remain separate from native review. Windows appearance/focus/scroll proof cannot be inferred from mounted tests.
