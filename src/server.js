import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import fs from 'fs';
import crypto from 'crypto';
import { ZIPS } from './zipdb.js';
import { INTERESTS } from './interests.js';
import { runAgent, renderHTML, sendEmail } from './agent.js';

// Determine absolute directory of current file for relative file resolution.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize SQLite database and ensure schema exists.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'subscribers.db');
const db = new Database(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  zip TEXT NOT NULL,
  radius_miles INTEGER NOT NULL DEFAULT 10,
  interests TEXT NOT NULL DEFAULT '[]',
  token TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_zip ON subscribers (email, zip);
`);

/**
 * Generate a secure random token for confirmation links.
 *
 * @returns {string} 32‑char hex string
 */
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Validate an email address with a basic regex.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

/**
 * Render the subscription form.
 */
app.get('/', (_req, res) => {
  // Load interest checkboxes HTML from file for reuse.
  const checkboxes = fs.readFileSync(path.join(__dirname, 'interests.html'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>South Suburban Events Signup</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:40px auto;max-width:620px;padding:0 20px}
      label{display:block;margin:0.6rem 0 0.2rem}
      fieldset{border:none;padding:0;margin-top:1rem}
      button{margin-top:12px;padding:10px 16px;font-size:16px}
    </style>
  </head><body>
    <h1>Subscribe to Local Events</h1>
    <form method="POST" action="/subscribe">
      <label>Email</label>
      <input name="email" type="email" required style="width:100%;padding:8px;font-size:16px">
      <label>ZIP Code</label>
      <input name="zip" pattern="\\d{5}" required style="width:100%;padding:8px;font-size:16px">
      <label>Radius (miles)</label>
      <input name="radius" type="number" min="3" max="25" value="10" style="width:100%;padding:8px;font-size:16px">
      <fieldset>
        <legend>Interests (optional)</legend>
        ${checkboxes}
      </fieldset>
      <button type="submit">Subscribe</button>
    </form>
  </body></html>`;
  res.type('html').send(html);
});

/**
 * Handle subscription requests.
 */
