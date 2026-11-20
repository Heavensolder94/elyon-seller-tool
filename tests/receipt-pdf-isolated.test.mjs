import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recognizePdfIsolated } from '../lib/receipt-pdf-isolated.js';
const xml='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><b:ID>TEST-ISOLATED</b:ID></Invoice>';
async function pdfWith(data){const pdf=await PDFDocument.create();pdf.addPage();await pdf.attach(data,'invoice.xml',{mimeType:'application/xml'});return Buffer.from(await pdf.save()).toString('base64');}
test('isolated PDF worker extracts a structured attachment',async()=>{const input=await pdfWith(Buffer.from(xml));let result;try{result=await recognizePdfIsolated(input);}catch(error){if(process.env.CI){const worker=fileURLToPath(new URL('../lib/receipt-pdf-worker.js',import.meta.url));const probe=spawnSync('/bin/sh',['-c','ulimit -v 1800000 && ulimit -d 800000 || exit 70; exec "$1" --no-addons --wasm-enforce-bounds-checks --max-old-space-size=64 "$2"','probe',process.execPath,worker],{input,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/tmp',NODE_ENV:'production'}});console.error('Synthetic worker startup diagnostic:',probe.stderr?.slice(0,1200));}throw error;}assert.equal(result.invoiceReference,'TEST-ISOLATED');});
test('isolated PDF worker rejects inflated attachments and bad inputs',async()=>{await assert.rejects(recognizePdfIsolated(await pdfWith(Buffer.alloc(8_000_000,65))));await assert.rejects(recognizePdfIsolated('a'.repeat(3333340)));});

test('parallel PDF requests do not create unbounded concurrent subprocesses',async()=>{const base64=await pdfWith(Buffer.from(xml));const results=await Promise.allSettled([recognizePdfIsolated(base64),recognizePdfIsolated(base64)]);assert.ok(results.filter(r=>r.status==='fulfilled').length<=1);assert.ok(results.some(r=>r.status==='rejected' && /ausgelastet/.test(r.reason.message)));});
test('worker rejects direct invocation when either operating-system limit is too high',async()=>{
 const input=await pdfWith(Buffer.from(xml));const worker=fileURLToPath(new URL('../lib/receipt-pdf-worker.js',import.meta.url));
 for(const limits of ['ulimit -v 1800000 && ulimit -d 900000','ulimit -v 1900000 && ulimit -d 800000']){
  const probe=spawnSync('/bin/sh',['-c',`${limits} || exit 70; exec "$1" --no-addons --wasm-enforce-bounds-checks --max-old-space-size=64 "$2"`,'probe',process.execPath,worker],{input,encoding:'utf8',timeout:10000});
  assert.notEqual(probe.status,0);
 }
});
