# Denver + South Suburban Events Coverage Plan

A layered, low-cost strategy to aggregate the broadest set of local events for the newsletter by combining official feeds (ICS/RSS), public APIs, trusted aggregators, and local media — with automation, normalization, and deduplication.

---

## Immediate Goals

- Aggregate thousands of local events efficiently and legally
- Cover key categories: community, cultural, music, professional, sports, government, food, family
- Automated ingestion and filtering for newsletter publishing
- Prioritize zero- and low-cost sources first (ICS/RSS + free API tiers)

---

## Phased Approach (cost-aware)

1) Zero-cost now (in place)
- Official ICS feeds from cities, libraries, parks & rec (e.g., Greenwood Village, HRMD)
- Add more ICS as available from Arapahoe, Douglas, Jeffco libraries; city/county calendars
- Local media RSS where available (303 Magazine, 5280, Westword, Denver Ear)

2) Near-term (free API tiers)
- Eventbrite API (local filters)
- Meetup API (groups around Denver metro)
- Bandsintown API (venues + metro area)
- Ticketmaster Discovery API (major venues, concerts, sports)

3) Optional paid enrichment (later)
- PredictHQ (broad event coverage + analytics)
- Aggregation plugins/services (e.g., The Events Calendar Event Aggregator for WP)

---

## Source Selection & Integration

### 1) National and Global Event Platforms (APIs)
- Eventbrite API: concerts, classes, community, professional
- Meetup API: networking, tech groups, hobbies
- Bandsintown API: concerts, tours, venues, music festivals

### 2) Regional and Local Feeds
- Ticketmaster Discovery API: concerts, big shows, sports, arts at large venues
- Denver and surrounding city/county calendars: festivals, public meetings, community programming (via ICS/JSON where available)
- Local governments: ICS feeds (Greenwood Village, Arapahoe County, Jeffco, etc.)
- Libraries & Parks/Rec: ICS feeds for family and educational programming (Arapahoe, Douglas, Jeffco; SSPRD)

### 3) Social Media & News Aggregators
- RSS & Atom: events posts from local outlets (303 Magazine, 5280, Westword, Denver Ear)
- Facebook/Instagram/Twitter/X: monitor venue pages/hashtags where allowed (respect ToS)
- Social monitoring via Hootsuite/EmbedSocial or similar tools

### 4) Advanced Event Intelligence (optional)
- PredictHQ API: high-visibility events + analytics
- Event Aggregator plugins (e.g., for WordPress) to bulk import/deduplicate

---

## Step-by-Step Implementation Plan

### A. Technical Setup

1) Register & Authenticate (for APIs)
- Create developer accounts (Eventbrite, Meetup, Bandsintown, Ticketmaster; optional: PredictHQ)
- Store credentials in Google Secret Manager; inject to Cloud Run via env vars
- Respect rate limits; add backoff and caching

2) Subscribe to ICS & RSS feeds
- Identify ICS links for cities/counties, libraries, parks/recs, venues
- Identify RSS feeds for local media and venue blogs
- Maintain source registry (docs or DB) with owner, URL, category, update frequency

3) Social & Media Monitoring
- Configure hashtag/venue monitoring in Hootsuite/EmbedSocial
- Curate allow-lists of venues and sources

### B. Data Aggregation & Deduplication

1) Normalize to a common schema
- Fields: id/source/source_type, title, description, url, start, end, timezone, venue_name, location, category, age/audience, cost/free, tags, image(optional)

2) Deduplicate & Merge
- Merge by title+date+venue (fuzzy matching fallback)
- Prefer official source links when duplicates appear

3) Categorize & Filter
- Categories: family, music, tech, art, food, civic, sports, education, community
- Geo filters: city/ZIP/lat-lon bounding box; date range filters

### C. Automation & Publishing

1) Scheduling
- Cron on Cloud Run jobs or Cloud Scheduler triggers to refresh feeds daily/hourly
- Cache TTLs per source type (ICS longer; APIs shorter)

2) Quality Control
- Manual weekly spot-checks for top events & gaps
- Intake form for community submissions

3) Output
- JSON API for Beehiiv and web
- Optional: per-zip or per-category endpoints; curated lists for newsletter sections

---

## Initial Implementation (current state)

- Cloud Run service exposing `/api/events?days=N`
- ICS ingestion using node-ical with caching and concurrency limits
- CORS restricted to Beehiiv domain
- Seed sources: Greenwood Village categories (14, 29, 42, 43, 44, 46), Highlands Ranch Metro District

