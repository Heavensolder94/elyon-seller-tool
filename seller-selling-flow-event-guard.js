(() => {
  "use strict";

  const guardedTargets = new Set(["svdVisualPanel", "sellerAutoListerParity"]);
  const guardedEvents = new Set(["click", "input", "change"]);
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function elyonGuardedAddEventListener(type, listener, options) {
    const targetId = this && typeof this === "object" ? String(this.id || "") : "";
    if (guardedTargets.has(targetId) && guardedEvents.has(String(type))) {
      const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
      const key = `${String(type)}:${capture ? "capture" : "bubble"}`;
      if (!this.__elyonSellingFlowDelegatedEvents) {
        Object.defineProperty(this, "__elyonSellingFlowDelegatedEvents", {
          value: new Set(),
          configurable: true,
          enumerable: false,
          writable: false,
        });
      }
      if (this.__elyonSellingFlowDelegatedEvents.has(key)) return;
      this.__elyonSellingFlowDelegatedEvents.add(key);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
})();