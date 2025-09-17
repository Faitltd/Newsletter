import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import ical from 'node-ical';
import { DateTime } from 'luxon';
import pLimit from 'p-limit';
import nodemailer from 'nodemailer';
import { SOURCES } from './sources.js';
import { ZIPS } from './zipdb.js';
import { tagEvent } from './tagger.js';

// Default timezone for parsing and rendering dates.
const TZ = 'America/Denver';

// Create a simple HTTP client with a custom User‑Agent to politely identify the crawler.
const http = axios.create({
  timeout: 20000,
  headers: { 'User-Agent': 'suburban-events-web/1.0 (+local)' }
});

// XML parser for RSS feeds.
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

// Limit concurrent requests to avoid overloading any single site.
const limit = pLimit(5);

/**
 * Attempt to parse a string into an ISO date in the configured timezone.
 * Accepts ISO 8601, RFC 2822 and a few loose formats.
 * Returns null if parsing fails.
 *
 * @param {string} input
 * @returns {string|null}
 */
function toISO(input) {
  if (!input) return null;
  const iso = DateTime.fromISO(input, { zone: TZ });
  if (iso.isValid) return iso.toISO();
  const rfc = DateTime.fromRFC2822(input, { zone: TZ });
  if (rfc.isValid) return rfc.toISO();
  // Try common simple formats like 'Jul 12' or 'July 12'
  const generic = DateTime.fromFormat(input, 'LLL d', { zone: TZ });
  return generic.isValid ? generic.toISO() : null;
}

/**
 * Extract Event objects from JSON‑LD script tags in a page.
 * If latitude/longitude are present, they are included to allow precise geofencing.
 *
 * @param {cheerio.Root} $ Cheerio root
 * @param {string} base Base URL used as fallback for event links
 * @returns {Array<Object>}
 */
function extractJsonLdEvents($, base) {
  const events = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    if (!text) return;
    try {
      const json = JSON.parse(text);
      const arr = Array.isArray(json) ? json : [json];
      for (const item of arr) {
        if (!item['@type']) continue;
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (!types.some((t) => /Event/i.test(t))) continue;
        const lat = item.location?.geo?.latitude;
        const lon = item.location?.geo?.longitude;
        events.push({
          title: (item.name || '').trim(),
          url: item.url || base,
          description: (item.description || '').trim(),
          start: toISO(item.startDate),
          end: toISO(item.endDate),
          location: item.location?.name || '',
          lat: typeof lat === 'number' ? lat : undefined,
          lon: typeof lon === 'number' ? lon : undefined
        });
      }
    } catch {
      // ignore invalid JSON
    }
  });
  return events;
}

/**
 * Calculate the Haversine distance between two points on Earth in miles.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // earth radius in miles
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Dedupe events by combining those with identical title, date and location.
 * Preference is given to events with richer information (description, location and URL).
 *
 * @param {Array<Object>} events
 * @returns {Array<Object>}
 */
function dedupeEvents(events) {
  const map = new Map();
  const makeKey = (e) => `${e.title.toLowerCase()}|${e.start?.slice(0, 10) || ''}|${(e.location || '').toLowerCase()}`;
  const score = (e) => (e.url ? 1 : 0) + (e.description ? 1 : 0) + (e.location ? 1 : 0) + ((e.tags?.length || 0) ? 1 : 0);
  for (const ev of events) {
    const key = makeKey(ev);
    if (!map.has(key) || score(ev) > score(map.get(key))) {
      map.set(key, ev);
    }
  }
  return Array.from(map.values());
}

// ---- Source ingestion functions ----

