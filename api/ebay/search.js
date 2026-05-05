export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    version: "RICHTIGE-SEARCH-DATEI-TEST",
    query: req.query.q || "",
    items: [
      {
        title: "TESTARTIKEL AUS DER RICHTIGEN SEARCH.JS",
        price: { value: "1.00", currency: "EUR" },
        condition: "Test",
        itemWebUrl: "https://www.ebay.de"
      }
    ]
  });
}
