import { ZIPS } from './zipdb.js';
import { runAgent, renderHTML } from './agent.js';
import { DateTime } from 'luxon';

const zip = process.argv[2] || '80111';
const center = ZIPS[zip];
if (!center) {
  console.error(`Unsupported ZIP: ${zip}`);
  process.exit(1);
}
const radius = Number(process.argv[3] || '10');
const interests = process.argv[4] ? process.argv[4].split(',') : [];

runAgent({ center, radiusMiles: radius, windowDays: 14, interests }).then((events) => {
  const html = renderHTML(events, zip);
  console.log(html);
}).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});