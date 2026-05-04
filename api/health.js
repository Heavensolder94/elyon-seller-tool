module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: "Elyon Backend",
    message: "Backend laeuft",
    time: new Date().toISOString()
  });
};
