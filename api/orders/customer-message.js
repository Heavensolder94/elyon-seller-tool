import crypto from "node:crypto";
import { requireSellerAccess } from "../../lib/seller-access.js";
import { readFinanceState,writeFinanceState,getFinanceStoreDescription } from "../../lib/finance-store.js";
import { ebayUserSession,callEbayJson } from "../../lib/ebay-production.js";
import { normalizeEbayOrder,paymentConfirmed } from "../../seller-orders-v2-core.js";
import { DEFAULT_ORDER_THANK_YOU,validateThankYouTemplate } from "../../seller-order-message-core.js";
import { verifiedInvoicePdf,attachmentUrl,attachmentBaseStatus,messageDeliveryEnabled } from "../../lib/order-message-attachment.js";

const text=x=>String(x??"").trim();
const validOrder=id=>/^[A-Za-z0-9_-]{6,70}$/.test(text(id));
const scrub=msg=>({ok:false,error:"message_send_blocked",message:msg});
const delivery=op=>op?.messageDispatch||null;

async function saveTemplate(req,res,body){
  if (!Number.isSafeInteger(body.expectedRevision))return res.status(409).json(scrub("Zuerst aktuellen Nachrichtenvorlagen-Stand laden."));
  const validation=validateThankYouTemplate(body.template);
  if(!validation.ok)return res.status(400).json({ok:false,error:"invalid_template",message:validation.errors.join(" · ")});
  const result=await writeFinanceState({settings:{orderThankYouTemplate:validation.template}},{
    action:"order_message_template_saved",actor:"seller",source:"orders_customer_message",
    summary:"Transaktionale Dankesnachricht bearbeitet."
  },{expectedRevision:body.expectedRevision});
  if(!result.ok)return res.status(result.conflict?409:503).json(scrub(result.error));
  return res.status(200).json({ok:true,revision:result.state.revision,template:validation.template});
}

