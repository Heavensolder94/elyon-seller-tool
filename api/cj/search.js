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

  const price =
    toNumber(
      product?.sellPrice ||
      product?.price ||
      product?.nowPrice ||
      product?.variantSellPrice ||
      product?.minPrice
    );

  const weight =
    toNumber(
      product?.productWeight ||
      product?.weight
    );

  const supplierName =
    cleanText(product?.supplierName) ||
    cleanText(product?.supplier) ||
    "";

  const supplierId =
    product?.supplierId ||
    "";

  const categoryName =
    cleanText(product?.categoryName) ||
    cleanText(product?.category) ||
    "";

  const shippingCountries =
    Array.isArray(product?.shippingCountryCodes)
      ? product.shippingCountryCodes
      : [];

  const isFreeShipping =
    Boolean(product?.isFreeShipping);

  const saleStatus =
    product?.saleStatus ?? null;

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
    rawProduct: product
  };
}

async function getCjAccessToken() {
  // PRIORITÄT 1:
  // Wenn bereits ein echter Access Token existiert
  const existingToken =
    process.env.CJ_ACCESS_TOKEN ||
    "";

  if (
    existingToken &&
    String(existingToken).length > 20
  ) {
    console.log("CJ USING EXISTING ACCESS TOKEN");
    return existingToken;
  }

  // PRIORITÄT 2:
  // Alten API-Key Flow versuchen
  const apiKey =
    process.env.CJ_API_KEY ||
    "";

  if (!apiKey) {
    throw new Error(
      "CJ_ACCESS_TOKEN oder CJ_API_KEY fehlt in Vercel."
    );
  }

  console.log("CJ REQUESTING ACCESS TOKEN");

  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        apiKey,
      }),
    }
  );

  const rawText = await response.text();

  console.log("CJ AUTH RAW:", rawText);

  let data = null;

  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      "CJ Auth Antwort ist kein JSON."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      "CJ Auth Fehler"
    );
  }

  // Unterstützt ALLE bekannten CJ Antworttypen
  const token =
    data?.data?.accessToken ||
    data?.accessToken ||
    data?.token ||
    data?.data?.token ||
    "";

  if (!token) {
    console.log(
      "CJ AUTH FULL RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      "CJ Access Token fehlt."
    );
  }

  console.log("CJ ACCESS TOKEN CREATED");

  return token;
}

  const contentType = String(
    response.headers.get("content-type") || ""
  ).toLowerCase();

  const rawText = await response.text();

  let data = null;

  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      data = null;
    }
  }

  console.log(
    "CJ AUTH RAW:",
    JSON.stringify(data, null, 2)
  );

  if (!response.ok || data?.result === false) {
    const message =
      data?.message ||
      data?.error ||
      rawText ||
      "CJ Access Token konnte nicht erstellt werden.";

    const error = new Error(message);

    error.status = response.status || 502;

    error.details = {
      upstreamStatus: response.status,
      upstreamStatusText: response.statusText || "",
      upstreamBody: data || rawText || null,
    };

    throw error;
  }

  // Unterstützt alte UND neue CJ Antworten
  const token =
    data?.data?.accessToken ||
    data?.accessToken ||
    data?.data?.token ||
    data?.token ||
    "";

  if (!token) {
    console.log(
      "CJ TOKEN RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      "CJ Access Token fehlt in der CJ-Antwort."
    );
  }

  return token;
}

export default async function handler(req, res) {
  const action = readText(
    req.query.action || req.query.endpoint || ""
  );

  if (action === "source-analyze") {
    return handleSourceAnalyze(req, res);
  }

  if (req.method !== "GET") {
    return jsonError(
      res,
      405,
      "Nur GET erlaubt.",
      "METHOD_NOT_ALLOWED"
    );
  }

  if (action === "status") {
    return res.status(200).json({
      ok: true,
      service: "CJ",
    });
  }

  const keyword = readText(
    req.query.keyword || req.query.q || ""
  );

  const page = Math.max(
    Number(req.query.page || 1),
    1
  );

  const size = Math.min(
    Math.max(
      Number(req.query.size || req.query.limit || 10),
      1
    ),
    50
  );

  const rawMode = req.query.raw === "1";

  if (!keyword) {
    return jsonError(
      res,
      400,
      "keyword fehlt.",
      "QUERY_MISSING"
    );
  }

  try {
    const token = await getCjAccessToken();

    console.log(
      "CJ TOKEN OK:",
      Boolean(token)
    );

    const cjUrl = new URL(
      "https://developers.cjdropshipping.com/api2.0/v1/product/listV2"
    );

    cjUrl.search = new URLSearchParams({
      page: String(page),
      size: String(size),
      keyWord: keyword,
    }).toString();

    console.log(
      "CJ SEARCH URL:",
      cjUrl.toString()
    );

    const response = await fetch(
      cjUrl.toString(),
      {
        method: "GET",
        headers: {
          "CJ-Access-Token": token,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    const { rawText, data } =
      await parseUpstreamResponse(response);

    console.log(
      "CJ RAW RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    console.log(
      "CJ RAW TEXT:",
      rawText
    );

    if (!response.ok || data?.result === false) {
      const upstreamError =
        data?.message ||
        data?.error ||
        rawText ||
        "CJ Produktsuche Fehler";

      return jsonError(
        res,
        response.status || 502,
        upstreamError,
        {
          upstreamStatus: response.status,
          upstreamStatusText:
            response.statusText || "",
          upstreamBody:
            data || rawText || null,
        }
      );
    }

    if (!data) {
      return jsonError(
        res,
        502,
        "CJ API lieferte keine JSON-Antwort.",
        {
          upstreamStatus: response.status,
          upstreamStatusText:
            response.statusText || "",
          upstreamBody:
            rawText || null,
        }
      );
    }

    const rawProducts =
      extractProductList(data);

    console.log(
      "CJ RAW PRODUCTS:",
      JSON.stringify(
        rawProducts?.slice?.(0, 2),
        null,
        2
      )
    );

    const products =
      rawProducts.map(normalizeCjProduct);

    return res.status(200).json({
      ok: true,
      source: "cj-search",
      status: 200,
      keyword,
      page,
      size,
      total:
        data?.data?.total ||
        data?.total ||
        products.length,
      count: products.length,
      products,
      raw: rawMode ? data : undefined,
    });
  } catch (error) {
    console.error(
      "CJ SEARCH ERROR:",
      error
    );

    const status = Number.isFinite(
      Number(error?.status)
    )
      ? Number(error.status)
      : 502;

    return jsonError(
      res,
      status,
      error?.message ||
        "Unbekannter CJ Search Fehler",
      {
        ...(error?.details
          ? { upstream: error.details }
          : {}),
        hint:
          "Prüfe CJ_API_KEY / CJ_ACCESS_TOKEN und die CJ API-Erreichbarkeit.",
      }
    );
  }
}
