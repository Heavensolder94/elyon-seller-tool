export function parseEbayMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  let raw = String(value ?? "").trim().replace(/[\s'’]/g, "").replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    raw = raw.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    raw = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    raw = /\.\d{1,2}$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
