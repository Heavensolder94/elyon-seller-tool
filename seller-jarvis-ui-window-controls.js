(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisPanel";
  const WINDOW_CONTROL_SELECTOR = "[data-jarvis-minimize],[data-jarvis-open]";
  let observer = null;

  function unlockWindowControls(root = document) {
    root.querySelectorAll?.(WINDOW_CONTROL_SELECTOR).forEach((button) => {
      if (button.disabled) button.disabled = false;
      button.removeAttribute("aria-disabled");
    });
  }

  function refresh() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return false;

    unlockWindowControls(panel);
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target?.matches?.(WINDOW_CONTROL_SELECTOR) && target.disabled) target.disabled = false;
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches?.(WINDOW_CONTROL_SELECTOR) && node.disabled) node.disabled = false;
          unlockWindowControls(node);
        });
      }
    });
    observer.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    return true;
  }

  window.ElyonJarvisUIWindowControls = Object.freeze({ refresh });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
