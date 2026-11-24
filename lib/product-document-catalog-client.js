import {validateDocumentCatalog} from './product-document-core.js';
import {DEFAULT_COMPANY_OS_URL} from './product-master-consumer.js';
// Only a fixed protected Company OS route; never fetch user-supplied document URLs.
export async function loadDocumentCatalog({env=process.env,fetchImpl=fetch}={}){
 try{
  const code=String(env.ELYON_COMPANY_OS_SYNC_CODE||env.COMPANY_OS_SYNC_CODE||'').trim();
  if(!code)throw Error();
  const url=new URL('/api/product-master-v2',env.ELYON_COMPANY_OS_URL||env.COMPANY_OS_URL||DEFAULT_COMPANY_OS_URL);
  if(url.protocol!=='https:'||url.username||url.password)throw Error();
  url.searchParams.set('documentCatalog','1');
  const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'application/json','X-Elyon-Sync-Code':code},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error();
  return validateDocumentCatalog(await response.json());
 }catch{throw Object.assign(Error('Kanonischer Produkt- und Dokumentenkatalog nicht verfügbar. Keine Änderungen gespeichert.'),{status:503});}
}
