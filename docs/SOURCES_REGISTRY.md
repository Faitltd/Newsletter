# Sources Registry

Track all event sources (ICS, RSS, APIs), status, and yield. Keep this file up to date as we add/remove feeds.

Columns:
- ID: short stable ID
- Owner: org/city/library/vendor
- Type: ICS | RSS | API
- Name: human-readable
- URL / Access: link or “API key via Secret Manager”
- Category: primary categories covered
- Status: Active | Testing | Planned | Paused
- Yield: Counts over 7/30/60 days (manual note until automated)
- Notes: constraints, rate limits, quirks

---

## Active (ICS)

| ID | Owner | Type | Name | URL / Access | Category | Status | Yield (7/30/60) | Notes |
|---|---|---|---|---|---|---|---|---|
| gv-cat-14 | Greenwood Village | ICS | Activities & Events (catID=14) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar | community, culture, family | Active | TBD/TBD/TBD | Verified working |
| gv-cat-29 | Greenwood Village | ICS | Government (catID=29) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=29&feed=calendar | civic, gov | Active | TBD/TBD/TBD | Verified working |
| gv-cat-42 | Greenwood Village | ICS | Arts & Culture (catID=42) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=42&feed=calendar | arts, culture | Active | TBD/TBD/TBD | Verified working |
| gv-cat-43 | Greenwood Village | ICS | Business (catID=43) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=43&feed=calendar | business | Active | TBD/TBD/TBD | Verified working |
| gv-cat-44 | Greenwood Village | ICS | Recreation (catID=44) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=44&feed=calendar | recreation | Active | TBD/TBD/TBD | Verified working |
| gv-cat-46 | Greenwood Village | ICS | Special Events (catID=46) | https://greenwoodvillage.com/common/modules/iCalendar/iCalendar.aspx?catID=46&feed=calendar | special events | Active | TBD/TBD/TBD | Verified working |
| hrmd | Highlands Ranch Metro District | ICS | HRMD Calendar | https://hrmdco.specialdistrict.org/common/modules/iCalendar/export.aspx?feed=calendar&lang=en | community, parks/rec | Active | TBD/TBD/TBD | Verified working |

---

## Planned / Testing

| ID | Owner | Type | Name | URL / Access | Category | Status | Yield (7/30/60) | Notes |
|---|---|---|---|---|---|---|---|---|
| arap-lib | Arapahoe Libraries | ICS | System/branch calendars | (ICS links TBD) | education, family | Planned | - | Identify per-branch ICS |
| dcl | Douglas County Libraries | ICS | DCL events | (ICS links TBD) | education, family | Planned | - | Per-branch/category ICS |
| jeffco-lib | Jefferson County Public Library | ICS | JCPL events | (ICS links TBD) | education, family | Planned | - | |
| englewood | City of Englewood | ICS | City events | (ICS link TBD) | civic, community | Planned | - | |
| littleton-bemis | Bemis Public Library (Littleton) | ICS | Library events | (ICS link TBD) | education, family | Planned | - | |
| ssprd | South Suburban Parks & Rec | ICS | Schedules/Events | (ICS link TBD) | recreation, sports | Planned | - | Some schedules not ICS |
| media-303 | 303 Magazine | RSS | Events posts | (RSS URL TBD) | arts, culture, food | Planned | - | |
| media-5280 | 5280 Magazine | RSS | Events posts | (RSS URL TBD) | arts, culture, food | Planned | - | |
| media-westword | Westword | RSS | Events posts | (RSS URL TBD) | arts, culture | Planned | - | |
| media-denver-ear | Denver Ear | RSS | Events posts | (RSS URL TBD) | family, culture | Planned | - | |

---

## APIs (keys in Secret Manager when enabled)

| ID | Provider | Type | Name | Access | Category | Status | Notes |
|---|---|---|---|---|---|---|---|
| eventbrite | Eventbrite | API | Eventbrite API | API key (Secret Manager) | all | Planned | Free tier; city/metro filters |
| meetup | Meetup | API | Meetup API | OAuth/API key (Secret Manager) | tech, hobby, networking | Planned | Group queries by geo |
| bandsintown | Bandsintown | API | Bandsintown API | API key (Secret Manager) | music | Planned | Venue + metro queries |
| ticketmaster | Ticketmaster | API | Discovery API | API key (Secret Manager) | concerts, sports | Planned | Large venues |
| predicthq | PredictHQ | API | PredictHQ API | API key (Secret Manager) | major events | Optional | Paid |

---

## Operating notes

- Only use official APIs and ICS/RSS endpoints (no scraping of prohibited pages)
- Record any rate limits, usage notes, or blocks (e.g., UA requirements)
- Add Yield after validation runs (e.g., count for next 7/30/60 days)
- Use consistent naming and stable IDs to aid deduplication