async function sendInvoiceMessage(req,res,body){
  if(!messageDeliveryEnabled())return res.status(409).json(scrub(
    "eBay-Nachrichtenversand ist noch nicht freigeschaltet. Zuerst OAuth-Berechtigung und PDF-Hosting verifizieren."));
  if(body.confirmation!=="SEND_ORDER_INVOICE_MESSAGE")return res.status(400).json(scrub("Versandbestätigung fehlt."));
  const orderId=text(body.orderId);
  if(!validOrder(orderId)||/^DEMO-/i.test(orderId))return res.status(400).json(scrub("Ungültige Bestellnummer."));
  if(!Number.isSafeInteger(body.expectedRevision))return res.status(409).json(scrub("Bestellstand zuerst neu laden."));
  const content=validateThankYouTemplate(body.messageText);
  if(!content.ok)return res.status(400).json(scrub(content.errors.join(" · ")));
  const state=await readFinanceState();
  if(state.revision!==body.expectedRevision)return res.status(409).json(scrub("Finanzstand wurde geändert. Vor Versand aktualisieren."));
  const record=state.invoiceMeta?.[orderId];
  if(!record || record.invoice?.taxMode!=="small_business")
    return res.status(409).json(scrub("Keine gültige ausgestellte Kleinunternehmerrechnung zur Bestellung."));
  try {verifiedInvoicePdf(record,orderId);}
  catch(error){return res.status(409).json(scrub(error.message));}
  if(!content.template.includes(orderId)||!content.template.includes(record.invoiceNumber))
    return res.status(400).json(scrub("Bestell- und Rechnungsnummer müssen im Nachrichtentext stehen."));
  const prior=delivery(state.orderOperations?.[orderId]);
  if(prior?.status)return res.status(409).json({
    ok:false,error:"message_already_attempted",
    message:prior.status==="sent"?"Rechnung wurde bereits als gesendet gespeichert.":
      "Für diese Rechnung existiert bereits ein Versandversuch. Zuerst den tatsächlichen eBay-Nachrichtenstatus prüfen.",
    delivery:prior
  });
  // Do not trust recipient, payment status, buyer identity or invoice from the browser.
  const session=await ebayUserSession("production");
  const raw=await callEbayJson(
    "https://api.ebay.com/sell/fulfillment/v1/order/"+encodeURIComponent(orderId),
    {headers:{Authorization:"Bearer "+session.accessToken,Accept:"application/json"}}
  );
  if(text(raw?.orderId)!==orderId)return res.status(409).json(scrub("eBay hat die Bestellnummer nicht bestätigt."));
  const verified=normalizeEbayOrder(raw);
  if(!paymentConfirmed(verified)||verified.cancelStatus.includes("CANCEL"))
    return res.status(409).json(scrub("Nicht vollständig bezahlte oder stornierte Bestellung."));
  const recipient=text(raw?.buyer?.username);
  if(!recipient || recipient.length>120)return res.status(409).json(scrub("eBay hat keinen eindeutigen Käufer-Account geliefert."));
  // Verify the temporary attachment URL before any write to eBay.
  const url=attachmentUrl({orderId,invoiceHash:record.snapshotHash,
    baseUrl:process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL});
  const probe=await fetch(url,{method:"GET",redirect:"error",headers:{Accept:"application/pdf"}});
  if(!probe.ok||!(probe.headers.get("content-type")||"").includes("application/pdf"))
    return res.status(503).json(scrub("eBay kann die geschützte Rechnung noch nicht zuverlässig abrufen."));
  const attemptId=crypto.randomUUID();
  const reserved=await writeFinanceState({orderOperations:{[orderId]:{
    messageDispatch:{status:"sending",attemptId,startedAt:new Date().toISOString(),
      invoiceNumber:record.invoiceNumber}
  }}},{
    action:"invoice_message_send_started",actor:"seller",source:"orders_customer_message",
    summary:"Versand einer Rechnungsnachricht nach ausdrücklicher Bestätigung begonnen."
  },{expectedRevision:state.revision});
  if(!reserved.ok)return res.status(reserved.conflict?409:503).json(scrub("Zeitgleiche Änderung: Versand nicht begonnen."));
  const requestBody={
    otherPartyUsername:recipient,messageText:content.template,
    messageMedia:[{mediaName:"ELYON-Rechnung-"+record.invoiceNumber+".pdf",
      mediaType:"PDF",mediaUrl:url}],
  };
  try{
    const response=await callEbayJson("https://api.ebay.com/commerce/message/v1/send_message",{
      method:"POST",headers:{Authorization:"Bearer "+session.accessToken,
        "Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(requestBody),
    });
    const messageId=text(response?.messageId||response?.message?.messageId);
    if(!messageId)throw new Error("eBay hat keine eindeutige Nachrichten-ID bestätigt.");
    const saved=await writeFinanceState({orderOperations:{[orderId]:{
      messageDispatch:{status:"sent",attemptId,invoiceNumber:record.invoiceNumber,
        messageId,sentAt:new Date().toISOString()}
    }}},{
      action:"invoice_message_sent",actor:"seller",source:"orders_customer_message",
      summary:"eBay hat die Rechnungsnachricht mit Nachrichten-ID bestätigt."
    });
    if(!saved.ok)return res.status(503).json({
      ok:false,error:"message_sent_recording_failed",
      message:"eBay hat den Versand bestätigt, die interne Speicherung aber nicht. Nicht erneut senden; eBay-Nachrichten prüfen."
    });
    return res.status(200).json({ok:true,messageId,
      message:"Rechnungs-PDF und Dankesnachricht wurden von eBay als versendet bestätigt."});
  } catch(error){
    await writeFinanceState({orderOperations:{[orderId]:{
      messageDispatch:{status:"unknown",attemptId,invoiceNumber:record.invoiceNumber,
        checkedAt:new Date().toISOString(),error:"Versandstatus manuell bei eBay prüfen"}
    }}},{
      action:"invoice_message_send_uncertain",actor:"seller",source:"orders_customer_message",
      summary:"Unklarer Nachrichtenversand. Automatische Wiederholung gesperrt."
    }).catch(()=>{});
    return res.status(502).json({
      ok:false,error:"message_delivery_uncertain",
      message:"eBay-Versand nicht eindeutig bestätigt. Bitte im eBay-Nachrichtenfach prüfen; keine automatische Wiederholung. "+text(error.message)
    });
  }
}

export default async function handler(req,res){
  if(!requireSellerAccess(req,res,{maxBodyBytes:8*1024}))return;
  try {
    if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"method_not_allowed"});
    if(req.method==="GET"){
      const state=await readFinanceState();
      const orderId=text(req.query?.orderId);
      return res.status(200).json({
        ok:true,revision:state.revision,
        template:state.settings?.orderThankYouTemplate||DEFAULT_ORDER_THANK_YOU,
        sendReady:messageDeliveryEnabled()&&getFinanceStoreDescription().persistent===true,
        attachmentBase:attachmentBaseStatus(process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL),
        invoice:validOrder(orderId)&&state.invoiceMeta?.[orderId]?.immutable===true
          ? {invoiceNumber:state.invoiceMeta[orderId].invoiceNumber} : null,
        delivery:validOrder(orderId)?delivery(state.orderOperations?.[orderId]):null,
      });
    }
    const body=req.body&&typeof req.body==="object"&&!Array.isArray(req.body)?req.body:{};
    if(body.action==="save-template")return await saveTemplate(req,res,body);
    if(body.action==="send-invoice")return await sendInvoiceMessage(req,res,body);
    return res.status(400).json({ok:false,error:"invalid_action"});
  }catch(error){return res.status(Number(error?.status||503)).json({
    ok:false,error:"customer_message_unavailable",message:text(error?.message)||"Nachrichtenfunktion nicht verfügbar."
  });}
}
