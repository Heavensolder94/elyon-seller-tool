import financeHandler from "../../internal/finance/index.js";

const EBAY_FINANCES_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.finances";
const configuredScopes = String(process.env.EBAY_SCOPES || "")
  .split(/[\s,]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);
if (!configuredScopes.includes(EBAY_FINANCES_SCOPE)) {
  process.env.EBAY_SCOPES = [...configuredScopes, EBAY_FINANCES_SCOPE].join(" ");
}

export default financeHandler;
