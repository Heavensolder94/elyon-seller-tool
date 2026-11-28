import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (name) => readFile(new URL(name, root), "utf8");

test("simplified Jarvis hub is browser-valid and exposes only three primary areas", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.doesNotThrow(() => new vm.Script(hub));
  const areasStart = hub.indexOf("const AREAS");
  const areasEnd = hub.indexOf("const SYSTEM_VIEWS", areasStart);
  const areas = hub.slice(areasStart, areasEnd);
  assert.match(areas, /id: "home", label: "JARVIS"/);
  assert.match(areas, /id: "brain", label: "Gehirn"/);
  assert.match(areas, /id: "system", label: "System"/);
  assert.doesNotMatch(areas, /id: "integrations"/);
  assert.doesNotMatch(areas, /id: "models"/);
  assert.match(hub, /window\.ElyonJarvisHub/);
  assert.match(hub, /SIMPLE CONTROL/);
  assert.doesNotMatch(hub, /setInterval\s*\(/);
});

test("hub keeps one top-level Jarvis route and removes the legacy Integration Center option", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /TOP_TAB_ID = "jarvisCommandCenterTab"/);
  assert.match(hub, /INTEGRATION_TAB_ID = "jarvisIntegrationCenterTab"/);
  assert.match(hub, /option\[value=/);
  assert.match(hub, /option\.remove\(\)/);
  assert.match(hub, /jarvis\.textContent = "◉ JARVIS"/);
  assert.match(hub, /legacySelected/);
});

test("normal mode hides developer-heavy information and keeps technical details opt-in", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /Technische Details/);
  assert.match(hub, /data-jarvis-toggle-advanced/);
  assert.match(hub, /data-jarvis-hub-advanced="0"/);
  assert.match(hub, /jarvis-cc-metrics\{display:none!important\}/);
  assert.match(hub, /jarvis-fm-health-grid/);
  assert.match(hub, /jarvis-fm-file-title code/);
  assert.match(hub, /jic-metrics/);
  assert.match(hub, /jic-route/);
});

test("Brain normal mode uses human labels while retaining existing edit and detail workflows", async () => {
  const hub = await source("seller-jarvis-hub.js");
  for (const label of ["Identität", "Elyon-Wissen", "Ziele", "Regeln", "Fähigkeiten", "Abläufe"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /window\.ElyonJarvisFileManager\?\.refresh/);
  assert.match(hub, /window\.ElyonJarvisFileManagerActions\?\.bindRoot/);
  assert.match(hub, /data-jarvis-file-edit/);
  assert.match(hub, /button\.textContent = "Details"/);
});

test("System keeps APIs, models, routing, costs and logs behind technical details", async () => {
  const hub = await source("seller-jarvis-hub.js");
  for (const label of ["Status", "Integrationen", "KI-Modelle", "Routing", "Kosten", "Logs"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /window\.ElyonJarvisIntegrationCenter/);
  assert.match(hub, /data-jic-tab/);
  assert.match(hub, /state\.advanced\.system/);
  assert.match(hub, /state\.systemView = "overview"/);
});

test("home normal mode keeps command, attention and last activity while hiding metrics, agents and pipeline", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /Was soll ich tun\?/);
  assert.match(hub, /Braucht deine Aufmerksamkeit/);
  assert.match(hub, /Letzte Aktionen/);
  assert.match(hub, /jarvis-cc-grid>.jarvis-cc-card:nth-child\(2\)/);
  assert.match(hub, /jarvis-cc-grid>.jarvis-cc-card:nth-child\(4\)/);
  assert.match(hub, /jarvis-cc>.jarvis-cc-card\{display:none!important\}/);
});

