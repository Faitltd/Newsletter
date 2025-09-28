# Data Model (Normalized Events)

A minimal, extensible schema used to normalize events across ICS, RSS, and API providers.

---

## Event schema (v1)

```json
{
  "id": "<stable id>",
  "source": "ics|rss|eventbrite|meetup|bandsintown|ticketmaster|predicthq|social",
  "source_id": "<provider-native id or hash>",
  "title": "",
  "description": "",
  "url": "https://…",
  "start": "2025-10-01T19:00:00-06:00",
  "end": "2025-10-01T21:00:00-06:00",
  "timezone": "America/Denver",
  "venue_name": "",
  "location": {
    "address": "",
    "lat": null,
    "lon": null
  },
  "category": "music|family|tech|civic|art|food|sports|community|education",
  "tags": ["free", "all-ages"],
  "image": "https://… (optional)",
  "cost": {
    "amount": null,
    "currency": "USD",
    "is_free": true
  }
}
```

Notes:
- id: stable hash like sha1(source + source_id) or derived from (title+date+venue)
- timezone: default America/Denver if unspecified
- location: lat/lon optional; derive from geocoding later

---

## Mapping rules per source

### ICS (node-ical)
- title ← summary
- description ← description
- url ← url | href (if present)
- start/end ← start/end (Date)
- venue_name ← location (string)
- source_id ← uid | (summary + start)

### RSS
- title ← item.title
- description ← item.description/content
- url ← item.link
- start/end ← parse from body or skip if unknown (then treat as "+info" only)
- venue_name/location ← parse heuristics (later)
- source_id ← item.guid | item.link

### Eventbrite/Meetup/Bandsintown/Ticketmaster
- Provider native fields mapped directly (title, url, start, end, venue)
- source_id ← provider id
- category ← provider category mapping table

---

## Deduplication (heuristic v1)

- Key: (normalized_title, event_date, venue_name)
- Normalization steps:
  - lower-case, trim, collapse whitespace
  - remove boilerplate (e.g., "| Eventbrite")
  - strip emojis and excessive punctuation
- If multiple sources collide:
  - Prefer official/venue source over aggregators
  - Merge fields (keep longer description, keep image if present)

---

## Categorization

- Simple rule-based mapping from keywords/organizers/categories to target taxonomy:
  - family, music, tech, art, food, civic, sports, community, education
- Later: ML-assisted tagging (optional)

---

## Geo & ZIP filtering

- If address present → geocode (batch) to lat/lon; cache results
- Compute nearest ZIP or within-city tags
- Expose filters: by ZIP list, by city, by radius

---

## Extensibility

- Add fields via additive changes (v2+)
- Keep compatibility by defaulting missing fields

