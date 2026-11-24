/* EventHub direct Apps Script transport. No Worker, Vercel or browser CORS fetch. */
(function () {
  const API_URL = window.EVENTHUB_API_URL;
  let sequence = 0;
  function requestId() {
    return 'eh_' + Date.now().toString(36) + '_' + (++sequence) + '_' + Math.random().toString(36).slice(2);
  }
  function request(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!API_URL || API_URL.includes('https://script.google.com/macros/s/AKfycbwkWEfzz4O-ZSY6Fowq_wCJ6D2ZSZKyUTVEULLOrsTdR7oqtQgAZWiTSGfk1dSYUa1gHA/exec')) {
        reject(new Error('Configure the Apps Script Web App URL in config.js first.'));
        return;
      }
      const id = requestId();
      const frameName = 'eventhub_frame_' + id;
      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.title = 'EventHub secure request';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'display:none;width:0;height:0;border:0';
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL;
      form.target = frameName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify({ action, ...data, _requestId: id });
      form.appendChild(input);
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        form.remove();
        iframe.remove();
      };
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        err ? reject(err) : resolve(value);
      };
      const onMessage = (event) => {
        // The exact iframe Window reference and per-request nonce prevent unrelated
        // windows/messages from resolving an API call.
        if (event.source !== iframe.contentWindow || !event.data ||
            event.data.type !== 'EVENTHUB_RESPONSE' || event.data.requestId !== id) return;
        const result = event.data.result;
        if (!result || result.ok !== true) finish(new Error((result && result.error) || 'Request failed.'));
        else finish(null, result);
      };
      window.addEventListener('message', onMessage);
      const timer = setTimeout(() => finish(new Error('The server took too long to respond. Please try again.')), 60000);
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      try { form.submit(); }
      catch (err) { finish(err); }
    });
  }
  window.EventHubAPI = { request };
})();