test("bootstrap loads the hub after Integration Center and production preparation copies it", async () => {
  const [bootstrap, prepare] = await Promise.all([
    source("seller-jarvis-bootstrap.js"),
    source("scripts/prepare-agent-registry.mjs"),
  ]);
  const integrationIndex = bootstrap.indexOf('"/seller-jarvis-integration-center.js"');
  const hubIndex = bootstrap.indexOf('"/seller-jarvis-hub.js"');
  assert.ok(integrationIndex >= 0 && hubIndex > integrationIndex);
  assert.match(bootstrap, /ElyonJarvisHub\?\.mount/);
  assert.match(prepare, /"seller-jarvis-hub\.js"/);
  assert.match(prepare, /normalizeJarvisMenu/);
  assert.doesNotMatch(prepare, /<option value=\"\$\{value\}\">11\. ⌘ Jarvis Integration Center<\/option>/);
});

test("hub visibility reuses existing render trees instead of moving command center or Brain Control DOM", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /data-jarvis-hub-area=\"home\"/);
  assert.match(hub, /data-jarvis-hub-area=\"brain\"/);
  assert.match(hub, /data-jarvis-hub-area=\"system\"/);
  assert.match(hub, /display:block!important/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvis-cc/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvisFileManagerPanel/);
});


test("system navigation clicks never resolve the body state attribute as a button", async () => {
  const handlers = new Map();
  const nodes = new Map();
  class Element {
    constructor(id = "") {
      this.id = id; this.dataset = {}; this.style = {};
      this.classList = { contains: () => true, toggle() {} };
      this.parentNode = {}; this.firstElementChild = {};
      this.textContent = ""; this.innerHTML = "";
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    setAttribute() {}
    insertAdjacentElement(_position, element) { nodes.set(element.id, element); }
    closest(selector) {
      // Emulate the ancestor match that formerly swallowed every click on the body.
      if (selector === "[data-jarvis-hub-area]" && body.dataset.jarvisHubArea) return body;
      return this.matchesSelector?.(selector) ? this : null;
    }
  }
  const body = new Element("body");
  const menu = new Element("mainMenu"); menu.value = "jarvisCommandCenterTab";
  const top = new Element("jarvisCommandCenterTab");
  nodes.set(menu.id, menu); nodes.set(top.id, top);
  const document = {
    readyState: "loading", body, documentElement: new Element(),
    head: { appendChild(node) { nodes.set(node.id, node); } },
    createElement: () => new Element(),
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, fn) => handlers.set(type, fn),
  };
  const calls = [];
  const window = { addEventListener() {}, ElyonJarvisIntegrationCenter: { refresh(options) { calls.push(options); } } };
  const sandbox = { document, window, Element, MutationObserver: class { observe() {} disconnect() {} }, queueMicrotask() {}, requestAnimationFrame() {} };
  vm.runInNewContext(await source("seller-jarvis-hub.js"), sandbox);
  window.ElyonJarvisHub.mount();
  const click = (selector, dataset = {}) => {
    const el = new Element(); el.dataset = dataset;
    el.matchesSelector = value => value === selector;
    handlers.get("click")({ target: el });
  };
  click("#jarvisUnifiedHubHost button[data-jarvis-hub-area]", { jarvisHubArea: "system" });
  assert.equal(body.dataset.jarvisHubArea, "system");
  assert.equal(calls.at(-1).load, true);
  click("#jarvisUnifiedHubHost button[data-jarvis-toggle-advanced]");
  assert.equal(body.dataset.jarvisHubAdvanced, "1");
  assert.match(nodes.get("jarvisUnifiedHubHost").innerHTML, /Technische Details ausblenden/);
  click("#jarvisUnifiedHubHost button[data-jarvis-system-view]", { jarvisSystemView: "logs" });
  assert.equal(calls.at(-1).view, "logs");
  const before = calls.length;
  click("unrelated-button");
  assert.equal(calls.length, before);
  click("#jarvisUnifiedHubHost button[data-jarvis-toggle-advanced]");
  assert.equal(body.dataset.jarvisHubAdvanced, "0");
  assert.equal(calls.at(-1).view, "overview");
});

test("integration center mounts and loads status within unified system view", async () => {
  const tab = { innerHTML: "" };
  const menu = { value: "jarvisCommandCenterTab", querySelector() { throw Error("legacy menu must not be reinserted"); } };
  const document = {
    readyState: "loading", documentElement: { dataset: {} },
    head: { appendChild() {} },
    createElement: () => ({}),
    getElementById: id => id === "jarvisIntegrationCenterTab" ? tab : id === "mainMenu" ? menu : null,
    addEventListener() {},
  };
  const window = { ElyonJarvisHub: {} };
  let reads = 0;
  const sandbox = {
    document, window, structuredClone, localStorage: { getItem: () => null },
    fetch: async (url, options) => {
      assert.equal(url, "/api/jarvis-system-status");
      assert.equal(options.method, "GET"); reads++;
      return { ok: true, json: async () => ({ ok: true, status: "degraded", brain: {}, memory: {}, redis: {}, e5: {} }) };
    },
  };
  vm.runInNewContext(await source("seller-jarvis-integration-center.js"), sandbox);
  assert.equal(window.ElyonJarvisIntegrationCenter.mount(), true);
  assert.match(tab.innerHTML, /Systemstatus laden/);
  window.ElyonJarvisIntegrationCenter.refresh({ view: "overview", load: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
  assert.match(tab.innerHTML, /Supabase|Memory/);
  assert.match(tab.innerHTML, /Redis/);
  assert.match(tab.innerHTML, /E5 Pipeline/);
  assert.equal(window.ElyonJarvisIntegrationCenter.getSystemStatus().status, "degraded");
});

test("persistent Brain host respects the unified hub area", async () => {
  const body = { dataset: { jarvisHubOpen: "1", jarvisHubArea: "system" } };
  const menu = { value: "jarvisCommandCenterTab" };
  const document = { readyState: "loading", body, addEventListener() {}, getElementById: () => menu };
  const window = { addEventListener() {} };
  vm.runInNewContext(await source("seller-jarvis-file-manager-mount-bridge.js"), { document, window });
  const tab = { classList: { contains: () => true } };
  const host = { style: {}, classList: { toggle() {} }, setAttribute(key, value) { this[key] = value; } };
  assert.equal(window.ElyonJarvisFileManagerMountBridge.syncHostVisibility(tab, host), false);
  assert.equal(host["aria-hidden"], "true");
  body.dataset.jarvisHubArea = "brain";
  assert.equal(window.ElyonJarvisFileManagerMountBridge.syncHostVisibility(tab, host), true);
  assert.equal(host["aria-hidden"], "false");
});
