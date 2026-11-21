// Deterministic, dependency-free A4 invoice PDF for immutable ELYON invoice snapshots.
// Layout inspired by DIN 5008 form B. Never constructs invoice data or tax decisions.
const mm = (n) => n * 72 / 25.4;
const W = mm(210), H = mm(297);
const COLOR = { ink:[0.13,0.20,0.30], sub:[0.37,0.44,0.52], pale:[0.91,0.93,0.95], line:[0.80,0.84,0.88], white:[1,1,1] };
const CP1252 = {8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,
  710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,
  8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,
  8250:155,339:156,382:158,376:159 };
function bytesFor(value) {
  const bytes = [];
  for (const char of String(value ?? "")) {
    const cp = char.codePointAt(0);
    const byte = cp < 128 || cp >= 160 && cp <= 255 ? cp : CP1252[cp];
    if (byte === undefined) throw new Error("PDF-Schrift unterstützt dieses Zeichen nicht: U+" + cp.toString(16).toUpperCase());
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}
function hex(value) { return bytesFor(value).toString("hex").toUpperCase(); }
function fmt(n) { return Number(n.toFixed(2)).toString(); }
function rgb(c) { return c.map(fmt).join(" "); }
function widthGuess(value, size) {
  let units=0;
  for(const ch of String(value)) {
    units += "ilI1.,:;! |".includes(ch) ? .27 : "MW@QÖÜÄ".includes(ch) ? .85 :
      "mw".includes(ch) ? .73 : /[A-Z0-9]/.test(ch) ? .63 : .54;
  }
  return units * size;
}
function wrap(value, maxWidth, size, {maxLines=80}={}) {
  const result=[];
  for(const paragraph of String(value??"").split(/\r?\n/)) {
    if(!paragraph.trim()){result.push("");continue;}
    let line="";
    for(const word of paragraph.trim().split(/\s+/)) {
      if(!word)continue;
      const next=line ? line+" "+word : word;
      if(line && widthGuess(next,size)>maxWidth){result.push(line);line="";}
      if(widthGuess(word,size)>maxWidth) {
        let part="";
        for(const c of word) {
          if(part && widthGuess(part+c,size)>maxWidth){result.push(part);part="";}
          part+=c;
        }
        line=part;
      } else line=line ? line+" "+word : word;
      if(result.length>maxLines) throw new Error("PDF-Text übersteigt das unterstützte Layout.");
    }
    if(line)result.push(line);
  }
  if(result.length>maxLines) throw new Error("PDF-Text übersteigt das unterstützte Layout.");
  return result;
}
function asDate(value) {
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error("Rechnungsdatum ungültig.");
  return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Berlin"}).format(d);
}
function euro(value) {
  if(!Number.isFinite(Number(value))) throw new Error("Betrag ungültig.");
  return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(value));
}
function assertInvoice(invoice) {
  if(!invoice || invoice.taxMode!=="small_business" || invoice.currency!=="EUR" ||
    !invoice.invoiceNumber || !invoice.orderId || !invoice.seller?.name ||
    !invoice.seller?.taxId || !invoice.buyer?.name ||
    !Array.isArray(invoice.lineItems) || !invoice.lineItems.length) {
    throw new Error("Nur vollständig ausgestellte, deutsche Kleinunternehmer-Rechnungen können exportiert werden.");
  }
  if(!Number.isFinite(Number(invoice.total))) throw new Error("Rechnungsbetrag fehlt.");
}
export function createKleinunternehmerInvoicePdf(invoice) {
  assertInvoice(invoice);
  const pages=[];
  let cmds=[];
  const ink=COLOR.ink, muted=COLOR.sub, line=COLOR.line;
  function newPage(continuation=false){
    cmds=[];pages.push(cmds);
    rect(mm(20),mm(270),mm(171),.55,line);
    txt(mm(20),mm(278),invoice.seller.brand||"ELYON",8.5,true,ink);
    txt(mm(20),mm(284),invoice.seller.name,7.8,false,muted);
    txt(mm(190),mm(278),"Rechnung "+invoice.invoiceNumber,7.3,false,muted,"right");
    if(continuation) {
      txt(mm(20),mm(24),invoice.seller.brand||"ELYON",16,true,ink);
      txt(mm(190),mm(24),"RECHNUNG · FORTSETZUNG",9,true,muted,"right");
      rect(mm(20),mm(30),mm(171),.5,line);
    } else {
      txt(mm(20),mm(24),invoice.seller.brand||"ELYON",17,true,ink);
      txt(mm(20),mm(31),"Rechnung und Bestellübersicht",8.6,false,muted);
      rect(mm(20),mm(36),mm(171),.6,ink);
      // DIN 5008 form B-style address field: 20mm from left, beginning about 45mm from top.
      txt(mm(20),mm(51),invoice.seller.name+" · "+invoice.seller.addressLine1+" · "+invoice.seller.postalCode+" "+invoice.seller.city,7,false,muted);
      rect(mm(20),mm(54),mm(85),.35,line);
      let addrY=mm(65);
      const buyer=[invoice.buyer.name,invoice.buyer.addressLine1,invoice.buyer.addressLine2,
        [invoice.buyer.postalCode,invoice.buyer.city].filter(Boolean).join(" "),
        invoice.buyer.country==="DE"?"Deutschland":invoice.buyer.country].filter(Boolean);
      for(const part of buyer) {
        for(const chunk of wrap(part,mm(81),10.3,{maxLines:6})) { txt(mm(20),addrY,chunk,10.3,false,ink);addrY+=13; }
      }
      txt(mm(123),mm(51),"RECHNUNG",13,true,ink);
      const metadata=[
        ["Rechnungsnummer",invoice.invoiceNumber],["Rechnungsdatum",asDate(invoice.issuedAt)],
        ["Bestelldatum",asDate(invoice.orderedAt)],["eBay-Bestellung",invoice.orderId],
      ];
      let top=mm(62);
      for(const [label,value] of metadata){
        txt(mm(123),top,label,8,false,muted);
        const arr=wrap(String(value),mm(67),8.5,{maxLines:4});
        for(const str of arr){txt(mm(123),top+11,str,8.5,true,ink);top+=11;}
        top+=17;
      }
      txt(mm(20),mm(117),"Rechnung für Ihre Bestellung",13,true,ink);
      txt(mm(20),mm(125),"Vielen Dank für Ihren Einkauf. Wir berechnen folgende Positionen:",9,false,muted);
    }
  }
  function txt(x,top,value,size=9,bold=false,color=ink,align="left"){
    const content=String(value??"");
    if(!content)return;
    const px=align==="right"?x-widthGuess(content,size):x;
    cmds.push("BT /"+(bold?"F2":"F1")+" "+fmt(size)+" Tf "+rgb(color)+" rg 1 0 0 1 "+fmt(px)+" "+fmt(H-top)+" Tm <"+hex(content)+"> Tj ET");
  }
  function rect(x,top,w,height,color=line) {
    cmds.push(rgb(color)+" rg "+fmt(x)+" "+fmt(H-top-height)+" "+fmt(w)+" "+fmt(height)+" re f");
  }
  function tableHeading(top) {
    rect(mm(20),top,mm(171),25,COLOR.pale);
    txt(mm(22),top+16,"Pos.",8,true,ink);
    txt(mm(34),top+16,"Artikel / Beschreibung",8,true,ink);
    txt(mm(154),top+16,"Menge",8,true,ink,"right");
    txt(mm(189),top+16,"Betrag",8,true,ink,"right");
    return top+25;
  }
  function row(top,idx,description,quantity,total,sku="") {
    const titleLines=wrap(description,mm(109),9.25,{maxLines:45});
    const skuLines=sku?wrap("SKU: "+sku,mm(109),7.3,{maxLines:12}):[];
    const height=Math.max(35,14+titleLines.length*12+skuLines.length*9);
    if(top+height>mm(251)) return null;
    txt(mm(22),top+16,String(idx),9,false,muted);
    let y=top+16;
    for(const part of titleLines){txt(mm(34),y,part,9.25,false,ink);y+=12;}
    for(const part of skuLines){txt(mm(34),y,part,7.3,false,muted);y+=9;}
    txt(mm(154),top+16,String(quantity),9,false,ink,"right");
    txt(mm(189),top+16,euro(total),9,true,ink,"right");
    rect(mm(20),top+height-.7,mm(171),.5,line);
    return top+height;
  }
  newPage(false);
  let y=tableHeading(mm(133));
  const items=[
    ...invoice.lineItems.map((item,index)=>({number:index+1,description:item.title,qty:item.quantity,total:item.total,sku:item.sku})),
    ...(invoice.shipping?[{number:"",description:"Versandkosten",qty:1,total:invoice.shipping}]:[]),
    ...(invoice.discount?[{number:"",description:"Rabatt",qty:1,total:-invoice.discount}]:[]),
  ];
  for(const item of items) {
    if(!item.description || !Number.isFinite(Number(item.total)))throw new Error("Rechnungsposition ist unvollständig.");
    let next=row(y,item.number,item.description,item.qty,item.total,item.sku);
    if(next===null){
      newPage(true);y=tableHeading(mm(40));
      next=row(y,item.number,item.description,item.qty,item.total,item.sku);
      if(next===null)throw new Error("Rechnungsposition ist zu lang für eine A4-Seite.");
    }
    y=next;
  }
  // The sum and tax note are kept together; never print into the footer.
  const noteLines=wrap(invoice.note||"",mm(159),8.7,{maxLines:8});
  const summaryHeight=55+Math.max(35,25+noteLines.length*12);
  if(y+summaryHeight>mm(259)) {newPage(true);y=mm(48);}
  y+=20;
  rect(mm(115),y-10,mm(76),.7,ink);
  txt(mm(115),y+11,"Rechnungsbetrag",11,true,ink);
  txt(mm(189),y+11,euro(invoice.total),13,true,ink,"right");
  y+=32;
  const noteHeight=20+noteLines.length*12;
  rect(mm(20),y-8,mm(171),noteHeight+6,COLOR.pale);
  txt(mm(25),y+4,"Hinweis zur Kleinunternehmerregelung",8.4,true,ink);
  let ny=y+18;
  for(const part of noteLines) {txt(mm(25),ny,part,8.7,false,ink);ny+=12;}
  const pageCount=pages.length;
  for(let i=0;i<pageCount;i++) {
    const content=pages[i];
    content.push("BT /F1 7.6 Tf "+rgb(muted)+" rg 1 0 0 1 "+fmt(mm(190)-widthGuess("Seite "+(i+1)+" von "+pageCount,7.6))+
      " "+fmt(H-mm(284))+" Tm <"+hex("Seite "+(i+1)+" von "+pageCount)+"> Tj ET");
  }
  const obj=[];
  const add=(value)=>{obj.push(Buffer.isBuffer(value)?value:Buffer.from(value,"latin1"));return obj.length;};
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds=pages.map((_,i)=>5+i*2);
  add("<< /Type /Pages /Count "+pages.length+" /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  for(let i=0;i<pages.length;i++) {
    const pageId=5+i*2,streamId=pageId+1;
    add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+fmt(W)+" "+fmt(H)+
      "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+streamId+" 0 R >>");
    const stream=Buffer.from(pages[i].join("\n")+"\n","latin1");
    add(Buffer.concat([Buffer.from("<< /Length "+stream.length+" >>\nstream\n","latin1"),stream,Buffer.from("endstream","latin1")]));
  }
  let bytes=Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","latin1");
  const offsets=[0];
  for(let i=0;i<obj.length;i++) {
    offsets.push(bytes.length);
    bytes=Buffer.concat([bytes,Buffer.from((i+1)+" 0 obj\n","latin1"),obj[i],Buffer.from("\nendobj\n","latin1")]);
  }
  const xrefAt=bytes.length;
  const xref=["xref","0 "+(obj.length+1),"0000000000 65535 f "];
  for(let i=1;i<offsets.length;i++) xref.push(String(offsets[i]).padStart(10,"0")+" 00000 n ");
  xref.push("trailer","<< /Size "+(obj.length+1)+" /Root 1 0 R >>","startxref",String(xrefAt),"%%EOF");
  return Buffer.concat([bytes,Buffer.from(xref.join("\n")+"\n","latin1")]);
}
