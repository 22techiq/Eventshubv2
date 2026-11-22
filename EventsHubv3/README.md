# EventHub by McOwino — GitHub Pages + Apps Script (No Worker)

This edition removes **Cloudflare Workers and Vercel completely**. The existing EventHub website, admin and scanner presentation are retained. GitHub Pages hosts the static interface; Google Apps Script handles the application logic; Google Sheets stores records; IntaSend processes payments.

## Architecture

- **GitHub Pages:** `index.html`, `admin.html`, `scanner.html`, styles and browser scripts.
- **Google Apps Script:** API, authentication, booking holds, IntaSend checkout creation and verification, ticket generation/email and gate check-in.
- **Google Sheets:** users, events, ticket types, bookings, booking items, tickets, transactions, check-ins and audit logs.
- **IntaSend:** hosted checkout for the payment methods enabled on your account (M-Pesa and cards where enabled).

The browser submits normal HTML form POSTs to a hidden Apps Script iframe. Apps Script returns the result to the page with `postMessage`. This avoids relying on cross-origin `fetch()`/CORS response access. No API secret or shared bridge secret is placed in GitHub.

## 1. Prepare Google Sheets and Apps Script

1. Create a Google spreadsheet named `EventHub Database`; copy its spreadsheet ID.
2. Open **Extensions → Apps Script**.
3. Replace the editor contents with `apps-script/Code.gs` (or paste its full contents into `Code.gs`).
4. In **Project Settings → Script Properties**, add:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | Your Google Sheet ID |
| `INTASEND_PUBLIC_KEY` | IntaSend publishable/public key |
| `INTASEND_SECRET_KEY` | IntaSend secret key |
| `INTASEND_WEBHOOK_CHALLENGE` | The exact challenge configured for the IntaSend webhook |
| `ADMIN_EMAIL` | Administrator notification address (if used by your setup) |
| `PUBLIC_BASE_URL` | Your GitHub Pages URL, e.g. `https://username.github.io/EventHub` |
| `CURRENCY` | `KES` |

   Also add `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` temporarily for first-admin creation. Use a strong unique password. Do not put these values in GitHub.
5. Run `setupEventHub()` once and authorize it. This creates the required Sheets tabs.
6. Run `createInitialAdmin()` once. It creates the administrator record and deletes the temporary password property. Store the password securely before running it.
7. Deploy **Deploy → New deployment → Web app**. Choose **Execute as: Me** and **Who has access: Anyone**. Deploy and copy the URL ending in `/exec`.
8. Run `installCleanupTrigger()` once to install the five-minute expired-booking cleanup trigger.

## 2. Connect the website to Apps Script

1. Open `config.js` in the GitHub repository.
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE` with your deployed `/exec` URL, for example:
   `https://script.google.com/macros/s/AKfycb.../exec`
3. Commit the change. Do not add IntaSend keys, passwords, or any other secrets to this file.

The frontend uses `api.js` to submit requests to Apps Script through a hidden iframe. Do not replace this with a JSON `fetch()` call; that would reintroduce the cross-origin response problem this edition is designed to avoid.

## 3. Publish on GitHub Pages

1. Create a repository, e.g. `EventHub-by-McOwino`.
2. Upload the **contents** of this folder to the repository root (not the outer folder).
3. Open **Settings → Pages**. Select **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
4. Wait for deployment. Open the GitHub Pages URL and confirm the homepage loads.
5. Test the public event list. If the browser shows an authorization or deployment error, confirm the Apps Script deployment is set to execute as you and accessible to Anyone, and confirm `config.js` contains the current `/exec` URL.

## 4. Configure IntaSend

1. Start with IntaSend sandbox keys and sandbox checkout/webhook settings.
2. Enable the required KES payment methods in your IntaSend account, including M-Pesa and cards where supported.
3. Configure the `collection_event` webhook to call the Apps Script `/exec` URL directly.
4. Use the same webhook challenge in IntaSend and the `INTASEND_WEBHOOK_CHALLENGE` Script Property.
5. The browser redirect is not proof of payment. The Apps Script webhook handler independently checks the invoice status with IntaSend before marking a booking paid and issuing tickets.
6. After successful end-to-end sandbox tests, switch to live keys and live webhook configuration.

## 5. Pages

- Public events and ticket lookup: `index.html`
- Admin console: `admin.html`
- Gate scanner: `scanner.html`

The scanner requires a camera-capable device and HTTPS (GitHub Pages provides HTTPS). Manual QR-token entry is also available.

## Security and limitations

- IntaSend secret keys remain in Apps Script Script Properties.
- Admin and gate actions require server-side session authentication and role checks.
- QR tokens are random and single-use; check-in is performed server-side under a script lock.
- Payment confirmation is verified server-side with IntaSend; never trust the browser return URL as proof of payment.
- Because a static GitHub Pages site has no private server-side credential, the public Apps Script web app endpoint must be callable by the browser. Public endpoints such as event listing and booking creation are therefore exposed to automated abuse. Before a public/high-volume launch, add a server-verified CAPTCHA or another abuse-control mechanism, stricter rate limits, and operational monitoring. Do not try to solve this by placing a secret in JavaScript; every visitor can read it.
- Google Sheets + Apps Script is suitable for an MVP and low-to-moderate traffic, not a high-demand ticket drop. Test concurrency and payment edge cases before launch.
- This is a starter implementation, not a production security certification. Test on sandbox before accepting live payments.

## API actions supported by the current interface

`publicEvents`, `getEvent`, `createBooking`, `getBookingStatus`, `login`, `dashboard`, `createEvent`, `updateEvent`, `createTicketType`, `listEventsAdmin`, `listTickets`, `checkIn`.

## Important deployment note

If you edit `Code.gs` after deployment, create a new Apps Script deployment version or update the existing deployment to the new version. The website URL in `config.js` normally remains the same when you edit the existing deployment.
