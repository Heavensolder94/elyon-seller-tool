function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function createCjApiError(message, details = {}) {
  const error = new Error(message || "CJ API error");
  error.details = details;
  return error;
}

export function getCjTokenStatus(env = process.env) {
  const accessToken = readText(env.CJ_ACCESS_TOKEN);
  if (accessToken) return "configured";
  if (readText(env.CJ_API_KEY)) return "api-key-only";
  return "missing";
}

export async function getCjAccessTokenFromEnv(env = process.env) {
  const existingToken = readText(env.CJ_ACCESS_TOKEN);
  if (existingToken) return existingToken;

  const apiKey = readText(env.CJ_API_KEY);
  if (!apiKey) {
    throw createCjApiError("CJ_ACCESS_TOKEN oder CJ_API_KEY fehlt in Vercel.", {
      tokenStatus: "missing",
    });
  }

  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok || data?.result === false) {
    throw createCjApiError(data?.message || data?.error || rawText || "CJ Access Token konnte nicht erstellt werden.", {
      tokenStatus: "refresh_failed",
      upstreamStatus: response.status,
      upstreamBody: data || rawText || null,
    });
  }

  const token = readText(data?.data?.accessToken);
  if (!token) {
    throw createCjApiError("CJ Access Token fehlt in der CJ-Antwort.", {
      tokenStatus: "invalid_response",
      upstreamBody: data || rawText || null,
    });
  }

  return token;
}

async function parseResponse(response) {
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }
  return { rawText, data };
}

function extractListData(data) {
  if (Array.isArray(data?.data?.content)) {
    return data.data.content.flatMap((entry) => Array.isArray(entry?.productList) ? entry.productList : entry).filter(Boolean);
  }
  if (Array.isArray(data?.data?.productList)) return data.data.productList;
  if (Array.isArray(data?.data?.variants)) return data.data.variants;
  if (Array.isArray(data?.data?.variantList)) return data.data.variantList;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

export function createCjApiClient(env = process.env) {
  return {
    async request(path, { method = "GET", query, body, token } = {}) {
      const accessToken = token || await getCjAccessTokenFromEnv(env);
      const url = new URL(`https://developers.cjdropshipping.com/api2.0/v1${path}`);
      Object.entries(query || {}).forEach(([key, value]) => {
        const next = readText(value);
        if (next) url.searchParams.set(key, next);
      });

      const response = await fetch(url.toString(), {
        method,
        headers: {
          "CJ-Access-Token": accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: method === "GET" ? undefined : JSON.stringify(body || {}),
      });

      const { rawText, data } = await parseResponse(response);
      if (!response.ok || data?.result === false || data?.success === false) {
        throw createCjApiError(data?.message || data?.error || rawText || "CJ API request failed.", {
          upstreamStatus: response.status,
          upstreamBody: data || rawText || null,
          endpoint: path,
          tokenStatus: getCjTokenStatus(env),
        });
      }

      return { response, rawText, data, token: accessToken };
    },

    async productListV2(params = {}, token) {
      return this.request("/product/listV2", { method: "GET", query: params, token });
    },

    async productQuery(params = {}, token) {
      return this.request("/product/query", { method: "GET", query: params, token });
    },

    async productVariantQuery(params = {}, token) {
      const attempts = [
        { path: "/product/variant/queryByPid", query: params },
        { path: "/product/variant/query", query: params },
      ];
      let lastError = null;
      for (const attempt of attempts) {
        try {
          return await this.request(attempt.path, { method: "GET", query: attempt.query, token });
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || createCjApiError("CJ Variant Query fehlgeschlagen.");
    },

    async stockQueryBySku(sku, token) {
      return this.request("/product/stock/queryBySku", { method: "GET", query: { sku }, token });
    },

    async inventoryByPid(pid, token) {
      return this.request("/product/stock/getInventoryByPid", { method: "GET", query: { pid }, token });
    },

    async globalWarehouseList(token) {
      return this.request("/product/globalWarehouseList", { method: "GET", token });
    },

    extractListData,
  };
}

export { extractListData, readText, toArray, createCjApiError };
