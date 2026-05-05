export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    route: "api/ebay/search.js",
    version: "SEARCH-TEST-2026-05-05",
    query: req.query.q || req.query.keyword || "",
    items: [
      {
        title: "TESTARTIKEL aus search.js",
        price: { value: "1.00", currency: "EUR" },
        condition: "Test",
        itemWebUrl: "https://www.ebay.de"
      }
    ]
  });
}
