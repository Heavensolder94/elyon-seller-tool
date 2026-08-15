import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function classListFor(node, initial = "") {
  const values = new Set(String(initial).split(/\s+/).filter(Boolean));
  const sync = () => { node._className = [...values].join(" "); };
  return {
    add(...names) { names.forEach((name) => values.add(name)); sync(); },
    remove(...names) { names.forEach((name) => values.delete(name)); sync(); },
    contains(name) { return values.has(name); },
    values,
  };
}

function createNode(documentRef, tagName, id = "", className = "") {
  const node = {
    tagName: String(tagName || "div").toUpperCase(),
    id,
    dataset: {},
    attributes: {},
    style: {
      values: {},
      setProperty(name, value, priority = "") {
        this.values[name] = { value, priority };
      },
    },
    parentNode: null,
    children: [],
    _className: className,
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
  node.classList = classListFor(node, className);
  Object.defineProperty(node, "className", {
    get() { return node._className; },
    set(value) {
      node._className = String(value || "");
      node.classList = classListFor(node, node._className);
    },
  });
  documentRef.nodes.push(node);
  return node;
}

function createDocumentFixture() {
  const documentRef = {
    nodes: [],
    getElementById(id) { return this.nodes.find((node) => node.id === id) || null; },
    createElement(tagName) { return createNode(this, tagName); },
  };
  const parent = {
    children: [],
    insertBefore(node, reference) {
      const index = this.children.indexOf(reference);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
    },
  };
  const legacy = createNode(documentRef, "section", "dashboardTab", "tab active");
  const sentinel = createNode(documentRef, "strong", "dTotal", "");
  parent.children.push(legacy);
  legacy.parentNode = parent;
  legacy.children.push(sentinel);
  sentinel.parentNode = legacy;
  return { documentRef, parent, legacy, sentinel };
}

test("mounts the Seller cockpit without deleting legacy dashboard elements", async () => {
  const source = await readFile(new URL("../seller-dashboard-compat.js", import.meta.url), "utf8");
  const { documentRef, parent, legacy, sentinel } = createDocumentFixture();
  const windowRef = { document: documentRef };

  vm.runInNewContext(source, { window: windowRef, globalThis: windowRef });

  const host = documentRef.getElementById("dashboardTab");
  assert.ok(host);
  assert.notEqual(host, legacy);
  assert.equal(host.dataset.elyonSellerCockpitHost, "true");
  assert.equal(host.classList.contains("active"), true);
  assert.equal(legacy.id, "elyonSellerLegacyDashboard");
  assert.equal(legacy.classList.contains("active"), false);
  assert.deepEqual(legacy.style.values.display, { value: "none", priority: "important" });
  assert.equal(documentRef.getElementById("dTotal"), sentinel);
  assert.deepEqual(parent.children, [host, legacy]);

  const second = windowRef.ElyonSellerDashboardCompat.install(documentRef);
  assert.equal(second.reason, "already_installed");
  assert.equal(parent.children.length, 2);
});

test("merges the legacy Rechnungen menu entry into the Finanzen workspace", async () => {
  const source = await readFile(new URL("../seller-dashboard-compat.js", import.meta.url), "utf8");
  const { documentRef } = createDocumentFixture();
  const menu = createNode(documentRef, "select", "mainMenu", "");
  const invoiceOption = createNode(documentRef, "option", "", "");
  invoiceOption.value = "invoiceTab";
  invoiceOption.textContent = "5. Rechnungen";
  invoiceOption.parentNode = menu;
  menu.children.push(invoiceOption);
  menu.options = menu.children;
  menu.value = "invoiceTab";

  const windowRef = { document: documentRef };
  vm.runInNewContext(source, { window: windowRef, globalThis: windowRef });

  assert.equal(menu.options.length, 1);
  assert.equal(menu.options[0].value, "financeTab");
  assert.equal(menu.options[0].textContent, "5. Finanzen");
  assert.equal(menu.value, "financeTab");
  assert.equal(menu.options[0].dataset.elyonFinanceMenuMerged, "true");
});

test("loads the compatibility layer before role policy and dashboard module", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const compatIndex = source.indexOf("/seller-dashboard-compat.js");
  const roleIndex = source.indexOf("/seller-role-policy.js");
  const dashboardIndex = source.indexOf("/seller-dashboard-v2.js");

  assert.ok(compatIndex > -1);
  assert.ok(roleIndex > compatIndex);
  assert.ok(dashboardIndex > roleIndex);
  assert.match(source, /seller-dashboard-compat\.js.*public\/seller-dashboard-compat\.js/s);
});
