(() => {
  const $ = (id) => document.getElementById(id);
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  async function safeJson(url, options) {
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error.message } };
    }
  }

  function badge(label, state = "blue") {
    return `<span class="badge ${state}">${label}</span>`;
  }

  function normalizeMoney(value) {
    const number = Number(value || 0);
    return euro.format(Number.isFinite(number) ? number : 0);
  }

  function orderTitle(order) {
    return order?.lineItems?.[0]?.title || order?.orderId || "eBay Bestellung";
  }

  function orderTotal(order) {
    return Number(order?.pricingSummary?.total?.value || order?.total?.value || order?.price?.value || order?.price || 0);
  }

  function renderServices(services = []) {
    if (!services.length || !$('statusList')) return;
    const html = services.map((service) => {
      const color = service.state === "ok" ? "green" : service.state === "warn" ? "amber" : "red";
      const dot = service.state === "ok" ? "" : "warn";
      const label = service.state === "ok" ? "LIVE" : service.state === "warn" ? "PRÜFEN" : "FEHLER";
      return `<div class="status-row"><span class="status-name"><i class="dot ${dot}"></i>${service.name}</span>${badge(label, color)}</div>`;
    }).join("");
    $('statusList').innerHTML = html;
    if ($('connectionsList')) $('connectionsList').innerHTML = html;
  }

  function renderOrders(orders = []) {
    if (!$('ordersList')) return;
    if (!orders.length) {
      $('ordersList').innerHTML = '<div class="status-row"><span class="status-name">Keine eBay Orders in den letzten 7 Tagen</span><span class="badge green">LIVE</span></div>';
      return;
    }

    $('ordersList').innerHTML = orders.map((order) => {
      const currency = order?.pricingSummary?.total?.currency || order?.total?.currency || "EUR";
      const total = orderTotal(order).toFixed(2).replace('.', ',');
      const status = order?.orderFulfillmentStatus || order?.orderPaymentStatus || "Order";
      return `<article class="order-card"><div class="thumb">📦</div><div><div class="order-title">${orderTitle(order)}</div><p class="order-meta">${order?.buyer?.username || 'Käufer'} · ${total} ${currency}<br>${order?.creationDate || ''}</p></div>${badge(status, 'green')}</article>`;
    }).join("");
  }

  async function loadMobileSummary() {
    const response = await safeJson('/api/mobile-summary');
    if (!response.ok || !response.data?.ok) return;

    const { metrics = {}, services = [], orders = [], source = {}, googleDrive = {} } = response.data;

    if ($('todayRevenue')) $('todayRevenue').textContent = normalizeMoney(metrics.revenue7d);
    if ($('todayProfit')) $('todayProfit').textContent = normalizeMoney(metrics.estimatedProfit7d);
    if ($('openOrders')) $('openOrders').textContent = String(metrics.openOrders ?? metrics.orders7d ?? orders.length ?? 0);
    if ($('healthScore')) $('healthScore').textContent = `${metrics.healthOk || 0}/${metrics.healthTotal || services.length || 0}`;
    if ($('healthTrend')) $('healthTrend').textContent = metrics.healthWarn || metrics.healthBad ? 'Prüfen' : 'Alles live';
    if ($('revenueTrend')) $('revenueTrend').textContent = source.ordersLive ? 'eBay live · 7 Tage' : 'Fallback';
    if ($('profitTrend')) $('profitTrend').textContent = 'Schätzung · 22%';
    if ($('ordersSubtitle')) $('ordersSubtitle').textContent = source.ordersLive ? 'Live eBay Orders der letzten 7 Tage.' : 'Orders-Fallback aktiv.';

    renderServices(services);
    renderOrders(orders);

    const driveConnected = Boolean(googleDrive?.connected);
    document.body.dataset.googleDrive = driveConnected ? 'connected' : 'disconnected';
  }

  async function askRealBrain(question) {
    if (!question) return;
    const chatLog = $('chatLog');
    if (!chatLog) return;

    const bubble = document.createElement('div');
    bubble.className = 'bubble ai';
    bubble.textContent = 'Elyon Brain denkt live…';
    chatLog.appendChild(bubble);

    const response = await safeJson('/api/ai-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: question,
        context: 'Mobile Command Center: Nutze API Health, eBay Orders, Produkt Scanner und Google Drive Status.',
        source: 'mobile-live-enhancer'
      })
    });

    bubble.textContent = response.data?.answer || response.data?.message || response.data?.result || 'Live Brain konnte nicht antworten. Bitte AI-Workflow prüfen.';
  }

  function enhanceBrain() {
    const send = $('brainSend');
    const input = $('brainInput');
    if (!send || !input || send.dataset.liveEnhanced) return;
    send.dataset.liveEnhanced = 'true';
    send.addEventListener('click', () => setTimeout(() => askRealBrain(input.value.trim()), 20));
  }

  window.ElyonMobileLive = {
    refresh: loadMobileSummary,
  };

  document.addEventListener('DOMContentLoaded', () => {
    loadMobileSummary();
    enhanceBrain();
    setInterval(loadMobileSummary, 60_000);
  });
})();
