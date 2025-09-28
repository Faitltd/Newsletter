# South Suburban Denver Events Backend – Handoff Guide

This document captures the full "from-zero to live" setup that rebuilds the South Suburban Denver Events backend inside Google Cloud Platform and ties it into the Beehiiv publishing workflow. The instructions are intentionally copy‑pasteable so a new teammate can stand everything up again without prior context.

---

## 1. What you are building

* A small Node/Express API that aggregates free public calendars (ICS feeds) from local libraries and municipalities and exposes them as newsletter-friendly JSON.
* The app is deployed to **Cloud Run** in the GCP project **`fait-444705`**, built with **Cloud Build**, and optionally triggered by **Cloud Scheduler** jobs.
* Email sending lives entirely inside **Beehiiv**. The backend only assembles structured event data per ZIP/area that you can paste into a campaign (or later automate via the Beehiiv API).
* The production service is mapped to the custom domain **`events.itsfait.com`**.

---

## 2. Local development (optional but recommended)

Open Cloud Shell (or your local terminal) and bootstrap the project:

```bash
# Create a working directory
mkdir -p ~/Newsletter && cd ~/Newsletter

# Minimal Node project definition
cat > package.json <<'JSON'
{
  "name": "south-suburban-events",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "body-parser": "^1.20.2",
    "node-ical": "^0.21.0",
    "cors": "^2.8.5"
  }
}
JSON

mkdir -p src
```

### 2.1 Configure calendar sources

Seed the project with a few reliable ICS feeds. You can add or replace sources as you discover more.

```bash
cat > src/calendars.js <<'JS'
module.exports = [
  {
    name: "Greenwood Village (example feed)",
    url: "https://www.greenwoodvillage.com/common/modules/iCalendar/export.aspx?CatIDs=1&feed=calendar&lang=en"
  },
  {
    name: "Highlands Ranch Metro District (example feed)",
    url: "https://hrmdco.specialdistrict.org/common/modules/iCalendar/export.aspx?feed=calendar&lang=en"
  }
];
JS
```

Add additional ICS URLs (for example, Arapahoe or Douglas County libraries) in the same format once you have working endpoints.

### 2.2 Optional HTML landing page

```bash
cat > src/index.html <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>South Suburban Events Signup</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:40px auto;max-width:620px;padding:0 20px}
      label{display:block;margin:0.6rem 0 0.2rem}
      fieldset{border:none;padding:0;margin-top:1rem}
      button{margin-top:12px;padding:10px 16px;font-size:16px}
    </style>
  </head>
  <body>
    <h1>Subscribe to Local Events</h1>
    <p>Use our Beehiiv hosted form to subscribe so you get events tailored to your ZIP code.</p>
  </body>
</html>
HTML
```

### 2.3 Express API server

The API exposes `/api/events?days=14` to return upcoming events across all configured calendars. You can layer in ZIP/radius filtering later.

