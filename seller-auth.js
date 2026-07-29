(() => {
  "use strict";

  const API_URL = "/api/auth/session";
  const PROTECTED_API_PATHS = [
    "/api/products",
    "/api/ebay/status",
    "/api/ebay/orders",
    "/api/ebay-taxonomy",
    "/api/google-sheets-sync",
  ];
  const nativeFetch = window.fetch.bind(window);
  let authState = "checking";
  let readyResolved = false;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  function requestPath(input) {
    try {
      const value = typeof input === "string" || input instanceof URL ? input : input?.url;
      return new URL(value, window.location.href).pathname;
    } catch {
      return "";
    }
  }

  function isProtectedRequest(input) {
    const path = requestPath(input);
    return PROTECTED_API_PATHS.some((protectedPath) => path === protectedPath || path.startsWith(`${protectedPath}/`));
  }

  function syntheticForbiddenResponse() {
    return new Response(JSON.stringify({
      ok: false,
      error: "Seller-Sitzung fehlt oder ist noch nicht bestätigt.",
      authenticated: false,
    }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  window.fetch = async function elyonAuthenticatedFetch(input, init) {
    if (!isProtectedRequest(input)) return nativeFetch(input, init);
    if (authState === "checking") await readyPromise;
    if (authState !== "authenticated") return syntheticForbiddenResponse();
    return nativeFetch(input, init);
  };

  function publishState(authenticated, details = {}) {
    const previous = authState;
    authState = authenticated ? "authenticated" : "required";
    if (document.body) document.body.dataset.sellerAuthenticated = authenticated ? "true" : "false";
    const snapshot = {
      authenticated,
      state: authState,
      configured: details.configured !== false,
      status: Number(details.status || 0),
    };
    window.ElyonSellerAuthState = snapshot;
    if (!readyResolved) {
      readyResolved = true;
      resolveReady(snapshot);
    }
    window.dispatchEvent(new CustomEvent("elyon:seller-auth-ready", { detail: snapshot }));
    if (authenticated && previous !== "authenticated") {
      window.dispatchEvent(new CustomEvent("elyon:seller-authenticated", { detail: snapshot }));
    }
    return snapshot;
  }

  async function request(url, options = {}) {
    try {
      const response = await nativeFetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error?.message || "Netzwerkfehler" } };
    }
  }

  function installStyles() {
    if (document.getElementById("elyonSellerAuthStyles")) return;
    const style = document.createElement("style");
    style.id = "elyonSellerAuthStyles";
    style.textContent = `
      .elyon-auth-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(2,6,23,.88);backdrop-filter:blur(18px)}
      .elyon-auth-backdrop[hidden]{display:none}
      .elyon-auth-card{width:min(100%,460px);padding:24px;border-radius:26px;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(96,165,250,.28);box-shadow:0 30px 100px rgba(0,0,0,.6);color:#e5e7eb}
      .elyon-auth-card h2{margin:0 0 8px;font-size:24px;letter-spacing:-.04em}.elyon-auth-card p{margin:0 0 18px;color:#cbd5e1;line-height:1.55}
      .elyon-auth-card label{display:grid;gap:8px;font-weight:800}.elyon-auth-card input{width:100%;padding:14px 15px;border-radius:16px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.72);color:#fff;outline:none}
      .elyon-auth-card input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(59,130,246,.16)}
      .elyon-auth-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px}.elyon-auth-actions button{min-height:46px;padding:0 16px;border-radius:15px;border:1px solid rgba(255,255,255,.12);font-weight:900;cursor:pointer}
      .elyon-auth-submit{background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff}.elyon-auth-retry{background:rgba(255,255,255,.07);color:#bfdbfe}
      .elyon-auth-message{min-height:22px;margin-top:12px!important;color:#fca5a5!important;font-size:13px}.elyon-auth-note{margin-top:16px!important;font-size:12px;color:#94a3b8!important}
      .elyon-auth-config-warning{border-color:rgba(245,158,11,.42)}
    `;
    document.head.appendChild(style);
  }

  function ensureDialog() {
    installStyles();
    let backdrop = document.getElementById("elyonSellerAuthBackdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "elyonSellerAuthBackdrop";
    backdrop.className = "elyon-auth-backdrop";
    backdrop.hidden = true;

    const card = document.createElement("section");
    card.className = "elyon-auth-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "elyonSellerAuthTitle");

    const title = document.createElement("h2");
    title.id = "elyonSellerAuthTitle";
    title.textContent = "Elyon Seller Tool entsperren";

    const description = document.createElement("p");
    description.id = "elyonSellerAuthDescription";
    description.textContent = "Gib deinen serverseitig eingerichteten Sicherheitscode ein. Er wird nur zur Anmeldung übertragen und nicht im Browser gespeichert.";

    const label = document.createElement("label");
    label.textContent = "Sicherheitscode";
    const input = document.createElement("input");
    input.id = "elyonSellerAuthToken";
    input.type = "password";
    input.autocomplete = "current-password";
    input.spellcheck = false;
    label.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "elyon-auth-actions";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "elyon-auth-submit";
    submit.textContent = "Sicher anmelden";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "elyon-auth-retry";
    retry.textContent = "Status prüfen";
    actions.append(submit, retry);

    const message = document.createElement("p");
    message.id = "elyonSellerAuthMessage";
    message.className = "elyon-auth-message";

    const note = document.createElement("p");
    note.className = "elyon-auth-note";
    note.textContent = "API-Keys und Zugangstokens gehören weiterhin ausschließlich in Vercel oder deine lokale .env.local-Datei.";

    card.append(title, description, label, actions, message, note);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    async function login() {
      const token = input.value.trim();
      if (!token) {
        message.textContent = "Bitte Sicherheitscode eingeben.";
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = "Prüfe…";
      message.textContent = "";
      const result = await request(API_URL, {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      input.value = "";
      submit.disabled = false;
      submit.textContent = "Sicher anmelden";
      if (result.ok && result.data?.authenticated) {
        publishState(true, { configured: result.data?.configured, status: result.status });
        backdrop.hidden = true;
        window.location.reload();
        return;
      }
      message.textContent = result.data?.message || "Anmeldung fehlgeschlagen.";
      input.focus();
    }

    submit.addEventListener("click", login);
    retry.addEventListener("click", check);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") login();
    });

    return backdrop;
  }

  async function check() {
    const backdrop = ensureDialog();
    const card = backdrop.querySelector(".elyon-auth-card");
    const title = document.getElementById("elyonSellerAuthTitle");
    const description = document.getElementById("elyonSellerAuthDescription");
    const message = document.getElementById("elyonSellerAuthMessage");
    const input = document.getElementById("elyonSellerAuthToken");
    const result = await request(API_URL, { method: "GET", headers: {} });

    if (result.ok && result.data?.authenticated) {
      backdrop.hidden = true;
      publishState(true, { configured: result.data?.configured, status: result.status });
      return true;
    }

    publishState(false, { configured: result.data?.configured, status: result.status });
    backdrop.hidden = false;
    card?.classList.toggle("elyon-auth-config-warning", result.data?.configured === false);

    if (result.data?.configured === false) {
      title.textContent = "Seller-Zugriff noch nicht eingerichtet";
      description.textContent = "Setze am Laptop in Vercel die Variable ELYON_SELLER_ACCESS_TOKEN. Bis dahin bleiben sensible APIs sicher gesperrt.";
      message.textContent = "Es wurde nichts am Live-System freigeschaltet.";
      if (input) input.disabled = true;
    } else {
      title.textContent = "Elyon Seller Tool entsperren";
      description.textContent = "Gib deinen serverseitig eingerichteten Sicherheitscode ein. Er wird nur zur Anmeldung übertragen und nicht im Browser gespeichert.";
      message.textContent = result.status === 0 ? "Serverstatus konnte nicht geladen werden." : "";
      if (input) {
        input.disabled = false;
        setTimeout(() => input.focus(), 50);
      }
    }
    return false;
  }

  window.ElyonSellerAuth = {
    check,
    whenReady: () => readyPromise,
    isAuthenticated: () => authState === "authenticated",
    get state() { return authState; },
    async logout() {
      await request(API_URL, { method: "DELETE", body: "{}" });
      window.location.reload();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check, { once: true });
  } else {
    check();
  }
})();
