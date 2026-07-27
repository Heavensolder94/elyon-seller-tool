(function installSellerDashboardCompatibility(global) {
  "use strict";

  const DASHBOARD_TAB_ID = "dashboardTab";
  const LEGACY_DASHBOARD_ID = "elyonSellerLegacyDashboard";
  const HOST_MARKER = "elyonSellerCockpitHost";

  function install(documentRef) {
    const doc = documentRef || global.document;
    if (!doc || typeof doc.getElementById !== "function") {
      return { installed: false, reason: "document_unavailable" };
    }

    const existingHost = doc.getElementById(DASHBOARD_TAB_ID);
    if (existingHost?.dataset?.[HOST_MARKER] === "true") {
      return {
        installed: false,
        reason: "already_installed",
        host: existingHost,
        legacy: doc.getElementById(LEGACY_DASHBOARD_ID),
      };
    }

    const legacy = doc.getElementById(LEGACY_DASHBOARD_ID) || existingHost;
    if (!legacy || !legacy.parentNode) {
      return { installed: false, reason: "dashboard_missing" };
    }

    const wasActive = legacy.classList?.contains("active") === true;
    legacy.id = LEGACY_DASHBOARD_ID;
    legacy.setAttribute?.("aria-hidden", "true");
    legacy.setAttribute?.("data-elyon-legacy-dashboard", "true");
    legacy.classList?.remove("active");
    legacy.style?.setProperty?.("display", "none", "important");

    const host = doc.createElement("section");
    host.id = DASHBOARD_TAB_ID;
    host.className = "tab";
    host.dataset[HOST_MARKER] = "true";
    host.setAttribute?.("data-elyon-seller-dashboard-host", "true");
    if (wasActive) host.classList?.add("active");

    legacy.parentNode.insertBefore(host, legacy);

    return { installed: true, host, legacy };
  }

  global.ElyonSellerDashboardCompat = { install };
  install(global.document);
})(typeof window !== "undefined" ? window : globalThis);
