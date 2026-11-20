import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestDocumentMatches,suggestSimpleReceiptAllocation} from '../seller-finance.js';
const transactions=[{id:'a',orderId:'12-345',itemId:'ELY-123',title:'Example'},{id:'b',orderId:'12-345',itemId:'OTHER'},{id:'c',orderId:'12-3456',itemId:'ELY-123'},{id:'d',orderId:'12-345',itemId:'ELY-123',voidedAt:'2026-01-01'}];
test('document matching uses exact existing order and item references, not titles',()=>{
 assert.deepEqual(suggestDocumentMatches({},transactions),[]);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-345',productReference:'ELY-123'},transactions).map(x=>x.id),['a']);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-34'},transactions),[]);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-345'},transactions).map(x=>x.id),['a','b']);
});
test('single cost suggestion needs an exact order, one revenue, matching quantity and EUR',()=>{
 const doc={ebayOrderId:'12-345',productReference:'ELY-123',amount:'12,50',currency:'EUR',documentType:'supplier_invoice',paymentDate:'2026-11-20',receiptLineItemsV1:[{title:'Test',quantity:2,amount:'12.50'}]};
 const sale={id:'sale',orderId:'12-345',itemId:'ELY-123',category:'revenue',quantity:2};
 assert.deepEqual(suggestSimpleReceiptAllocation(doc,[sale]),{orderId:'12-345',itemId:'ELY-123',amount:'12.50'});
 for(const input of [{...doc,ebayOrderId:''},{...doc,productReference:'OTHER'},{...doc,currency:'USD'},{...doc,amount:'-1.00'},{...doc,paymentDate:''},{...doc,documentType:'payment_proof'},{...doc,receiptLineItemsV1:[{},{}]},{...doc,receiptLineItemsV1:[{quantity:1}]}])assert.equal(suggestSimpleReceiptAllocation(input,[sale]),null);
 assert.equal(suggestSimpleReceiptAllocation(doc,[sale,{...sale,id:'another'}]),null);
 assert.equal(suggestSimpleReceiptAllocation(doc,[{...sale,voidedAt:'2026-11-20'}]),null);
 assert.equal(suggestSimpleReceiptAllocation(doc,[{...sale,category:'ebay_fee'}]),null);
 assert.equal(suggestSimpleReceiptAllocation({...doc,productReference:''},[{...sale,itemId:'bad|reference'}]),null);
});
