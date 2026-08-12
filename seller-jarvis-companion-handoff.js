(() => {
  "use strict";

  const SOURCE_PARAM = "jarvisSource";
  const COMMAND_PARAM = "jarvisCommand";
  const MODE_PARAM = "jarvisMode";
  const ALLOWED_SOURCE = "quick-access";
  const ALLOWED_MODE = "plan";
  const MAX_COMMAND_LENGTH = 2000;
  const TAB_ID = "jarvisCommandCenterTab";

  const text = (value) => String(value ?? "").trim();

  function readHandoff() {
    let url;
    try { url = new URL(window.location.href); }
    catch { return null; }

    const source = text(url.searchParams.get(SOURCE_PARAM));
    if (source !== ALLOWED_SOURCE) return null;

    const mode = text(url.searchParams.get(MODE_PARAM)).toLowerCase();
    const command = text(url.searchParams.get(COMMAND_PARAM)).slice(0, MAX_COMMAND_LENGTH);

    url.searchParams.delete(SOURCE_PARAM);
    url.searchParams.delete(MODE_PARAM);
    url.searchParams.delete(COMMAND_PARAM);
    try { history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`); }
    catch { /* URL cleanup is best effort only */ }

    if (mode !== ALLOWED_MODE || !command) return null;
    return { source, mode: ALLOWED_MODE, command };
  }

  function prefill(handoff) {
    if (!handoff?.command) return false;
    window.ElyonJarvisCommandCenter?.open?.();

    const input = document.querySelector(`#${TAB_ID} [data-jarvis-cc-input]`);
    if (!input) return false;

    input.value = handoff.command;
    input.dataset.jarvisCompanionPrefilled = "1";
    input.setAttribute("aria-description", "Von Elyon Quick Access übergeben. Noch nichts geplant oder ausgeführt.");
    requestAnimationFrame(() => input.focus({ preventScroll: true }));

    window.dispatchEvent(new CustomEvent("elyon:jarvis-companion-handoff", {
      detail: {
        source: ALLOWED_SOURCE,
        mode: ALLOWED_MODE,
        command: handoff.command,
        nothingExecuted: true,
      },
    }));
    return true;
  }

  function consume() {
    const handoff = readHandoff();
    if (!handoff) return false;
    return prefill(handoff);
  }

  window.ElyonJarvisCompanionHandoff = Object.freeze({
    consume,
    prefill,
    safety: Object.freeze({
      acceptedSource: ALLOWED_SOURCE,
      acceptedMode: ALLOWED_MODE,
      automaticPlanning: false,
      automaticExecution: false,
    }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", consume, { once: true });
  else consume();
})();
