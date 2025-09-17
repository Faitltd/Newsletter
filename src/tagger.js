// Lightweight keyword‑based event tagger.
// Each category is associated with an array of regular expressions.
// When any of these patterns match an event’s title, description, location or source, the category is assigned.
const KEYWORDS = {
  Music: [/concert|band|orchestra|dj\b|open mic/i],
  Arts: [/\bart\b|gallery|exhibit|exhibition|sculpture|craft fair/i],
  Theater: [/theatre|theater|play\b|musical\b|improv show/i],
  Comedy: [/comedy|stand-?up/i],
  Markets: [/market|bazaar|fair|flea market|farmers market/i],
  "Food & Drink": [/brewery|beer|wine|tasting|food truck|restaurant week|cookoff|brunch/i],
  Outdoors: [/hike|trail|garden|nature walk|wildflower|botanic/i],
  Fitness: [/yoga|pilates|boot ?camp|zumba|run\b|5k|spin class/i],
  Sports: [/game\b|match|tournament|league|soccer|baseball|basketball|pickleball|hockey/i],
  "Kids & Family": [/kids|family|children|toddler|storytime|lego|teen|young adult/i],
  Library: [/library|libraries|book club|author talk|storytime/i],
  "Classes & Workshops": [/workshop|class|course|lesson|seminar|training|clinic/i],
  "City & Civic": [/city council|town hall|public meeting|board meeting|candidate forum|planning commission/i]
};

/**
 * Assign interest tags to an event.
 *
 * @param {Object} event Event record with title, description, location and source fields.
 * @returns {Array<string>} Sorted list of unique tags.
 */
export function tagEvent(event) {
  const haystack = `${event.title || ''} ${event.description || ''} ${event.location || ''} ${event.source || ''}`;
  const tags = new Set();
  for (const [category, patterns] of Object.entries(KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(haystack))) {
      tags.add(category);
    }
  }
  // Always tag library events based on source name if not matched above
  if (/Arapahoe Libraries|Douglas County Libraries/i.test(event.source)) {
    tags.add('Library');
  }
  return Array.from(tags).sort();
}