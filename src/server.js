const express = require('express');
const bodyParser = require('body-parser');
const ical = require('node-ical');
const cors = require('cors');
const path = require('path');
const calendars = require('./calendars');

// Config
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://faitevents.beehiiv.com';
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '600000', 10); // 10 minutes
const FETCH_CONCURRENCY = parseInt(process.env.FETCH_CONCURRENCY || '4', 10);


// Optional API providers (opt-in via env)
const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN || '';
// Auto-enable Eventbrite if token present, unless explicitly disabled via EVENTBRITE_ENABLED=false
const EVENTBRITE_ENABLED = Boolean(EVENTBRITE_TOKEN) && (process.env.EVENTBRITE_ENABLED !== 'false');
const TM_API_KEY = process.env.TM_API_KEY || '';
// Auto-enable Ticketmaster if key present, unless explicitly disabled via TM_ENABLED=false
const TM_ENABLED = Boolean(TM_API_KEY) && (process.env.TM_ENABLED !== 'false');
// South Suburban Denver defaults; configurable via env
const API_GEO_LAT = process.env.API_GEO_LAT || '39.6133';
const API_GEO_LON = process.env.API_GEO_LON || '-104.9895';
const API_RADIUS_MILES = process.env.API_RADIUS_MILES || '25';

// Per-API status (last fetch outcome)
const apiStatus = new Map(); // name -> { ok: boolean, ts: number, name: string, error?: string }


const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Simple in-memory cache per calendar URL
const cache = new Map(); // url -> { ts: number, data: any }

// Per-source status (last fetch outcome)
const sourceStatus = new Map(); // url -> { ok: boolean, ts: number, name: string, error?: string }

async function fetchCalendar(url) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.data;
  const requestOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FAITEvents/1.0; +https://events.itsfait.com)'
    },
    timeout: 15000
  };
  const data = await ical.async.fromURL(url, requestOptions);
  cache.set(url, { ts: now, data });
  return data;
}

// Tiny concurrency limiter (no dependency)
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    setImmediate(next);
  });
}
const limit = pLimit(FETCH_CONCURRENCY);

// Optional: Eventbrite integration
async function fetchEventbrite(now, cutoff) {
  if (!EVENTBRITE_ENABLED || !EVENTBRITE_TOKEN) return [];
  try {
    const params = new URLSearchParams({
      'location.latitude': String(API_GEO_LAT),
      'location.longitude': String(API_GEO_LON),
      'location.within': `${API_RADIUS_MILES}mi`,
      'start_date.range_start': now.toISOString(),
      'start_date.range_end': cutoff.toISOString(),
      'expand': 'venue',
      'page': '1'
    });
    const url = 'https://www.eventbriteapi.com/v3/events/search/?' + params.toString();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${EVENTBRITE_TOKEN}` } });
    if (!res.ok) throw new Error(`Eventbrite HTTP ${res.status}`);
    const json = await res.json();
    const events = Array.isArray(json.events) ? json.events : [];
    apiStatus.set('Eventbrite', { ok: true, ts: Date.now(), name: 'Eventbrite' });
    return events.map((e) => ({
      source: 'Eventbrite',
      title: (e.name && e.name.text) || '',
      description: (e.description && e.description.text) || '',
      location: (e.venue && (e.venue.name || (e.venue.address && e.venue.address.localized_address_display))) || '',
      start: e.start && (e.start.utc ? new Date(e.start.utc) : (e.start.local ? new Date(e.start.local) : null)),
      end: e.end && (e.end.utc ? new Date(e.end.utc) : (e.end.local ? new Date(e.end.local) : null)),
      url: e.url || ''
    })).filter((x) => x.start && x.start >= now && x.start <= cutoff);
  } catch (err) {
    console.error('Eventbrite fetch failed:', err && err.message ? err.message : err);
    apiStatus.set('Eventbrite', { ok: false, ts: Date.now(), name: 'Eventbrite', error: (err && err.message) ? err.message : String(err) });
    return [];
  }
}

// Optional: Ticketmaster integration
async function fetchTicketmaster(now, cutoff) {
  if (!TM_ENABLED || !TM_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      apikey: TM_API_KEY,
      latlong: `${API_GEO_LAT},${API_GEO_LON}`,
      radius: String(API_RADIUS_MILES),
      unit: 'miles',
      countryCode: 'US',
      size: '100',
      startDateTime: now.toISOString(),
      endDateTime: cutoff.toISOString(),
    });
    const url = 'https://app.ticketmaster.com/discovery/v2/events.json?' + params.toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Ticketmaster HTTP ${res.status}`);
    const json = await res.json();
    const events = (json && json._embedded && Array.isArray(json._embedded.events)) ? json._embedded.events : [];
    apiStatus.set('Ticketmaster', { ok: true, ts: Date.now(), name: 'Ticketmaster' });
    return events.map((e) => ({
      source: 'Ticketmaster',
      title: e.name || '',
      description: '',
      location: (e._embedded && e._embedded.venues && e._embedded.venues[0] && e._embedded.venues[0].name) || '',
      start: (e.dates && e.dates.start && (e.dates.start.dateTime ? new Date(e.dates.start.dateTime) : (e.dates.start.localDate ? new Date(e.dates.start.localDate) : null))) || null,
      end: null,
      url: e.url || ''
    })).filter((x) => x.start && x.start >= now && x.start <= cutoff);
  } catch (err) {
    console.error('Ticketmaster fetch failed:', err && err.message ? err.message : err);
    apiStatus.set('Ticketmaster', { ok: false, ts: Date.now(), name: 'Ticketmaster', error: (err && err.message) ? err.message : String(err) });
    return [];
  }
}


