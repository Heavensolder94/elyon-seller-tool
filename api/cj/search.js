export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    version: "CJ-SEARCH-RECREATED",
    keyword: req.query.keyword || req.query.q || "",
    products: [
      {
        productName: "CJ TESTPRODUKT AUS NEUER SEARCH.JS",
        pid: "CJ-TEST-001",
        sellPrice: "4.99",
        deliveryTime: "7-12 Tage",
        productLink: "https://cjdropshipping.com"
      }
    ]
  });
}
