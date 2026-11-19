import { cjConfigurationStatus } from "../../lib/cj-configuration-status.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  const state = cjConfigurationStatus();
  return res.status(200).json({ ok: true, service: "CJ", ...state, cjConnected: false, sandbox: null });
}
