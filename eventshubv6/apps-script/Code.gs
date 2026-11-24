/**
 * EventHub by McOwino — Apps Script backend
 * Configure Script Properties before deployment. Never put API secrets in the frontend.
 */
const SHEETS = {
  Users:["id","name","email","passwordHash","role","status","createdAt"],
  Events:["id","name","category","description","venue","startsAt","endsAt","status","bannerUrl","createdAt","updatedAt"],
  TicketTypes:["id","eventId","name","price","quantity","sold","status","createdAt"],
  Bookings:["id","bookingRef","eventId","customerName","email","phone","amount","currency","status","checkoutId","invoiceId","createdAt","updatedAt","expiresAt"],
  BookingItems:["id","bookingId","ticketTypeId","ticketName","quantity","unitPrice","lineTotal"],
  Tickets:["id","bookingId","bookingRef","eventId","eventName","ticketTypeId","ticketType","ticketCode","qrToken","status","issuedAt","checkedInAt","checkedInBy"],
  CheckIns:["id","ticketId","ticketCode","staffEmail","gate","result","createdAt"],
  Transactions:["id","bookingId","invoiceId","apiRef","amount","currency","state","provider","providerRef","rawJson","createdAt","updatedAt"],
  AuditLogs:["id","actor","action","entity","entityId","details","createdAt"]
};

function setupEventHub(){
  const ss=SpreadsheetApp.openById(prop_("SPREADSHEET_ID"));
  Object.keys(SHEETS).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if(!sh) sh=ss.insertSheet(name);
    if(sh.getLastRow()===0) sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  });
  return "EventHub sheets are ready.";
}

function doGet(e){
  return json_({ok:true,service:"EventHub API",version:"1.0.0"});
}

function doPost(e){
  let body={};
  try{
    // IntaSend sends a raw JSON webhook. Browser requests arrive as a normal
    // HTML form field named "payload" and are answered through the iframe bridge.
    if(e && e.parameter && e.parameter.payload){
      body=JSON.parse(e.parameter.payload);
      const requestId=String(body._requestId||"");
      let result;
      try{
        const out=route_(body);
        result=Object.assign({ok:true},out||{});
      }catch(err){
        console.error(err.stack||err);
        result={ok:false,error:err.message||"Request failed"};
      }
      return iframeResponse_(result,requestId);
    }
    body=JSON.parse((e.postData&&e.postData.contents)||"{}");
    if(body.topic==="collection_event") return handleWebhook_(body);
    return json_({ok:false,error:"Unsupported request. Use the EventHub website."});
  }catch(err){
    console.error(err.stack||err);
    if(body && body._requestId) return iframeResponse_({ok:false,error:err.message||"Invalid request"},String(body._requestId));
    return json_({ok:false,error:err.message||"Invalid request"});
  }
}