async function ingestRss(src) {
  const { data } = await http.get(src.url);
  const feed = xml.parse(data);
  const items = feed?.rss?.channel?.item || feed?.feed?.entry || [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((it) => {
    const title = (it.title?.['#text'] || it.title || '').trim();
    const url = it.link?.href || it.link || src.url;
    const description = (it.description || it.summary || '').trim();
    const date = it.pubDate || it.updated || '';
    return {
      source: src.name,
      title,
      url,
      description,
      start: toISO(date) || null,
      location: '',
    };
  });
}

async function ingestIcs(src) {
  const { data } = await http.get(src.url, { responseType: 'text' });
  const parsed = ical.sync.parseICS(data);
  const items = [];
  for (const key of Object.keys(parsed)) {
    const comp = parsed[key];
    if (!comp || comp.type !== 'VEVENT') continue;
    const dtStart = comp.start instanceof Date ? DateTime.fromJSDate(comp.start, { zone: TZ }) : null;
    const iso = dtStart && dtStart.isValid ? dtStart.toISO() : null;
    items.push({
      source: src.name,
      title: (comp.summary || '').trim(),
      url: (comp.url || src.url),
      description: (comp.description || '').trim(),
      start: iso,
      location: (comp.location || '').trim(),
    });
  }
  return items;
}

async function ingestHtml(src) {
  const { data } = await http.get(src.url);
  const $ = cheerio.load(data);
  const items = [];
  // extract JSON‑LD first
  const jsonEvents = extractJsonLdEvents($, src.url);
  items.push(...jsonEvents);
  // fallback: CSS selectors for generic markup
  $(src.selector).each((_, el) => {
    const $el = $(el);
    const title = ($el.find('h1,h2,h3,.title,.event-title,.EventList-title').first().text() || $el.attr('aria-label') || $el.text()).trim().slice(0, 140);
    const href = $el.find('a').first().attr('href');
    const url = href ? new URL(href, src.url).toString() : src.url;
    const datetimeAttr = $el.find('time').attr('datetime');
    const datetimeText = $el.find('time').first().text();
    const dateGuess = datetimeAttr || datetimeText || '';
    const location = ($el.find('.location,.event-location,.EventListItem-location').first().text() || '').trim();
    const desc = $el.text().trim().slice(0, 1200);
    items.push({
      source: src.name,
      title: title || 'Untitled',
      url,
      description: desc,
      start: toISO(dateGuess),
      location,
    });
  });
  return items;
}

/**
 * Aggregate events from all configured sources.
 * Applies time window and geofencing as early as possible for efficiency.
 * Tags events for interest filtering.
 *
 * @param {Object} options
 * @param {Object} options.center Latitude and longitude
 * @param {number} options.radiusMiles Radius within which events are considered relevant
 * @param {number} options.windowDays Days into the future for which to include events
 * @param {Array<string>} options.interests List of interest names; if empty, no filtering by interests
 */
export async function runAgent({ center, radiusMiles = 10, windowDays = 14, interests = [] }) {
  // Determine time window boundaries in local timezone
  const now = DateTime.now().setZone(TZ);
  const windowStart = now.startOf('day');
  const windowEnd = now.plus({ days: windowDays }).endOf('day');
  // Acquire events concurrently with concurrency limiting
  const tasks = SOURCES.map((src) => limit(async () => {
    try {
      if (src.kind === 'rss') return await ingestRss(src);
      if (src.kind === 'ics') return await ingestIcs(src);
      return await ingestHtml(src);
    } catch (err) {
      // swallow errors; return empty array
      return [];
    }
  }));
  const results = (await Promise.all(tasks)).flat();
  // filter by time window
  const inWindow = results.filter((e) => {
    if (!e.start) return false;
    const dt = DateTime.fromISO(e.start, { zone: TZ });
    return dt.isValid && dt >= windowStart && dt <= windowEnd;
  });
  // geofence: limit to events within radius or unknown coords but matching common locales
  const geoFiltered = inWindow.filter((e) => {
    // if event has lat/lon, check haversine distance
    if (typeof e.lat === 'number' && typeof e.lon === 'number') {
      const d = haversineMiles(e.lat, e.lon, center.lat, center.lon);
      return d <= radiusMiles;
    }
    // fallback: basic textual filter for south-suburban place names
    const text = `${e.location} ${e.description}`.toLowerCase();
    return /greenwood|littleton|englewood|centennial|lone tree|highlands ranch|roxborough|ken caryl|columbine|parker|dtc/.test(text);
  });
  // tag events
  const tagged = geoFiltered.map((e) => {
    const tags = tagEvent(e);
    return { ...e, tags };
  });
  // filter by selected interests
  const interestFiltered = interests && interests.length > 0
    ? tagged.filter((e) => e.tags.some((t) => interests.includes(t)))
    : tagged;
  // dedupe and sort
  const deduped = dedupeEvents(interestFiltered);
  deduped.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return deduped;
}

/**
 * Render an array of events to a simple HTML email body grouped by day.
 * Each event shows its title (with link), time, location, source and tags.
 *
 * @param {Array<Object>} events
 * @param {string} zip ZIP code used to generate this issue; appears in heading
 * @returns {string} HTML string
 */
export function renderHTML(events, zip) {
  const byDay = new Map();
  for (const e of events) {
    const dt = DateTime.fromISO(e.start, { zone: TZ });
    const dayKey = dt.isValid ? dt.toFormat('cccc, LLL d') : 'TBA';
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(e);
  }
  let html = '<!doctype html><meta charset="utf-8"><style>\n';
  html += 'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0}\n';
  html += '.wrap{max-width:760px;margin:0 auto;padding:24px}\n';
  html += 'h1{font-size:24px;margin:0 0 6px}\n';
  html += 'h2{font-size:18px;margin:20px 0 8px}\n';
  html += '.item{padding:8px 0;border-bottom:1px solid #eee}\n';
  html += '.meta{color:#555;font-size:13px}\n';
  html += 'a{color:#0a6;text-decoration:none}\n';
  html += '.src{color:#888;font-size:12px}\n';
  html += '</style><div class="wrap">';
  const brandName = process.env.BRAND_NAME || 'South Suburban Spotlight';
  html += `<h1>${brandName}: Events near ${zip}</h1>`;
  html += '<div class="meta">Covering Greenwood Village, Littleton, Englewood, Centennial, Lone Tree, Highlands Ranch and surrounding areas.</div>';
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => {
    const ad = DateTime.fromFormat(a, 'cccc, LLL d', { zone: TZ });
    const bd = DateTime.fromFormat(b, 'cccc, LLL d', { zone: TZ });
    return ad.toJSDate() - bd.toJSDate();
  });
  for (const day of sortedDays) {
    html += `<h2>${day}</h2>`;
    const list = byDay.get(day) || [];
    for (const e of list) {
      const time = DateTime.fromISO(e.start, { zone: TZ }).toFormat('h:mma');
      const tagList = e.tags && e.tags.length ? ` <span class="src">• ${e.tags.join(', ')}</span>` : '';
      html += '<div class="item">';
      html += `<div><a href="${e.url}">${e.title}</a></div>`;
      html += `<div class="meta">${time} – ${e.location || 'TBA'}${tagList}</div>`;
      html += `<div class="src">${e.source}</div>`;
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}

/**
 * Send an email using nodemailer.
 * Requires SMTP configuration provided via environment variables or passed explicitly.
 *
 * @param {Object} opts
 * @param {string} opts.html The email HTML body
 * @param {string} opts.subject The subject line
 * @param {string} opts.to Recipient email address
 * @param {Object} opts.transportEnv Override environment variables for SMTP
 */
export async function sendEmail({ html, subject, to, transportEnv = process.env }) {
  const host = transportEnv.SMTP_HOST;
  const port = Number(transportEnv.SMTP_PORT || '587');
  const user = transportEnv.SMTP_USER;
  const pass = transportEnv.SMTP_PASS;
  const from = transportEnv.FROM_EMAIL;
  if (!host || !from || !to) throw new Error('SMTP configuration is incomplete');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined
  });
  await transporter.sendMail({ from, to, subject, html });
}