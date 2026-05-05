async function getCjAccessToken() {
  const apiKey = process.env.CJ_API_KEY;

  if (!apiKey) {
    throw new Error("CJ_API_KEY fehlt in Vercel.");
  }

  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    }
  );

  const data = await response.json();

  if (!response.ok || data.result === false) {
    throw new Error(data.message || "CJ Access Token konnte nicht erstellt werden.");
  }

  return data.data?.accessToken;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;

  const cleaned = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";

  let text = String(value)
    .replace(/\s+/g, " ")
    .replace(/""/g, '"')
    .trim();

  // Falls CJ manchmal Arrays als Text liefert: ["LED","Solar","Light"]
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr.join(" ");
      }
    } catch (err) {
      return text
        .replace(/[\[\]"]/g, "")
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return text;
}

function normalizeCjProduct(product) {
  const pid =
    product.pid ||
    product.productId ||
    product.id ||
    "";

  const title =
    cleanText(product.productNameEn) ||
    cleanText(product.productName) ||
    "CJ Produkt";

  const sku =
    product.productSku ||
    product.sku ||
    "";

  const image =
    product.productImage ||
    product.image ||
    "";

  const price =
    toNumber(product.sellPrice || product.price || product.nowPrice);

  const weight =
    toNumber(product.productWeight || product.weight);

  const supplierName =
    cleanText(product.supplierName) ||
    "";

  const supplierId =
    product.supplierId ||
    "";

  const categoryName =
    cleanText(product.categoryName) ||
    "";

  const shippingCountries =
    Array.isArray(product.shippingCountryCodes)
      ? product.shippingCountryCodes
      : [];

  const isFreeShipping =
    Boolean(product.isFreeShipping);

  const saleStatus =
    product.saleStatus ?? null;

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
    source: "CJ Dropshipping"
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

export default async function handler(req, res) {
  try {
    const keyword = req.query.keyword || req.query.q || "";
    const page = Math.max(Number(req.query.page || 1), 1);
    const size = Math.min(Number(req.query.size || 10), 50);
    const rawMode = req.query.raw === "1";

    if (!keyword) {
      return res.status(400).json({
        ok: false,
        error: "keyword fehlt."
      });
    }

    const token = await getCjAccessToken();

    if (!token) {
      throw new Error("CJ Access Token fehlt in der CJ-Antwort.");
    }

    const cjUrl =
      "https://developers.cjdropshipping.com/api2.0/v1/product/listV2" +
      `?page=${page}` +
      `&size=${size}` +
      `&keyWord=${encodeURIComponent(keyword)}`;

    const response = await fetch(cjUrl, {
      method: "GET",
      headers: {
        "CJ-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok || data.result === false) {
      return res.status(response.status || 500).json({
        ok: false,
        error: data.message || "CJ Produktsuche Fehler",
        details: data
      });
    }

    const rawProducts = extractProductList(data);
    const products = rawProducts.map(normalizeCjProduct);

    return res.status(200).json({
      ok: true,
      keyword,
      page,
      size,
      total: data.data?.total || products.length,
      count: products.length,
      products,
      raw: rawMode ? data : undefined
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
