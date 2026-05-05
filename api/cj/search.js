async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;

  if (!apiKey) {
    throw new Error("CJ_API_KEY fehlt in Vercel.");
  }

  const tokenRes = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.result === false) {
    throw new Error(
      tokenData.message ||
      tokenData.error ||
      "CJ Access Token konnte nicht erstellt werden."
    );
  }

  const accessToken =
    tokenData.data?.accessToken ||
    tokenData.data?.access_token ||
    tokenData.accessToken ||
    tokenData.access_token;

  if (!accessToken) {
    throw new Error("CJ Access Token fehlt in der Antwort.");
  }

  return accessToken;
}

function normalizeProducts(cjData) {
  const raw =
    cjData.data?.list ||
    cjData.data?.content ||
    cjData.data?.records ||
    cjData.data ||
    cjData.products ||
    [];

  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  try {
    const keyword = req.query.keyword || req.query.q || "";
    const page = Number(req.query.page || 1);
    const size = Math.min(Number(req.query.size || 10), 50);

    if (!keyword) {
      return res.status(400).json({
        ok: false,
        error: "keyword fehlt."
      });
    }

    const accessToken = await getCjAccessToken();

    const url =
      "https://developers.cjdropshipping.com/api2.0/v1/product/list" +
      `?pageNum=${page}` +
      `&pageSize=${size}` +
      `&productNameEn=${encodeURIComponent(keyword)}`;

    const cjRes = await fetch(url, {
      method: "GET",
      headers: {
        "CJ-Access-Token": accessToken
      }
    });

    const cjData = await cjRes.json();

    if (!cjRes.ok || cjData.result === false) {
      return res.status(cjRes.status || 500).json({
        ok: false,
        error: cjData.message || cjData.error || "CJ Produktsuche Fehler",
        details: cjData
      });
    }

    const products = normalizeProducts(cjData);

    return res.status(200).json({
      ok: true,
      keyword,
      page,
      size,
      count: products.length,
      products,
      raw: cjData
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
