(() => {
  "use strict";
  const SKU = "AMZ-B0BWND9WBR";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);

  if (typeof document !== "undefined" && !document.getElementById("elyonFeedArchiveStyles")) {
    const css = document.createElement("style");
    css.id = "elyonFeedArchiveStyles";
    css.textContent = [
      ".elyon-feed-archive-btn{display:inline-flex;margin-top:12px;padding:8px 12px;border:1px solid rgba(148,163,184,.35);border-radius:10px;background:transparent;color:#cbd5e1;font-size:12px;font-weight:650;cursor:pointer}",
      ".elyon-feed-archive-btn:hover{background:rgba(148,163,184,.09)}",
      ".elyon-feed-archive-btn:disabled{opacity:.5;cursor:wait}",
      ".elyon-feed-history{padding:15px 20px}",
      ".elyon-feed-history summary{cursor:pointer;font-size:13px;font-weight:750;color:#dbeafe}",
      ".elyon-feed-history .elyon-status-foot{margin-top:8px}",
      ".elyon-feed-history-list{display:grid;gap:10px;margin-top:12px}",
      ".elyon-feed-history-entry{padding:12px 14px;border-top:1px solid rgba(148,163,184,.16);color:#e2e8f0;font-size:12px}",
      ".elyon-feed-history-entry strong{font-size:13px}",
      ".elyon-feed-history-entry p{color:#94a3b8;font-size:11px;margin:5px 0 0;overflow-wrap:anywhere}",
    ].join("");
    document.head.appendChild(css);
  }

  function button(product, mode) {
    if (mode !== "draft" || product?.source !== "elyon_seller_hub_feed" ||
        product?.feedVerification !== "feed_processed_not_live_checked" ||
        String(product?.sku).toUpperCase() !== SKU || !product?.externalTaskId) return "";
    return '<button type="button" class="elyon-feed-archive-btn" data-elyon-archive-feed-sku="' +
      SKU + '" data-elyon-archive-feed-task="' + esc(product.externalTaskId) +
      '">Nur Dreamzie-Feed in ELYON archivieren</button>';
  }

  function renderHistory(records) {
    if (!Array.isArray(records) || !records.length) return "";
    return '<details class="card elyon-feed-history">' +
      '<summary>Feed-Verlauf · ' + records.length + ' archiviert</summary>' +
      '<p class="elyon-status-foot">Lokaler ELYON-Verlauf. Eine Archivierung löscht keinen eBay-Entwurf und bestätigt nicht, ob einer im Seller Hub vorhanden ist.</p>' +
      '<div class="elyon-feed-history-list">' + records.map((entry) =>
        '<div class="elyon-feed-history-entry"><strong>' + esc(entry.title || "Verarbeiteter Feed-Auftrag") +
        '</strong><p>SKU ' + esc(entry.sku) + ' · Feed-Auftrag ' + esc(entry.externalTaskId) +
        '</p><p>In ELYON archiviert: ' + esc(entry.archivedAt || "Datum unbekannt") + '</p></div>'
      ).join("") + '</div></details>';
  }

  async function archive(button, currentDrafts, onSuccess, onError) {
    const sku = String(button?.dataset?.elyonArchiveFeedSku || "").toUpperCase();
    const externalTaskId = String(button?.dataset?.elyonArchiveFeedTask || "");
    if (sku !== SKU || !externalTaskId || button.disabled ||
        !Array.isArray(currentDrafts) || !currentDrafts.some((item) =>
          item?.source === "elyon_seller_hub_feed" &&
          item?.feedVerification === "feed_processed_not_live_checked" &&
          String(item.sku).toUpperCase() === sku &&
          String(item.externalTaskId) === externalTaskId)) return;
    if (window.confirm(
      "Dreamzie-Feed-Auftrag nur in ELYON archivieren?\n\n" +
      "ELY-000004 bleibt in Company OS zur Prüfung erhalten.\n" +
      "Der verarbeitete Feed-Auftrag bleibt im Feed-Verlauf.\n" +
      "Bei eBay wird nichts gelöscht oder verändert.\n" +
      "Seller-Hub-Entwürfe sind nicht live prüfbar."
    ) !== true) return;

    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Feed-Auftrag wird archiviert …";
    try {
      const response = await fetch("/api/ebay/archive-processed-feed", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sku, externalTaskId, confirmation: "ARCHIVE_FEED_LOCALLY" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true || data?.archived !== true) {
        throw new Error("HTTP " + response.status + ": " +
          String(data?.message || data?.error || "Archivierung nicht bestätigt"));
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = label;
      onError?.(String(error?.message || "Unbekannter Fehler"));
      return;
    }
    await onSuccess?.();
  }

  window.ElyonFeedArchive = Object.freeze({ button, renderHistory, archive });
})();
