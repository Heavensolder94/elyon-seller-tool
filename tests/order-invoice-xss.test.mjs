import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('invalid currency text from an eBay order is escaped in the order table', async () => {
  const source = await readFile(new URL('../seller-order-invoices.js', import.meta.url), 'utf8');
  const root = { innerHTML: '' };
  const tab = { appendChild() {} };
  const document = {
    getElementById(id) { return id === 'financeTab' ? tab : id === 'elyonOrderInvoicePanel' ? root : null; },
    createElement() { return {}; }, head: { appendChild() {} }, addEventListener() {},
  };
  const malicious = '\"><img src=x onerror=alert(1)>';
  const window = { toast() {} };
  const context = { document, window, Intl, Date, JSON, Object, Number, String, Math, Array, Set,
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch: async url => String(url).includes('action=orders')
      ? { ok:true, json:async()=>({ok:true,orders:[{orderId:'123456',pricingSummary:{total:{value:'1',currency:malicious}},lineItems:[]}]}) }
      : { ok:true, json:async()=>({ok:true,state:{invoiceMeta:{},orderOperations:{}}}) },
  };
  vm.runInNewContext(source, context);
  window.ElyonOrderInvoices.mount();
  await window.ElyonOrderInvoices.load();
  assert.ok(root.innerHTML.includes('&lt;img'));
  assert.ok(!root.innerHTML.includes('<img src=x'));
});
