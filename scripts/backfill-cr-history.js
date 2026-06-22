#!/usr/bin/env node

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  dataDbPath,
  generateDataExports,
  importClanSnapshotRow,
  importMemberSnapshotRow,
  localDate,
  openDataDb,
  upsertRiverRaceLog,
  writeDataExports,
} from "./clash-data-store.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = resolve(repoRoot, "..", "elixir-bot", "elixir-v5.db");
const dataDir = resolve(repoRoot, "src", "_data");
const clanPath = resolve(dataDir, "clan.json");
const rosterPath = resolve(dataDir, "roster.json");
const args = process.argv.slice(2);

function hasArg(name) {
  return args.includes(name);
}

function argValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? "" : args[index + 1] || "";
}

function printHelp() {
  console.log(`Usage: node scripts/backfill-cr-history.js [options]

Options:
  --source PATH   Source SQLite DB. Defaults to ../elixir-bot/elixir-v5.db.
  --reset         Delete data/clash-royale.sqlite before importing.
  --no-export     Import SQLite history without rewriting generated JSON.
  --help          Show this help.

This is a one-time migration helper for historical Clash Royale API data.`);
}

function readJson(path, fallback = {}) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

function sourceUri(path) {
  return `${pathToFileURL(path).href}?mode=ro&immutable=1`;
}

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function badgeByName(badges, names) {
  const wanted = new Set(names);
  return Array.isArray(badges) ? badges.find((badge) => wanted.has(badge.name)) ?? null : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function profileFields(row) {
  const badges = parseJson(row.badges_json, []);
  const years = badgeByName(badges, ["YearsPlayed"]);
  const battleWins = badgeByName(badges, ["BattleWins"]);
  const collection = badgeByName(badges, ["CollectionLevel"]);
  const warWins = badgeByName(badges, ["ClanWarWins", "ClanWarsVeteran"]);
  const donations = badgeByName(badges, ["ClanDonations"]);
  const accountAgeDays = numberOrNull(years?.progress);

  return {
    battle_wins: firstNumber(row.wins, battleWins?.progress),
    battle_count: numberOrNull(row.battle_count),
    three_crown_wins: numberOrNull(row.three_crown_wins),
    account_age_days: accountAgeDays,
    account_age_years: firstNumber(years?.level, accountAgeDays === null ? null : Math.floor(accountAgeDays / 365)),
    collection_level: numberOrNull(collection?.progress),
    clan_war_wins: firstNumber(warWins?.progress, row.war_day_wins),
    total_clan_donations: firstNumber(donations?.progress, row.total_donations),
    badge_count: Array.isArray(badges) ? badges.length : null,
  };
}

function importClanDaily(source, target) {
  const rows = source.prepare(`
    SELECT metric_date, clan_tag, clan_name, member_count, open_slots, clan_score,
           clan_war_trophies, required_trophies, weekly_donations_total,
           total_member_trophies, observed_at, raw_json
    FROM clan_daily_metrics
    ORDER BY metric_date
  `).all();
  for (const row of rows) {
    const raw = parseJson(row.raw_json, {});
    importClanSnapshotRow(target, {
      snapshot_date: row.metric_date,
      observed_at: row.observed_at,
      clan_tag: row.clan_tag,
      clan_name: row.clan_name,
      type: raw?.type ?? null,
      location_name: raw?.location?.name ?? null,
      member_count: row.member_count,
      open_slots: row.open_slots,
      clan_score: row.clan_score,
      total_trophies: row.total_member_trophies,
      clan_war_trophies: row.clan_war_trophies,
      donations_per_week: row.weekly_donations_total,
      required_trophies: row.required_trophies,
    });
  }
  return rows.length;
}

function importMemberDaily(source, target) {
  const rows = source.prepare(`
    SELECT d.metric_date, m.player_tag, m.current_name AS player_name,
           d.exp_level, d.trophies, d.best_trophies, d.clan_rank,
           d.donations_week, d.donations_received_week, d.last_seen_api
    FROM member_daily_metrics d
    JOIN members m ON m.member_id = d.member_id
    ORDER BY d.metric_date, d.clan_rank
  `).all();
  for (const row of rows) {
    importMemberSnapshotRow(target, {
      snapshot_date: row.metric_date,
      player_tag: row.player_tag,
      player_name: row.player_name,
      exp_level: row.exp_level,
      trophies: row.trophies,
      best_trophies: row.best_trophies,
      clan_rank: row.clan_rank,
      donations: row.donations_week,
      donations_received: row.donations_received_week,
      last_seen: row.last_seen_api,
    });
  }
  return rows.length;
}

function importProfileSnapshots(source, target) {
  const rows = source.prepare(`
    SELECT p.fetched_at, m.player_tag, m.current_name AS player_name,
           p.exp_level, p.trophies, p.best_trophies, p.wins, p.battle_count,
           p.total_donations, p.donations, p.donations_received, p.war_day_wins,
           p.three_crown_wins, p.badges_json
    FROM player_profile_snapshots p
    JOIN members m ON m.member_id = p.member_id
    ORDER BY p.fetched_at
  `).all();
  for (const row of rows) {
    importMemberSnapshotRow(target, {
      snapshot_date: localDate(row.fetched_at),
      player_tag: row.player_tag,
      player_name: row.player_name,
      exp_level: row.exp_level,
      trophies: row.trophies,
      best_trophies: row.best_trophies,
      donations: row.donations,
      donations_received: row.donations_received,
      ...profileFields(row),
    });
  }
  return rows.length;
}

function importWarRaces(source, target) {
  const rows = source.prepare(`
    SELECT season_id, section_index, created_date, our_rank, trophy_change,
           our_fame, total_clans, finish_time, our_clan_score, raw_json
    FROM war_races
    ORDER BY season_id, section_index
  `).all();
  const items = rows.map((row) => {
    const raw = parseJson(row.raw_json, null);
    if (raw) {
      return raw;
    }
    return {
      seasonId: row.season_id,
      sectionIndex: row.section_index,
      createdDate: row.created_date,
      standings: [
        {
          rank: row.our_rank,
          trophyChange: row.trophy_change,
          clan: {
            tag: "#J2RGCRVG",
            name: "POAP KINGS",
            fame: row.our_fame,
            finishTime: row.finish_time,
            clanScore: row.our_clan_score,
          },
        },
      ],
    };
  });
  upsertRiverRaceLog(target, { clanTag: "#J2RGCRVG", items });
  return rows.length;
}

function main() {
  if (hasArg("--help")) {
    printHelp();
    return;
  }

  const sourcePath = resolve(argValue("--source") || defaultSource);
  if (!existsSync(sourcePath)) {
    throw new Error(`Source database not found: ${sourcePath}`);
  }
  if (hasArg("--reset") && existsSync(dataDbPath)) {
    rmSync(dataDbPath);
  }

  const source = new DatabaseSync(sourceUri(sourcePath));
  const target = openDataDb();
  try {
    target.exec("BEGIN");
    const clanRows = importClanDaily(source, target);
    const memberRows = importMemberDaily(source, target);
    const profileRows = importProfileSnapshots(source, target);
    target.exec("COMMIT");
    const warRows = importWarRaces(source, target);

    const changedExports = hasArg("--no-export")
      ? []
      : writeDataExports(generateDataExports(target, {
        clan: readJson(clanPath),
        roster: readJson(rosterPath, { members: [] }),
      })).map((path) => path.replace(`${repoRoot}/`, ""));

    console.log(`Imported ${clanRows} clan daily rows.`);
    console.log(`Imported ${memberRows} member daily rows.`);
    console.log(`Imported ${profileRows} profile snapshots.`);
    console.log(`Imported ${warRows} war race weeks.`);
    console.log(`changed_files=data/clash-royale.sqlite${changedExports.length ? `,${changedExports.join(",")}` : ""}`);
  } catch (error) {
    try {
      target.exec("ROLLBACK");
    } catch {
      // The failure may have happened after the import transaction committed.
    }
    throw error;
  } finally {
    source.close();
    target.close();
  }
}

main();
