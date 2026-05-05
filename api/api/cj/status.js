export default async function handler(req, res) {
  const hasKey = !!process.env.CJ_API_KEY;

  res.status(200).json({
    ok: true,
    cjApiKeyFound: hasKey,
    message: hasKey
      ? "CJ_API_KEY ist im Backend vorhanden."
      : "CJ_API_KEY fehlt in Vercel Environment Variables."
  });
}
