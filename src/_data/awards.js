import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, "elixirAwards.json"), "utf8"));

const AWARD_TYPE_META = {
  war_champ: {
    label: "War Champs",
    singular: "War Champion",
    description: "Top fame earners across the season's war races.",
    order: 1,
    style: "podium",
    metricLabel: "fame",
  },
  donation_champ: {
    label: "Donation Champs",
    singular: "Donation Champion",
    description: "Season leaders in cards donated to the clan.",
    order: 2,
    style: "podium",
    metricLabel: "donations",
  },
  rookie_mvp: {
    label: "Rookie MVPs",
    singular: "Rookie MVP",
    description: "First-season members with the strongest war contributions.",
    order: 3,
    style: "podium",
    metricLabel: "fame",
  },
  perfect_week: {
    label: "Perfect Week",
    singular: "Perfect Week",
    description: "Members who used every available war battle slot in a week.",
    order: 4,
    style: "weekly",
    metricLabel: "battle days",
  },
  donation_champ_weekly: {
    label: "Donation Champ (Weekly)",
    singular: "Weekly Donation Champ",
    description: "Top donator for each week of the season.",
    order: 5,
    style: "weekly",
    metricLabel: "donations",
  },
  war_participant: {
    label: "War Participants",
    singular: "War Participant",
    description: "Every member who logged fame in a war race.",
    order: 6,
    style: "list",
    metricLabel: "fame",
  },
};

const TYPE_ORDER = Object.keys(AWARD_TYPE_META).sort(
  (a, b) => AWARD_TYPE_META[a].order - AWARD_TYPE_META[b].order,
);

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function sortByRankThenMetric(awards) {
  return [...awards].sort((a, b) => {
    const ra = a.rank ?? 999;
    const rb = b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    return (b.metric_value ?? 0) - (a.metric_value ?? 0);
  });
}

function sortByMetricDesc(awards) {
  return [...awards].sort((a, b) => (b.metric_value ?? 0) - (a.metric_value ?? 0));
}

const seasons = [...(raw.seasons || [])]
  .sort((a, b) => b.season_id - a.season_id)
  .map((season) => {
    const byTypeMap = groupBy(season.awards || [], (a) => a.award_type);
    const byType = {};
    for (const [type, awards] of byTypeMap.entries()) {
      byType[type] =
        type === "war_participant" ? sortByMetricDesc(awards) : sortByRankThenMetric(awards);
    }

    const perfectWeekBySection = [...groupBy(byType.perfect_week || [], (a) => a.section_index ?? 0)]
      .sort((a, b) => a[0] - b[0])
      .map(([section_index, awards]) => ({
        section_index,
        week_label: `Week ${Number(section_index) + 1}`,
        awards: sortByMetricDesc(awards),
      }));

    const donationChampWeeklyBySection = [
      ...groupBy(byType.donation_champ_weekly || [], (a) => a.section_index ?? 0),
    ]
      .sort((a, b) => a[0] - b[0])
      .map(([section_index, awards]) => {
        const sorted = sortByRankThenMetric(awards);
        const meta = sorted[0]?.metadata || {};
        return {
          section_index,
          week_label: `Week ${Number(section_index) + 1}`,
          week_key: meta.week_key || null,
          week_ending: meta.week_ending || null,
          awards: sorted,
        };
      });

    const categories = TYPE_ORDER.filter(
      (type) => byType[type] && byType[type].length > 0,
    ).map((type) => ({
      type,
      ...AWARD_TYPE_META[type],
      awards: byType[type],
    }));

    return {
      ...season,
      byType,
      perfectWeekBySection,
      donationChampWeeklyBySection,
      categories,
      awardCount: (season.awards || []).length,
    };
  });

for (let i = 0; i < seasons.length; i += 1) {
  const newer = seasons[i - 1];
  const older = seasons[i + 1];
  seasons[i].newerSeasonId = newer ? newer.season_id : null;
  seasons[i].olderSeasonId = older ? older.season_id : null;
}

const featuredSeason =
  seasons.find((s) => s.byType.war_champ && s.byType.war_champ.length > 0) || null;

export default {
  generated_at: raw.generated_at || null,
  seasons,
  featuredSeason,
  awardTypeMeta: AWARD_TYPE_META,
  typeOrder: TYPE_ORDER,
};
