import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const voiceUrl = new URL("../seller-jarvis-voice.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

test("Jarvis voice module is valid browser JavaScript and uses local MediaRecorder + Whisper bridge", async () => {
  const source = await readFile(voiceUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /MediaRecorder/);
  assert.match(source, /http:\/\/127\.0\.0\.1:8765/);
  assert.match(source, /audio\/webm;codecs=opus/);
  assert.match(source, /FormData/);
  assert.match(source, /\/transcribe/);
  assert.match(source, /GAIN_MULTIPLIER = 18/);
});

test("Jarvis voice does not fall back to browser SpeechRecognition or remote cloud speech", async () => {
  const source = await readFile(voiceUrl, "utf8");
  assert.doesNotMatch(source, /webkitSpeechRecognition|\bSpeechRecognition\b/);
  assert.doesNotMatch(source, /api\.openai\.com|deepseek\.com|googleapis\.com|azure\.com/);
  assert.match(source, /\["127\.0\.0\.1", "localhost"\]/);
});

test("voice transcript only fills the Jarvis input and never auto-plans or auto-executes", async () => {
  const source = await readFile(voiceUrl, "utf8");
  assert.match(source, /input\.value = next/);
  assert.match(source, /autoExecute: false/);
  assert.doesNotMatch(source, /ElyonJarvis\.execute|ElyonJarvis\.plan|runCommand\(|requestSubmit\(|\.submit\(\)/);
  assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund|send_customer_message|\/api\/ebay/);
});

test("one-click voice supports silence stop plus manual stop and bounded recording duration", async () => {
  const source = await readFile(voiceUrl, "utf8");
  assert.match(source, /SILENCE_STOP_MS = 1350/);
  assert.match(source, /MAX_RECORDING_MS = 20000/);
  assert.match(source, /NO_SPEECH_TIMEOUT_MS = 8000/);
  assert.match(source, /stopRecording\("silence"\)/);
  assert.match(source, /stopRecording\("manual"\)/);
});

test("voice button is mounted into the existing Jarvis bar and panel without a second UI shell", async () => {
  const source = await readFile(voiceUrl, "utf8");
  assert.match(source, /#elyonJarvisDock \[data-jarvis-dock-form\]/);
  assert.match(source, /data-jarvis-dock-input/);
  assert.match(source, /#elyonJarvisPanel \[data-jarvis-panel-form\]/);
  assert.match(source, /data-jarvis-panel-input/);
  assert.match(source, /🎙/);
  assert.doesNotMatch(source, /MutationObserver|setInterval/);
});

test("bootstrap and production preparation ship the voice module after Jarvis UI", async () => {
  const [bootstrap, prepare] = await Promise.all([
    readFile(bootstrapUrl, "utf8"),
    readFile(prepareUrl, "utf8"),
  ]);
  const uiIndex = bootstrap.indexOf("seller-jarvis-ui.js");
  const voiceIndex = bootstrap.indexOf("seller-jarvis-voice.js");
  assert.ok(uiIndex >= 0 && voiceIndex > uiIndex);
  assert.match(bootstrap, /window\.ElyonJarvisVoice\?\.mount\?\.\(\)/);
  assert.match(prepare, /seller-jarvis-voice\.js/);
  assert.match(prepare, /copyFile\(path\.join\(appRoot, name\), path\.join\(publicRoot, name\)\)/);
});