// Root (optional info/health page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// /api/events - fetch next N days across calendars (parallel + cached)
app.get('/api/events', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '14', 10);
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const all = [];

    await Promise.all(
      calendars.map((cal) =>
        limit(async () => {
          try {
            const data = await fetchCalendar(cal.url);
            sourceStatus.set(cal.url, { ok: true, ts: Date.now(), name: cal.name });
            for (const key in data) {
              const ev = data[key];
              if (ev && ev.type === 'VEVENT' && ev.start instanceof Date) {
                if (ev.start >= now && ev.start <= cutoff) {
                  all.push({
                    source: cal.name,
                    title: ev.summary || '',
                    description: ev.description || '',
                    location: ev.location || '',
                    start: ev.start,
                    end: ev.end || null,
                    url: (ev.url || ev.href || ''),
                  });
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch ' + cal.name + ':', (err && err.message) ? err.message : err);
            sourceStatus.set(cal.url, { ok: false, ts: Date.now(), name: cal.name, error: (err && err.message) ? err.message : String(err) });
          }
        })
      )
    );

    // Optionally augment with API providers
    try {
      const [eb, tm] = await Promise.all([
        fetchEventbrite(now, cutoff),
        fetchTicketmaster(now, cutoff)
      ]);
      if (Array.isArray(eb) && eb.length) all.push(...eb);
      if (Array.isArray(tm) && tm.length) all.push(...tm);
    } catch (_) {
      // Individual fetchers record their own status; continue regardless
    }


    // Sort soonest first
    all.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ count: all.length, events: all });
  } catch (err) {
    console.error('Error in /api/events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Lightweight health/status endpoint
app.get('/api/health', (req, res) => {
  const status = calendars.map((c) => {
    const cached = cache.get(c.url);
    const s = sourceStatus.get(c.url);
    return {
      name: c.name,
      url: c.url,
      cachedAt: cached ? new Date(cached.ts).toISOString() : null,
      lastStatus: s || null,
    };
  });
  res.json({
    ok: true,
    config: {
      cors_origin: ALLOWED_ORIGIN,
      cache_ttl_ms: CACHE_TTL_MS,
      fetch_concurrency: FETCH_CONCURRENCY,
      api_geo: { lat: Number(API_GEO_LAT), lon: Number(API_GEO_LON), radius_miles: Number(API_RADIUS_MILES) },
      providers: { eventbrite_enabled: EVENTBRITE_ENABLED, ticketmaster_enabled: TM_ENABLED },
      now: new Date().toISOString(),
    },
    sources: status,
    apis: [
      { name: 'Eventbrite', enabled: EVENTBRITE_ENABLED, lastStatus: apiStatus.get('Eventbrite') || null },
      { name: 'Ticketmaster', enabled: TM_ENABLED, lastStatus: apiStatus.get('Ticketmaster') || null },
    ],
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Server listening on port ' + port));


