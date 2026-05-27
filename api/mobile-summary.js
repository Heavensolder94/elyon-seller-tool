async function readJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || process.env.VERCEL_URL || "localhost:3000";
  return `${proto}://${host}`;
}

async function probe(req, path) {
  try {
    const response = await fetch(`${getBaseUrl(req)}${path}`);
    const data = await readJsonSafe(response);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: error.message } };
  }
}

function normalizeOrders(data) {
  const orders = data?.orders || data?.data?.orders || [];
  return Array.isArray(orders) ? orders : [];
}

function getOrderTotal(order) {
  return Number(
    order?.pricingSummary?.total?.value ||
    order?.total?.value ||
    order?.price?.value ||
    order?.price ||
    0
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });

  const [health, ordersProbe, googleDrive] = await Promise.all([
    probe(req, "/api/mobile-health"),
    probe(req, "/api/ebay/orders?days=7"),
    probe(req, "/api/google-drive/status"),
  ]);

  const orders = normalizeOrders(ordersProbe.data);
  const revenue7d = orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
  const estimatedProfit7d = Number((revenue7d * 0.22).toFixed(2));
  const openOrders = orders.filter(order => {
    const status = String(order?.orderFulfillmentStatus || order?.status || "").toLowerCase();
    return !status.includes("fulfilled") && !status.includes("complete") && !status.includes("cancel");
  }).length;

  const services = health.data?.services || [];
  const summary = health.data?.summary || { total: 0, ok: 0, warn: 0, bad: 0 };

  return res.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    metrics: {
      revenue7d,
      estimatedProfit7d,
      orders7d: orders.length,
      openOrders,
      healthOk: summary.ok || 0,
      healthTotal: summary.total || services.length || 0,
      healthWarn: summary.warn || 0,
      healthBad: summary.bad || 0,
    },
    services,
    orders: orders.slice(0, 20),
    googleDrive: googleDrive.data || null,
    source: {
      ordersLive: ordersProbe.ok,
      healthLive: health.ok,
      googleDriveLive: googleDrive.ok,
    },
  });
}
