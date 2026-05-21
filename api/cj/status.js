export default async function handler(req, res) {
  try {
    res.status(200).json({
      ok: true,
      cjConnected: true,
      sandbox: true,
      message: "CJ Verbindung vorbereitet"
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
