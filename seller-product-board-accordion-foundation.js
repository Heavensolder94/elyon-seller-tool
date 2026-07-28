(() => {
  "use strict";

  const LIST_SELECTOR = "#productListTab #list";
  const CONTROLS_ID = "elyonProductBoardAccordionControls";
  const STYLE_ID = "elyonProductBoardAccordionFoundationStyles";
  let scheduled = false;
  let retryTimer = null;

  const text = (value) => String(value ?? "").trim();

  function productId(card) {
    const aiButton = card.querySelector('[id^="productAiBtn_"]');
    if (aiButton?.id) return aiButton.id.replace(/^productAiBtn_/, "");

    const stable = card.querySelector("[data-elyon-stable-id]")?.dataset.elyonStableId;
    if (stable) return text(stable);

    const deleteId = card.querySelector("[data-elyon-delete-product]")?.dataset.elyonDeleteProduct;
    if (deleteId) return text(deleteId);

    const inline = [...card.querySelectorAll("button[onclick]")].find((button) =>
      /(?:editProduct|removeProduct|duplicateProduct|stopProduct|prepareProductForEbayDraft)\s*\(/.test(text(button.getAttribute("onclick"))),
    );
    const match = text(inline?.getAttribute("onclick")).match(/\((?:'|")?([^)'"\s]+)(?:'|")?\)/);
    return match ? match[1] : "";
  }

  function productRecord(card) {
    const id = productId(card);
    try {
      if (id && typeof products !== "undefined" && Array.isArray(products)) {
        return products.find((product) => String(product?.id) === String(id)) || null;
      }
    } catch {}
    return null;
  }

  function parseGermanMoney(value) {
    const cleaned = text(value)
      .replace(/[^0-9,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const number = Number.parseFloat(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function findPillText(card, prefix) {
    const pill = [...card.querySelectorAll(".details-box .pill")].find((node) =>
      text(node.textContent).startsWith(prefix),
    );
    return text(pill?.textContent);
  }

  function ensureEssentialPills(card) {
    if (!(card instanceof HTMLElement)) return;
    const main = card.firstElementChild;
    if (!main) return;

    const existingRow = [...main.querySelectorAll(":scope > .pill-row")][0] || main.querySelector(".pill-row");
    if (!existingRow || existingRow.querySelector("[data-elyon-essential-pill]")) return;

    const product = productRecord(card);
    const totalCostText = findPillText(card, "EK+Versand:");
    const visiblePills = [...existingRow.querySelectorAll(".pill")].map((node) => text(node.textContent));
    const sellText = visiblePills.find((value) => value.startsWith("VK:")) || "";
    const profitText = visiblePills.find((value) => value.startsWith("Gewinn:")) || "";
    const sell = product ? Number(product.sell) || 0 : parseGermanMoney(sellText);
    const profit = (() => {
      if (product && typeof calcProduct === "function") {
        try {
          return Number(calcProduct(product)?.profit) || 0;
        } catch {}
      }
      return parseGermanMoney(profitText);
    })();
    const margin = sell > 0 ? (profit / sell) * 100 : 0;

    const additions = [];
    if (totalCostText && !visiblePills.some((value) => value.startsWith("EK+Versand:"))) {
      additions.push(totalCostText);
    }
    if (sell > 0) additions.push(`Marge: ${margin.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

    const risk = text(product?.risk).toLowerCase();
    if (risk) {
      const label = risk === "low" ? "niedrig" : risk === "medium" ? "mittel" : risk === "high" ? "hoch" : risk;
      additions.push(`Risiko: ${label}`);
    }

    additions.forEach((label) => {
      const pill = document.createElement("span");
      pill.className = "pill elyon-essential-pill";
      pill.dataset.elyonEssentialPill = "true";
      pill.textContent = label;
      existingRow.appendChild(pill);
    });
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #productListTab #list .elyon-essential-pill{
        background:rgba(59,130,246,.1);
        border-color:rgba(96,165,250,.2);
        color:#dbeafe;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureControls(list) {
    let controls = document.getElementById(CONTROLS_ID);
    if (!controls) {
      controls = document.createElement("div");
      controls.id = CONTROLS_ID;
      controls.className = "elyon-product-board-accordion-controls";
      controls.innerHTML = `
        <span class="muted">Standardmäßig geschlossen · kompakte Vorschau mit Titel, Kennzahlen, Status und Score</span>
        <div>
          <button type="button" class="secondary" data-elyon-board-expand-all>Alle aufklappen</button>
          <button type="button" class="secondary" data-elyon-board-collapse-all>Alle einklappen</button>
        </div>
      `;
      list.parentElement?.insertBefore(controls, list);
    }
    return controls;
  }

  function decorate() {
    scheduled = false;
    const list = document.querySelector(LIST_SELECTOR);
    if (!list) return false;

    installStyles();
    ensureControls(list);
    const cards = list.querySelectorAll(".product-card:not(.small-card)");
    cards.forEach(ensureEssentialPills);
    return cards.length > 0;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function startRetry() {
    if (retryTimer) return;
    let tries = 0;
    retryTimer = setInterval(() => {
      tries += 1;
      const ready = decorate();
      if (ready || tries >= 12) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    }, 250);
  }

  function install() {
    schedule();
    startRetry();
    window.addEventListener("elyon:products-updated", schedule);
    window.addEventListener("elyon:tab-changed", schedule);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === "productListTab") schedule();
    }, true);

    window.ElyonProductBoardAccordionFoundation = {
      refresh: schedule,
      ensureControls: () => {
        const list = document.querySelector(LIST_SELECTOR);
        return list ? ensureControls(list) : null;
      },
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
