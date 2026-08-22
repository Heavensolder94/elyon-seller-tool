const DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

const PRO_TASK_PATTERNS = Object.freeze([
  /compliance/i,
  /gpsr/i,
  /vero/i,
  /profit/i,
  /margin/i,
  /break[-_ ]?even/i,
  /market[-_ ]?(?:analysis|decision|research)/i,
  /risk/i,
  /operations[-_ ]?manager/i,
  /strategy/i,
  /custom-agent-task/i,
]);

const FLASH_TASK_PATTERNS = Object.freeze([
  /listing/i,
  /title/i,
  /description/i,
  /seo/i,
  /product-search/i,
  /product_data/i,
  /assistant/i,
  /mobile_command_center_text/i,
  /order/i,
  /tracking/i,
  /repair/i,
  /prompt/i,
  /general/i,
]);

function text(value) {
  return String(value ?? "").trim();
}

export function chooseDeepSeekModelForTask(task, fallback = "") {
  const normalized = text(task);
  if (!normalized) return text(fallback);
  if (PRO_TASK_PATTERNS.some((pattern) => pattern.test(normalized))) return DEEPSEEK_PRO_MODEL;
  if (FLASH_TASK_PATTERNS.some((pattern) => pattern.test(normalized))) return DEEPSEEK_FLASH_MODEL;
  return text(fallback);
}

export function deepSeekTaskPolicy(task) {
  const model = chooseDeepSeekModelForTask(task, DEEPSEEK_FLASH_MODEL);
  return {
    task: text(task),
    model,
    tier: model === DEEPSEEK_PRO_MODEL ? "pro" : "flash",
  };
}

export { DEEPSEEK_FLASH_MODEL, DEEPSEEK_PRO_MODEL };
