// List of all event sources targeted by the aggregator.
// Each entry has a kind ('rss', 'ics', or 'html'), a human‑readable name, a URL to fetch, and (for HTML) a CSS selector to locate event items.
export const SOURCES = [
  // City calendars
  { kind: 'rss', name: 'Greenwood Village – RSS', url: 'https://www.greenwoodvillage.com/rss.aspx?cat=29' },
  { kind: 'ics', name: 'Greenwood Village – iCal', url: 'https://www.greenwoodvillage.com/iCalendar.aspx' },
  { kind: 'html', name: 'City of Littleton – Events', url: 'https://www.littletonco.gov/Community/City-Calendars', selector: '.event-list-item, .calendar-list' },
  { kind: 'html', name: 'Englewood – Events', url: 'https://www.englewoodco.gov/our-city/events', selector: '.listing .event' },
  { kind: 'html', name: 'Centennial – Community Calendar', url: 'https://www.centennialco.gov/Residents/Community-Resource-Hub/Community-Calendar', selector: '[data-ct-event]' },
  { kind: 'html', name: 'City of Lone Tree – Events', url: 'https://cityoflonetree.com/events/', selector: '.tribe-events-calendar-list__event, .event' },
  // Recreation and community associations
  { kind: 'html', name: 'HRCA – Events', url: 'https://hrcaonline.org/events', selector: '.EventList .EventListItem, .events-list .event' },
  { kind: 'html', name: 'South Suburban – REC1', url: 'https://register.ssprd.org/CO/south-suburban-parks-rec/catalog/index?filter=dGFiJTVCMTEzMTklNUQ9MSZzZWFyY2g9', selector: '.section .item' },
  // Libraries
  { kind: 'html', name: 'Arapahoe Libraries – Events', url: 'https://arapahoelibraries.bibliocommons.com/v2/events', selector: "[data-testid='event-card']" },
  { kind: 'html', name: 'Douglas County Libraries – Events', url: 'https://go.dcl.org/events', selector: '.event, .event-list-item, .list-item' },
  // Large venues and attractions
  { kind: 'html', name: 'Fiddler’s Green Amphitheatre', url: 'https://www.fiddlersgreenamp.com/calendar/', selector: '.event, .event-card, .calendar-listing' },
  { kind: 'html', name: 'Hudson Gardens – Public Events', url: 'https://www.hudsongardens.org/calendar/', selector: '.tribe-events-calendar-list__event, .event' },
  { kind: 'html', name: 'Lone Tree Arts Center', url: 'https://www.lonetreeartscenter.org/events', selector: '.event, .event-listing' },
  { kind: 'html', name: 'The Streets at SouthGlenn – Events & Sales', url: 'https://www.shopsouthglenn.com/events-sales/', selector: '.event, .events, .list' },
  { kind: 'html', name: 'Park Meadows – News & Events', url: 'https://www.parkmeadows.com/en/events/', selector: "a[href*='/events/'], .event" },
  { kind: 'html', name: 'Aspen Grove – Events', url: 'https://aspengrovecenter.com/event-listings/', selector: '.event, .listing' },
  { kind: 'html', name: 'High Line Canal Conservancy – Events', url: 'https://highlinecanal.org/events/', selector: '.tribe-events-calendar-list__event, .event' }
];