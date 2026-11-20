import test from "node:test";
import assert from "node:assert/strict";
import { feedTaskHasConfirmedSuccess } from "../lib/ebay-seller-hub-drafts.js";

test("completed feed without a successful item is not confirmed", () => {
  assert.equal(feedTaskHasConfirmedSuccess("COMPLETED", 0, 0), false);
  assert.equal(feedTaskHasConfirmedSuccess("COMPLETED", 1, 0), true);
  assert.equal(feedTaskHasConfirmedSuccess("COMPLETED", 1, 1), false);
  assert.equal(feedTaskHasConfirmedSuccess("COMPLETED_WITH_ERROR", 1, 0), false);
});
