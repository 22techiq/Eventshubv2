const $ = selector => document.querySelector(selector);
let token = "", reader = null, loginBusy = false, scanBusy = false;
async function call(action, data = {}) { return window.EventHubAPI.request(action, data); }
function setLoginFeedback(state, message = "") {
  const button = $("#scannerSignInBtn"), status = $("#scannerLoginStatus"), error = $("#result");
  if (state === "loading") {
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>Verifying access…</span>';
    status.textContent = "Connecting to EventHub and checking your staff permissions. Please wait.";
    status.className = "form-status is-loading";
    error.textContent = "";
  } else {
    button.disabled = false;
    button.textContent = "Sign in";
    status.textContent = "";
    status.className = "form-status";
    if (state === "error") error.textContent = message;
  }
}
function showResult(data) {
  const element = $("#result");
  element.className = "scan-result " + (data.valid ? "good" : "bad");
  element.textContent = "";
  const heading = document.createElement("h2");
  heading.textContent = data.valid ? "✓ ENTRY APPROVED" : "✕ ENTRY DENIED";
  const message = document.createElement("b");
  message.textContent = data.message || "Unable to validate ticket.";
  const detail = document.createElement("p");
  detail.textContent = [data.ticketCode, data.eventName, data.ticketType].filter(Boolean).join(" · ");
  element.append(heading, message, detail);
}
async function verify(qrToken) {
  if (scanBusy) return;
  scanBusy = true;
  showResult({ valid: false, message: "Checking ticket with EventHub…" });
  try {
    const data = await call("checkIn", { token, qrToken, gate: "Main" });
    showResult(data);
  } catch (error) {
    showResult({ valid: false, message: error.message || "Ticket verification failed." });
  } finally { scanBusy = false; }
}
$("#loginForm").onsubmit = async event => {
  event.preventDefault();
  if (loginBusy) return;
  loginBusy = true;
  setLoginFeedback("loading");
  const fields = new FormData(event.currentTarget);
  try {
    const data = await call("login", { email: fields.get("email"), password: fields.get("password") });
    if (!["ADMIN", "GATE"].includes(data.user.role)) throw new Error("This account is not authorized for gate access.");
    token = data.token;
    $("#loginForm").classList.add("hidden");
    $("#scanner").classList.remove("hidden");
    $("#result").className = "scan-result";
    $("#result").textContent = "Signed in successfully. You can now scan tickets.";
  } catch (error) {
    setLoginFeedback("error", error.message || "Unable to sign in. Please try again.");
  } finally { loginBusy = false; }
};
$("#manualForm").onsubmit = event => {
  event.preventDefault();
  const value = new FormData(event.currentTarget).get("qrToken");
  verify(String(value || "").trim());
};
$("#startCamera").onclick = async () => {
  const button = $("#startCamera");
  button.disabled = true;
  button.textContent = "Starting camera…";
  try {
    if (!window.ZXing) throw new Error("The camera scanner library could not be loaded. Use manual QR entry instead.");
    if (reader) reader.reset();
    reader = new ZXing.BrowserMultiFormatReader();
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    if (!devices.length) throw new Error("No camera was found on this device.");
    await reader.decodeFromVideoDevice(devices[0].deviceId, $("#video"), (result) => {
      if (result && !scanBusy) {
        reader.reset();
        button.disabled = false;
        button.textContent = "Start camera scanner";
        verify(result.getText());
      }
    });
    button.textContent = "Camera active — scan a ticket";
  } catch (error) {
    button.disabled = false;
    button.textContent = "Start camera scanner";
    showResult({ valid: false, message: error.message });
  }
};
