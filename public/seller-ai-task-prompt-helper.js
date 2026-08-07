(() => {
  "use strict";

  const STYLE_ID = "elyonAiTaskPromptHelperStyles";
  const FIELD_RULES = [
    {
      kind: "task",
      selectors: [
        '#elyonAiWorkforceTeamV6Composer [data-v6-field="prompt"]',
        '#elyonAiWorkforceTeamV5Composer [data-v5-field="prompt"]',
        '#elyonAiAgentTaskComposerModal [data-task-field="prompt"]',
        '#elyonAiWorkforce #aiTaskDescriptionInput',
        '#elyonAiWorkforce textarea[placeholder*="konkrete Aufgabe"]',
        '#elyonAiWorkforce textarea[placeholder*="Arbeitsauftrag"]',
        '#elyonAiWorkforce textarea[placeholder*="geprüft werden"]',
      ],
    },
    {
      kind: "system",
      selectors: [
        '#elyonAiAgentBuilderModal [data-builder-field="systemPrompt"]',
      ],
    },
  ];

  const state = { queued: false, installed: false, nextId: 1 };
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .aiw-prompt-helper{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:3px 0 8px;padding:8px 9px;border:1px solid rgba(96,165,250,.2);border-radius:10px;background:linear-gradient(100deg,rgba(37,99,235,.09),rgba(124,58,237,.06));width:100%;box-sizing:border-box}
      .aiw-prompt-helper button{margin:0;padding:7px 9px;border-radius:8px;font-size:9px;line-height:1.2;white-space:nowrap}
      .aiw-prompt-helper .aiw-prompt-generate{background:linear-gradient(135deg,#2563eb,#7c3aed)!important;color:#fff!important;border-color:transparent!important;font-weight:800}
      .aiw-prompt-helper .aiw-prompt-restore,.aiw-prompt-helper .aiw-prompt-regenerate{background:rgba(148,163,184,.07)!important}
      .aiw-prompt-helper-status{font-size:9px;color:#9fb0c3;line-height:1.35;min-width:160px;flex:1}
      .aiw-prompt-helper-status.success{color:#86efac}.aiw-prompt-helper-status.error{color:#fca5a5}.aiw-prompt-helper-status.busy{color:#93c5fd}
      .aiw-prompt-helper[aria-busy="true"] button{opacity:.65;pointer-events:none}
      .aiw-prompt-helper[data-prompt-kind="system"]{border-color:rgba(167,139,250,.22);background:linear-gradient(100deg,rgba(124,58,237,.09),rgba(37,99,235,.05))}
      @media(max-width:620px){.aiw-prompt-helper{align-items:stretch}.aiw-prompt-helper button{flex:1 1 auto}.aiw-prompt-helper-status{flex-basis:100%}}
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

  function discoverFields() {
    const found = new Map();
    FIELD_RULES.forEach((rule) => {
      rule.selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((field) => {
          if (field instanceof HTMLTextAreaElement && !found.has(field)) found.set(field, rule.kind);
        });
      });
    });
    return [...found.entries()].filter(([field]) => field.dataset.elyonPromptHelper !== "1");
  }

  function promptKind(field) {
    return field.dataset.elyonPromptKind === "system" ? "system" : "task";
  }

  function inferContext(field) {
    const kind = promptKind(field);
    const container = field.closest("#elyonAiWorkforceTeamV6Composer,#elyonAiWorkforceTeamV5Composer,#elyonAiAgentTaskComposerModal,#elyonAiAgentBuilderModal,.aiw-builder-panel,.aiw-v6-composer-inner,.aiw-v5-composer-inner,#elyonAiWorkforce") || document.body;
    const heading = text(container.querySelector("h2,h3")?.textContent);
    const assigneeSelect = container.querySelector('[data-task-field="agent"]');
    const assignee = text(assigneeSelect?.selectedOptions?.[0]?.textContent || heading.replace(/\s+beauftragen$/i, ""));
    const taskTitle = text(container.querySelector('[data-v6-field="title"],[data-v5-field="title"],[data-task-field="title"],#aiTaskTitleInput,input[name="title"]')?.value);
    const agentName = text(container.querySelector('[data-builder-field="name"]')?.value || assignee);
    const agentRole = text(container.querySelector('[data-builder-field="role"]')?.value);
    const department = text(container.querySelector('[data-builder-field="department"]')?.selectedOptions?.[0]?.textContent || container.querySelector('[data-builder-field="department"]')?.value);
    return {
      promptKind: kind,
      assignee,
      taskTitle,
      agentName,
      agentRole,
      department,
      workspace: heading || "Virtuelle Mitarbeiter",
    };
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
    const kind = promptKind(field);
    const current = text(field.value);
    if (!current && !text(field.dataset.elyonPromptOriginal)) {
      toast(kind === "system" ? "Bitte zuerst Rolle, Ziele oder ein paar Stichpunkte für den System-Prompt eingeben." : "Bitte zuerst ein paar Stichpunkte eingeben.");
      return false;
    }

    if (!field.dataset.elyonPromptOriginal) field.dataset.elyonPromptOriginal = current;
    const notes = text(field.dataset.elyonPromptOriginal);
    if (!notes) return false;

    const busyText = kind === "system"
      ? (regenerate ? "DeepSeek erstellt den System-Prompt neu …" : "DeepSeek formuliert die dauerhafte Hauptanweisung …")
      : (regenerate ? "DeepSeek formuliert den Arbeitsauftrag neu …" : "DeepSeek formuliert deinen Arbeitsauftrag …");
    setBusy(toolbar, true, busyText);

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
        status.textContent = kind === "system"
          ? "KI-System-Prompt eingefügt – bitte vor dem Speichern kurz prüfen."
          : "KI-Arbeitsauftrag eingefügt – bitte kurz prüfen und bei Bedarf anpassen.";
      }
      return true;
    } catch (error) {
      const message = error?.message || (kind === "system" ? "DeepSeek konnte den System-Prompt nicht formulieren." : "DeepSeek konnte den Auftrag nicht formulieren.");
      const status = toolbar.querySelector("[data-prompt-helper-status]");
      if (status) {
        status.className = "aiw-prompt-helper-status error";
        status.textContent = message;
      }
      toast(message);
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
      status.textContent = promptKind(field) === "system" ? "Ausgangstext wiederhergestellt." : "Stichpunkte wiederhergestellt.";
    }
  }

  function ensureFieldId(field) {
    if (field.id) return field.id;
    const id = `elyonAiPromptHelperField${state.nextId++}`;
    field.id = id;
    return id;
  }

  function decorateField(field, kind = "task") {
    if (!(field instanceof HTMLTextAreaElement) || field.dataset.elyonPromptHelper === "1") return false;
    field.dataset.elyonPromptHelper = "1";
    field.dataset.elyonPromptKind = kind;
    const fieldId = ensureFieldId(field);
    const toolbar = document.createElement("div");
    toolbar.className = "aiw-prompt-helper";
    toolbar.dataset.promptHelperField = fieldId;
    toolbar.dataset.promptKind = kind;
    const isSystem = kind === "system";
    toolbar.innerHTML = `
      <button type="button" class="aiw-prompt-generate" data-prompt-generate>${isSystem ? "✨ System-Prompt mit DeepSeek" : "✨ Mit DeepSeek ausformulieren"}</button>
      <button type="button" class="aiw-prompt-regenerate" data-prompt-regenerate hidden>↻ Neu generieren</button>
      <button type="button" class="aiw-prompt-restore" data-prompt-restore hidden>${isSystem ? "↩ Ausgangstext" : "↩ Stichpunkte wiederherstellen"}</button>
      <span class="aiw-prompt-helper-status" data-prompt-helper-status>${isSystem ? "Kurze Rollen- und Arbeitsregeln reichen – DeepSeek baut daraus eine dauerhafte Hauptanweisung." : "Stichpunkte reichen – DeepSeek macht daraus einen klaren Arbeitsauftrag."}</span>
    `;
    field.insertAdjacentElement("beforebegin", toolbar);
    return true;
  }

  function decorate() {
    installStyles();
    discoverFields().forEach(([field, kind]) => decorateField(field, kind));
  }

  function queueDecorate() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      decorate();
    });
  }

  function toolbarField(toolbar) {
    const field = document.getElementById(toolbar?.dataset?.promptHelperField || "");
    return field instanceof HTMLTextAreaElement ? field : null;
  }

  function handleHelperClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-prompt-generate],[data-prompt-regenerate],[data-prompt-restore]");
    if (!button) return false;
    const toolbar = button.closest(".aiw-prompt-helper");
    const field = toolbarField(toolbar);
    if (!toolbar || !field) return false;
    event.preventDefault();
    event.stopPropagation();
    if (button.matches("[data-prompt-restore]")) restore(field, toolbar);
    else generate(field, toolbar, { regenerate: button.matches("[data-prompt-regenerate]") });
    return true;
  }

  function relevantClick(target) {
    return target instanceof Element && Boolean(target.closest(
      "#virtualAgentsTab,#elyonAiAgentBuilderModal,#elyonAiAgentTaskComposerModal,#elyonAiWorkforceTeamV6Panel,#elyonAiWorkforceTeamV6Composer,#elyonAiWorkforceTeamV5Panel,#elyonAiWorkforceTeamV5Composer"
    ));
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    installStyles();
    queueDecorate();
    document.addEventListener("click", (event) => {
      if (handleHelperClick(event)) return;
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