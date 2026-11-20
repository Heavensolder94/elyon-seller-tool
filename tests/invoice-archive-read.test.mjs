import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../internal/finance/index.js';

test('authenticated archive read returns only an intact server snapshot', async () => {
 const names=['ELYON_FINANCE_STORE_MODE','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ELYON_SELLER_ACCESS_TOKEN'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]])); const oldFetch=globalThis.fetch;
 Object.assign(process.env,{ELYON_FINANCE_STORE_MODE:'upstash',UPSTASH_REDIS_REST_URL:'https://example.invalid',UPSTASH_REDIS_REST_TOKEN:'test',ELYON_SELLER_ACCESS_TOKEN:'synthetic-test'});
 const invoice={orderId:'123456',invoiceNumber:'TEST-1',total:12};
 const record={immutable:true,invoice,snapshotHash:createHash('sha256').update(JSON.stringify(invoice)).digest('hex')};
 let state={revision:1,invoiceMeta:{'123456':record}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({result:JSON.stringify(state)})});
 const req={method:'GET',query:{action:'read-issued-invoice',orderId:'123456'},headers:{host:'localhost','x-elyon-seller-token':'synthetic-test'}};
 const response=()=>({setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}});
 try {
  let res=response();await handler(req,res);assert.equal(res.code,200);assert.equal(res.body.invoice.total,12);
  state={...state,invoiceMeta:{'123456':{...record,invoice:{...invoice,total:1}}}};
  res=response();await handler(req,res);assert.equal(res.code,409);assert.equal(res.body.invoice,undefined);
  res=response();await handler({...req,headers:{host:'localhost'}},res);assert.equal(res.code,403);
  state={revision:1,invoiceMeta:{'123456':{invoiceNumber:'OLD'}}};
  res=response();await handler(req,res);assert.equal(res.code,404);
 } finally {globalThis.fetch=oldFetch;for(const k of names)old[k]===undefined?delete process.env[k]:process.env[k]=old[k];}
});
