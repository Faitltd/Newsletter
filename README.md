# South Suburban Denver Events – Handoff Package

This repository contains a clean, from-zero to live backend to aggregate free public calendars (ICS) and expose them as JSON for your Beehiiv workflow. It is designed to run on Google Cloud Run in project `fait-444705` with Cloud Build, and optionally map to the custom domain `events.itsfait.com`.

---

## 1) What we’re building (quick overview)

- A tiny Node/Express API that aggregates free public calendars (ICS) from local libraries / cities and returns JSON your newsletter can use.
- It runs in your GCP project (fait-444705) on Cloud Run, built by Cloud Build, with optional Cloud Scheduler.
- You’ll send via Beehiiv, not SES; the backend just provides event data per zip/area that you paste (or later automate via Beehiiv API).
- Custom domain: events.itsfait.com mapped to the Cloud Run service.

---

## 2) Local dev (optional but handy)

Open Cloud Shell (or your terminal) and run:

```bash
# Clone a fresh folder (or reuse your Newsletter folder)
mkdir -p ~/Newsletter && cd ~/Newsletter

# Create minimal Node project (already present in this repo)
# package.json is configured to start the server

mkdir -p src
```

### 2.1 Calendars list (easy free ICS feeds)

You can expand this later, but start with a few reliable sources. Some city pages block direct ICS or require a specific ICS endpoint—these two work as examples you can test with (you can replace/add more):

Edit `src/calendars.js`:

```js
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
```

> If you have an ICS URL for Arapahoe Libraries or Douglas County Libraries, drop it into `calendars.js` the same way.

### 2.2 Simple HTML (root page – optional)

`src/index.html` is a simple informational page.

### 2.3 API server (Express + ICS fetcher)

- `/api/events?days=14` → returns all events within the next N days from the configured ICS feeds.
- Later you can add zip/radius filtering if you attach locations + geocoding, but this is production-safe for a first launch.

---

## 3) Containerize

### 3.1 Dockerfile

A minimal Dockerfile is provided at the repo root.
### 3.2 Runtime config (optional)
- `CORS_ORIGIN` (default: https://faitevents.beehiiv.com)
- `CACHE_TTL_MS` cache per calendar URL (default: 600000 = 10 minutes)
- `FETCH_CONCURRENCY` parallel fetch limit (default: 4)


---

## 4) Deploy on your Google Cloud (project: fait-444705)

### 4.1 One-time enables

```bash
gcloud config set project fait-444705
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### 4.2 Build the image

```bash
cd ~/Newsletter
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

Grab the service URL:

```bash
RUN_URL=$(gcloud run services describe events-newsletter-prod \
  --region us-central1 --format='value(status.url)')

echo "$RUN_URL"
curl -s "$RUN_URL/api/events?days=14" | jq .
```

---

## 5) Map the custom domain: events.itsfait.com

```bash
gcloud beta run domain-mappings create \
  --service events-newsletter-prod \
  --domain events.itsfait.com \
  --region us-central1
```

Add a CNAME at your DNS provider:

- Name/Host: `events`
- Type: `CNAME`
- Alias/Target: `ghs.googlehosted.com`

Check status:

```bash
gcloud beta run domain-mappings describe \
  --domain events.itsfait.com \
  --region us-central1
```

When the certificate is provisioned, this will work:

```bash
curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```

---

## 6) Beehiiv setup (simple & scalable)

Goal: One weekly send per area/zip segment, populated by your API.

1. Custom field & segments
   - In Beehiiv, create a custom field `zip_code`.
   - Create segments like “80111 newsletter” where `zip_code = 80111`.
2. Signup forms per zip (for your Facebook ads)
   - Use a Beehiiv hosted form (or your site) that pre-fills a hidden `zip_code` value per ad.
3. Weekly content workflow
   - Fetch data for that segment:
   ```bash
   curl -s "https://events.itsfait.com/api/events?days=14" | jq .
   ```

---

## 7) Optional: Cloud Scheduler “harvest” job

If you want a weekly “harvest” to warm the cache or write a weekly static block to Cloud Storage (advanced/optional), add a protected endpoint like `/tasks/harvest` and schedule it. If not needed, skip this.

---

## 8) Security & cost notes

- Costs: Cloud Run with `--min-instances=0` spins to zero. You only pay for requests. Cloud Build charges only on builds.
- Secrets: Not used here. If you add keys (e.g., a geocoder), use Secret Manager + `--set-secrets`.
- CORS: Enabled; to restrict, set `cors({ origin: "https://your-beehiiv-domain" })`.
- Emergency-only cleanup: Teardown or cleanup (including deleting Cloud Run services/images or removing legacy files) is intended for emergencies only. Prefer leaving the service deployed with `--min-instances=0` and simply updating calendars or redeploying when needed.


---

## 9) Updating calendars (production hygiene)

When you find a working ICS URL for a source, edit `src/calendars.js`:

```js
{ name: "Source Name", url: "https://example.com/some-calendar.ics" }
```

Then rebuild & deploy:

```bash
gcloud builds submit --tag gcr.io/fait-444705/events-newsletter:prod
gcloud run deploy events-newsletter-prod \
  --image gcr.io/fait-444705/events-newsletter:prod \
  --region us-central1 --allow-unauthenticated --min-instances=0 --max-instances=2
```

---

## 10) Validating the pipeline

```bash
# Cloud Run URL
echo "$RUN_URL"

# JSON test (14 days)
curl -s "$RUN_URL/api/events?days=14" | jq .

# Custom domain
curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```

If some feeds fail, replace with a working ICS URL.

---
> Emergency-only: Use teardown only when you must immediately halt costs or decommission the service. In normal operation, keep the service deployed with `--min-instances=0` (scale-to-zero) and update or redeploy instead of deleting resources.



## 11) Teardown (to $0 run cost)

```bash
# Delete the domain mapping first (optional)
gcloud beta run domain-mappings delete \
  --domain events.itsfait.com \
  --region us-central1

# Delete Cloud Run service
gcloud run services delete events-newsletter-prod --region us-central1 --quiet

# Delete built image (optional cleanup)
gcloud container images delete gcr.io/fait-444705/events-newsletter:prod --quiet --force-delete-tags
```

If you created any Scheduler jobs earlier, delete them too:

```bash
gcloud scheduler jobs list --location=us-central1
# then
gcloud scheduler jobs delete <JOB_NAME> --location=us-central1
```

---

## 12) Roadmap (after launch)

- Broaden sources: add reliable ICS feeds from each city, county, library, park & rec, museum, etc.
- Zip filtering: if ICS has addresses, parse addresses and attach geocoding to tag events by nearby zips.
- Automation: once segments scale, use Beehiiv’s API to create and populate campaigns automatically.

---

## TL;DR

```bash
# 0) Project
gcloud config set project fait-444705
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 1) App
npm install
node src/server.js
# in another tab:
curl -s "http://localhost:8080/api/events?days=14" | jq .

# 2) Build & Deploy
gcloud builds submit --tag gcr.io/fait-444705/events-newsletter:prod
gcloud run deploy events-newsletter-prod \
  --image gcr.io/fait-444705/events-newsletter:prod \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=2

# 3) Domain
gcloud beta run domain-mappings create \
  --service events-newsletter-prod \
  --domain events.itsfait.com \
  --region us-central1
# Add the shown CNAME at your DNS registrar, then:
gcloud beta run domain-mappings describe --domain events.itsfait.com --region us-central1

# 4) Use in Beehiiv
curl -s "https://events.itsfait.com/api/events?days=14" | jq .
```

