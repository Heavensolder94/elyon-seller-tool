export default function handler(req, res) {
  const keyword = req.query.keyword || req.query.q || "Test";

  res.status(200).json({
    ok: true,
    keyword,
    count: 3,
    low: 9.99,
    avg: 16.49,
    high: 24.99,
    items: [
      {
        title: `${keyword} Beispiel Listing 1`,
        price: { value: "9.99", currency: "EUR" },
        condition: "Neu",
        itemWebUrl: "https://www.ebay.de"
      },
      {
        title: `${keyword} Beispiel Listing 2`,
        price: { value: "14.99", currency: "EUR" },
        condition: "Neu",
        itemWebUrl: "https://www.ebay.de"
      },
      {
        title: `${keyword} Beispiel Listing 3`,
        price: { value: "24.99", currency: "EUR" },
        condition: "Neu",
        itemWebUrl: "https://www.ebay.de"
      }
    ]
  });
}
