// Protocol test fixture only; never imported by production code.
import {createHash} from 'node:crypto';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const header=['Document url','Document type','Document language 1','Document language 2','Document language 3','Document language 4','Document language others','Document nickname'];
export function mockPreview(request,reference){
 return {ok:true,schemaVersion:'elyon-document-xlsx-preview-v3.3',stage:'A_METADATA_PREVIEW',status:'BLOCKED',requestSha256:hash(request),profile:{templateId:reference.templateId,registryVersion:reference.registryVersion,templateVersion:reference.templateVersion,originalSha256:reference.sha256,originalSize:17244,header,headerRow:3,maxRows:97},rows:request.documents.map((d,i)=>{
  const languages=[...(d.primaryLanguage?[d.primaryLanguage]:[]),...d.additionalLanguages];
  const valid=d.primaryLanguage&&languages.length<=4&&new Set(languages).size===languages.length&&languages.every(l=>reference.languages.includes(l));
  return {documentId:d.documentId,documentRevision:d.documentRevision,row:i+4,values:['',d.documentType||'',...(valid?[...languages,...Array(4-languages.length).fill('')]:Array(4).fill('')),d.otherLanguageText,d.nickname],declaredLanguages:languages,blockers:['DOCUMENT_DELIVERY_UNVERIFIED','PRIVATE_FILE_UNAVAILABLE','PROVENANCE_UNVERIFIED',...(!d.documentType?['DOCUMENT_TYPE_MISSING']:[]),...(!d.primaryLanguage?['PRIMARY_LANGUAGE_MISSING']:[]),...(languages.length>4?['LANGUAGE_LIMIT_EXCEEDED']:[]),...(languages.includes('OTHER')?['OTHER_LANGUAGE_SYNTAX_UNVERIFIED']:[])]};
 }),validation:{status:'INVALID',structureStatus:'VALID',businessStatus:'INVALID',diagnostics:[{row:4,field:'Document url',code:'required_field',classification:'REQUIRED_FIELD',severity:'error'}]},executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,privateFileAvailable:false,gpsrCompliant:false,downloadAvailable:false,ebayDocumentId:null,artifact:null,artifactSha256:null};
}
