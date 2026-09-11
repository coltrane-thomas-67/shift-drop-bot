# Shift Drop Bot

Supreme/sneaker-drop energy, applied to gig shifts. This watches a
login-gated shift board for a side hustle of mine and texts me the second a
new opening drops, so I don't have to frantically refresh a tab all day
hoping to catch one before someone else does. Costs $0 to run: headless
browser automation for checking, a free email-to-SMS relay for the text, a
JSON file for state.

> **Before you run this against your own site:** automating login to a
> third-party site can violate its Terms of Use, and this stores your real
> login credentials locally. Use a check interval you're comfortable with
> (45s default, with built-in random jitter so it doesn't land at a
> perfectly robotic fixed cadence), and stop the bot if the site ever asks
> you to. This tool only touches your own account. It doesn't do anything
> on your behalf beyond viewing a page you're already allowed to see.

## 1. Install

```bash
cd shift-drop-bot
npm install
cp .env.example .env
```

## 2. Find your CSS selectors

The bot doesn't know your target site's markup out of the box, so you point
it at your own login form and shift list via `config/selectors.json`. Takes
about 5 minutes:

1. Open your site in Chrome and go to the login page.
2. Right-click the username field and choose **Inspect**. In DevTools,
   right-click the highlighted HTML element, choose **Copy > Copy
   selector**, and paste that into `config/selectors.json` as
   `login.usernameField`.
3. Repeat for the password field (`login.passwordField`) and the
   login/submit button (`login.submitButton`).
4. Log in manually and go to the page that lists open shifts. Inspect one
   row or card and find a selector that matches every row (a repeated class
   or a table row usually works) for `shifts.rowSelector`.
5. Within one row, find selectors for whatever details matter to you
   (time, location, rate, etc.) for `shifts.fields`.
6. If a row has a stable unique attribute, like `data-id="1234"`, set
   `shifts.idAttribute` to that attribute name. If not, leave it as `null`
   and the bot will hash the row's text instead, which still reliably
   detects new vs. already-seen entries.
7. Set `loggedOutIndicator` to a selector that's only present on the login
   page (the password field's selector usually works). The bot uses this to
   detect an expired session and re-login automatically.

## 3. Configure `.env`

Fill in your site's login URL, shift-list URL, username, password, and your
phone number. See `.env.example` for the full list of variables.

For SMS, the default `NOTIFY_METHOD=emailToSms` is free forever:

1. Turn on 2-Step Verification on the Gmail account you'll send from:
   https://myaccount.google.com/security
2. Create an App Password at https://myaccount.google.com/apppasswords and
   put the 16-character result in `GMAIL_APP_PASSWORD`.
3. Set `CARRIER_GATEWAY` to your phone carrier's gateway domain (a list is
   in `.env.example`). If you're not sure of your carrier's domain, search
   "[your carrier] email to text gateway."

This works by emailing `yournumber@carriergateway.com`, which your carrier
converts to a text. It's free, but carrier gateways can occasionally be a
minute or two slower than a real SMS API, and a few carriers (notably some
prepaid MVNOs) don't support it at all. Test it before relying on it (step 4
below).

**Alternative:** set `NOTIFY_METHOD=twilio` and fill in the `TWILIO_*` vars
if you'd rather use Twilio (`npm install twilio` first). Twilio's free
trial gives you credit, no card required, that's effectively free for
personal-volume alerts. But trial accounts can only text numbers you've
verified in the Twilio console, and it stops being free once the trial
credit runs out.

## 4. Test locally

```bash
npm start
```

Watch the console or `logs/bot.log`. The first run "primes" the bot: it
records whatever's currently open without texting you, so you don't get
flooded with texts for stuff that was already posted. After that, only
genuinely new entries trigger a text.

To send yourself a one-off test text without waiting for a real drop, run:

```bash
node -e "require('dotenv').config(); require('./src/notify').sendShiftAlert({id:'test', time:'test', location:'123 Main St', rate:'\$25/hr'})"
```

### Pause / resume

```bash
touch data/PAUSED    # pause, bot keeps running but stops checking
rm data/PAUSED        # resume
```

## 5. Deploying for 24/7 monitoring

Being upfront about the free-hosting landscape: no host today guarantees a
real-time (30-60s) background process running forever for $0 with zero
caveats. Here are the actual options, ranked by reliability.

### Option A: your own always-on machine (most reliable, $0)

If you have a computer that's already on, like a home server or an old
laptop that stays plugged in, this is the most dependable free option:

```bash
npm install -g pm2
pm2 start src/index.js --name shift-bot
pm2 save
pm2 startup   # follow the printed instructions to survive reboots
pm2 logs shift-bot   # remote friendly, SSH in and tail this anytime
```

### Option B: Oracle Cloud "Always Free" VM (genuinely free forever)

Oracle's Always Free tier includes a small VM that never expires and never
requires payment, unlike most "free tier" clouds, which are really free
trials. It's more setup than a PaaS, but it's the closest thing to a truly
permanent free 24/7 host:

1. Sign up at oracle.com/cloud/free (a card is required for identity
   verification, but the Always Free resources are never billed).
2. Create an "Always Free" Ampere or VM.Standard.E2.1.Micro instance
   (Ubuntu image).
3. SSH in and install Node.js:
   `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`
4. `git clone` your repo (or `scp` the folder), run `npm install`, add your
   `.env`, and run it with `pm2` as in Option A.

### Option C: Replit (easy, but the free tier sleeps)

Replit's free tier no longer includes true "Always On" background workers.
That now requires a paid plan. There are two free workarounds, both with
caveats:

1. Push this folder to a new Repl and set your env vars as Replit
   **Secrets** (not committed to the repo).
2. Add a tiny HTTP server (a few lines with Express, listening on Replit's
   assigned port) alongside the bot so the Repl counts as a "web" Repl.
3. Use a free uptime pinger like UptimeRobot (uptimerobot.com) to hit that
   URL every 5 minutes, which keeps a free Repl from sleeping.

This works, but it's unofficial, can still have gaps, and some hosts
consider keep-alive pinging against their spirit. Treat it as a fallback,
not the primary plan.

### Option D: Railway.app (easy, but free trial credit, not indefinite)

Railway gives new accounts a one-time trial credit, enough to run this bot
continuously for a while, but it's trial credit, not a permanent free tier:

1. `railway login`, then `railway init` in this folder.
2. `railway variable set KEY=VALUE` for every variable in `.env.example`.
3. `railway up` to deploy. Railway runs `npm start` automatically.
4. `railway logs` to monitor remotely.
5. Watch your usage in the Railway dashboard. Once the trial credit is
   exhausted you'll need to add a payment method or move to Option A or B.

### Remote log monitoring (any option)

`logs/bot.log` has every check, alert, and error with timestamps. On a VM,
`tail -f logs/bot.log` over SSH. On Railway or Replit, use their built-in
log viewer or CLI.

## How it works

- `src/auth.js` logs in, and re-logs-in automatically if the session
  expires (detected via `loggedOutIndicator`).
- `src/monitor.js` scrapes the shift-list page using
  `config/selectors.json`, hashing each row to a stable ID.
- `src/state.js` tracks which entries have already been alerted on
  (`data/seen.json`), so restarts don't re-send old alerts.
- `src/notify.js` sends the SMS via email-to-SMS gateway or Twilio.
- `src/index.js` runs the check loop: login, scrape, diff, alert, sleep
  (interval plus random jitter), repeat.
