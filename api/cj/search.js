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

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").replace(/""/g, '"').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function extractProductList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.list)) return data.data.list;
  if (Array.isArray(data?.data?.content)) return data.data.content;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.data?.products)) return data.data.products;
  return [];
}

function normalizeCjProduct(product) {
  const pid =
    product?.pid ||
    product?.productId ||
    product?.id ||
    product?.vid ||
    "";

  const title =
    cleanText(product?.productNameEn) ||
    cleanText(product?.productName) ||
    cleanText(product?.nameEn) ||
    cleanText(product?.name) ||
    cleanText(product?.titleEn) ||
    cleanText(product?.title) ||
    "Unbekanntes CJ Produkt";

  const sku =
    product?.productSku ||
    product?.sku ||
    product?.variantSku ||
    "";

  const image =
    product?.productImage ||
    product?.image ||
    product?.mainImage ||
    product?.productImageUrl ||
    "";

  const price = toNumber(
    product?.sellPrice ||
      product?.price ||
      product?.nowPrice ||
      product?.variantSellPrice ||
      product?.minPrice
  );

  const weight = toNumber(product?.productWeight || product?.weight);
  const supplierName =
    cleanText(product?.supplierName) || cleanText(product?.supplier) || "";
  const supplierId = product?.supplierId || "";
  const categoryName =
    cleanText(product?.categoryName) || cleanText(product?.category) || "";
  const shippingCountries = Array.isArray(product?.shippingCountryCodes)
    ? product.shippingCountryCodes
    : [];

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
    isFreeShipping: Boolean(product?.isFreeShipping),
    saleStatus: product?.saleStatus ?? null,
    source: "CJ Dropshipping",
    rawProduct: product,
  };
}

async function parseUpstreamResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();

  if (!rawText) return { rawText: "", data: null };

  if (contentType.includes("application/json") || rawText.trim().startsWith("{")) {
    try {
      return { rawText, data: JSON.parse(rawText) };
    } catch {
      return { rawText, data: null };
    }
  }

  return { rawText, data: null };
}

async function getCjAccessToken() {
  const existingToken = readText(process.env.CJ_ACCESS_TOKEN);

  if (existingToken && existingToken.toLowerCase() !== "test") {
    console.log("CJ USING EXISTING ACCESS TOKEN");
    return existingToken;
  }

  if (existingToken.toLowerCase() === "test") {
    throw new Error(
      "CJ_ACCESS_TOKEN ist aktuell nur 'test'. Bitte echten CJ Access Token eintragen oder CJ_API_KEY setzen."
    );
  }

  const apiKey = readText(process.env.CJ_API_KEY);

  if (!apiKey) {
    throw new Error("CJ_ACCESS_TOKEN oder CJ_API_KEY fehlt in Vercel.");
  }

  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ apiKey }),
    }
  );

  const { rawText, data } = await parseUpstreamResponse(response);

  console.log("CJ AUTH RAW:", rawText);

  if (!response.ok || data?.result === false) {
    const error = new Error(
      data?.message || data?.error || rawText || "CJ Auth Fehler"
    );

    error.status = response.status || 502;
    error.details = {
      upstreamStatus: response.status,
      upstreamBody: data || rawText || null,
    };

    throw error;
  }

  const token =
    data?.data?.accessToken ||
    data?.accessToken ||
    data?.data?.token ||
    data?.token ||
    "";

  if (!token) {
    throw new Error("CJ Access Token fehlt in der CJ-Antwort.");
  }

  return token;
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
      source: "cj-search",
      tokenConfigured: Boolean(
        readText(process.env.CJ_ACCESS_TOKEN) || readText(process.env.CJ_API_KEY)
      ),
    });
  }

  const keyword = readText(req.query.keyword || req.query.q || "");
  const page = Math.max(Number(req.query.page || 1), 1);
  const size = Math.min(
    Math.max(Number(req.query.size || req.query.limit || 10), 1),
    50
  );

  const rawMode = req.query.raw === "1";

  if (!keyword) {
    return jsonError(res, 400, "keyword fehlt.", "QUERY_MISSING");
  }

  try {
    const token = await getCjAccessToken();

    const cjUrl = new URL(
      "https://developers.cjdropshipping.com/api2.0/v1/product/listV2"
    );

    cjUrl.search = new URLSearchParams({
      page: String(page),
      size: String(size),
      keyWord: keyword,
    }).toString();

    const response = await fetch(cjUrl.toString(), {
      method: "GET",
      headers: {
        "CJ-Access-Token": token,
        Accept: "application/json",
      },
    });

    const { rawText, data } = await parseUpstreamResponse(response);

    console.log("CJ RAW RESPONSE:", rawText);

    if (!response.ok || data?.result === false) {
      return jsonError(
        res,
        response.status || 502,
        data?.message || data?.error || rawText || "CJ Produktsuche Fehler",
        {
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText || "",
          upstreamBody: data || rawText || null,
        }
      );
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
      total: data?.data?.total || data?.total || products.length,
      count: products.length,
      products,
      raw: rawMode ? data : undefined,
    });
  } catch (error) {
    const status = Number.isFinite(Number(error?.status))
      ? Number(error.status)
      : 502;

    return jsonError(
      res,
      status,
      error?.message || "Unbekannter CJ Search Fehler",
      {
        ...(error?.details ? { upstream: error.details } : {}),
        hint:
          "Prüfe CJ_ACCESS_TOKEN / CJ_API_KEY und redeploye Vercel nach Änderungen.",
      }
    );
  }
}