app.post('/subscribe', async (req, res) => {
  const emailRaw = String(req.body.email || '').trim().toLowerCase();
  const zipRaw = String(req.body.zip || '').trim();
  const radiusRaw = Number(req.body.radius || '10');
  const interestSelection = req.body.interests || [];
  // Validate inputs
  if (!isValidEmail(emailRaw)) {
    return res.status(400).send('Invalid email address.');
  }
  if (!/^\d{5}$/.test(zipRaw) || !ZIPS[zipRaw]) {
    return res.status(400).send('Unsupported or invalid ZIP code.');
  }
  const radius = Math.max(3, Math.min(25, radiusRaw));
  // Normalize interests to an array
  const selected = Array.isArray(interestSelection) ? interestSelection : [interestSelection];
  const interests = selected.filter((v) => INTERESTS.includes(v));
  // Generate or reuse token
  const existing = db.prepare('SELECT confirmed, token FROM subscribers WHERE email=? AND zip=?').get(emailRaw, zipRaw);
  const token = existing ? existing.token : generateToken();
  const createdAt = DateTime.utc().toISO();
  db.prepare(`INSERT OR REPLACE INTO subscribers (email, zip, radius_miles, interests, token, confirmed, created_at)
    VALUES (@email, @zip, @radius_miles, @interests, @token,
      COALESCE((SELECT confirmed FROM subscribers WHERE email=@email AND zip=@zip),0), @created_at)`)
    .run({ email: emailRaw, zip: zipRaw, radius_miles: radius, interests: JSON.stringify(interests), token, created_at: createdAt });
  // Send confirmation email
  const confirmUrl = `${req.protocol}://${req.get('host')}/confirm?email=${encodeURIComponent(emailRaw)}&zip=${encodeURIComponent(zipRaw)}&token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      html: `<p>Hello! Please confirm your subscription for events near ${zipRaw}.</p><p><a href="${confirmUrl}">Click here to confirm</a></p>`,
      subject: `Confirm your subscription for ${zipRaw}`,
      to: emailRaw,
      transportEnv: process.env
    });
    res.type('text').send('Thanks! Please check your email to confirm your subscription.');
  } catch (err) {
    res.status(500).send('Failed to send confirmation email. Please try again later.');
  }
});

/**
 * Confirmation endpoint. Activates a subscriber’s record if the token matches.
 */
app.get('/confirm', (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  const zip = String(req.query.zip || '');
  const token = String(req.query.token || '');
  const row = db.prepare('SELECT id, token FROM subscribers WHERE email=? AND zip=?').get(email, zip);
  if (!row || row.token !== token) {
    return res.status(400).send('Invalid confirmation link.');
  }
  db.prepare('UPDATE subscribers SET confirmed=1 WHERE id=?').run(row.id);
  res.type('text').send('Subscription confirmed! You will receive the next newsletter.');
});

/**
 * Preview endpoint for testing event output. Does not email anything.
 */
app.get('/preview/:zip', async (req, res) => {
  const zip = String(req.params.zip || '');
  const center = ZIPS[zip];
  if (!center) return res.status(404).send('Unsupported ZIP.');
  try {
    const events = await runAgent({ center, radiusMiles: 10, windowDays: 14, interests: [] });
    const html = renderHTML(events, zip);
    res.type('html').send(html);
  } catch (err) {
    res.status(500).send('Error generating preview.');
  }
});

/**
 * Weekly send task triggered by a POST request. Loops through confirmed subscribers and sends them their personalized event list.
 */
app.post('/tasks/send-weekly', async (_req, res) => {
  const subs = db.prepare('SELECT email, zip, radius_miles, interests, token FROM subscribers WHERE confirmed=1').all();
  let sentCount = 0;
  for (const sub of subs) {
    const center = ZIPS[sub.zip];
    if (!center) continue;
    const interests = JSON.parse(sub.interests || '[]');
    try {
      const events = await runAgent({ center, radiusMiles: sub.radius_miles, windowDays: 14, interests });
      if (events.length === 0) continue;
      const htmlBody = renderHTML(events, sub.zip);
      const baseUrl = process.env.PUBLIC_BASE_URL || '';
      const privacyUrl = process.env.PRIVACY_URL || `${baseUrl}/privacy`;
      const termsUrl = process.env.TERMS_URL || `${baseUrl}/terms`;
      const unsubscribeUrl = sub.token ? `${baseUrl}/unsubscribe?token=${encodeURIComponent(sub.token)}` : '';
      const footer = `
<div style="margin-top:16px;color:#666;font-size:12px;line-height:1.4">
  <div>You’re receiving this because you subscribed at ${baseUrl || 'our site'}.</div>
  ${unsubscribeUrl ? `<div>Unsubscribe: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></div>` : ''}
  <div>Privacy: <a href="${privacyUrl}">${privacyUrl}</a> &nbsp; Terms: <a href="${termsUrl}">${termsUrl}</a></div>
</div>`;
      const html = `${htmlBody}${footer}`;
      const subject = `Events near ${sub.zip} • ${DateTime.now().setZone('America/Denver').toFormat('MMM d')}`;
      await sendEmail({ html, subject, to: sub.email, transportEnv: process.env });
      sentCount++;
    } catch {
      // continue on error
    }
  }
  res.json({ ok: true, sent: sentCount });
});

// Start the server when invoked directly (not imported)
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || '3000');
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

export default app;

/**
 * Unsubscribe endpoint. Marks subscriber as unconfirmed using a token.
 */
app.get('/unsubscribe', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).send('Missing token.');
  const row = db.prepare('SELECT id FROM subscribers WHERE token=?').get(token);
  if (!row) return res.status(404).send('Not found.');
  db.prepare('UPDATE subscribers SET confirmed=0 WHERE id=?').run(row.id);
  res.type('text').send('You’ve been unsubscribed.');
});

// Minimal Privacy and Terms routes
app.get('/privacy', (_req, res) => {
  res.type('html').send(`
  <h1>Privacy Policy</h1>
  <p>We collect your email, ZIP code, radius, and optional interests to send a local events newsletter. We do not sell personal data. You can unsubscribe at any time via the link in each email.</p>
  <p>Contact: privacy@itsfait.com</p>`);
});

app.get('/terms', (_req, res) => {
  res.type('html').send(`
  <h1>Terms of Service</h1>
  <p>This newsletter is provided “as is.” Listings are informational and may change; verify details with organizers. By subscribing, you consent to receive weekly emails and occasional service notices.</p>
  <p>Contact: terms@itsfait.com</p>`);
});