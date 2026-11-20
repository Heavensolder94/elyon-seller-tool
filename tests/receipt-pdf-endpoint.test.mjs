import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../internal/finance/index.js';
test('PDF receipt recognition stays blocked until decompression is bounded',async()=>{
 const old=process.env.ELYON_SELLER_ACCESS_TOKEN;process.env.ELYON_SELLER_ACCESS_TOKEN='synthetic-test';
 const req={method:'POST',query:{action:'recognize-pdf-receipt'},headers:{host:'localhost','x-elyon-seller-token':'synthetic-test'},body:{base64:'JVBERi0='}};
 const res={setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 try{await handler(req,res);assert.equal(res.code,503);assert.equal(res.body.error,'receipt_pdf_recognition_disabled');}finally{old===undefined?delete process.env.ELYON_SELLER_ACCESS_TOKEN:process.env.ELYON_SELLER_ACCESS_TOKEN=old}
});
