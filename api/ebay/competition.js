export default async function handler(req, res) {
  try {
    const keyword = req.query.keyword || req.query.q || "iphone";
    const limit = Math.min(Number(req.query.limit || 20), 50);

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const searchUrl =
      `${baseUrl}/api/ebay/search?q=${encodeURIComponent(keyword)}&limit=${limit}`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (!response.ok || data.ok === false) {
      return res.status(response.status || 500).json({
        ok: false,
        error: data.error || "eBay Search konnte für Competition nicht geladen werden.",
        details: data
      });
    }

    const items = data.items || data.itemSummaries || data.results || [];

    const prices = items
      .map(item => Number(item.price?.value || item.price || item.currentPrice || 0))
      .filter(price => price > 0);

    const low = prices.length ? Math.min(...prices) : 0;
    const high = prices.length ? Math.max(...prices) : 0;
    const avg = prices.length
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length
      : 0;

    return res.status(200).json({
      ok: true,
      keyword,
      count: items.length,
      low,
      avg,
      high,
      items
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
