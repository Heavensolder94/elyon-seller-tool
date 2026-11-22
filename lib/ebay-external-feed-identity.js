/**
 * Identity-only decision for an already verified Seller Hub Feed task.
 * Never replaces an active Inventory offer or a different live Feed task.
 * Historic archived/removed/ended records are preserved as history.
 */
const terminalStates = new Set(["archived", "removed", "ended"]);

const text = value => String(value ?? "").trim();
const env = value => text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";

/** Pure, conservative selection. Index -1 means append a new Feed record. */
export function planExternalFeedRegistration(records = [], input = {}) {
  const sku = text(input.sku).toUpperCase();
  const taskId = text(input.externalTaskId || input.taskId);
  const environment = env(input.environment);
  if (!sku || !taskId) {
    return { ok: false, reason: "sku_or_task_missing", index: -1 };
  }
  const matches = (Array.isArray(records) ? records : [])
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => env(record?.environment) === environment);
  const forTask = matches.filter(({ record }) => text(record?.externalTaskId) === taskId);
  if (forTask.length !== 1 && forTask.length > 0) {
    return { ok: false, reason: "feed_task_identity_ambiguous", index: -1 };
  }
  if (forTask.length === 1) {
    const { record, index } = forTask[0];
    if (text(record?.sku).toUpperCase() !== sku) {
      return { ok: false, reason: "feed_task_sku_mismatch", index: -1 };
    }
    if (record?.visibilityMode !== "seller_hub_feed") {
      return { ok: false, reason: "feed_task_type_conflict", index: -1 };
    }
    if (record?.state !== "draft") {
      // An already archived/removed/published task must not be reactivated.
      return { ok: false, reason: "feed_record_no_longer_draft", index: -1 };
    }
    return { ok: true, reason: "same_verified_task", index };
  }
  const forSku = matches.filter(({ record }) =>
    text(record?.sku).toUpperCase() === sku && !terminalStates.has(record?.state));
  if (forSku.length > 1) {
    return { ok: false, reason: "active_sku_identity_ambiguous", index: -1 };
  }
  if (forSku.length === 1) {
    const { record, index } = forSku[0];
    // A Feed entry without a task ID can be completed only for its same
    // product/source identity, never for an unrelated source.
    if (record?.visibilityMode === "seller_hub_feed" &&
        record?.state === "draft" && !text(record?.externalTaskId) &&
        (!text(record?.sourceProductId) ||
         text(record.sourceProductId) === text(input.sourceProductId))) {
      return { ok: true, reason: "link_pending_feed", index };
    }
    return { ok: false, reason: "existing_sku_belongs_to_another_draft", index: -1 };
  }
  // Other tasks with this SKU are all terminal. Preserve them rather than
  // overwriting them; create a separate entry for the newly verified task.
  return { ok: true, reason: "new_verified_task", index: -1 };
}

export function feedRegistrationFailureMessage(reason) {
  switch (text(reason)) {
    case "feed_record_no_longer_draft":
      return "Dieser eBay-Task wurde in ELYON bereits archiviert oder abgeschlossen. Der alte Verlauf bleibt erhalten.";
    case "feed_task_sku_mismatch":
    case "feed_task_type_conflict":
    case "feed_task_identity_ambiguous":
    case "active_sku_identity_ambiguous":
    case "existing_sku_belongs_to_another_draft":
      return "Diese Amazon-SKU oder Task-ID ist in ELYON einem anderen aktiven Entwurf zugeordnet. Zum Schutz bestehender Einträge wurde nichts überschrieben.";
    case "storage_unavailable":
    case "storage_confirmation_missing":
      return "Die eBay-Task wurde bestätigt, aber der ELYON-Speicher konnte die Zuordnung nicht bestätigen. Der eBay-Entwurf bleibt erhalten; bitte nur den Abgleich erneut versuchen.";
    default:
      return "Die eBay-Task wurde gefunden, aber ELYON konnte die Zuordnung nicht sicher bestätigen. Es wurde kein neuer Entwurf angelegt.";
  }
}
