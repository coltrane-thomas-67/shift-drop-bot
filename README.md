# Shift Drop Bot

Supreme/sneaker-drop energy, applied to gig shifts. This watches a
login-gated shift board for a side hustle of mine and texts me the second a
new opening drops — no more frantically refreshing a tab all day hoping to
catch one before someone else does. $0 to run: headless browser automation
for checking, a free email-to-SMS relay for the text, a JSON file for state.

> **Before you run this against your own site:** automating login to a
> third-party site can violate its Terms of Use, and this stores your real
> login credentials locally. Use a check interval you're comfortable with
> (45s default, with built-in random jitter so it doesn't look like a
> perfectly robotic fixed cadence) and stop the bot if the site ever asks
> you to. This tool only touches your own account — it doesn't do anything
> on your behalf beyond viewing a page you're already allowed to see.

## 1. Install

```bash
cd shift-drop-bot
npm install
cp .env.example .env
```

## 2. Find your CSS selectors

The bot doesn't know your target site's markup out of the box — you point
it at your own login form and shift list via `config/selectors.json`. Takes
about 5 minutes:

1. Open your site in Chrome, go to the login page.
2. Right-click the username field → **Inspect**. In DevTools, right-click the
   highlighted HTML element → **Copy → Copy selector**. Paste that into
   `config/selectors.json` as `login.usernameField`.
3. Repeat for the password field (`login.passwordField`) and the
   login/submit button (`login.submitButton`).
4. Log in manually, go to the page that lists open shifts/requests. Inspect
   one row/card. Find a selector that matches *every* row (e.g. a repeated
   class or a table row) → `appointments.rowSelector`.
5. Within one row, find selectors for whatever details matter to you (time,
   location, rate, etc.) → `appointments.fields`.
6. If a row has a stable unique attribute (e.g. `data-id="1234"`), set
   `appointments.idAttribute` to that attribute name. If not, leave it as
   `null` — the bot hashes the row's text instead, which still reliably
   detects new vs. already-seen entries.
7. Set `loggedOutIndicator` to a selector that's only present on the login
   page (e.g. the password field's selector) — the bot uses this to detect
   an expired session and re-login automatically.

## 3. Configure `.env`

Fill in your site's login URL, shift-list URL, username, password, and your
phone number (see `.env.example` for the full list of variables).

For SMS, the default `NOTIFY_METHOD=emailToSms` is free forever:

1. Turn on 2-Step Verification on the Gmail account you'll send from:
   https://myaccount.google.com/security
2. Create an App Password: https://myaccount.google.com/apppasswords
   → put the 16-character result in `GMAIL_APP_PASSWORD`.
3. Set `CARRIER_GATEWAY` to your phone carrier's gateway domain (list is in
   `.env.example`). If you're not sure of your carrier's domain, search
   "[your carrier] email to text gateway."

This works by emailing `yournumber@carriergateway.com`, which your carrier
converts to a text. It's free but carrier gateways can occasionally be a
minute or two slower than a real SMS API, and a few carriers (notably some
prepaid MVNOs) don't support it at all — test it before relying on it (step 4
below).

**Alternative:** set `NOTIFY_METHOD=twilio` and fill in the `TWILIO_*` vars if
you'd rather use Twilio (`npm install twilio` first). Twilio's free trial
gives you credit (not a card-required subscription) that's effectively free
for personal-volume alerts, but trial accounts can only text numbers you've
verified in the Twilio console, and it's not free forever once the trial
credit runs out.

## 4. Test locally

```bash
npm start
```

Watch the console/`logs/bot.log`. First run "primes" the bot — it records
whatever's currently open without texting you (so you don't get flooded
with texts for stuff that was already posted). After that, only genuinely
new entries trigger a text.

To send yourself a one-off test text without waiting for a real drop, run:

```bash
node -e "require('dotenv').config(); require('./src/notify').sendShiftAlert({id:'test', time:'test', location:'123 Main St', rate:'\$25/hr'})"
```

### Pause / resume

```bash
touch data/PAUSED    # pause — bot keeps running but stops checking
rm data/PAUSED        # resume
```

## 5. Deploying for 24/7 monitoring

Being straightforward about the free-hosting landscape: there is no host
today that guarantees a real-time (30–60s) background process running
forever for $0 with zero caveats. Here are the actual options, ranked by
reliability:

### Option A — Your own always-on machine (most reliable, $0)

If you have a computer that's on anyway (a home server, an old laptop that
stays plugged in), this is the most dependable free option:

```bash
npm install -g pm2
pm2 start src/index.js --name shift-bot
pm2 save
pm2 startup   # follow the printed instructions to survive reboots
pm2 logs shift-bot   # remote-friendly: SSH in and tail this anytime
```

### Option B — Oracle Cloud "Always Free" VM (genuinely free forever)

Oracle's Always Free tier includes a small VM that never expires and never
requires payment (unlike most "free tier" clouds, which are free trials).
It's more setup than a PaaS but it's the closest thing to a truly permanent
free 24/7 host:

1. Sign up at oracle.com/cloud/free (requires a card for identity
   verification, but the Always Free resources are never billed).
2. Create an "Always Free" Ampere or VM.Standard.E2.1.Micro instance
   (Ubuntu image).
3. SSH in, install Node.js (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`).
4. `git clone` your repo (or `scp` the folder), `npm install`, add your
   `.env`, then run it with `pm2` as in Option A.

### Option C — Replit (easy, but free tier sleeps)

Replit's free tier no longer includes true "Always On" background workers —
that now requires a paid plan. Two ways to work around that for free, with
caveats:

1. Push this folder to a new Repl, set your env vars as Replit **Secrets**
   (not committed to the repo).
2. Add a tiny HTTP server (a few lines with Express, listening on Replit's
   assigned port) alongside the bot so the Repl counts as a "web" Repl.
3. Use a free uptime pinger like UptimeRobot (uptimerobot.com) to hit that
   URL every 5 minutes, which keeps a free Repl from sleeping.

This works but is unofficial, can still have gaps, and some hosts consider
keep-alive pinging against their spirit — treat it as a fallback, not the
primary plan.

### Option D — Railway.app (easy, free trial credit — not indefinite)

Railway gives new accounts a one-time trial credit, enough to run this bot
continuously for a while, but it is trial credit, not a permanent free tier:

1. `railway login`, `railway init` in this folder.
2. `railway variable set KEY=VALUE` for every variable in `.env.example`.
3. `railway up` to deploy. Railway runs `npm start` automatically.
4. `railway logs` to monitor remotely.
5. Watch your usage in the Railway dashboard — once the trial credit is
   exhausted you'll need to add a payment method or move to Option A/B.

### Remote log monitoring (any option)

`logs/bot.log` has every check, alert, and error with timestamps. On a VM,
`tail -f logs/bot.log` over SSH; on Railway/Replit, use their built-in log
viewer/CLI.

## How it works

- `src/auth.js` — logs in, and re-logs-in automatically if the session
  expires (detected via `loggedOutIndicator`).
- `src/monitor.js` — scrapes the shift-list page using
  `config/selectors.json`, hashing each row to a stable ID.
- `src/state.js` — tracks which entries have already been alerted on
  (`data/seen.json`), so restarts don't re-send old alerts.
- `src/notify.js` — sends the SMS via email-to-SMS gateway or Twilio.
- `src/index.js` — the check loop: login → scrape → diff → alert → sleep
  (interval + random jitter) → repeat.
