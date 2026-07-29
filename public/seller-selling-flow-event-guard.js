(() => {
  "use strict";

  window.ElyonSellingFlowEventGuard = {
    mode: "scoped_abort_controller",
    prototypePatched: false,
    guardedTargets: ["svdVisualPanel", "sellerAutoListerParity"],
    guardedEvents: ["click", "input", "change"],
  };
})();
