import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachmentBaseStatus } from "../lib/order-message-attachment.js";

test("PDF attachment base status accepts a public https production domain", () => {
  assert.deepEqual(attachmentBaseStatus("https://elyonsellertool.vercel.app"), {
    configured:true,valid:true,origin:"https://elyonsellertool.vercel.app",
  });
  assert.deepEqual(attachmentBaseStatus("https://elyonsellertool.vercel.app/"), {
    configured:true,valid:true,origin:"https://elyonsellertool.vercel.app",
  });
});

test("PDF attachment status fails closed on missing, malformed, unsafe or credentialled origins", () => {
  assert.deepEqual(attachmentBaseStatus(""),{configured:false,valid:false,origin:null});
  for(const invalid of [
    "nonsense",
    "http://elyonsellertool.vercel.app",
    "https://localhost",
    "https://myservice.local",
    "https://elyonsellertool.vercel.app/other",
    "https://elyonsellertool.vercel.app?token=abc",
    "https://user:pass@elyonsellertool.vercel.app",
  ]) assert.equal(attachmentBaseStatus(invalid).valid,false,invalid);
});

test("authenticated invoice-message endpoint reports only safe PDF base status", async () => {
  const source=await readFile(new URL("../api/orders/customer-message.js",import.meta.url),"utf8");
  assert.match(source,/requireSellerAccess\(req,res/);
  assert.match(source,/attachmentBase:attachmentBaseStatus\(process\.env\.ELYON_MESSAGE_ATTACHMENT_BASE_URL\)/);
  assert.match(source,/sendReady:messageDeliveryEnabled\(\)/);
  assert.doesNotMatch(source,/attachmentBase:process\.env\.ELYON_MESSAGE_ATTACHMENT_BASE_URL/);
});
