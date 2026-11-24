const $ = (s) => document.querySelector(s);
let events = [];
let activeEvent = null;

async function api(action, data = {}) { return window.EventHubAPI.request(action, data); }
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3000)}
function dateText(v){if(!v)return "Date to be announced";const d=new Date(v);return isNaN(d)?"":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}
function money(v){return "KSh "+Number(v||0).toLocaleString("en-KE")}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadEvents(){
  try{const data=await api("publicEvents");events=data.events||[];renderEvents()}
  catch(e){$("#eventGrid").innerHTML='<div class="empty-state">Events could not be loaded. Please try again later.</div>';$("#eventCount").textContent="";}
}
function renderEvents(){
  const q=$("#searchInput").value.toLowerCase(), cat=$("#categoryFilter").value;
  const list=events.filter(e=>(!cat||e.category===cat)&&[e.name,e.venue,e.category,e.description].join(" ").toLowerCase().includes(q));
  $("#eventCount").textContent=`${list.length} event${list.length===1?"":"s"}`;
  $("#eventGrid").innerHTML=list.length?list.map(e=>`<article class="event-card"><div class="event-cover"><span>${esc((e.category||"EVENT").toUpperCase())}</span></div><div class="event-info"><h3>${esc(e.name)}</h3><div class="event-meta">◷ ${esc(dateText(e.startsAt))}<br>⌖ ${esc(e.venue||"Venue to be announced")}</div><div class="event-bottom"><span class="price">${e.minPrice?`From ${money(e.minPrice)}`:"See ticket prices"}</span><button class="small-btn" data-event="${esc(e.id)}">View event →</button></div></div></article>`).join(""):'<div class="empty-state">No matching events found.</div>';
  document.querySelectorAll("[data-event]").forEach(b=>b.onclick=()=>openEvent(b.dataset.event));
}
async function openEvent(id){
  try{
    const d=await api("getEvent",{eventId:id});activeEvent=d.event;
    const e=d.event;
    $("#eventModalBody").innerHTML=`<span class="eyebrow">${esc(e.category||"EVENT")}</span><h2>${esc(e.name)}</h2><p class="muted">◷ ${esc(dateText(e.startsAt))} &nbsp; · &nbsp; ⌖ ${esc(e.venue||"Venue TBA")}</p><p>${esc(e.description||"Join us for this event.")}</p><h3>Choose your tickets</h3><div id="ticketChoices">${e.ticketTypes.map(t=>`<div class="ticket-type"><div><b>${esc(t.name)}</b><small>${money(t.price)} · ${Number(t.available)} available</small></div><input type="number" min="0" max="${Number(t.available)}" value="0" data-type="${esc(t.id)}" aria-label="Quantity"></div>`).join("")}</div><form id="checkoutForm" class="stack"><input name="firstName" placeholder="First name" required maxlength="45"><input name="lastName" placeholder="Last name" required maxlength="45"><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone (e.g. 2547XXXXXXXX)" required><button class="btn btn-primary">Continue to secure payment →</button></form><p class="muted">Payments are processed securely by IntaSend. M-Pesa and cards are shown according to your checkout account settings.</p>`;
    $("#eventModal").classList.add("open");
    $("#checkoutForm").onsubmit=submitBooking;
  }catch(e){toast(e.message)}
}
async function submitBooking(ev){
  ev.preventDefault();
  const f=new FormData(ev.target), quantities=[...document.querySelectorAll("[data-type]")].map(x=>({ticketTypeId:x.dataset.type,quantity:Number(x.value)})).filter(x=>x.quantity>0);
  if(!quantities.length)return toast("Choose at least one ticket.");
  const btn=ev.target.querySelector("button");btn.disabled=true;btn.textContent="Preparing secure checkout…";
  try{
    const d=await api("createBooking",{eventId:activeEvent.id,customer:{firstName:f.get("firstName"),lastName:f.get("lastName"),email:f.get("email"),phone:f.get("phone")},items:quantities});
    window.location.href=d.checkoutUrl;
  }catch(e){toast(e.message);btn.disabled=false;btn.textContent="Continue to secure payment →"}
}
$("#searchInput").addEventListener("input",renderEvents);
$("#categoryFilter").addEventListener("change",renderEvents);
$("#myTicketsBtn").onclick=()=>$("#ticketsModal").classList.add("open");
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest(".modal").classList.remove("open"));
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open")}));
$("#lookupForm").onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target),out=$("#lookupResult");out.textContent="Searching…";
  try{const d=await api("getBookingStatus",{bookingRef:f.get("bookingRef"),email:f.get("email")});
    out.innerHTML=(d.tickets||[]).map(t=>`<div class="ticket-result"><b>${esc(t.eventName)} — ${esc(t.ticketType)}</b><br>Ticket: ${esc(t.ticketCode)} · ${esc(t.status)}<br>${t.pdfUrl?`<a href="${esc(t.pdfUrl)}" target="_blank" rel="noopener">Open ticket PDF</a>`:"Ticket PDF was sent to your email."}</div>`).join("")||"No tickets found for this booking.";
  }catch(err){out.textContent=err.message}
};
$("#year").textContent=new Date().getFullYear();
loadEvents();
