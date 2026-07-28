import handler from "./ai-agent-run.js";
import { applyCompanyOsApprovalCompat } from "../lib/company-os-approval-compat.js";

export default async function compatibleAiAgentHandler(req, res) {
  if (String(req?.method || "").toUpperCase() === "POST") {
    req.body = applyCompanyOsApprovalCompat(req.body);
  }
  return handler(req, res);
}
