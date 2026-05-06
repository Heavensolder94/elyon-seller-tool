async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY fehlt in Vercel.");
  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    }
  );
  const data = await response.json();
  if (!response.ok || data.result === false) throw new Error(data.message || "CJ Token Fehler");
  return data.data?.accessToken;
}

export default async function handler(req, res) {
  try {
    const token = await getCjAccessToken();

    // GET: Bestellliste
    if (req.method === "GET") {
      const { orderId } = req.query;

      if (orderId) {
        // Einzelne Bestellung
        const response = await fetch(
          `https://developers.cjdropshipping.com/api2.0/v1/shopping/order/getOrderDetail?orderId=${orderId}`,
          { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } }
        );
        const data = await response.json();
        return res.status(200).json({ ok: true, order: data.data });
      }

      // Bestellliste
      const { pageNum = 1, pageSize = 20, status } = req.query;
      let url = `https://developers.cjdropshipping.com/api2.0/v1/shopping/order/list?pageNum=${pageNum}&pageSize=${pageSize}`;
      if (status) url += `&status=${status}`;

      const response = await fetch(url, {
        headers: { "CJ-Access-Token": token, "Content-Type": "application/json" }
      });
      const data = await response.json();
      return res.status(200).json({ ok: true, orders: data.data?.list || [], total: data.data?.total || 0 });
    }

    // POST: Bestellung erstellen
    if (req.method === "POST") {
      const body = req.body;
      const response = await fetch(
        "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2",
        {
          method: "POST",
          headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await response.json();
      if (!response.ok || data.result === false) {
        return res.status(500).json({ ok: false, error: data.message || "Bestellung Fehler", details: data });
      }
      return res.status(200).json({ ok: true, order: data.data });
    }

    // DELETE: Bestellung löschen
    if (req.method === "DELETE") {
      const { orderId } = req.query;
      if (!orderId) return res.status(400).json({ ok: false, error: "orderId fehlt" });
      const response = await fetch(
        `https://developers.cjdropshipping.com/api2.0/v1/shopping/order/deleteOrder?orderId=${orderId}`,
        {
          method: "DELETE",
          headers: { "CJ-Access-Token": token, "Content-Type": "application/json" }
        }
      );
      const data = await response.json();
      return res.status(200).json({ ok: true, result: data.data });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
