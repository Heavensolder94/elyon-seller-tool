(() => {
  "use strict";

  const guardedTargets = new Set(["svdVisualPanel", "sellerAutoListerParity"]);
  const guardedEvents = new Set(["click", "input", "change"]);
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const registry = new WeakMap();

  function captureFrom(options) {
    return typeof options === "boolean" ? options : Boolean(options?.capture);
  }

  function targetRegistry(target) {
    let entries = registry.get(target);
    if (!entries) {
      entries = new Map();
      registry.set(target, entries);
    }
    return entries;
  }

  EventTarget.prototype.addEventListener = function elyonGuardedAddEventListener(type, listener, options) {
    const targetId = this && typeof this === "object" ? String(this.id || "") : "";
    const eventType = String(type);
    if (!guardedTargets.has(targetId) || !guardedEvents.has(eventType) || typeof listener !== "function") {
      return originalAddEventListener.call(this, type, listener, options);
    }

    const capture = captureFrom(options);
    const key = `${eventType}:${capture ? "capture" : "bubble"}`;
    const entries = targetRegistry(this);
    const previous = entries.get(key);

    if (previous?.listener === listener) return;
    if (previous?.listener) {
      originalRemoveEventListener.call(this, eventType, previous.listener, previous.capture);
    }

    entries.set(key, { listener, capture });
    return originalAddEventListener.call(this, eventType, listener, options);
  };

  EventTarget.prototype.removeEventListener = function elyonGuardedRemoveEventListener(type, listener, options) {
    const eventType = String(type);
    const capture = captureFrom(options);
    const targetId = this && typeof this === "object" ? String(this.id || "") : "";
    if (guardedTargets.has(targetId) && guardedEvents.has(eventType)) {
      const key = `${eventType}:${capture ? "capture" : "bubble"}`;
      const entries = registry.get(this);
      if (entries?.get(key)?.listener === listener) entries.delete(key);
    }
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  window.ElyonSellingFlowEventGuard = {
    mode: "replace_stale_listener",
    guardedTargets: [...guardedTargets],
    guardedEvents: [...guardedEvents],
  };
})();
