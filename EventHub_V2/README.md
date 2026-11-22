# EventHub by McOwino — GitHub Pages Edition

This version preserves the existing EventHub public site, admin console and gate scanner interface. The frontend is static and hosted on GitHub Pages; Google Apps Script runs the application logic; Google Sheets stores the records; IntaSend handles hosted checkout; a small Cloudflare Worker securely proxies browser API requests to Apps Script. **Vercel has been removed.**

## Project layout

- `index.html`, `admin.html`, `scanner.html`: website pages at the repository root
- `styles.css`, `app.js`, `admin.js`, `scanner.js`: original interface styles and scripts
- `config.js`: public Worker URL only (not a secret)
- `apps-script/Code.gs`: backend, Sheets, IntaSend verification, QR ticket generation, email and check-in
- `worker/worker.js`: CORS-enabled API proxy; holds the bridge secret as a Worker secret

## 1. Create the Google Sheet and Apps Script backend

1. Create a Google spreadsheet named `EventHub Database` and copy its ID.
2. Open **Extensions → Apps Script**. Paste `apps-script/Code.gs` into the project.
3. In Project Settings, enable the manifest file and replace it with `apps-script/appsscript.json`.
4. In **Project Settings → Script properties**, add:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | Your Google Sheet ID |
| `BRIDGE_SECRET` | A long random secret (same value will be stored in Cloudflare Worker) |
| `INTASEND_PUBLIC_KEY` | IntaSend publishable key |
| `INTASEND_SECRET_KEY` | IntaSend secret key |
| `INTASEND_WEBHOOK_CHALLENGE` | Exact webhook challenge configured in IntaSend |
| `ADMIN_EMAIL` | Admin notification email |
| `PUBLIC_BASE_URL` | Your GitHub Pages URL, e.g. `https://username.github.io/EventHub/` |
| `CURRENCY` | `KES` |

5. Run `setupEventHub()` once and authorize it.
6. Add `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` Script Properties. Run `createInitialAdmin()` once. The password property is deleted by that function.
7. Deploy **Deploy → New deployment → Web app**. Execute as **Me** and access **Anyone**. Copy the `/exec` URL.
8. Run `installCleanupTrigger()` once to install the five-minute expired-booking cleanup trigger.

Use IntaSend sandbox credentials for initial testing. Do not place the IntaSend secret key or bridge secret in GitHub files.

## 2. Deploy the API proxy on Cloudflare Workers (free tier is sufficient for a small MVP)

1. Create/sign in to a Cloudflare account and open **Workers & Pages → Create → Worker**.
2. Replace the starter code with `worker/worker.js` and deploy.
3. In the Worker settings, add these environment variables/secrets:
   - `GAS_WEB_APP_URL` — Apps Script `/exec` URL (text variable)
   - `BRIDGE_SECRET` — the exact long random value stored in Apps Script (mark as a secret)
   - `ALLOWED_ORIGINS` — your exact GitHub Pages origin, e.g. `https://username.github.io` (no path); if using a custom domain, include that origin too, comma-separated
4. Copy the Worker URL, e.g. `https://eventhub-api.your-subdomain.workers.dev`.
5. Open `config.js` and replace the placeholder `EVENTHUB_API_URL` with the Worker URL. Commit the file. The Worker URL is public; its secrets remain in Worker settings.

## 3. Publish on GitHub Pages

1. Create a GitHub repository, e.g. `EventHub-by-McOwino`.
2. Upload the **contents of this folder** (not the containing folder) to the repository root.
3. Go to **Settings → Pages**. Choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
4. Wait for GitHub Pages to publish. Open the generated URL.
5. Ensure the exact origin (scheme + hostname only) is included in Worker `ALLOWED_ORIGINS`.

The relative asset paths support both `https://username.github.io/repository/` and a custom domain.

## 4. Configure IntaSend webhooks

1. In IntaSend, enable KES checkout methods, including M-Pesa and cards as applicable to your account.
2. Create a webhook with endpoint set directly to the Apps Script `/exec` URL (not the Worker URL).
3. Set the challenge to the exact `INTASEND_WEBHOOK_CHALLENGE` value and subscribe to `collection_event`.
4. Test webhook delivery. The backend independently verifies invoice status with IntaSend before issuing tickets; the browser redirect is not proof of payment.

## 5. Admin and gate access

- Admin: `https://your-pages-url/admin.html`
- Gate scanner: `https://your-pages-url/scanner.html`
- Create the first admin using the one-time setup above. Add GATE staff accounts manually to the `Users` sheet using a securely generated password hash only if you have a trusted process; do not share the admin account with gate staff.

## Important security and operational notes

- Never add IntaSend secret keys, bridge secrets, or administrator passwords to GitHub.
- The browser calls the Worker; the Worker injects the bridge secret; Apps Script rejects calls without it.
- IntaSend webhooks go directly to Apps Script and are validated using the configured challenge plus server-side invoice verification.
- The starter stores admin sessions in Apps Script cache. Sessions expire; sign in again when required.
- Google Sheets + Apps Script is appropriate for an MVP / low-to-moderate traffic, not a high-volume ticket onsale. Test concurrency, payment edge cases, email delivery, access controls and local privacy requirements before public launch.
- Ticket QR values are opaque random tokens. Gate scanning validates and marks each ticket as used on the server.
- The existing app is a starter foundation, not a production security certification.

## API actions

`publicEvents`, `getEvent`, `createBooking`, `getBookingStatus`, `login`, `dashboard`, `createEvent`, `updateEvent`, `createTicketType`, `listEventsAdmin`, `listTickets`, `checkIn`.

## IntaSend references

- https://developers.intasend.com/getting-started/
- https://developers.intasend.com/guides/collections/checkout/
- https://developers.intasend.com/guides/webhooks/
- https://developers.intasend.com/guides/collections/overview/
