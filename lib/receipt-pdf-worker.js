// This process handles only attachment metadata; it never renders pages.
// pdf.js needs a DOMMatrix global even when the optional canvas native module
// cannot load under the OS address-space limit. Rendering is intentionally off.
import { readFileSync } from 'node:fs';
globalThis.DOMMatrix ||= class DOMMatrix {};
// PDF.js checks Response.prototype even for an in-memory PDF. On Node 20 the
// native Response getter initializes undici and reserves large Wasm memory.
// This worker never fetches URLs, so disable network fetch and use a stub.
Object.defineProperty(globalThis,'Response',{configurable:true,writable:true,value:class DisabledResponse {constructor(){throw new Error('network_disabled');}}});
Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:()=>{throw new Error('network_disabled');}});
const chunks=[];let size=0;let stage='limits';
try {
 const limits=readFileSync('/proc/self/limits','utf8');
 const match=limits.match(/^Max address space\s+(\d+)\s+\d+\s+bytes\s*$/m);
 if(!match || Number(match[1])>1843200000)throw new Error('address_limit_not_enforced');
 stage='input';
 for await (const chunk of process.stdin) {size+=chunk.length;if(size>3333336)throw new Error('input_too_large');chunks.push(chunk);}
 const input=Buffer.concat(chunks).toString('ascii');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input))throw new Error('invalid_input');
 stage='module';
 const {extractStructuredReceiptFromPdf}=await import('./receipt-pdf.js');
 stage='extract';
 const proposal=await extractStructuredReceiptFromPdf(Buffer.from(input,'base64'));
 process.stdout.write(JSON.stringify({ok:true,proposal}));
} catch (error) {process.stdout.write(JSON.stringify({ok:false,stage,errorType:['Error','TypeError','ReferenceError','RangeError','SyntaxError'].includes(error?.name)?error.name:'Error'}));process.exitCode=1;}
