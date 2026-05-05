export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    ebayClientId: !!process.env.EBAY_CLIENT_ID,
    ebayClientSecret: !!process.env.EBAY_CLIENT_SECRET,
    cjApiKey: !!process.env.CJ_API_KEY
  });
}
