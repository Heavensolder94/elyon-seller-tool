(() => {
  const $ = (id) => document.getElementById(id);
  let detector = null;
  let scanTimer = null;
  let lastBarcode = "";
  let lastAnalysis = null;

  async function safeJson(url, options) {
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error.message } };
    }
  }

  function toast(message) {
    const el = $('sheetToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

  function isEnabled() {
    return document.body.dataset.flags?.split(' ').includes('scannerV2') || document.body.classList.contains('scanner-v2-enabled');
  }

  function installStyles() {
    if (document.getElementById('scannerV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'scannerV2Styles';
    style.textContent = `
      .scanner-v2-panel{margin-top:14px;padding:15px;border-radius:22px;background:rgba(15,23,42,.72);border:1px solid rgba(56,189,248,.24);box-shadow:0 18px 52px rgba(0,0,0,.28);display:grid;gap:10px}
      .scanner-v2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.scanner-v2-head b{font-size:15px}.scanner-v2-head small{display:block;color:#94a3b8;margin-top:3px;line-height:1.35}
      .scanner-v2-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.scanner-v2-actions button{padding:12px;border-radius:16px;background:rgba(37,99,235,.20);color:#bfdbfe;border:1px solid rgba(96,165,250,.22);font-weight:900}
      .scanner-v2-result{padding:12px;border-radius:16px;background:rgba(2,6,23,.48);border:1px solid rgba(148,163,184,.16);font-size:12px;color:#cbd5e1;line-height:1.45}.scanner-v2-result b{color:#e5e7eb}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (!isEnabled()) return null;
    installStyles();
    if ($('scannerV2Panel')) return $('scannerV2Panel');
    const card = $('analysisCard');
    if (!card) return null;
    const panel = document.createElement('div');
    panel.id = 'scannerV2Panel';
    panel.className = 'scanner-v2-panel';
    panel.innerHTML = `
      <div class="scanner-v2-head">
        <div><b>Scanner V2</b><small>Barcode-Erkennung, eBay-Suche und Produktidee-Übernahme.</small></div>
        <span class="badge green">BETA</span>
      </div>
      <div class="scanner-v2-actions">
        <button id="barcodeLiveBtn">Barcode Live</button>
        <button id="ebayCompareBtn">eBay Check</button>
        <button id="saveIdeaBtn">Idee speichern</button>
        <button id="clearScannerBtn">Reset</button>
      </div>
      <div class="scanner-v2-result" id="scannerV2Result">Bereit. Starte die Kamera und tippe auf Barcode Live.</div>
    `;
    card.insertAdjacentElement('afterend', panel);
    $('barcodeLiveBtn')?.addEventListener('click', startBarcodeLoop);
    $('ebayCompareBtn')?.addEventListener('click', runEbayCompare);
    $('saveIdeaBtn')?.addEventListener('click', saveProductIdea);
    $('clearScannerBtn')?.addEventListener('click', resetScannerV2);
    return panel;
  }

  async function initDetector() {
    if (!('BarcodeDetector' in window)) return null;
    if (detector) return detector;
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];
    detector = new BarcodeDetector({ formats });
    return detector;
  }

  async function detectOnce() {
    const video = $('cameraPreview');
    if (!video || video.style.display === 'none' || !video.videoWidth) return null;
    const activeDetector = await initDetector();
    if (!activeDetector) {
      $('scannerV2Result').innerHTML = '<b>BarcodeDetector nicht verfügbar.</b><br>Auf iPhone/Safari kann Barcode-Erkennung eingeschränkt sein. Nutze manuelle EAN oder Foto-Analyse.';
      return null;
    }
    const codes = await activeDetector.detect(video).catch(() => []);
    const first = codes?.[0];
    if (!first?.rawValue) return null;
    return { value: first.rawValue, format: first.format || 'barcode' };
  }

  async function startBarcodeLoop() {
    if (!isEnabled()) return toast('Scanner V2 ist noch nicht online geschaltet.');
    ensurePanel();
    if (scanTimer) clearInterval(scanTimer);
    $('scannerV2Result').innerHTML = 'Barcode Live Scan läuft…';
    scanTimer = setInterval(async () => {
      const result = await detectOnce();
      if (!result) return;
      lastBarcode = result.value;
      if ($('barcodeInput')) $('barcodeInput').value = result.value;
      $('scannerV2Result').innerHTML = `<b>Barcode erkannt:</b> ${result.value}<br>Format: ${result.format}`;
      if ($('scannerOverlay')) $('scannerOverlay').textContent = `Barcode erkannt: ${result.value}`;
      clearInterval(scanTimer);
      scanTimer = null;
    }, 900);
  }

  async function runEbayCompare() {
    if (!isEnabled()) return toast('Scanner V2 ist noch nicht online geschaltet.');
    ensurePanel();
    const query = $('barcodeInput')?.value?.trim() || $('analysisTitle')?.textContent?.trim() || $('productUrl')?.value?.trim();
    if (!query || query === 'Noch keine Analyse') {
      $('scannerV2Result').innerHTML = 'Bitte erst Barcode, Fotoanalyse oder Produktlink erfassen.';
      return;
    }
    $('scannerV2Result').innerHTML = `eBay Vergleich läuft für: <b>${query}</b>…`;
    const res = await safeJson(`/api/ebay/search?q=${encodeURIComponent(query)}&limit=8`);
    const items = res.data?.items || res.data?.itemSummaries || [];
    if (!res.ok || !items.length) {
      $('scannerV2Result').innerHTML = 'Keine eBay Treffer gefunden oder eBay Suche nicht erreichbar.';
      return;
    }
    const prices = items.map((item) => Number(item.price?.value || item.price || 0)).filter(Boolean);
    const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    $('sellPrice').textContent = avg ? `${avg.toFixed(2).replace('.', ',')} €` : '–';
    $('scannerV2Result').innerHTML = `<b>eBay Treffer:</b> ${items.length}<br><b>Ø Preis:</b> ${avg ? avg.toFixed(2).replace('.', ',') + ' €' : 'unbekannt'}<br><b>Top Treffer:</b> ${items[0]?.title || '–'}`;
  }

  function saveProductIdea() {
    if (!isEnabled()) return toast('Scanner V2 ist noch nicht online geschaltet.');
    const idea = {
      id: `idea-${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: 'mobile-scanner-v2',
      title: $('analysisTitle')?.textContent || 'Produktidee',
      category: $('analysisMeta')?.textContent || '',
      barcode: $('barcodeInput')?.value || lastBarcode || '',
      url: $('productUrl')?.value || '',
      sellPrice: $('sellPrice')?.textContent || '',
      buyPrice: $('buyPrice')?.textContent || '',
      profit: $('profitPrice')?.textContent || '',
    };
    const ideas = JSON.parse(localStorage.getItem('elyon_mobile_product_ideas') || '[]');
    ideas.unshift(idea);
    localStorage.setItem('elyon_mobile_product_ideas', JSON.stringify(ideas.slice(0, 100)));
    lastAnalysis = idea;
    $('scannerV2Result').innerHTML = `<b>Produktidee gespeichert.</b><br>${idea.title}<br>${idea.barcode ? 'Barcode: ' + idea.barcode : ''}`;
    toast('Produktidee lokal gespeichert.');
  }

  function resetScannerV2() {
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
    lastBarcode = '';
    lastAnalysis = null;
    if ($('scannerV2Result')) $('scannerV2Result').textContent = 'Scanner V2 zurückgesetzt.';
  }

  function waitForFlagSystem() {
    ensurePanel();
    const observer = new MutationObserver(() => ensurePanel());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-flags'] });
  }

  window.ElyonScannerV2 = {
    mount: ensurePanel,
    startBarcode: startBarcodeLoop,
    compare: runEbayCompare,
    saveIdea: saveProductIdea,
    reset: resetScannerV2,
  };

  document.addEventListener('DOMContentLoaded', waitForFlagSystem);
})();
