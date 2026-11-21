import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=filename=>readFile(path.join(root,filename),"utf8");

test("every SellerTool order entry dependency is included in the Vercel deployment mirror",async()=>{
  const prepare=await read("scripts/prepare-vercel.mjs");
  const entry=await read("seller-orders-v2.js");
  const loader=await read("seller-orders-v2-loader.js");
  const handoff=await read("seller-supplier-order-import-core.js");
  assert.match(entry,/data-nova-pairing/);
  assert.match(entry,/from "\.\/seller-supplier-order-import-core\.js"/);
  assert.match(handoff,/export function validateSupplierOrderHandoff/);
  const deps=[...entry.matchAll(/from ["']\.\/([^"']+\.js)["']/g)].map(match=>match[1]);
  assert.ok(deps.includes("seller-supplier-order-import-core.js"));
  for(const filename of deps) {
    assert.ok(prepare.includes('["'+filename+'", "public/'+filename+'"]'),filename+" missing from deploy mirror");
    assert.ok((await read(filename)).length>0,filename+" source missing");
  }
  assert.ok(prepare.includes('["seller-orders-v2.js", "public/seller-orders-v2.js"]'));
  assert.ok(prepare.includes('["seller-orders-v2-loader.js", "public/seller-orders-v2-loader.js"]'));
  const marker="orders2-20261121-nova-pair-fix1";
  assert.ok(loader.includes('/seller-orders-v2.js?v='+marker));
  assert.ok(prepare.includes('/seller-orders-v2-loader.js?v='+marker));
  assert.ok(prepare.includes('/seller-orders-v2.css?v='+marker));
});
