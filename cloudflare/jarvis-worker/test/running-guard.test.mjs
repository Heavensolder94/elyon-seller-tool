import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isTaskCurrentlyRunning } from "../src/index.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const runningTask = (startedAt, extra = {}) => ({ status: "running", startedAt, updatedAt: startedAt, ...extra });

test("eine frisch gestartete laufende Task blockiert parallele Zustellung", () => {
  assert.equal(isTaskCurrentlyRunning(runningTask("2026-10-20T11:55:00.000Z"), NOW), true);
  assert.equal(isTaskCurrentlyRunning(runningTask("2026-10-20T11:59:59.000Z"), NOW), true);
});

test("ein haengen gebliebener Lauf wird wieder aufgenommen", () => {
  assert.equal(isTaskCurrentlyRunning(runningTask("2026-10-20T11:40:00.000Z"), NOW), false);
});

test("andere Status blockieren nie", () => {
  for (const status of ["queued", "completed", "failed", "cancelled", ""]) {
    assert.equal(isTaskCurrentlyRunning({ status, startedAt: "2026-10-20T11:59:00.000Z" }, NOW), false);
  }
  assert.equal(isTaskCurrentlyRunning(null, NOW), false);
});

test("ohne brauchbaren Zeitstempel wird nicht blockiert", () => {
  assert.equal(isTaskCurrentlyRunning({ status: "running" }, NOW), false);
  assert.equal(isTaskCurrentlyRunning({ status: "running", startedAt: "kein datum" }, NOW), false);
  assert.equal(isTaskCurrentlyRunning({ status: "running", updatedAt: "2026-10-20T11:59:00.000Z" }, NOW), true);
});

test("der Status wird unabhaengig von der Schreibweise erkannt", () => {
  assert.equal(isTaskCurrentlyRunning({ status: "RUNNING", startedAt: "2026-10-20T11:59:00.000Z" }, NOW), true);
});

test("der Guard greift vor der Idempotenzpruefung und nach der Terminalpruefung", () => {
  const terminal = source.indexOf("TERMINAL_STATUSES.has(task.status)");
  const guard = source.indexOf("isTaskCurrentlyRunning(task)");
  const idempotency = source.indexOf("getCompletedIdempotency(env, task.idempotencyKey)");
  assert.ok(terminal > 0 && guard > 0 && idempotency > 0, "Alle drei Stellen muessen existieren");
  assert.ok(guard > terminal, "Guard muss nach der Terminalpruefung laufen");
  assert.ok(guard < idempotency, "Guard muss vor der Idempotenzpruefung laufen");
});

test("bei paralleler Zustellung wird erneut zugestellt statt ausgefuehrt", () => {
  const block = source.slice(source.indexOf("if (isTaskCurrentlyRunning(task))"), source.indexOf("getCompletedIdempotency(env, task.idempotencyKey)"));
  assert.match(block, /retry\(message, retryDelaySeconds\(/);
  assert.match(block, /task_running_elsewhere/);
  assert.doesNotMatch(block, /ack\(message\)/);
});
