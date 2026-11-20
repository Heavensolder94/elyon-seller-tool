import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let busy=false;
// Linux RLIMIT_AS caps all child address space, including external buffers.
// Fail closed if unavailable; never fall back to parsing in the server process.
export async function recognizePdfIsolated(base64) {
 if(process.platform!=='linux')throw new Error('Begrenzte PDF-Verarbeitung ist in dieser Umgebung nicht verfügbar.');
 if(typeof base64!=='string'||base64.length>3333336||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Ungültige PDF-Daten.');
 if(busy)throw new Error('PDF-Verarbeitung ausgelastet. Bitte später erneut versuchen.');
 busy=true;
 try{return await new Promise((resolve,reject)=>{
  const worker=fileURLToPath(new URL('./receipt-pdf-worker.js',import.meta.url));
  const child=spawn('/bin/sh',['-c','ulimit -v 1800000 || exit 70; exec "$1" --no-addons --max-old-space-size=64 "$2"','elyon-pdf-worker',process.execPath,worker],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/tmp',NODE_ENV:'production'}});
  let output='',failed=false,done=false;
  const timeout=setTimeout(()=>{failed=true;child.kill('SIGKILL')},10000);
  child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>20000){failed=true;child.kill('SIGKILL')}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{if(!done){done=true;clearTimeout(timeout);reject(new Error('Begrenzte PDF-Verarbeitung nicht verfügbar.'));}});
  child.on('close',(code,signal)=>{if(done)return;done=true;clearTimeout(timeout);if(failed||code!==0)return reject(new Error('PDF konnte nicht innerhalb der Sicherheitsgrenzen verarbeitet werden (Exit '+String(code)+', Signal '+String(signal||'-')+').'));try{const data=JSON.parse(output);if(data.ok!==true||!data.proposal)throw new Error();resolve(data.proposal);}catch{reject(new Error('PDF konnte nicht sicher ausgewertet werden.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(base64);
 });}finally{busy=false;}
}
