// Dates as the site prints them: "Nov 8, 2026".
//
// A full timestamp falls on a different calendar day in different places, so the caller says whose
// day it means. A refresh that runs Sunday at 6:15 PM Central is stamped Monday 00:15 UTC: the
// "Data updated" lines name the day in the clan's home zone, where the refresh is scheduled, and
// everything else (a season's end, a bare date, which has no zone to convert) stays on the UTC day.
export const CLAN_TIME_ZONE = "America/Chicago";

const DAY = { year: "numeric", month: "short", day: "numeric" };

export function formatDate(dateStr, timeZone = "UTC") {
  if (!dateStr) return "";
  const raw = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { ...DAY, timeZone });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { ...DAY, timeZone: "UTC" });
  }
  return raw;
}

// When the committed data was last fetched, on the clan's own calendar day.
export const formatUpdated = (dateStr) => formatDate(dateStr, CLAN_TIME_ZONE);
