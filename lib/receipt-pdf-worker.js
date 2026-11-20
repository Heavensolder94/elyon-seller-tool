// This process handles only attachment metadata; it never renders pages.
// pdf.js needs a DOMMatrix global even when the optional canvas native module
// cannot load under the OS address-space limit. Rendering is intentionally off.
import { readFileSync } from 'node:fs';
globalThis.DOMMatrix ||= class DOMMatrix {};
const chunks=[];let size=0;
try {
 const limits=readFileSync('/proc/self/limits','utf8');
 const match=limits.match(/^Max address space\s+(\d+)\s+\d+\s+bytes\s*$/m);
 if(!match || Number(match[1])>1843200000)throw new Error('address_limit_not_enforced');
 for await (const chunk of process.stdin) {size+=chunk.length;if(size>3333336)throw new Error('input_too_large');chunks.push(chunk);}
 const input=Buffer.concat(chunks).toString('ascii');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input))throw new Error('invalid_input');
 const {extractStructuredReceiptFromPdf}=await import('./receipt-pdf.js');
 const proposal=await extractStructuredReceiptFromPdf(Buffer.from(input,'base64'));
 process.stdout.write(JSON.stringify({ok:true,proposal}));
} catch {process.stdout.write(JSON.stringify({ok:false,error:'PDF oder eingebettetes XML konnte nicht sicher verarbeitet werden.'}));process.exitCode=1;}
