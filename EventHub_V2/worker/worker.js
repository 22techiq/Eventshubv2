export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = allowed.includes(origin) ? origin : (allowed.includes("*") ? "*" : "");
    const headers = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return Response.json({ ok:false, error:"POST required" }, { status:405, headers });
    if (!corsOrigin || (origin && !allowed.includes(origin) && !allowed.includes("*")))
      return Response.json({ ok:false, error:"Origin not allowed" }, { status:403, headers });
    if (!env.GAS_WEB_APP_URL || !env.BRIDGE_SECRET)
      return Response.json({ ok:false, error:"Worker configuration incomplete" }, { status:500, headers });
    try {
      const body = await request.json();
      // Never allow a browser caller to override the server-held bridge secret.
      delete body.bridge_secret;
      const upstream = await fetch(env.GAS_WEB_APP_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ ...body, bridge_secret:env.BRIDGE_SECRET },)
      });
      const raw = await upstream.text();
      let data;
      try { data = JSON.parse(raw); }
      catch (_) { data = { ok:false, error:"Unexpected Apps Script response", detail:raw.slice(0,250) }; }
      return Response.json(data, { status:upstream.ok ? 200 : 502, headers });
    } catch (error) {
      return Response.json({ ok:false, error:"Backend request failed" }, { status:502, headers });
    }
  }
};
