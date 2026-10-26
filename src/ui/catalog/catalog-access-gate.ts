import { useAppOperations } from "../app-operation-context.ts";
import { createElement, type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { catalogAccessCommands, type CatalogAccessResponse, type CatalogAccessStatus } from "../../commands/catalog.ts";
import { useActionNotifications } from "../visual-system/action-notifications.ts";
import { Action, Feedback } from "../visual-system/controls.ts";

export const accessErrorMessage = (response: CatalogAccessResponse) => response.kind === "error" && response.code === "invalid_credentials" ? "La contraseña o el código de recuperación no es válido." : response.kind === "error" && response.code === "license_required" ? "Se requiere una licencia válida para configurar el acceso al catálogo." : response.kind === "error" && response.code === "validation_error" ? "La contraseña debe tener entre 8 y 1024 caracteres." : "No se pudo completar la solicitud de acceso al catálogo.";

export function CatalogAccessGate({ status, notice, onUnlocked }: { status: CatalogAccessStatus | "loading"; notice: string | null; onUnlocked: (message: string) => void }) {
  const operations = useAppOperations();
  const ownerCurrent = () => !operations || operations.isCurrent();
  const notifications = useActionNotifications();
  const mounted = useRef(true), locked = useRef(false), request = useRef(0);
  useEffect(() => () => { mounted.current = false; request.current++; }, []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"setup" | "unlock" | "recovery" | "confirm_setup" | "confirm_recovery">(status === "setup_required" ? "setup" : "unlock");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { setMode(status === "setup_required" ? "setup" : "unlock"); }, [status]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    if ((mode === "setup" || mode === "recovery") && (password.length < 8 || password !== confirmation)) { setFeedback("Ingresá una contraseña de al menos 8 caracteres y confirmala correctamente."); return; }
    locked.current = true; setPending(true); setFeedback(null);
    const current = ++request.current;
    try {
      const response = mode === "setup" ? await (operations?.mutations.access.beginSetup ?? catalogAccessCommands.beginSetup)(password)
        : mode === "unlock" ? await (operations?.mutations.access.unlock ?? catalogAccessCommands.unlock)(password)
          : mode === "recovery" ? await (operations?.mutations.access.beginRecovery ?? catalogAccessCommands.beginRecovery)(recoveryCode, password)
            : mode === "confirm_setup" ? await (operations?.mutations.access.finishSetup ?? catalogAccessCommands.finishSetup)()
              : await (operations?.mutations.access.finishRecovery ?? catalogAccessCommands.finishRecovery)();
      if (!ownerCurrent() || !mounted.current || current !== request.current) return;
      setPassword(""); setConfirmation(""); setRecoveryCode("");
      if (response.kind === "recovery_code") {
        setShownCode(response.recovery_code); setMode(mode === "setup" ? "confirm_setup" : "confirm_recovery");
        notifications?.publish({ severity: "info", message: "Guardá el código de recuperación y confirmá que lo guardaste para completar el acceso." });
      } else if (response.kind === "success") {
        const message = mode === "confirm_setup" ? "Acceso al catálogo configurado." : mode === "confirm_recovery" ? "Contraseña restablecida. Catálogo desbloqueado." : "Catálogo desbloqueado.";
        notifications?.publish({ severity: "success", message });
        setShownCode(null); onUnlocked(message);
      } else {
        const message = accessErrorMessage(response);
        if (response.kind === "error" && !["invalid_credentials", "validation_error"].includes(response.code) && notifications) notifications.publish({ severity: "error", message });
        else setFeedback(message);
      }
    } catch {
      if (ownerCurrent() && mounted.current && current === request.current) {
        const message = "No se pudo completar la solicitud de acceso al catálogo.";
        if (notifications) notifications.publish({ severity: "error", message }); else setFeedback(message);
      }
    } finally { if (ownerCurrent() && mounted.current && current === request.current) { locked.current = false; setPending(false); } }
  };
  const isSetup = status === "setup_required" && mode === "setup";
  const isUnlock = status === "locked" && mode === "unlock";
  const isRecoveryEntry = status === "locked" && mode === "recovery";
  const isConfirmation = mode === "confirm_setup" || mode === "confirm_recovery";
  const recoveryNotice = isConfirmation && shownCode ? createElement("section", { "aria-label": "Código de recuperación" },
    createElement("p", null, "Guardá este código de recuperación en un lugar seguro. Solo se muestra ahora."),
    createElement("div", { "data-ui-catalog-confirmation-code-block": true },
      createElement("span", { id: "catalog-recovery-code-label" }, "Código de recuperación"),
      createElement("output", { "aria-labelledby": "catalog-recovery-code-label", "data-ui-catalog-recovery-code": true }, shownCode)),
    createElement("p", null, "Te permite restablecer la contraseña si la olvidás."),
    createElement("label", { "data-ui-catalog-confirmation-checkbox": true },
      createElement("input", { type: "checkbox", checked: confirmation === "stored", onChange: (event: ChangeEvent<HTMLInputElement>) => setConfirmation(event.currentTarget.checked ? "stored" : "") }),
      "Confirmo que guardé el código de recuperación")) : null;
  const form = status === "locked" || status === "setup_required" ? createElement("form", { "aria-labelledby": isUnlock || isSetup || isRecoveryEntry || isConfirmation ? "catalog-access-heading" : undefined, onSubmit: (event: FormEvent) => { void submit(event); } },
    (mode === "setup" || mode === "recovery") && createElement("label", null, "Nueva contraseña", createElement("input", { type: "password", autoComplete: "new-password", "aria-describedby": isSetup ? "catalog-setup-hint" : isRecoveryEntry ? "catalog-recovery-entry-hint" : undefined, placeholder: isSetup ? "Nueva contraseña" : undefined, value: password, onChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.currentTarget.value), required: true, minLength: 8, maxLength: 1024 })),
    (mode === "setup" || mode === "recovery") && createElement("label", null, "Confirmar contraseña", createElement("input", { type: "password", autoComplete: "new-password", "aria-describedby": isSetup ? "catalog-setup-hint" : isRecoveryEntry ? "catalog-recovery-entry-hint" : undefined, placeholder: isSetup ? "Confirmá la nueva contraseña" : undefined, value: confirmation, onChange: (event: ChangeEvent<HTMLInputElement>) => setConfirmation(event.currentTarget.value), required: true, minLength: 8, maxLength: 1024 })),
    mode === "unlock" && createElement("label", null, "Contraseña", createElement("input", { type: "password", autoComplete: "current-password", value: password, onChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.currentTarget.value), required: true, maxLength: 1024 })),
    mode === "recovery" && createElement("label", null, "Código de recuperación", createElement("input", { type: "text", autoComplete: "off", value: recoveryCode, onChange: (event: ChangeEvent<HTMLInputElement>) => setRecoveryCode(event.currentTarget.value), required: true, maxLength: 48 })),
    recoveryNotice,
    isRecoveryEntry && createElement("p", { id: "catalog-recovery-entry-hint" }, "Usá al menos 8 caracteres y confirmá la misma contraseña."),
    isRecoveryEntry && createElement("p", { "data-ui-catalog-recovery-entry-next": true }, "En el siguiente paso deberás guardar y confirmar tu nuevo código de recuperación para completar el restablecimiento."),
    isSetup && createElement("p", { id: "catalog-setup-hint", "data-ui-catalog-setup-hint": true }, "Usá al menos 8 caracteres y confirmá la misma contraseña."),
    isSetup && createElement("p", { "data-ui-catalog-setup-next": true }, "En el siguiente paso deberás guardar tu código de recuperación para completar la configuración."),
    feedback && createElement(Feedback, { kind: "error" } as never, feedback),
    createElement(Action, { variant: "primary", type: "submit", disabled: pending || isConfirmation && confirmation !== "stored" }, pending ? "Procesando…" : isConfirmation ? "Continuar al catálogo" : mode === "setup" ? "Configurar catálogo" : mode === "unlock" ? "Desbloquear catálogo" : "Restablecer contraseña"),
    isConfirmation && createElement("p", { "data-ui-catalog-confirmation-hint": true }, "Confirmá que guardaste el código para continuar."),
    mode === "unlock" && createElement(Action, { type: "button", variant: "tertiary", disabled: pending, onClick: () => { setMode("recovery"); setFeedback(null); } }, "Usar código de recuperación"),
    mode === "recovery" && createElement(Action, { type: "button", variant: "tertiary", disabled: pending, onClick: () => { setMode("unlock"); setFeedback(null); } }, "Volver al ingreso de contraseña")) : null;
  if (isConfirmation) {
    return createElement("main", { "aria-labelledby": "catalog-access-heading", "data-ui-catalog-access": true, "data-ui-catalog-confirmation": true },
      createElement("div", { "data-ui-catalog-confirmation-card": true },
        createElement("span", { "data-ui-catalog-confirmation-icon": true, "aria-hidden": true },
          createElement("svg", { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true, focusable: false },
            createElement("circle", { cx: 7, cy: 12, r: 4 }),
            createElement("path", { d: "M11 12h10l-2 3h-3v2h-3v-2h-2M7 11v2" }))),
        createElement("h1", { id: "catalog-access-heading" }, "Guardá tu código de recuperación"),
        notice ? createElement(Feedback, { kind: "success", children: notice }) : null,
        form));
  }
  if (isRecoveryEntry) {
    return createElement("main", { "aria-labelledby": "catalog-access-heading", "data-ui-catalog-access": true, "data-ui-catalog-recovery-entry": true },
      createElement("div", { "data-ui-catalog-recovery-entry-card": true },
        createElement("span", { "data-ui-catalog-recovery-entry-icon": true, "aria-hidden": true },
          createElement("svg", { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true, focusable: false },
            createElement("circle", { cx: 7, cy: 12, r: 4 }),
            createElement("path", { d: "M11 12h10l-2 3h-3v2h-3v-2h-2M7 11v2" }))),
        createElement("h1", { id: "catalog-access-heading" }, "Restablecer contraseña"),
        notice ? createElement(Feedback, { kind: "success", children: notice }) : null,
        createElement("p", null, "Ingresá el código de recuperación que guardaste y elegí una nueva contraseña para el catálogo."),
        form));
  }
  if (isSetup) {
    return createElement("main", { "aria-labelledby": "catalog-access-heading", "data-ui-catalog-access": true, "data-ui-catalog-setup": true },
      createElement("div", { "data-ui-catalog-setup-card": true },
        createElement("span", { "data-ui-catalog-setup-icon": true, "aria-hidden": true },
          createElement("svg", { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true, focusable: false },
            createElement("rect", { x: 5, y: 10, width: 14, height: 11, rx: 2 }),
            createElement("path", { d: "M8 10V7a4 4 0 0 1 8 0v3M12 14v3" }))),
        createElement("h1", { id: "catalog-access-heading" }, "Configurar acceso al catálogo"),
        notice ? createElement(Feedback, { kind: "success", children: notice }) : null,
        createElement("p", null, "Configurá una contraseña para proteger el catálogo de este dispositivo."),
        form));
  }
  if (isUnlock) {
    return createElement("main", { "aria-labelledby": "catalog-access-heading", "data-ui-catalog-access": true, "data-ui-catalog-unlock": true },
      createElement("div", { "data-ui-catalog-unlock-card": true },
        createElement("span", { "data-ui-catalog-unlock-icon": true, "aria-hidden": true },
          createElement("svg", { viewBox: "0 0 24 24", width: 28, height: 28, fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true, focusable: false },
            createElement("rect", { x: 5, y: 10, width: 14, height: 11, rx: 2 }),
            createElement("path", { d: "M8 10V7a4 4 0 0 1 8 0v3M12 14v3" }))),
        createElement("h1", { id: "catalog-access-heading" }, "Acceso al catálogo"),
        notice ? createElement(Feedback, { kind: "success", children: notice }) : null,
        createElement("p", null, "Ingresá tu contraseña para desbloquear el catálogo durante esta sesión."),
        form));
  }
  return createElement("main", { "aria-labelledby": "catalog-access-heading", "data-ui-catalog-access": true },
    createElement("h1", { id: "catalog-access-heading" }, "Acceso al catálogo"),
    notice ? createElement(Feedback, { kind: "success", children: notice }) : null,
    createElement("p", null, status === "setup_required" ? "Configurá una contraseña para proteger el catálogo de este dispositivo." : "Ingresá tu contraseña para desbloquear el catálogo durante esta sesión."),
    (status === "loading" || status === "unavailable") && createElement(Feedback, { kind: status === "loading" ? "loading" : "error" } as never, status === "loading" ? "Verificando acceso…" : "No se pudo leer la configuración local del catálogo."),
    form);
}
