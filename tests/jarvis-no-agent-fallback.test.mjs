import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Jarvis no-agent fallback stays direct and fail-safe", async () => {
  const source = await readFile(new URL("../seller-jarvis-client.js", import.meta.url), "utf8");
  assert.match(source, /payload\?\.error === "jarvis_no_suitable_agent"/);
  assert.match(source, /mode:\s*"direct"/);
  assert.match(source, /answerDirectly:\s*true/);
  assert.match(source, /executable:\s*false/);
  assert.match(source, /externalActionsLocked:\s*true/);
  assert.match(source, /livePublishingAllowed:\s*false/);
  assert.match(source, /nothingExecuted:\s*true/);
  assert.match(source, /throw error/);
});