### Near-term Additions (no/low cost)
- More ICS: Arapahoe, Douglas, Jeffco libraries; Englewood/Littleton city calendars; SSPRD schedules
- Media RSS: 303 Magazine, 5280, Westword, Denver Ear (events sections)
- Venue calendars with ICS/RSS (where offered)

### API Integrations (free tiers)
- Eventbrite: city/metro filtered queries
- Meetup: location + radius for Denver metro; key groups by category
- Bandsintown: venue + metro queries
- Ticketmaster Discovery: category + geo filters for large venues

---

## Data Model (proposed minimal schema)

```json
{
  "id": "<stable hash or provider id>",
  "source": "eventbrite|meetup|bandsintown|ticketmaster|ics|rss|social",
  "title": "",
  "description": "",
  "url": "",
  "start": "2025-10-01T19:00:00-06:00",
  "end": "2025-10-01T21:00:00-06:00",
  "timezone": "America/Denver",
  "venue_name": "",
  "location": "address or lat,lon",
  "category": "music|family|tech|civic|art|food|sports|community|education",
  "tags": ["free", "all-ages"],
  "image": "(optional)"
}
```

---

## Operations & Reliability

- Caching: in-memory per feed; extend to Redis/Memorystore if needed
- Concurrency: modest parallelism with retries + backoff
- User-Agent + timeouts for ICS requests to improve compatibility
- Monitoring: basic logs; consider Cloud Logging filters and Error Reporting
- Rate limits: per-API budgets, exponential backoff, circuit breakers on errors

---

## Legal & Compliance

- Respect each source’s Terms of Service and robots.txt
- Use provided APIs/feeds only; no scraping of prohibited endpoints
- Attribute sources when required; link directly to official event pages
- Honor request to remove or adjust usage if contacted by a source owner

---

## Coverage Enrichment Strategies

- Weekly venue/source discovery sprint to add new ICS/RSS/API endpoints
- Audience survey for missing categories (comedy, food trucks, outdoor movies)
- Partnerships with city officials, libraries, community coalitions for exclusive listings
- Rotating feature section to highlight underrepresented events

---

## Recommended Sources (examples)

| Source Type | Platforms / Examples | Notes |
| --- | --- | --- |
| Global/national API | Eventbrite, Meetup | Free tiers; OAuth where required |
| Music API | Bandsintown, Ticketmaster | Venue + metro queries |
| Local gov/ICS | Denver metro cities & counties | Public meetings, festivals, civic |
| Libraries | DCL, Arapahoe, Jeffco | Family, education |
| Aggregators | PredictHQ, Event Aggregator | Optional paid/plug-in |
| Media RSS | 303 Magazine, 5280, Westword, Denver Ear | Arts/culture/food |

---

## Environment & Config (Cloud Run)

- Env vars: CORS_ORIGIN, CACHE_TTL_MS, FETCH_CONCURRENCY, (later) API keys via Secret Manager
- Scale-to-zero to minimize cost; 512Mi/1 CPU sufficient for current loads
- Domain mapping via Cloud Run + DNS CNAME (events.itsfait.com → ghs.googlehosted.com)

---

## Roadmap (next 2–6 weeks)

1) Expand ICS/RSS registry and validate yields per source
2) Add first API integrations (Eventbrite/Meetup/Bandsintown) behind feature flags
3) Introduce normalization + dedup layer (simple heuristic → fuzzy matching)
4) Add categorization, per-zip filters, and curated endpoints for Beehiiv
5) Optional: Persist normalized events (e.g., Cloud SQL or Firestore) for history/analytics
6) Evaluate paid enrichment (PredictHQ) if ROI justifies

---

## References (docs)

- Eventbrite API: https://www.eventbrite.com/platform/api
- Meetup API: https://www.meetup.com/api/
- Bandsintown API: https://www.artists.bandsintown.com/support/api-installation
- Ticketmaster Discovery: https://developer.ticketmaster.com/products-and-docs/apis/discovery/
- PredictHQ: https://docs.predicthq.com/
- Hootsuite: https://help.hootsuite.com/
- EmbedSocial: https://embedsocial.com/
- The Events Calendar (Event Aggregator): https://theeventscalendar.com/products/wordpress-event-aggregator/
- Cloud Run domain mapping: https://cloud.google.com/run/docs/mapping-custom-domains

