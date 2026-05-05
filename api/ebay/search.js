export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    version: "LOWERCASE-EBAY-SEARCH-TEST",
    query: req.query.q || "",
    items: [
      {
        title: "TESTARTIKEL AUS API/ebay/search.js",
        price: { value: "1.00", currency: "EUR" },
        condition: "Test",
        itemWebUrl: "https://www.ebay.de"
      }
    ]
  });
}