function iframeResponse_(result,requestId){
  // Escape script-breaking characters before embedding serialized data in HTML.
  const safe=JSON.stringify(result).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
  const rid=JSON.stringify(String(requestId||""));
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body><script>'+
    // HtmlService can wrap the returned document in a sandboxed frame. Send the
    // response to the top-level GitHub Pages window, not only the immediate parent.
    'try{window.top.postMessage({type:"EVENTHUB_RESPONSE",requestId:'+rid+',result:'+safe+'},"*");}catch(e){try{window.parent.postMessage({type:"EVENTHUB_RESPONSE",requestId:'+rid+',result:'+safe+'},"*");}catch(_){}}'+
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function route_(b){
  switch(b.action){
    case "publicEvents": return {events:publicEvents_()};
    case "getEvent": return {event:getEvent_(b.eventId)};
    case "createBooking": return createBooking_(b);
    case "getBookingStatus": return getBookingStatus_(b);
    case "login": return login_(b);
    case "dashboard": return dashboard_(auth_(b.token));
    case "createEvent": return createEvent_(b);
    case "updateEvent": return updateEvent_(b);
    case "createTicketType": return createTicketType_(b);
    case "listEventsAdmin": return {events:allEvents_(auth_(b.token))};
    case "listTickets": return {tickets:listTickets_(auth_(b.token),b.eventId)};
    case "checkIn": return checkIn_(b);
    default: throw new Error("Unknown action");
  }
}

function db_(){return SpreadsheetApp.openById(prop_("SPREADSHEET_ID"));}
function prop_(k){const v=PropertiesService.getScriptProperties().getProperty(k);if(!v)throw new Error("Missing Script Property: "+k);return v;}
function sheet_(n){const s=db_().getSheetByName(n);if(!s)throw new Error("Missing sheet "+n+"; run setupEventHub().");return s;}
function rows_(n){
  const sh=sheet_(n),v=sh.getDataRange().getValues();if(v.length<2)return [];
  const h=v[0];return v.slice(1).map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=r[j]);return o;});
}
function append_(n,o){const h=SHEETS[n];sheet_(n).appendRow(h.map(k=>o[k]===undefined?"":o[k]));}
function updateRow_(n,row,o){const h=SHEETS[n],sh=sheet_(n);h.forEach((k,i)=>{if(o[k]!==undefined)sh.getRange(row,i+1).setValue(o[k]);});}
function id_(){return Utilities.getUuid();}
function ref_(){return "EH-"+Utilities.getUuid().replace(/-/g,"").slice(0,12).toUpperCase();}
function token_(){return Utilities.getUuid().replace(/-/g,"")+Utilities.getUuid().replace(/-/g,"");}
function now_(){return new Date().toISOString();}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function safeEqual_(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function publicEvents_(){
  const es=rows_("Events").filter(e=>e.status==="PUBLISHED"&&new Date(e.endsAt||e.startsAt)>=new Date());
  return es.map(e=>{const ts=rows_("TicketTypes").filter(t=>t.eventId===e.id&&t.status==="ACTIVE");return Object.assign(eventPublic_(e),{minPrice:ts.length?Math.min(...ts.map(t=>Number(t.price))):0});});
}
function eventPublic_(e){return {id:e.id,name:e.name,category:e.category,description:e.description,venue:e.venue,startsAt:e.startsAt,endsAt:e.endsAt,bannerUrl:e.bannerUrl,status:e.status};}
function getEvent_(id){
  const e=rows_("Events").find(x=>x.id===id&&x.status==="PUBLISHED");if(!e)throw new Error("Event not found.");
  const types=rows_("TicketTypes").filter(t=>t.eventId===id&&t.status==="ACTIVE").map(t=>({id:t.id,name:t.name,price:Number(t.price),available:Math.max(0,Number(t.quantity)-Number(t.sold))}));
  return Object.assign(eventPublic_(e),{ticketTypes:types});
}
function createBooking_(b){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ev=getEvent_(b.eventId),items=b.items||[],c=b.customer||{};
    if(!c.firstName||!c.lastName||!c.email||!c.phone)throw new Error("Complete all customer details.");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email))throw new Error("Enter a valid email address.");
    if(!items.length)throw new Error("Select at least one ticket.");
    const types=rows_("TicketTypes"),chosen=[],amount=0;
    let total=0;
    items.forEach(i=>{
      const t=types.find(x=>x.id===i.ticketTypeId&&x.eventId===ev.id&&x.status==="ACTIVE");
      const q=Math.floor(Number(i.quantity));
      if(!t||q<1||q>20)throw new Error("Invalid ticket selection.");
      if(Number(t.quantity)-Number(t.sold)<q)throw new Error("Not enough tickets remain for "+t.name+".");
      chosen.push({t,q});total+=Number(t.price)*q;
    });
    if(total<=0)throw new Error("Invalid booking amount.");
    const bookingId=id_(),bookingRef=ref_(),stamp=now_();
    append_("Bookings",{id:bookingId,bookingRef,eventId:ev.id,customerName:c.firstName+" "+c.lastName,email:c.email,phone:normalizePhone_(c.phone),amount:total,currency:"KES",status:"PENDING",createdAt:stamp,updatedAt:stamp,expiresAt:new Date(Date.now()+15*60*1000).toISOString()});
    chosen.forEach(x=>{
      append_("BookingItems",{id:id_(),bookingId,ticketTypeId:x.t.id,ticketName:x.t.name,quantity:x.q,unitPrice:x.t.price,lineTotal:Number(x.t.price)*x.q});
      updateRow_("TicketTypes",x.t._row,{sold:Number(x.t.sold)+x.q});
    });
    const checkout=createCheckout_(bookingRef,total,c,ev);
    const bk=rows_("Bookings").find(x=>x.id===bookingId);
    updateRow_("Bookings",bk._row,{checkoutId:checkout.id,updatedAt:now_()});
    append_("Transactions",{id:id_(),bookingId,invoiceId:"",apiRef:bookingRef,amount:total,currency:"KES",state:"PENDING",provider:"INTASEND_CHECKOUT",rawJson:JSON.stringify(checkout),createdAt:stamp,updatedAt:stamp});
    audit_("PUBLIC","BOOKING_CREATED","Booking",bookingId,{bookingRef,amount:total});
    return {bookingRef,checkoutUrl:checkout.url};
  }finally{lock.releaseLock();}
}
function createCheckout_(bookingRef,amount,c,ev){
  const body={amount:Number(amount),currency:"KES",email:c.email,first_name:c.firstName,last_name:c.lastName,phone_number:normalizePhone_(c.phone),api_ref:bookingRef,unique_api_ref:true,redirect_url:prop_("PUBLIC_BASE_URL")+"/?payment=return&booking="+encodeURIComponent(bookingRef)};
  const res=UrlFetchApp.fetch("https://api.intasend.com/api/v1/checkout/",{method:"post",contentType:"application/json",headers:{"X-IntaSend-Public-API-Key":prop_("INTASEND_PUBLIC_KEY")},payload:JSON.stringify(body),muteHttpExceptions:true});
  const data=JSON.parse(res.getContentText()||"{}");
  if(res.getResponseCode()<200||res.getResponseCode()>=300||!data.url)throw new Error(data.detail||data.message||"Could not initialize payment checkout.");
  return data;
}
function handleWebhook_(payload){
  if(!safeEqual_(String(payload.challenge||""),prop_("INTASEND_WEBHOOK_CHALLENGE")))return json_({ok:false,error:"Invalid webhook challenge"});
  if(!payload.invoice_id)return json_({ok:true,ignored:true});
  const verified=verifyInvoice_(payload.invoice_id);
  const inv=verified.invoice||verified;
  const apiRef=String(inv.api_ref||payload.api_ref||"");
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const b=rows_("Bookings").find(x=>x.bookingRef===apiRef);
    if(!b)return json_({ok:true,unmatched:true});
    // Verify exact amount/currency/reference and COMPLETE state before issuing tickets.
    const paid=String(inv.state||inv.status||"").toUpperCase()==="COMPLETE";
    const correct=Number(inv.value)===Number(b.amount)&&String(inv.currency||"KES")==="KES"&&apiRef===b.bookingRef;
    const tx=rows_("Transactions").find(x=>x.apiRef===apiRef);
    if(tx)updateRow_("Transactions",tx._row,{invoiceId:payload.invoice_id,state:inv.state||"UNKNOWN",provider:inv.provider||"",providerRef:inv.provider_ref||inv.mpesa_reference||"",rawJson:JSON.stringify(inv),updatedAt:now_()});
    if(paid&&correct&&b.status==="PENDING"){
      // A delayed payment webhook must not issue tickets after the 15-minute
      // inventory hold has expired and the tickets may have been resold.
      const holdExpired = b.expiresAt && new Date(b.expiresAt).getTime() < Date.now();
      if(holdExpired){
        updateRow_("Bookings",b._row,{status:"PAID_REVIEW",invoiceId:payload.invoice_id,updatedAt:now_()});
        audit_("INTASEND","PAYMENT_AFTER_HOLD_EXPIRED","Booking",b.id,{invoiceId:payload.invoice_id,amount:b.amount});
      }else{
        updateRow_("Bookings",b._row,{status:"PAID",invoiceId:payload.invoice_id,updatedAt:now_()});
        issueTickets_(b);
        audit_("INTASEND","PAYMENT_CONFIRMED","Booking",b.id,{invoiceId:payload.invoice_id});
      }
    }else if(!paid&&b.status==="PENDING"&&["FAILED","CANCELED"].includes(String(inv.state||"").toUpperCase())){
      updateRow_("Bookings",b._row,{status:"PAYMENT_FAILED",updatedAt:now_()});
      releaseInventory_(b.id);
    }
    return json_({ok:true});
  }finally{lock.releaseLock();}
}
function verifyInvoice_(invoiceId){
  const res=UrlFetchApp.fetch("https://api.intasend.com/api/v1/payment/status/",{method:"post",contentType:"application/json",headers:{Authorization:"Bearer "+prop_("INTASEND_SECRET_KEY")},payload:JSON.stringify({invoice_id:invoiceId}),muteHttpExceptions:true});
  const data=JSON.parse(res.getContentText()||"{}");
  if(res.getResponseCode()<200||res.getResponseCode()>=300)throw new Error("IntaSend status verification failed.");
  return data;
}
function issueTickets_(b){
  if(rows_("Tickets").some(t=>t.bookingId===b.id))return;
  const its=rows_("BookingItems").filter(i=>i.bookingId===b.id),ev=rows_("Events").find(e=>e.id===b.eventId);
  const created=[];
  its.forEach(i=>{for(let n=0;n<Number(i.quantity);n++){
    const tk={id:id_(),bookingId:b.id,bookingRef:b.bookingRef,eventId:b.eventId,eventName:ev.name,ticketTypeId:i.ticketTypeId,ticketType:i.ticketName,ticketCode:ref_(),qrToken:token_(),status:"VALID",issuedAt:now_()};
    append_("Tickets",tk);created.push(tk);
  }});
  sendTicketEmail_(b,created);
}
function sendTicketEmail_(b,tickets){
  const blobs=tickets.map(t=>{
    const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data="+encodeURIComponent("EVENTHUB:"+t.qrToken);
    const qr=UrlFetchApp.fetch(qrUrl).getBlob().setName("qr.png");
    const qrData=Utilities.base64Encode(qr.getBytes());
    const html=`<div style="font-family:Arial;padding:24px;border:1px solid #ddd"><h2>EventHub by McOwino</h2><h3>${escapeHtml_(t.eventName)}</h3><p>${escapeHtml_(t.ticketType)} · ${escapeHtml_(t.ticketCode)}</p><img src="data:image/png;base64,${qrData}" width="180"><p>Booking ${escapeHtml_(b.bookingRef)}</p><small>Present this QR code at the entrance. Each ticket is valid for one entry.</small></div>`;
    const pdf=Utilities.newBlob(html,"text/html","ticket.html").getAs(MimeType.PDF).setName("EventHub-"+t.ticketCode+".pdf");
    // QR is also included as a separate image attachment for fallback.
    return {pdf,qr};
  });
  const attachments=blobs.map(x=>x.pdf).concat(blobs.map(x=>x.qr));
  MailApp.sendEmail({to:b.email,subject:"Your EventHub tickets — "+b.bookingRef,body:"Thank you for your booking. Your digital tickets are attached. Booking reference: "+b.bookingRef,htmlBody:"<p>Thank you for booking with <b>EventHub by McOwino</b>.</p><p>Your PDF tickets are attached. Booking reference: <b>"+escapeHtml_(b.bookingRef)+"</b>.</p>",attachments});
}
function getBookingStatus_(b){
  const booking=rows_("Bookings").find(x=>x.bookingRef===String(b.bookingRef||"").trim()&&String(x.email).toLowerCase()===String(b.email||"").toLowerCase());
  if(!booking)throw new Error("Booking not found. Check the reference and email.");
  return {status:booking.status,tickets:rows_("Tickets").filter(t=>t.bookingId===booking.id).map(t=>({ticketCode:t.ticketCode,eventName:t.eventName,ticketType:t.ticketType,status:t.status,pdfUrl:""}))};
}
function normalizePhone_(p){let s=String(p||"").replace(/[^\d+]/g,"");if(s.startsWith("+"))s=s.slice(1);if(s.startsWith("0"))s="254"+s.slice(1);if(s.startsWith("7")||s.startsWith("1"))s="254"+s;if(!/^254[17]\d{8}$/.test(s))throw new Error("Use a valid Kenyan mobile number, e.g. 2547XXXXXXXX.");return s;}
function createInitialAdmin(){
  const email=prop_("INITIAL_ADMIN_EMAIL"),password=prop_("INITIAL_ADMIN_PASSWORD");
  if(rows_("Users").some(u=>String(u.email).toLowerCase()===email.toLowerCase()))throw new Error("Admin already exists.");
  append_("Users",{id:id_(),name:"EventHub Administrator",email,passwordHash:hash_(password),role:"ADMIN",status:"ACTIVE",createdAt:now_()});
  PropertiesService.getScriptProperties().deleteProperty("INITIAL_ADMIN_PASSWORD");
  return "Initial admin created. Password property deleted.";
}
function hash_(p){const b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(p),Utilities.Charset.UTF_8);return b.map(x=>("0"+((x+256)%256).toString(16)).slice(-2)).join("");}
function login_(b){
  const email=String(b.email||"").toLowerCase(),u=rows_("Users").find(x=>String(x.email).toLowerCase()===email&&x.status==="ACTIVE");
  if(!u||u.passwordHash!==hash_(b.password||""))throw new Error("Invalid email or password.");
  const token=token_(),cache=CacheService.getScriptCache();cache.put("sess_"+token,JSON.stringify({email:u.email,role:u.role,name:u.name}),21600);
  return {token,user:{name:u.name,email:u.email,role:u.role}};
}
function auth_(token){
  const s=CacheService.getScriptCache().get("sess_"+String(token||""));if(!s)throw new Error("Session expired. Sign in again.");return JSON.parse(s);
}
function dashboard_(u){
  const ev=rows_("Events"),bk=rows_("Bookings"),tk=rows_("Tickets");
  return {user:u,stats:{events:ev.length,published:ev.filter(x=>x.status==="PUBLISHED").length,ticketsSold:tk.length,revenue:bk.filter(x=>x.status==="PAID").reduce((a,x)=>a+Number(x.amount),0),pending:bk.filter(x=>x.status==="PENDING").length}};
}
function createEvent_(b){
  const u=auth_(b.token);if(u.role!=="ADMIN")throw new Error("Admin access required.");
  const d=b.event||{};if(!d.name||!d.startsAt||!d.venue)throw new Error("Event name, start date and venue are required.");
  const id=id_(),stamp=now_();append_("Events",{id,name:d.name,category:d.category||"Other",description:d.description||"",venue:d.venue,startsAt:d.startsAt,endsAt:d.endsAt||d.startsAt,status:d.status==="PUBLISHED"?"PUBLISHED":"DRAFT",bannerUrl:d.bannerUrl||"",createdAt:stamp,updatedAt:stamp});
  audit_(u.email,"EVENT_CREATED","Event",id,{name:d.name});return {eventId:id};
}
function updateEvent_(b){
  const u=auth_(b.token);if(u.role!=="ADMIN")throw new Error("Admin access required.");
  const e=rows_("Events").find(x=>x.id===b.eventId);if(!e)throw new Error("Event not found.");
  const d=b.event||{};updateRow_("Events",e._row,{name:d.name,category:d.category,description:d.description,venue:d.venue,startsAt:d.startsAt,endsAt:d.endsAt,status:d.status,updatedAt:now_()});return {updated:true};
}
function createTicketType_(b){
  const u=auth_(b.token);if(u.role!=="ADMIN")throw new Error("Admin access required.");
  const d=b.ticketType||{},e=rows_("Events").find(x=>x.id===d.eventId);
  if(!e||!d.name||Number(d.price)<=0||Number(d.quantity)<1)throw new Error("Valid event, ticket name, price and quantity are required.");
  const id=id_();append_("TicketTypes",{id,eventId:e.id,name:d.name,price:Number(d.price),quantity:Math.floor(Number(d.quantity)),sold:0,status:"ACTIVE",createdAt:now_()});return {ticketTypeId:id};
}
function allEvents_(u){if(u.role!=="ADMIN")throw new Error("Admin access required.");return rows_("Events").map(eventPublic_);}
function listTickets_(u,eventId){if(!["ADMIN","GATE"].includes(u.role))throw new Error("Not authorized.");return rows_("Tickets").filter(t=>!eventId||t.eventId===eventId).map(t=>({ticketCode:t.ticketCode,eventName:t.eventName,ticketType:t.ticketType,status:t.status,issuedAt:t.issuedAt}));}
function checkIn_(b){
  const u=auth_(b.token);if(!["ADMIN","GATE"].includes(u.role))throw new Error("Gate access required.");
  const raw=String(b.qrToken||"").replace(/^EVENTHUB:/,""),lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const t=rows_("Tickets").find(x=>x.qrToken===raw);
    if(!t){append_("CheckIns",{id:id_(),ticketId:"",ticketCode:"",staffEmail:u.email,gate:b.gate||"Main",result:"INVALID",createdAt:now_()});return {valid:false,message:"Invalid ticket."};}
    if(t.status!=="VALID"){append_("CheckIns",{id:id_(),ticketId:t.id,ticketCode:t.ticketCode,staffEmail:u.email,gate:b.gate||"Main",result:"ALREADY_USED",createdAt:now_()});return {valid:false,message:"Ticket already used.",ticketCode:t.ticketCode};}
    updateRow_("Tickets",t._row,{status:"USED",checkedInAt:now_(),checkedInBy:u.email});
    append_("CheckIns",{id:id_(),ticketId:t.id,ticketCode:t.ticketCode,staffEmail:u.email,gate:b.gate||"Main",result:"ACCEPTED",createdAt:now_()});
    return {valid:true,message:"Entry approved.",ticketCode:t.ticketCode,eventName:t.eventName,ticketType:t.ticketType};
  }finally{lock.releaseLock();}
}
function releaseInventory_(bookingId){
  rows_("BookingItems").filter(i=>i.bookingId===bookingId).forEach(i=>{
    const t=rows_("TicketTypes").find(x=>x.id===i.ticketTypeId);
    if(t)updateRow_("TicketTypes",t._row,{sold:Math.max(0,Number(t.sold)-Number(i.quantity))});
  });
}
function audit_(actor,action,entity,entityId,details){append_("AuditLogs",{id:id_(),actor,action,entity,entityId,details:JSON.stringify(details||{}),createdAt:now_()});}
function escapeHtml_(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}


// Run this function from Apps Script once every 5 minutes using a time-driven trigger.
// It releases ticket inventory for abandoned unpaid bookings after the 15-minute hold.
function cleanupExpiredBookings(){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const now=Date.now();
    rows_("Bookings").filter(b=>b.status==="PENDING"&&b.expiresAt&&new Date(b.expiresAt).getTime()<now).forEach(b=>{
      updateRow_("Bookings",b._row,{status:"EXPIRED",updatedAt:now_()});
      releaseInventory_(b.id);
      audit_("SYSTEM","BOOKING_EXPIRED","Booking",b.id,{bookingRef:b.bookingRef});
    });
  }finally{lock.releaseLock();}
}
function installCleanupTrigger(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="cleanupExpiredBookings").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("cleanupExpiredBookings").timeBased().everyMinutes(5).create();
}
