const $=id=>document.getElementById(id),endpoint='/api/auth/session?operator=1';
const q=new URLSearchParams(location.hash.slice(1)),code=q.get('code'),state=q.get('state');history.replaceState(null,'',location.pathname);
let busy=false;
async function api(action,fields={}){const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});const d=await r.json();if(!r.ok||d.ok!==true||['executionAuthorized','publishAuthorized','automaticApprovalAllowed','liveEnabled'].some(k=>d[k]!==false))throw Error(d.error||'operator_request_failed');return d;}
function show(d){$('status').textContent=d.authenticated?'Persönliche Operator-Sitzung verifiziert. '+(d.accountBound?'eBay-Konto zugeordnet.':'eBay-Konto noch nicht zugeordnet.')+' Keine Übertragungsfreigabe.':'Noch nicht persönlich angemeldet.';$('login').hidden=!!d.authenticated;$('logout').hidden=!d.authenticated;}
function on(id,fn){$(id).addEventListener('click',async()=>{if(busy)return;busy=true;$(id).disabled=true;try{await fn();}catch(e){$('status').textContent='Nicht abgeschlossen: '+e.message;}finally{busy=false;$(id).disabled=false;}});}
on('login',async()=>{const d=await api('begin'),url=new URL(d.url);if(url.origin!=='https://elyon-company-os.vercel.app'||url.pathname!=='/operator-auth.html'||url.search)throw Error('Ungültiges Anmeldeziel');location.assign(url.href);});
on('logout',async()=>{show(await api('logout'));});
(async()=>{try{show(code&&state?await api('exchange',{code,state}):await api('status'));}catch(e){$('status').textContent='Operator-Anmeldung nicht verfügbar: '+e.message;$('login').hidden=false;}})();
