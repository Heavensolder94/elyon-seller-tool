import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("direct login fallback uses the existing secure SellerTool session endpoint", async () => {
  const page = await readFile(new URL("../public/seller-entsperren.html", import.meta.url), "utf8");
  assert.match(page, /<form id="unlockForm" hidden>/);
  assert.match(page, /type="password"/);
  assert.match(page, /fetch\("\/api\/auth\/session",options\)/);
  assert.match(page, /credentials:"same-origin"/);
  assert.match(page, /cache:"no-store"/);
  assert.match(page, /session\("POST",\{token\}\)/);
  assert.match(page, /session\("GET"\)/);
  assert.match(page, /verified\.data\.authenticated!==true/);
  assert.match(page, /pdfCheck\.hidden=false/);
  assert.match(page, /fetch\("\/api\/orders\/attachment-check"/);
  assert.match(page, /credentials:"same-origin"/);
  assert.match(page, /response\.status===403/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /[?&]token=/);
});

test("login fallback does not bypass server-side access validation", async () => {
  const api = await readFile(new URL("../api/auth/session.js", import.meta.url), "utf8");
  assert.match(api, /createSellerSession\(req, res, token\)/);
  assert.match(api, /authenticated: isSellerAuthenticated\(req\)/);
  const access = await readFile(new URL("../lib/seller-access.js", import.meta.url), "utf8");
  assert.match(access, /HttpOnly/);
  assert.match(access, /SameSite=Strict/);
  assert.match(access, /Secure/);
});