```bash
cat > src/server.js <<'JS'
const express = require('express');
const bodyParser = require('body-parser');
const ical = require('node-ical');
const cors = require('cors');
const path = require('path');
const calendars = require('./calendars');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/events', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '14', 10);
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const events = [];

    for (const cal of calendars) {
      try {
        const data = await ical.async.fromURL(cal.url);
        for (const key in data) {
          const entry = data[key];
          if (entry.type === 'VEVENT' && entry.start instanceof Date) {
            if (entry.start >= now && entry.start <= cutoff) {
              events.push({
                source: cal.name,
                title: entry.summary || '',
                description: entry.description || '',
                location: entry.location || '',
                start: entry.start,
                end: entry.end || null,
                url: entry.url || entry.href || ''
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch ${cal.name}:`, err?.message || err);
      }
    }

    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ count: events.length, events });
  } catch (err) {
    console.error('Error in /api/events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server listening on port ${port}`));
JS
```

### 2.4 Run locally

```bash
npm install
node src/server.js
```

In another terminal:

```bash
curl -s "http://localhost:8080/api/events?days=14" | jq .
```

Logs will note any calendars that failed to load; successful entries still return.

---

## 3. Containerize the application

Create the Dockerfile so Cloud Build can assemble the image:

```bash
cat > Dockerfile <<'DOCKER'
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
DOCKER
```

---

## 4. Deploy to Google Cloud

### 4.1 Enable required services

```bash
gcloud config set project fait-444705
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### 4.2 Build the container image

```bash
gcloud builds submit --tag gcr.io/fait-444705/events-newsletter:prod
```

### 4.3 Deploy to Cloud Run

```bash
gcloud run deploy events-newsletter-prod \
  --image gcr.io/fait-444705/events-newsletter:prod \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi --cpu=1
```

Capture the service URL and test it:

```bash
RUN_URL=$(gcloud run services describe events-newsletter-prod \
  --region us-central1 --format='value(status.url)')

echo "$RUN_URL"
curl -s "$RUN_URL/api/events?days=14" | jq .
```

---

## 5. Map the custom domain (`events.itsfait.com`)

```bash
gcloud beta run domain-mappings create \
  --service events-newsletter-prod \
  --domain events.itsfait.com \
  --region us-central1
```

Add the provided CNAME record at your DNS host:

* **Name/Host:** `events`
* **Type:** `CNAME`
* **Target:** `ghs.googlehosted.com`

Verify once DNS propagates and the certificate is ready:

```bash
gcloud beta run domain-mappings describe \
  --domain events.itsfait.com \
  --region us-central1

curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```

---

## 6. Beehiiv integration workflow

1. **Custom field and segments**
   * Create a `zip_code` custom field in Beehiiv.
   * Build segments like “80111 newsletter” where `zip_code = 80111`.
2. **Signup flows**
   * Use Beehiiv hosted forms (or your site) that include a hidden pre-filled `zip_code` so leads land in the right segment.
3. **Weekly newsletter prep**
   * Before each send, pull events:
     ```bash
     curl -s "https://events.itsfait.com/api/events?days=14" | jq .
     ```
   * Paste the curated events into the corresponding Beehiiv campaign.
   * When you add ZIP-aware filtering to the API, adjust calls accordingly (e.g. `/api/events?zip=80111&radius=10&days=14`).

---

## 7. Optional Cloud Scheduler warm-up

If you want a scheduled "harvest" to precompute data or drop cached payloads into Cloud Storage, add a protected endpoint such as `/tasks/harvest` and attach a Cloud Scheduler job. Skip this to avoid extra complexity and spend.

---

## 8. Security and cost considerations

* Cloud Run with `--min-instances=0` idles to zero, so you only pay when requests arrive.
* Cloud Build only charges during builds (usually pennies per run).
* The base stack uses no secrets. If you later introduce API keys (e.g., for geocoding), store them in Secret Manager and mount them with `--set-secrets`.
* CORS is wide open for convenience. Lock it down with `cors({ origin: 'https://your-beehiiv-domain' })` once you know the exact origin that needs access.

---

## 9. Updating calendar sources

When you discover a new ICS feed:

1. Edit `src/calendars.js` and append the new source object.
2. Rebuild and redeploy using the same Cloud Build and Cloud Run commands as above.

---

## 10. Validating the end-to-end pipeline

```bash
# Cloud Run URL
echo "$RUN_URL"

# Fetch 14 days of events
curl -s "$RUN_URL/api/events?days=14" | jq .

# Custom domain check
curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```

Errors like `Failed to fetch X` indicate that a feed rejected the request or the URL is incorrect. Swap in reliable ICS endpoints.

---

## 11. Teardown (return to $0 run cost)

```bash
# Remove domain mapping
gcloud beta run domain-mappings delete \
  --domain events.itsfait.com \
  --region us-central1

# Delete the Cloud Run service
gcloud run services delete events-newsletter-prod --region us-central1 --quiet

# Delete the container image (optional)
gcloud container images delete gcr.io/fait-444705/events-newsletter:prod --quiet --force-delete-tags
```

Remove any Cloud Scheduler jobs if you created them:

```bash
gcloud scheduler jobs list --location=us-central1
gcloud scheduler jobs delete <JOB_NAME> --location=us-central1
```

---

## 12. Roadmap after launch

* Expand the list of ICS sources (cities, counties, libraries, museums, parks, etc.).
* Add ZIP-based filtering by parsing locations and applying a geocoder or a static centroid lookup.
* Once the number of segments grows, use the Beehiiv API to automate campaign creation and population.

---

## TL;DR quick-start

```bash
# Project setup
gcloud config set project fait-444705
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# App bootstrap
mkdir -p ~/Newsletter/src && cd ~/Newsletter
# (create package.json, calendars.js, index.html, server.js)
# (create Dockerfile)

npm install
node src/server.js
curl -s "http://localhost:8080/api/events?days=14" | jq .

# Build & deploy
gcloud builds submit --tag gcr.io/fait-444705/events-newsletter:prod
gcloud run deploy events-newsletter-prod \
  --image gcr.io/fait-444705/events-newsletter:prod \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=2

# Domain
gcloud beta run domain-mappings create \
  --service events-newsletter-prod \
  --domain events.itsfait.com \
  --region us-central1
gcloud beta run domain-mappings describe --domain events.itsfait.com --region us-central1

# Beehiiv usage
curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```
