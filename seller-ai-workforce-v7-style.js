(() => {
  "use strict";
  const STYLE_ID = "elyonAiWorkforceV7Styles";
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #virtualAgentsSettingsRoot.aiw-v7-overview-active>:not(#elyonAiWorkforceV7){display:none!important}
    #elyonAiWorkforceV7{display:grid;gap:15px;width:100%;max-width:1240px;margin:0 auto 24px;color:#eef4fb}
    .aiw7-bar,.aiw7-head,.aiw7-card-top,.aiw7-card-foot,.aiw7-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .aiw7-bar h2{margin:0;font-size:22px}.aiw7-bar p{margin:4px 0 0;color:#7f91a7;font-size:10px}
    .aiw7-switch{display:flex;gap:4px;padding:4px;border:1px solid rgba(148,163,184,.1);border-radius:10px;background:rgba(15,23,42,.55)}
    .aiw7-switch button{min-height:30px!important;padding:5px 9px!important;border-radius:7px!important;background:transparent!important;border-color:transparent!important;color:#8292a6!important;font-size:9px!important}
    .aiw7-switch button.active{background:rgba(79,140,255,.13)!important;color:#edf4ff!important}
    .aiw7-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:21px;border:1px solid rgba(79,140,255,.24);border-radius:18px;background:radial-gradient(circle at 10% 0,rgba(59,130,246,.16),transparent 32%),rgba(11,20,32,.9)}
    .aiw7-jarvis{display:flex;gap:14px;align-items:center}.aiw7-core{width:56px;height:56px;display:grid;place-items:center;border-radius:50%;font-size:27px;background:radial-gradient(circle at 35% 30%,#e0f2fe 0 7%,#38bdf8 10%,#2563eb 43%,#081426 74%);box-shadow:0 0 30px rgba(56,189,248,.24)}
    .aiw7-hero h3{margin:0;font-size:20px}.aiw7-hero p{margin:5px 0 0;max-width:620px;color:#94a6ba;font-size:10px;line-height:1.5}.aiw7-online{display:inline-flex;margin-top:8px;padding:5px 8px;border-radius:999px;background:rgba(34,197,94,.08);color:#baf7ce;font-size:8px}
    .aiw7-side{display:grid;gap:9px;justify-items:end}.aiw7-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.aiw7-metric{min-width:76px;padding:9px;border:1px solid rgba(148,163,184,.08);border-radius:11px;background:rgba(2,6,23,.25);text-align:center}.aiw7-metric strong{display:block;font-size:19px}.aiw7-metric span{display:block;margin-top:2px;color:#71849a;font-size:7px}
    .aiw7-actions{display:flex;gap:6px}.aiw7-primary{background:linear-gradient(135deg,#2563eb,#4f8cff)!important;color:#fff!important;border-color:transparent!important}
    .aiw7-head h3,.aiw7-panel h3{margin:0;font-size:13px}.aiw7-head p{margin:3px 0 0;color:#71849a;font-size:9px}.aiw7-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .aiw7-card,.aiw7-panel{padding:15px;border:1px solid rgba(148,163,184,.1);border-radius:15px;background:rgba(11,20,32,.76)}.aiw7-card{display:grid;gap:11px}.aiw7-person{display:flex;gap:9px;align-items:flex-start}.aiw7-avatar{width:39px;height:39px;display:grid;place-items:center;border-radius:11px;background:rgba(79,140,255,.09);font-size:19px}
    .aiw7-person h4{margin:0;font-size:12px}.aiw7-person p{margin:4px 0 0;color:#8193a8;font-size:9px}.aiw7-status,.aiw7-pill{padding:5px 7px;border:1px solid rgba(148,163,184,.09);border-radius:999px;background:rgba(255,255,255,.02);color:#8fa0b3;font-size:8px}.aiw7-status.ready{color:#baf7ce}.aiw7-status.running{color:#b9dcff}.aiw7-status.decision{color:#fde68a}.aiw7-status.attention{color:#fecaca}
    .aiw7-now{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.022);border:1px solid rgba(148,163,184,.06)}.aiw7-now small{color:#65788f;font-size:7px}.aiw7-now strong{display:block;margin-top:3px;font-size:9px}.aiw7-meta{display:flex;gap:5px;flex-wrap:wrap}.aiw7-card-foot small{color:#65788f;font-size:8px}.aiw7-buttons{display:flex;gap:5px}.aiw7-card button,.aiw7-hero button{min-height:31px!important;padding:5px 8px!important;border-radius:8px!important;font-size:9px!important}
    .aiw7-lower{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:10px}.aiw7-list{display:grid;gap:6px;margin-top:9px}.aiw7-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:8px;border:1px solid rgba(148,163,184,.07);border-radius:9px;background:rgba(255,255,255,.018)}.aiw7-row span:first-child{width:24px;height:24px;display:grid;place-items:center;border-radius:7px;background:rgba(79,140,255,.07)}.aiw7-row strong{display:block;font-size:9px}.aiw7-row p{margin:3px 0 0;color:#6f8299;font-size:8px;line-height:1.4}.aiw7-row small{color:#5f7187;font-size:7px}.aiw7-empty{padding:15px;text-align:center;border:1px dashed rgba(148,163,184,.12);border-radius:10px;color:#6f8299;font-size:9px}
    @media(max-width:900px){.aiw7-hero{grid-template-columns:1fr}.aiw7-side{justify-items:start}.aiw7-lower{grid-template-columns:1fr}}
    @media(max-width:680px){.aiw7-bar{align-items:flex-start;flex-direction:column}.aiw7-switch{width:100%}.aiw7-switch button{flex:1}.aiw7-grid{grid-template-columns:1fr}.aiw7-metrics{grid-template-columns:repeat(2,1fr);width:100%}.aiw7-side{width:100%}.aiw7-card-foot{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
})();
