(() => {
  "use strict";

  const src = "/seller-virtual-agents-redesign.js";
  const exists = [...document.scripts].some((script) => {
    try {
      return new URL(script.src, window.location.href).pathname === src;
    } catch {
      return false;
    }
  });
  if (exists) return;

  const script = document.createElement("script");
  script.src = `${src}?v=virtual-agents-redesign-20260807-1`;
  script.dataset.elyonVirtualAgentsCompatibility = "true";
  script.async = true;
  document.head.appendChild(script);
})();
