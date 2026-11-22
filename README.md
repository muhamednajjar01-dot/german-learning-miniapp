# Deutsch | Lernbibliothek — static Mini App shell

This repository contains **one file**: `index.html`, the static shell of the
Telegram Mini App for a private German-learning project.

- It holds **no secrets**: no bot token, no API keys, no student data, no answer
  keys, no chat ids. It only renders a UI and talks to an authenticated backend.
- Every request carries Telegram `initData`, which the backend verifies
  server-side (HMAC-SHA256 over the bot token, `auth_date` expiry, numeric
  allowlist). Opened outside Telegram it shows a refusal and nothing else.
- The backend lives in Google Apps Script; this page is the HTTPS origin so the
  Mini App has a stable address.

Published with GitHub Pages (free tier, HTTPS). No analytics, no cookies, no
third-party scripts beyond `telegram.org/js/telegram-web-app.js`.
