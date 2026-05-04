export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "Elyon Backend",
    message: "Backend läuft ✅",
    time: new Date().toISOString()
  });
}



Commit changes
