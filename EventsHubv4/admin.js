const $ = (s) => document.querySelector(s);
let token = sessionStorage.getItem("eh_token") || "";
let busy = false;

async function call(action, data = {}) {
  return window.EventHubAPI.request(action, data);
}
function money(n) { return "KSh " + Number(n || 0).toLocaleString("en-KE"); }
function setLoginState(state, message = "") {
  const button = $("#signInBtn");
  const status = $("#loginStatus");
  const error = $("#loginError");
  if (state === "loading") {
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>Signing in…</span>';
    status.textContent = "Connecting securely to EventHub and verifying your details. Please wait.";
    status.className = "form-status is-loading";
    error.textContent = "";
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = "Sign in";
    if (state === "success") {
      status.textContent = message || "Sign-in successful. Loading your dashboard…";
      status.className = "form-status is-success";
      error.textContent = "";
    } else if (state === "error") {
      status.textContent = "";
      status.className = "form-status";
      error.textContent = message;
    } else {
      status.textContent = "";
      status.className = "form-status";
      error.textContent = "";
    }
  }
}
function setActionState(form, loading, label) {
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>' + label + '</span>';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || label;
  }
}
async function refresh() {
  const d = await call("dashboard", { token });
  $("#welcome").textContent = "Signed in as " + d.user.name;
  $("#sEvents").textContent = d.stats.events;
  $("#sPublished").textContent = d.stats.published;
  $("#sTickets").textContent = d.stats.ticketsSold;
  $("#sRevenue").textContent = money(d.stats.revenue);
  const e = await call("listEventsAdmin", { token });
  $("#eventList").innerHTML = e.events.map(x => `<div class="event-row"><span><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.venue)} · ${escapeHtml(x.status)}</small></span><span>${x.startsAt ? new Date(x.startsAt).toLocaleDateString() : "—"}</span></div>`).join("") || "No events created.";
  $("#eventSelect").innerHTML = '<option value="">Choose an event</option>' + e.events.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join("");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function enter() {
  await refresh();
  $("#loginPanel").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
}
$("#loginForm").onsubmit = async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  setLoginState("loading");
  const form = event.currentTarget;
  const fields = new FormData(form);
  try {
    const data = await call("login", { email: fields.get("email"), password: fields.get("password") });
    token = data.token;
    sessionStorage.setItem("eh_token", token);
    await enter();
    setLoginState("success", "Signed in successfully.");
  } catch (error) {
    token = "";
    sessionStorage.removeItem("eh_token");
    setLoginState("error", error.message || "Unable to sign in. Please try again.");
  } finally {
    busy = false;
    if (!$("#dashboard").classList.contains("hidden")) {
      $("#signInBtn").disabled = false;
    }
  }
};

$("#eventForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const eventData = Object.fromEntries(fields);
  eventData.startsAt = new Date(eventData.startsAt).toISOString();
  eventData.endsAt = eventData.endsAt ? new Date(eventData.endsAt).toISOString() : eventData.startsAt;
  setActionState(form, true, "Creating event…");
  $("#eventMsg").textContent = "Saving event to your EventHub database…";
  try {
    await call("createEvent", { token, event: eventData });
    $("#eventMsg").textContent = "Event created successfully.";
    form.reset();
    await refresh();
  } catch (error) { $("#eventMsg").textContent = error.message; }
  finally { setActionState(form, false); }
};

$("#typeForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  setActionState(form, true, "Adding ticket type…");
  $("#typeMsg").textContent = "Saving ticket category…";
  try {
    await call("createTicketType", { token, ticketType: { eventId: fields.get("eventId"), name: fields.get("name"), price: Number(fields.get("price")), quantity: Number(fields.get("quantity")) } });
    $("#typeMsg").textContent = "Ticket category added successfully.";
    form.reset();
    await refresh();
  } catch (error) { $("#typeMsg").textContent = error.message; }
  finally { setActionState(form, false); }
};

$("#logoutBtn").onclick = () => {
  sessionStorage.removeItem("eh_token");
  token = "";
  location.reload();
};
if (token) {
  $("#loginPanel").classList.add("hidden");
  enter().catch(error => {
    token = "";
    sessionStorage.removeItem("eh_token");
    $("#loginPanel").classList.remove("hidden");
    setLoginState("error", error.message || "Your session has expired. Please sign in again.");
  });
}
