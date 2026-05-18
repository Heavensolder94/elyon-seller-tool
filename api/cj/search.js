function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "cj-search",
    status,
    error,
    details: details ?? null,
  });
}

function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\s+/g, " ").replace(/""/g, '"').trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.join(" ");
    } catch (err) {
      return text.replace(/[\[\]"]/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return text;
}

function normalizeCjProduct(product) {
  const pid = product.pid || product.productId || product.id || "";
  const title = cleanText(product.productNameEn) || cleanText(product.productName) || "CJ Produkt";
  const sku = product.productSku || product.sku || "";
  const image = product.productImage || product.image || "";
  const price = toNumber(product.sellPrice || product.price || product.nowPrice);
  const weight = toNumber(product.productWeight || product.weight);
  const supplierName = cleanText(product.supplierName) || "";
  const supplierId = product.supplierId || "";
  const categoryName = cleanText(product.categoryName) || "";
  const shippingCountries = Array.isArray(product.shippingCountryCodes) ? product.shippingCountryCodes : [];
  const isFreeShipping = Boolean(product.isFreeShipping);
  const saleStatus = product.saleStatus ?? null;

  return {
    pid,
    title,
    productName: title,
    productNameEn: title,
    sku,
    productSku: sku,
    image,
    productImage: image,
    price,
    sellPrice: price,
    weight,
    productWeight: weight,
    supplierName,
    supplierId,
    categoryName,
    shippingCountries,
    isFreeShipping,
    saleStatus,
    source: "CJ Dropshipping",
  };
}

function extractProductList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.products)) return data.products;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.data?.list)) return data.data.list;
  if (Array.isArray(data.data?.content)) return data.data.content;
  if (Array.isArray(data.result)) return data.result;
  return [];
}

async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ_API_KEY fehlt in Vercel.");
  }

  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apiKey }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  let data = null;
  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      data = null;
    }
  }

  if (!response.ok || data?.result === false) {
    const message = data?.message || data?.error || rawText || "CJ Access Token konnte nicht erstellt werden.";
    const error = new Error(message);
    error.status = response.status || 502;
    error.details = {
      upstreamStatus: response.status,
      upstreamStatusText: response.statusText || "",
      upstreamBody: data || rawText || null,
    };
    throw error;
  }

  const token = data?.data?.accessToken;
  if (!token) {
    throw new Error("CJ Access Token fehlt in der CJ-Antwort.");
  }

  return token;
}

async function parseUpstreamResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  if (!rawText) return { rawText: "", data: null };

  if (contentType.includes("application/json")) {
    try {
      return { rawText, data: JSON.parse(rawText) };
    } catch (err) {
      return { rawText, data: null };
    }
  }

  return { rawText, data: null };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return jsonError(res, 405, "Nur GET erlaubt.", "METHOD_NOT_ALLOWED");
  }

  const action = readText(req.query.action || req.query.endpoint || "");
  if (action === "status") {
    return res.status(200).json({
      ok: true,
      service: "CJ",
    });
  }

  const keyword = readText(req.query.keyword || req.query.q || "");
  const page = Math.max(Number(req.query.page || 1), 1);
  const size = Math.min(Math.max(Number(req.query.size || req.query.limit || 10), 1), 50);
  const rawMode = req.query.raw === "1";

  if (!keyword) {
    return jsonError(res, 400, "keyword fehlt.", "QUERY_MISSING");
  }

  try {
    const token = await getCjAccessToken();
    const cjUrl = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/listV2");
    cjUrl.search = new URLSearchParams({
      page: String(page),
      size: String(size),
      keyWord: keyword,
    }).toString();

    const response = await fetch(cjUrl.toString(), {
      method: "GET",
      headers: {
        "CJ-Access-Token": token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    const { rawText, data } = await parseUpstreamResponse(response);

    if (!response.ok || data?.result === false) {
      const upstreamError = data?.message || data?.error || rawText || "CJ Produktsuche Fehler";
      return jsonError(res, response.status || 502, upstreamError, {
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText || "",
        upstreamBody: data || rawText || null,
      });
    }

    if (!data) {
      return jsonError(res, 502, "CJ API lieferte keine JSON-Antwort.", {
        upstreamStatus: response.status,
        upstreamStatusText: response.statusText || "",
        upstreamBody: rawText || null,
      });
    }

    const rawProducts = extractProductList(data);
    const products = rawProducts.map(normalizeCjProduct);

    return res.status(200).json({
      ok: true,
      source: "cj-search",
      status: 200,
      keyword,
      page,
      size,
      total: data.data?.total || products.length,
      count: products.length,
      products,
      raw: rawMode ? data : undefined,
    });
  } catch (error) {
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : (/CJ_API_KEY/.test(error?.message || "") ? 500 : 502);
    return jsonError(res, status, error?.message || "Unbekannter CJ Search Fehler", {
      ...(error?.details ? { upstream: error.details } : {}),
      hint: "Prüfe CJ_API_KEY und die CJ API-Erreichbarkeit.",
    });
  }
}
