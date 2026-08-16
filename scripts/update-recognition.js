import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "src/_data/recognition.json");
const databasePath = resolve(
  projectRoot,
  process.env.ELIXIR_DB_PATH || "../elixir-bot/elixir-v51.db",
);
const checkOnly = process.argv.includes("--check");

if (!existsSync(databasePath)) {
  console.error("Elixir database not found. Set ELIXIR_DB_PATH to a readable v5.1 database.");
  process.exit(1);
}

const db = new DatabaseSync(databasePath, { readOnly: true });

const seasons = db
  .prepare(
    `SELECT season_id, started_at, ended_at, final_rank
       FROM war_seasons
      WHERE ended_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM awards WHERE awards.season_id = war_seasons.season_id
        )
      ORDER BY season_id DESC
      LIMIT 6`,
  )
  .all();

const awardRows = db
  .prepare(
    `SELECT a.season_id, a.award_type, a.rank, a.metric_value, a.metric_unit,
            a.player_tag, COALESCE(p.display_name, p.current_name) AS player_name
       FROM awards a
       LEFT JOIN players p ON p.player_tag = a.player_tag
      WHERE a.season_id = ?
        AND a.award_type IN (
          'war_champ', 'free_pass', 'iron_king', 'rookie_mvp', 'donation_champ'
        )
      ORDER BY CASE a.award_type
                 WHEN 'war_champ' THEN 1
                 WHEN 'free_pass' THEN 2
                 WHEN 'iron_king' THEN 3
                 WHEN 'rookie_mvp' THEN 4
                 WHEN 'donation_champ' THEN 5
                 ELSE 6
               END,
               a.rank ASC,
               player_name COLLATE NOCASE`,
  );

const cleanAward = (row) => ({
  rank: Number(row.rank),
  name: row.player_name || row.player_tag,
  tag: String(row.player_tag || "").replace(/^#/, ""),
  metricValue: Number(row.metric_value || 0),
  metricUnit: row.metric_unit || null,
});

const projection = {
  updated: seasons[0]?.ended_at || null,
  source: "Elixir durable awards ledger",
  state: "completed seasons only",
  seasons: seasons.map((season) => {
    const awards = awardRows.all(season.season_id);
    const byType = (type) => awards.filter((award) => award.award_type === type).map(cleanAward);
    return {
      seasonId: Number(season.season_id),
      startedAt: season.started_at,
      endedAt: season.ended_at,
      finalRank: season.final_rank == null ? null : Number(season.final_rank),
      warChamp: byType("war_champ"),
      freePass: byType("free_pass")[0] || null,
      ironKings: byType("iron_king"),
      rookieMvp: byType("rookie_mvp"),
      donationChamp: byType("donation_champ"),
    };
  }),
};

db.close();

const next = `${JSON.stringify(projection, null, 2)}\n`;
const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
const changed = current !== next;

console.log(`changed=${changed}`);
console.log("changed_files=" + (changed ? "src/_data/recognition.json" : ""));

if (checkOnly) process.exit(changed ? 2 : 0);
if (!changed) process.exit(0);

const temporaryPath = `${outputPath}.tmp`;
writeFileSync(temporaryPath, next, "utf8");
renameSync(temporaryPath, outputPath);
