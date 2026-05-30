(() => {
  const script = document.createElement("script");
  script.src = "public/elyon-app.js";
  script.async = false;
  script.onload = () => {
    if (window.__elyonRootAppBootstrapped) return;
    window.__elyonRootAppBootstrapped = true;
    document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  };
  document.head.appendChild(script);
})();
