(() => {
  "use strict";

  const STYLE_ID = "elyonJarvisVoiceStyles";
  const BRIDGE_ORIGIN = "http://127.0.0.1:8765";
  const MAX_RECORDING_MS = 20000;
  const NO_SPEECH_TIMEOUT_MS = 8000;
  const SILENCE_STOP_MS = 1350;
  const SPEECH_THRESHOLD = 0.025;
  const GAIN_MULTIPLIER = 18;

  const state = {
    recorder: null,
    rawStream: null,
    audioContext: null,
    chunks: [],
    button: null,
    input: null,
    analyser: null,
    animationFrame: 0,
    maxTimer: 0,
    noSpeechTimer: 0,
    heardSpeech: false,
    lastSpeechAt: 0,
    stopping: false,
  };

  const text = (value) => value === null || value === undefined ? "" : String(value).trim();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-jarvis-voice{flex:0 0 auto;width:38px;height:38px;padding:0!important;border-radius:12px!important;display:grid;place-items:center;background:rgba(255,255,255,.07)!important;border:1px solid rgba(125,211,252,.22)!important;color:#dbeafe!important;font-size:16px!important;line-height:1!important;box-shadow:none!important}
      .elyon-jarvis-voice:hover{border-color:rgba(125,211,252,.55)!important;background:rgba(14,116,144,.14)!important}
      .elyon-jarvis-voice[data-voice-state="recording"]{color:#fecaca!important;border-color:rgba(248,113,113,.55)!important;background:rgba(127,29,29,.22)!important;animation:elyonJarvisVoicePulse 1s ease-in-out infinite}
      .elyon-jarvis-voice[data-voice-state="transcribing"]{color:#fde68a!important;border-color:rgba(250,204,21,.38)!important;cursor:wait}
      .elyon-jarvis-voice[data-voice-state="error"]{color:#fecaca!important;border-color:rgba(248,113,113,.35)!important}
      @keyframes elyonJarvisVoicePulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.08)!important}50%{box-shadow:0 0 0 7px rgba(248,113,113,.07)!important}}
    `;
    document.head.appendChild(style);
  }

  function bridgeOrigin() {
    const configured = text(window.ELYON_JARVIS_VOICE_BRIDGE_URL);
    if (!configured) return BRIDGE_ORIGIN;
    try {
      const url = new URL(configured);
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) return BRIDGE_ORIGIN;
      if (url.protocol !== "http:" && url.protocol !== "https:") return BRIDGE_ORIGIN;
      return url.origin;
    } catch {
      return BRIDGE_ORIGIN;
    }
  }

  function setButtonState(button, next, title) {
    if (!button) return;
    button.dataset.voiceState = next;
    button.disabled = next === "transcribing";
    button.textContent = next === "recording" ? "●" : next === "transcribing" ? "…" : "🎙";
    button.setAttribute("aria-label", title);
    button.title = title;
  }

  function idleButton(button, title = "Mit Jarvis sprechen") {
    setButtonState(button, "idle", `${title} · Whisper lokal · kein automatisches Ausführen`);
  }

  function supportedMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return candidates.find((candidate) => window.MediaRecorder?.isTypeSupported?.(candidate)) || "";
  }

  function rmsLevel(analyser) {
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return Math.sqrt(sum / samples.length);
  }

  function stopLevelWatch() {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = 0;
  }

  function watchLevel() {
    if (!state.recorder || state.recorder.state !== "recording" || !state.analyser) return;
    const level = rmsLevel(state.analyser);
    const now = performance.now();
    if (level >= SPEECH_THRESHOLD) {
      state.heardSpeech = true;
      state.lastSpeechAt = now;
    } else if (state.heardSpeech && now - state.lastSpeechAt >= SILENCE_STOP_MS) {
      stopRecording("silence");
      return;
    }
    state.animationFrame = requestAnimationFrame(watchLevel);
  }

  function cleanupMedia() {
    stopLevelWatch();
    clearTimeout(state.maxTimer);
    clearTimeout(state.noSpeechTimer);
    state.maxTimer = 0;
    state.noSpeechTimer = 0;
    try { state.rawStream?.getTracks?.().forEach((track) => track.stop()); } catch { /* noop */ }
    state.rawStream = null;
    const context = state.audioContext;
    state.audioContext = null;
    if (context && context.state !== "closed") context.close().catch(() => {});
    state.analyser = null;
  }

  function extractTranscript(payload) {
    if (typeof payload === "string") return text(payload);
    if (!payload || typeof payload !== "object") return "";
    return text(
      payload.text ||
      payload.transcript ||
      payload.transcription ||
      payload.result?.text ||
      payload.data?.text
    );
  }

  async function postAudio(url, blob, fieldName) {
    const body = new FormData();
    const extension = blob.type.includes("ogg") ? "ogg" : "webm";
    body.append(fieldName, blob, `jarvis-voice.${extension}`);
    body.append("language", "de");
    body.append("task", "transcribe");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        method: "POST",
        body,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const contentType = text(response.headers.get("content-type")).toLowerCase();
      let payload;
      if (contentType.includes("application/json")) payload = await response.json().catch(() => ({}));
      else payload = await response.text().catch(() => "");
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  async function transcribe(blob) {
    const origin = bridgeOrigin();
    const attempts = [
      ["/transcribe", "file"],
      ["/transcribe", "audio"],
      ["/api/transcribe", "file"],
      ["/api/transcribe", "audio"],
      ["/whisper", "file"],
    ];
    let lastError = null;

    for (const [path, fieldName] of attempts) {
      try {
        const { response, payload } = await postAudio(`${origin}${path}`, blob, fieldName);
        if (response.ok) {
          const transcript = extractTranscript(payload);
          if (transcript) return transcript;
          lastError = new Error("Whisper hat Audio erhalten, aber keinen Text erkannt.");
          continue;
        }
        if ([400, 404, 405, 415, 422].includes(response.status)) {
          lastError = new Error(`Whisper-Bridge antwortet mit HTTP ${response.status}.`);
          continue;
        }
        throw new Error(`Whisper-Bridge Fehler (HTTP ${response.status}).`);
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("Whisper-Bridge hat nicht rechtzeitig geantwortet.");
        if (error instanceof TypeError) throw new Error("Lokale Whisper-Bridge auf 127.0.0.1:8765 ist nicht erreichbar.");
        lastError = error;
      }
    }
    throw lastError || new Error("Lokale Whisper-Transkription fehlgeschlagen.");
  }

  function insertTranscript(input, transcript) {
    if (!input) return;
    const previous = text(input.value);
    const next = previous ? `${previous} ${transcript}` : transcript;
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    if (typeof input.setSelectionRange === "function") input.setSelectionRange(next.length, next.length);
    window.dispatchEvent(new CustomEvent("elyon:jarvis-voice-transcript", {
      detail: { transcript, source: "local-whisper", autoExecute: false },
    }));
  }

  async function handleStopped(blob, button, input) {
    cleanupMedia();
    state.recorder = null;
    state.stopping = false;
    if (!blob || blob.size < 256) {
      setButtonState(button, "error", "Kein brauchbares Audiosignal aufgenommen");
      setTimeout(() => idleButton(button), 1800);
      return;
    }

    setButtonState(button, "transcribing", "Whisper transkribiert lokal …");
    try {
      const transcript = await transcribe(blob);
      insertTranscript(input, transcript);
      idleButton(button, `Erkannt: ${transcript.slice(0, 90)}`);
    } catch (error) {
      console.warn("[Elyon Jarvis Voice]", error);
      setButtonState(button, "error", error?.message || "Spracherkennung fehlgeschlagen");
      window.dispatchEvent(new CustomEvent("elyon:jarvis-voice-error", {
        detail: { message: error?.message || "Spracherkennung fehlgeschlagen" },
      }));
      setTimeout(() => idleButton(button), 3200);
    } finally {
      state.button = null;
      state.input = null;
      state.chunks = [];
    }
  }

  function stopRecording(reason = "manual") {
    if (!state.recorder || state.recorder.state !== "recording" || state.stopping) return false;
    state.stopping = true;
    stopLevelWatch();
    clearTimeout(state.maxTimer);
    clearTimeout(state.noSpeechTimer);
    const recorder = state.recorder;
    const button = state.button;
    setButtonState(button, "transcribing", reason === "silence" ? "Sprache erkannt · transkribiere …" : "Aufnahme beendet · transkribiere …");
    try { recorder.requestData?.(); } catch { /* noop */ }
    recorder.stop();
    return true;
  }

  async function startRecording(button, input) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Mikrofonaufnahme ist in diesem Browser-Kontext nicht verfügbar.");
    }

    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      rawStream.getTracks().forEach((track) => track.stop());
      throw new Error("Web Audio ist in diesem Browser nicht verfügbar.");
    }

    const context = new AudioContextCtor();
    await context.resume();
    const source = context.createMediaStreamSource(rawStream);
    const gain = context.createGain();
    gain.gain.value = GAIN_MULTIPLIER;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const destination = context.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(compressor);
    compressor.connect(destination);

    const mimeType = supportedMimeType();
    const recorder = mimeType ? new MediaRecorder(destination.stream, { mimeType }) : new MediaRecorder(destination.stream);
    state.rawStream = rawStream;
    state.audioContext = context;
    state.analyser = analyser;
    state.recorder = recorder;
    state.button = button;
    state.input = input;
    state.chunks = [];
    state.heardSpeech = false;
    state.lastSpeechAt = performance.now();
    state.stopping = false;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) state.chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      handleStopped(blob, button, input);
    }, { once: true });
    recorder.addEventListener("error", () => {
      cleanupMedia();
      state.recorder = null;
      state.stopping = false;
      setButtonState(button, "error", "Mikrofonaufnahme fehlgeschlagen");
      setTimeout(() => idleButton(button), 2500);
    }, { once: true });

    recorder.start(250);
    setButtonState(button, "recording", "Ich höre zu … erneut klicken zum Stoppen");
    state.maxTimer = setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
    state.noSpeechTimer = setTimeout(() => {
      if (!state.heardSpeech) stopRecording("no-speech");
    }, NO_SPEECH_TIMEOUT_MS);
    state.animationFrame = requestAnimationFrame(watchLevel);
  }

  async function toggle(button, input) {
    if (state.recorder?.state === "recording") {
      stopRecording("manual");
      return;
    }
    if (state.recorder || state.stopping) return;
    try {
      await startRecording(button, input);
    } catch (error) {
      console.warn("[Elyon Jarvis Voice]", error);
      setButtonState(button, "error", error?.message || "Mikrofon konnte nicht gestartet werden");
      setTimeout(() => idleButton(button), 3000);
    }
  }

  function makeButton(targetName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "elyon-jarvis-voice";
    button.dataset.jarvisVoice = targetName;
    idleButton(button);
    return button;
  }

  function mountDockButton() {
    const form = document.querySelector("#elyonJarvisDock [data-jarvis-dock-form]");
    const input = form?.querySelector("[data-jarvis-dock-input]");
    if (!form || !input) return false;
    let button = form.querySelector('[data-jarvis-voice="dock"]');
    if (!button) {
      button = makeButton("dock");
      const plan = form.querySelector('button[type="submit"]');
      if (plan) plan.insertAdjacentElement("beforebegin", button);
      else form.appendChild(button);
      button.addEventListener("click", () => toggle(button, input));
    }
    return true;
  }

  function mountPanelButton() {
    const form = document.querySelector("#elyonJarvisPanel [data-jarvis-panel-form]");
    const input = form?.querySelector("[data-jarvis-panel-input]");
    const actions = form?.querySelector(".elyon-jarvis-panel-actions");
    if (!form || !input || !actions) return false;
    let button = actions.querySelector('[data-jarvis-voice="panel"]');
    if (!button) {
      button = makeButton("panel");
      const plan = actions.querySelector("[data-jarvis-plan]");
      if (plan) plan.insertAdjacentElement("beforebegin", button);
      else actions.prepend(button);
      button.addEventListener("click", () => toggle(button, input));
    }
    return true;
  }

  function mount() {
    installStyles();
    mountDockButton();
    mountPanelButton();
    return true;
  }

  window.ElyonJarvisVoice = Object.freeze({
    mount,
    stop: () => stopRecording("manual"),
    status: () => ({
      recording: state.recorder?.state === "recording",
      bridge: bridgeOrigin(),
      autoExecute: false,
      gain: GAIN_MULTIPLIER,
    }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
