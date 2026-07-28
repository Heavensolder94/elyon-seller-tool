const APPROVED_STATUSES = new Set([
  "ready_for_seller_tool",
  "bereit_manuell_einstellen",
  "approved",
]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 200) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function applyCompanyOsApprovalCompat(bodyValue) {
  const body = plainObject(bodyValue);
  const input = plainObject(body.input || body.context || body);
  const product = plainObject(input.product || input.context || input.source || input);
  const currentApproval = plainObject(product.companyOsApproval || input.companyOsApproval);
  const status = text(product.status || product.workflowStatus || product.sellerStatus).toLowerCase();

  if (!status || currentApproval.status) return body;

  const normalizedApproval = {
    ...currentApproval,
    status,
    approved: APPROVED_STATUSES.has(status),
    source: currentApproval.source || "product-status",
  };

  if (input.product && typeof input.product === "object") {
    input.product = { ...product, companyOsApproval: normalizedApproval };
  } else {
    input.companyOsApproval = normalizedApproval;
  }

  if (body.input && typeof body.input === "object") body.input = input;
  else if (body.context && typeof body.context === "object") body.context = input;
  else Object.assign(body, input);

  return body;
}

export { APPROVED_STATUSES, applyCompanyOsApprovalCompat };
