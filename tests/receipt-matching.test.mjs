import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestDocumentMatches} from '../seller-finance.js';
const transactions=[{id:'a',orderId:'12-345',itemId:'ELY-123',title:'Example'},{id:'b',orderId:'12-345',itemId:'OTHER'},{id:'c',orderId:'12-3456',itemId:'ELY-123'},{id:'d',orderId:'12-345',itemId:'ELY-123',voidedAt:'2026-01-01'}];
test('document matching uses exact existing order and item references, not titles',()=>{
 assert.deepEqual(suggestDocumentMatches({},transactions),[]);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-345',productReference:'ELY-123'},transactions).map(x=>x.id),['a']);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-34'},transactions),[]);
 assert.deepEqual(suggestDocumentMatches({ebayOrderId:'12-345'},transactions).map(x=>x.id),['a','b']);
});
