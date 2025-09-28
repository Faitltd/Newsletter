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

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Simple in-memory cache per calendar URL
const cache = new Map(); // url -> { ts: number, data: any }

async function fetchCalendar(url) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.data;
  const data = await ical.async.fromURL(url);
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
          }
        })
      )
    );

    // Sort soonest first
    all.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ count: all.length, events: all });
  } catch (err) {
    console.error('Error in /api/events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Server listening on port ' + port));


