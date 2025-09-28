# Ingestion Pipeline

High-level flow to collect events from many sources, normalize, deduplicate, categorize, and serve to the newsletter/API.

---

## Architecture

1) Source adapters
- ICS fetcher (node-ical) with UA + timeout + caching
- RSS fetcher (feedparser) (planned)
- API clients: Eventbrite, Meetup, Bandsintown, Ticketmaster (planned)

2) Normalization
- Map each provider to the unified event schema (see DATA_MODEL.md)
- Add default timezone, sanitize text

3) Deduplication
- Heuristic collision on (title, date, venue)
- Merge strategy prefers official sources; union tags/images

4) Categorization
- Rule-based keyword/category mapping into taxonomy

5) Storage (optional)
- Start: ephemeral, in-memory responses
- Later: persist normalized events to DB (Firestore/Cloud SQL) for history & analytics

6) Serving layer
- Cloud Run endpoint(s): `/api/events?days=N` (current), later add filters (`zip`, `category`)
- CORS locked to Beehiiv domain

7) Scheduling
- Cloud Scheduler or Run Jobs to refresh on cadence (hourly/daily per source)
- Warm cache; write static snapshots to GCS if needed

8) Observability & Reliability
- Logs, error capture, retry/backoff per source
- Track per-source yield (7/30/60 days) and error rates

---

## Config & Secrets

- Env vars: CORS_ORIGIN, CACHE_TTL_MS, FETCH_CONCURRENCY
- Secrets (later): API keys in Secret Manager, mounted via `--set-secrets`
- Per-source config file or DB table for enable/disable and weights

---

## Failure modes & mitigations

- Source down or malformed: continue with partial results, log error
- High latency: concurrency cap + timeouts + cache hits
- Rate limits: backoff, staggered schedules, per-source budget

---

## Roadmap tasks

- [ ] Add RSS adapter and initial media feeds
- [ ] Add Eventbrite adapter (free tier)
- [ ] Add Meetup adapter
- [ ] Add Bandsintown adapter
- [ ] Add Ticketmaster adapter
- [ ] Introduce persistence for normalized events
- [ ] Add dedup + categorization modules
- [ ] Add per-zip/per-category API filters
- [ ] Add `/api/health` with per-source last fetch timestamp

