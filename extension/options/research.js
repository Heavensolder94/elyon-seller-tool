function badgeClass(status) {
  return `badge badge-${String(status || "new").toLowerCase()}`;
}

async function readResearch() {
  const response = await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_LIST" });
  return Array.isArray(response?.researchMemory) ? response.researchMemory : [];
}

function render(items) {
  const root = document.getElementById("researchList");
  if (!items.length) {
    root.innerHTML = "<p>Keine Einträge vorhanden.</p>";
    return;
  }
  root.innerHTML = items
    .map(
      (item) => `
      <article class="item">
        <div class="top">
          <div>
            <div class="title">${item.title || "Ohne Titel"}</div>
            <div class="meta">${item.domain || "-"} · ${item.url || "-"}</div>
          </div>
          <span class="${badgeClass(item.status)}">${item.status || "new"}</span>
        </div>
        <div class="meta">
          Preis: ${item.price || "-"} · Währung: ${item.currency || "-"} · Score: ${item.score || "-"}<br />
          Notizen: ${item.notes || "-"}<br />
          Erkannt: ${item.detectedAt || "-"}<br />
          Aktualisiert: ${item.updatedAt || "-"}
        </div>
        <div class="row-actions">
          <input type="text" placeholder="Notiz hinzufügen" data-note-input="${item.id}" />
          <button type="button" data-note-save="${item.id}">Notiz speichern</button>
        </div>
        <div class="row-actions">
          <button type="button" data-status="${item.id}:reviewed">Reviewed</button>
          <button type="button" data-status="${item.id}:winner">Winner</button>
          <button type="button" data-status="${item.id}:risky">Risky</button>
          <button type="button" data-status="${item.id}:rejected">Rejected</button>
          <button type="button" data-delete="${item.id}">Löschen</button>
        </div>
      </article>
    `
    )
    .join("");
  root.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [id, status] = button.getAttribute("data-status").split(":");
      await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_UPDATE", id, patch: { status } });
      await load();
    });
  });
  root.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_DELETE", id: button.getAttribute("data-delete") });
      await load();
    });
  });
  root.querySelectorAll("[data-note-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-note-save");
      const input = root.querySelector(`[data-note-input="${id}"]`);
      await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_UPDATE", id, patch: { notes: input?.value || "" } });
      await load();
    });
  });
}

async function exportJson() {
  const response = await chrome.runtime.sendMessage({ type: "ELYON_RESEARCH_EXPORT_PREP" });
  const blob = new Blob([response?.exportJson || "[]"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url });
}

async function load() {
  render(await readResearch());
}

document.getElementById("refresh").addEventListener("click", load);
document.getElementById("exportJson").addEventListener("click", exportJson);
void load();
