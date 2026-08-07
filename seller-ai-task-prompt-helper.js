(() => {
  "use strict";

  const STYLE_ID = "elyonAiTaskPromptHelperStyles";
  const SELECTORS = [
    '#elyonAiWorkforceTeamV6Composer [data-v6-field="prompt"]',
    '#elyonAiWorkforceTeamV5Composer [data-v5-field="prompt"]',
    '#elyonAiAgentTaskComposerModal [data-task-field="prompt"]',
    '#elyonAiWorkforce textarea[placeholder*="konkrete Aufgabe"]',
    '#elyonAiWorkforce textarea[placeholder*="geprüft werden"]',
  ];

  const state = { queued: false };
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .aiw-prompt-helper{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:7px;padding:8px 9px;border:1px solid rgba(96,165,250,.14);border-radius:10px;background:rgba(37,99,235,.05)}
      .aiw-prompt-helper button{margin:0;padding:7px 9px;border-radius:8px;font-size:9px;line-height:1.2}
      .aiw-prompt-helper .aiw-prompt-generate{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important;font-weight:800}
      .aiw-prompt-helper .aiw-prompt-restore,.aiw-prompt-helper .aiw-prompt-regenerate{background:rgba(148,163,184,.07)!important}
      .aiw-prompt-helper-status{font-size:9px;color:#8fa2b8;line-height:1.35;min-width:140px;flex:1}
      .aiw-prompt-helper-status.success{color:#86efac}.aiw-prompt-helper-status.error{color:#fca5a5}.aiw-prompt-helper-status.busy{color:#93c5fd}
      .aiw-prompt-helper[aria-busy="true"] button{opacity:.65;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const existing = document.querySelector(".aiw-prompt-helper-toast");
    existing?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-prompt-helper-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function uniqueFields() {
    const found = new Set();
    SELECTORS.forEach((selector) => document.querySelectorAll(selector).forEach((field) => found.add(field)));
    return [...found].filter((field) => field instanceof HTMLTextAreaElement && field.dataset.elyonPromptHelper !== "1" && field.dataset.builderField !== "systemPrompt");
  }

  function inferContext(field) {
    const container = field.closest("#elyonAiWorkforceTeamV6Composer,#elyonAiWorkforceTeamV5Composer,#elyonAiAgentTaskComposerModal,.aiw-builder-panel,.aiw-v6-composer-inner,.aiw-v5-composer-inner,#elyonAiWorkforce") || document.body;
    const heading = text(container.querySelector("h2,h3")?.textContent);
    const assigneeSelect = container.querySelector('[data-task-field="agent"]');
    const assignee = text(assigneeSelect?.selectedOptions?.[0]?.textContent || heading.replace(/\s+beauftragen$/i, ""));
    const taskTitle = text(container.querySelector('[data-v6-field="title"],[data-v5-field="title"],[data-task-field="title"],input[name="title"]')?.value);
    return { assignee, taskTitle, workspace: heading || "Virtuelle Mitarbeiter" };
  }

  function setFieldValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus({ preventScroll: true });
  }

  function setBusy(toolbar, busy, message = "") {
    toolbar.setAttribute("aria-busy", busy ? "true" : "false");
    const status = toolbar.querySelector("[data-prompt-helper-status]");
    if (!status) return;
    status.className = `aiw-prompt-helper-status${busy ? " busy" : ""}`;
    status.textContent = message;
  }

  function showGeneratedControls(toolbar, generated) {
    const generate = toolbar.querySelector("[data-prompt-generate]");
    const regenerate = toolbar.querySelector("[data-prompt-regenerate]");
    const restore = toolbar.querySelector("[data-prompt-restore]");
    if (generate) generate.hidden = generated;
    if (regenerate) regenerate.hidden = !generated;
    if (restore) restore.hidden = !generated;
  }

  async function generate(field, toolbar, { regenerate = false } = {}) {
    const current = text(field.value);
    if (!current && !text(field.dataset.elyonPromptOriginal)) {
      toast("Bitte zuerst ein paar Stichpunkte eingeben.");
      return false;
    }

    if (!field.dataset.elyonPromptOriginal) field.dataset.elyonPromptOriginal = current;
    const notes = text(field.dataset.elyonPromptOriginal);
    if (!notes) return false;

    setBusy(toolbar, true, regenerate ? "DeepSeek formuliert neu …" : "DeepSeek formuliert deinen Arbeitsauftrag …");
    try {
      const context = inferContext(field);
      const response = await fetch("/api/ai-task-prompt-generator", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, ...context }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.prompt) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);

      setFieldValue(field, String(payload.prompt));
      field.dataset.elyonPromptGenerated = "1";
      showGeneratedControls(toolbar, true);
      const status = toolbar.querySelector("[data-prompt-helper-status]");
      if (status) {
        status.className = "aiw-prompt-helper-status success";
        status.textContent = "KI-Entwurf eingefügt – bitte kurz prüfen und bei Bedarf anpassen.";
      }
      return true;
    } catch (error) {
      const status = toolbar.querySelector("[data-prompt-helper-status]");
      if (status) {
        status.className = "aiw-prompt-helper-status error";
        status.textContent = error?.message || "DeepSeek konnte den Auftrag nicht formulieren.";
      }
      toast(error?.message || "DeepSeek konnte den Auftrag nicht formulieren.");
      return false;
    } finally {
      toolbar.setAttribute("aria-busy", "false");
    }
  }

  function restore(field, toolbar) {
    const original = text(field.dataset.elyonPromptOriginal);
    if (!original) return;
    setFieldValue(field, original);
    delete field.dataset.elyonPromptOriginal;
    delete field.dataset.elyonPromptGenerated;
    showGeneratedControls(toolbar, false);
    const status = toolbar.querySelector("[data-prompt-helper-status]");
    if (status) {
      status.className = "aiw-prompt-helper-status";
      status.textContent = "Stichpunkte wiederhergestellt.";
    }
  }

  function decorateField(field) {
    if (!(field instanceof HTMLTextAreaElement) || field.dataset.elyonPromptHelper === "1") return false;
    field.dataset.elyonPromptHelper = "1";
    const toolbar = document.createElement("div");
    toolbar.className = "aiw-prompt-helper";
    toolbar.innerHTML = `
      <button type="button" class="aiw-prompt-generate" data-prompt-generate>✨ Mit DeepSeek ausformulieren</button>
      <button type="button" class="aiw-prompt-regenerate" data-prompt-regenerate hidden>↻ Neu generieren</button>
      <button type="button" class="aiw-prompt-restore" data-prompt-restore hidden>↩ Stichpunkte wiederherstellen</button>
      <span class="aiw-prompt-helper-status" data-prompt-helper-status>Stichpunkte reichen – DeepSeek macht daraus einen klaren Arbeitsauftrag.</span>
    `;
    field.insertAdjacentElement("afterend", toolbar);
    toolbar.querySelector("[data-prompt-generate]")?.addEventListener("click", () => generate(field, toolbar));
    toolbar.querySelector("[data-prompt-regenerate]")?.addEventListener("click", () => generate(field, toolbar, { regenerate: true }));
    toolbar.querySelector("[data-prompt-restore]")?.addEventListener("click", () => restore(field, toolbar));
    return true;
  }

  function decorate() {
    installStyles();
    uniqueFields().forEach(decorateField);
  }

  function queueDecorate() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      decorate();
    });
  }

  function relevantClick(target) {
    return target instanceof Element && Boolean(target.closest(
      "#virtualAgentsTab,#elyonAiAgentBuilderModal,#elyonAiAgentTaskComposerModal,#elyonAiWorkforceTeamV6Panel,#elyonAiWorkforceTeamV6Composer,#elyonAiWorkforceTeamV5Panel,#elyonAiWorkforceTeamV5Composer"
    ));
  }

  function install() {
    installStyles();
    queueDecorate();
    document.addEventListener("click", (event) => {
      if (!relevantClick(event.target)) return;
      setTimeout(queueDecorate, 0);
      setTimeout(queueDecorate, 80);
    }, true);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") setTimeout(queueDecorate, 0);
    });
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", () => setTimeout(queueDecorate, 0));
    [100, 350, 800].forEach((delay) => setTimeout(queueDecorate, delay));
  }

  window.ElyonAITaskPromptHelper = { refresh: queueDecorate, decorate, generate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();