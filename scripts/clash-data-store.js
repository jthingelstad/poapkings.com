import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = dirname(scriptDir);
export const dataDbPath = join(repoRoot, "data", "clash-royale.sqlite");
export const dataDir = join(repoRoot, "src", "_data");

const currentExportPaths = {
  clanInsights: join(dataDir, "clanInsights.json"),
  clanTrends: join(dataDir, "clanTrends.json"),
  rosterExplorer: join(dataDir, "rosterExplorer.json"),
  warHistory: join(dataDir, "warHistory.json"),
};

export function openDataDb({ path = dataDbPath, readOnly = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  if (!readOnly) {
    ensureDataDb(db);
  }
  return db;
}

export function ensureDataDb(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clan_daily_snapshots (
      snapshot_date TEXT PRIMARY KEY,
      observed_at TEXT NOT NULL,
      clan_tag TEXT NOT NULL,
      clan_name TEXT,
      type TEXT,
      location_name TEXT,
      member_count INTEGER,
      open_slots INTEGER,
      clan_score INTEGER,
      total_trophies INTEGER,
      clan_war_trophies INTEGER,
      donations_per_week INTEGER,
      required_trophies INTEGER
    );

    CREATE TABLE IF NOT EXISTS member_daily_snapshots (
      snapshot_date TEXT NOT NULL,
      player_tag TEXT NOT NULL,
      player_name TEXT,
      role TEXT,
      clan_rank INTEGER,
      previous_clan_rank INTEGER,
      trophies INTEGER,
      best_trophies INTEGER,
      arena_name TEXT,
      last_seen TEXT,
      donations INTEGER,
      donations_received INTEGER,
      exp_level INTEGER,
      battle_wins INTEGER,
      battle_count INTEGER,
      three_crown_wins INTEGER,
      account_age_days INTEGER,
      account_age_years INTEGER,
      collection_level INTEGER,
      clan_war_wins INTEGER,
      total_clan_donations INTEGER,
      badge_count INTEGER,
      PRIMARY KEY (snapshot_date, player_tag)
    );

    CREATE TABLE IF NOT EXISTS river_race_weeks (
      season_id INTEGER NOT NULL,
      section_index INTEGER NOT NULL,
      created_date TEXT,
      our_rank INTEGER,
      trophy_change INTEGER,
      our_fame INTEGER,
      total_clans INTEGER,
      finish_time TEXT,
      our_clan_score INTEGER,
      is_colosseum INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (season_id, section_index)
    );

    CREATE TABLE IF NOT EXISTS river_race_standings (
      season_id INTEGER NOT NULL,
      section_index INTEGER NOT NULL,
      clan_tag TEXT NOT NULL,
      clan_name TEXT,
      rank INTEGER,
      trophy_change INTEGER,
      fame INTEGER,
      repair_points INTEGER,
      period_points INTEGER,
      clan_score INTEGER,
      finish_time TEXT,
      PRIMARY KEY (season_id, section_index, clan_tag)
    );

    CREATE TABLE IF NOT EXISTS river_race_participants (
      season_id INTEGER NOT NULL,
      section_index INTEGER NOT NULL,
      clan_tag TEXT NOT NULL,
      player_tag TEXT NOT NULL,
      player_name TEXT,
      clan_name TEXT,
      fame INTEGER,
      repair_points INTEGER,
      boat_attacks INTEGER,
      decks_used INTEGER,
      PRIMARY KEY (season_id, section_index, clan_tag, player_tag)
    );
  `);
}

export function stableJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function writeJsonIfChanged(filePath, value, { dryRun = false } = {}) {
  const next = stableJson(value);
  const previous = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  if (previous === next) {
    return false;
  }
  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, next);
  }
  return true;
}

export function writeDataExports(exports, { dryRun = false } = {}) {
  const changed = [];
  for (const [key, filePath] of Object.entries(currentExportPaths)) {
    if (writeJsonIfChanged(filePath, exports[key], { dryRun })) {
      changed.push(filePath);
    }
  }
  return changed;
}

export function upsertCurrentSnapshot(db, { snapshotDate, observedAt, clanTag, clanData, clanPayload, rosterPayload }) {
  const date = snapshotDate || localDate(observedAt);
  const normalizedClanTag = normalizeTag(clanTag || clanData?.tag || clanPayload?.tag);
  const members = Array.isArray(rosterPayload?.members) ? rosterPayload.members : [];
  const memberCount = numberOrNull(clanData?.members ?? clanPayload?.members ?? members.length);
  const totalTrophies = sumNumbers(members.map((member) => member.trophies));

  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO clan_daily_snapshots (
        snapshot_date, observed_at, clan_tag, clan_name, type, location_name,
        member_count, open_slots, clan_score, total_trophies, clan_war_trophies,
        donations_per_week, required_trophies
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date) DO UPDATE SET
        observed_at = excluded.observed_at,
        clan_tag = excluded.clan_tag,
        clan_name = excluded.clan_name,
        type = excluded.type,
        location_name = excluded.location_name,
        member_count = excluded.member_count,
        open_slots = excluded.open_slots,
        clan_score = excluded.clan_score,
        total_trophies = excluded.total_trophies,
        clan_war_trophies = excluded.clan_war_trophies,
        donations_per_week = excluded.donations_per_week,
        required_trophies = excluded.required_trophies
    `).run(
      date,
      observedAt,
      normalizedClanTag,
      clanData?.name ?? clanPayload?.name ?? null,
      clanData?.type ?? clanPayload?.type ?? null,
      clanData?.location?.name ?? clanPayload?.location?.name ?? null,
      memberCount,
      memberCount === null ? null : Math.max(0, 50 - memberCount),
      numberOrNull(clanData?.clanScore ?? clanPayload?.clanScore),
      totalTrophies,
      numberOrNull(clanData?.clanWarTrophies ?? clanPayload?.clanWarTrophies),
      numberOrNull(clanData?.donationsPerWeek ?? clanPayload?.donationsPerWeek),
      numberOrNull(clanData?.requiredTrophies ?? clanPayload?.requiredTrophies),
    );

    const deleteMembers = db.prepare("DELETE FROM member_daily_snapshots WHERE snapshot_date = ?");
    deleteMembers.run(date);

    const insertMember = db.prepare(`
      INSERT INTO member_daily_snapshots (
        snapshot_date, player_tag, player_name, role, clan_rank, previous_clan_rank,
        trophies, best_trophies, arena_name, last_seen, donations, donations_received,
        exp_level, battle_wins, battle_count, three_crown_wins, account_age_days,
        account_age_years, collection_level, clan_war_wins, total_clan_donations, badge_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const member of members) {
      insertMember.run(
        date,
        normalizeTag(member.tag),
        member.name ?? null,
        member.role ?? null,
        numberOrNull(member.clan_rank),
        numberOrNull(member.previous_clan_rank),
        numberOrNull(member.trophies),
        numberOrNull(member.best_trophies),
        member.arena ?? null,
        member.last_seen ?? null,
        numberOrNull(member.donations),
        numberOrNull(member.donations_received),
        numberOrNull(member.exp_level),
        firstNumber(member.battle_wins, member.cr_battle_wins),
        numberOrNull(member.battle_count),
        numberOrNull(member.three_crown_wins),
        numberOrNull(member.cr_account_age_days),
        numberOrNull(member.cr_account_age_years),
        firstNumber(member.collection_level, member.cr_collection_level),
        firstNumber(member.clan_war_wins, member.cr_clan_war_wins),
        firstNumber(member.total_donations, member.cr_clan_donations),
        numberOrNull(member.badge_count),
      );
    }

    setMetadata(db, "last_snapshot_date", date);
    setMetadata(db, "last_observed_at", observedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function upsertRiverRaceLog(db, { clanTag, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }
  const normalizedClanTag = normalizeTag(clanTag);
  const upsertWeek = db.prepare(`
    INSERT INTO river_race_weeks (
      season_id, section_index, created_date, our_rank, trophy_change, our_fame,
      total_clans, finish_time, our_clan_score, is_colosseum
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, section_index) DO UPDATE SET
      created_date = excluded.created_date,
      our_rank = excluded.our_rank,
      trophy_change = excluded.trophy_change,
      our_fame = excluded.our_fame,
      total_clans = excluded.total_clans,
      finish_time = excluded.finish_time,
      our_clan_score = excluded.our_clan_score,
      is_colosseum = excluded.is_colosseum
  `);
  const deleteStandings = db.prepare("DELETE FROM river_race_standings WHERE season_id = ? AND section_index = ?");
  const deleteParticipants = db.prepare("DELETE FROM river_race_participants WHERE season_id = ? AND section_index = ?");
  const insertStanding = db.prepare(`
    INSERT INTO river_race_standings (
      season_id, section_index, clan_tag, clan_name, rank, trophy_change, fame,
      repair_points, period_points, clan_score, finish_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertParticipant = db.prepare(`
    INSERT INTO river_race_participants (
      season_id, section_index, clan_tag, player_tag, player_name, clan_name,
      fame, repair_points, boat_attacks, decks_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, section_index, clan_tag, player_tag) DO UPDATE SET
      player_name = excluded.player_name,
      clan_name = excluded.clan_name,
      fame = excluded.fame,
      repair_points = excluded.repair_points,
      boat_attacks = excluded.boat_attacks,
      decks_used = excluded.decks_used
  `);

  let count = 0;
  db.exec("BEGIN");
  try {
    for (const item of items) {
      const seasonId = numberOrNull(item.seasonId);
      const sectionIndex = numberOrNull(item.sectionIndex);
      if (seasonId === null || sectionIndex === null) {
        continue;
      }
      const standings = Array.isArray(item.standings) ? item.standings : [];
      const ourStanding = standings.find((standing) => normalizeTag(standing?.clan?.tag) === normalizedClanTag) ?? standings[0];
      const ourClan = ourStanding?.clan ?? {};
      const trophyChange = numberOrNull(ourStanding?.trophyChange);

      upsertWeek.run(
        seasonId,
        sectionIndex,
        item.createdDate ?? null,
        numberOrNull(ourStanding?.rank),
        trophyChange,
        numberOrNull(ourClan?.fame),
        standings.length || null,
        ourClan?.finishTime ?? null,
        numberOrNull(ourClan?.clanScore),
        Math.abs(trophyChange ?? 0) >= 100 ? 1 : 0,
      );

      deleteStandings.run(seasonId, sectionIndex);
      deleteParticipants.run(seasonId, sectionIndex);

      for (const standing of standings) {
        const clan = standing?.clan ?? {};
        const standingClanTag = normalizeTag(clan.tag);
        if (!standingClanTag) {
          continue;
        }
        insertStanding.run(
          seasonId,
          sectionIndex,
          standingClanTag,
          clan.name ?? null,
          numberOrNull(standing.rank),
          numberOrNull(standing.trophyChange),
          numberOrNull(clan.fame),
          numberOrNull(clan.repairPoints),
          numberOrNull(clan.periodPoints),
          numberOrNull(clan.clanScore),
          clan.finishTime ?? null,
        );

        for (const participant of clan.participants ?? []) {
          const playerTag = normalizeTag(participant.tag);
          if (!playerTag) {
            continue;
          }
          insertParticipant.run(
            seasonId,
            sectionIndex,
            standingClanTag,
            playerTag,
            participant.name ?? null,
            clan.name ?? null,
            numberOrNull(participant.fame),
            numberOrNull(participant.repairPoints),
            numberOrNull(participant.boatAttacks),
            numberOrNull(participant.decksUsed),
          );
        }
      }
      count += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return count;
}

export function generateDataExports(db, { clan, roster }) {
  const members = Array.isArray(roster?.members) ? roster.members : [];
  const currentMembers = members.map((member) => toExplorerMember(member)).filter((member) => member.tag);
  const latestSnapshotDate = db.prepare("SELECT value FROM metadata WHERE key = 'last_snapshot_date'").get()?.value ?? null;
  const latestObservedAt = db.prepare("SELECT value FROM metadata WHERE key = 'last_observed_at'").get()?.value ?? roster?.updated ?? null;

  return {
    clanInsights: buildClanInsights({ clan, roster, members: currentMembers, generatedAt: latestObservedAt, latestSnapshotDate }),
    clanTrends: buildClanTrends(db, { generatedAt: latestObservedAt }),
    rosterExplorer: buildRosterExplorer({ clan, members: currentMembers, generatedAt: latestObservedAt }),
    warHistory: buildWarHistory(db, { generatedAt: latestObservedAt }),
  };
}

export function importClanSnapshotRow(db, row) {
  db.prepare(`
    INSERT INTO clan_daily_snapshots (
      snapshot_date, observed_at, clan_tag, clan_name, type, location_name,
      member_count, open_slots, clan_score, total_trophies, clan_war_trophies,
      donations_per_week, required_trophies
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      observed_at = COALESCE(excluded.observed_at, clan_daily_snapshots.observed_at),
      clan_tag = COALESCE(excluded.clan_tag, clan_daily_snapshots.clan_tag),
      clan_name = COALESCE(excluded.clan_name, clan_daily_snapshots.clan_name),
      type = COALESCE(excluded.type, clan_daily_snapshots.type),
      location_name = COALESCE(excluded.location_name, clan_daily_snapshots.location_name),
      member_count = COALESCE(excluded.member_count, clan_daily_snapshots.member_count),
      open_slots = COALESCE(excluded.open_slots, clan_daily_snapshots.open_slots),
      clan_score = COALESCE(excluded.clan_score, clan_daily_snapshots.clan_score),
      total_trophies = COALESCE(excluded.total_trophies, clan_daily_snapshots.total_trophies),
      clan_war_trophies = COALESCE(excluded.clan_war_trophies, clan_daily_snapshots.clan_war_trophies),
      donations_per_week = COALESCE(excluded.donations_per_week, clan_daily_snapshots.donations_per_week),
      required_trophies = COALESCE(excluded.required_trophies, clan_daily_snapshots.required_trophies)
  `).run(
    row.snapshot_date,
    row.observed_at,
    normalizeTag(row.clan_tag),
    row.clan_name ?? null,
    row.type ?? null,
    row.location_name ?? null,
    numberOrNull(row.member_count),
    row.open_slots === undefined ? null : numberOrNull(row.open_slots),
    numberOrNull(row.clan_score),
    numberOrNull(row.total_trophies),
    numberOrNull(row.clan_war_trophies),
    numberOrNull(row.donations_per_week),
    numberOrNull(row.required_trophies),
  );
}

export function importMemberSnapshotRow(db, row) {
  db.prepare(`
    INSERT INTO member_daily_snapshots (
      snapshot_date, player_tag, player_name, role, clan_rank, previous_clan_rank,
      trophies, best_trophies, arena_name, last_seen, donations, donations_received,
      exp_level, battle_wins, battle_count, three_crown_wins, account_age_days,
      account_age_years, collection_level, clan_war_wins, total_clan_donations, badge_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date, player_tag) DO UPDATE SET
      player_name = COALESCE(excluded.player_name, member_daily_snapshots.player_name),
      role = COALESCE(excluded.role, member_daily_snapshots.role),
      clan_rank = COALESCE(excluded.clan_rank, member_daily_snapshots.clan_rank),
      previous_clan_rank = COALESCE(excluded.previous_clan_rank, member_daily_snapshots.previous_clan_rank),
      trophies = COALESCE(excluded.trophies, member_daily_snapshots.trophies),
      best_trophies = COALESCE(excluded.best_trophies, member_daily_snapshots.best_trophies),
      arena_name = COALESCE(excluded.arena_name, member_daily_snapshots.arena_name),
      last_seen = COALESCE(excluded.last_seen, member_daily_snapshots.last_seen),
      donations = COALESCE(excluded.donations, member_daily_snapshots.donations),
      donations_received = COALESCE(excluded.donations_received, member_daily_snapshots.donations_received),
      exp_level = COALESCE(excluded.exp_level, member_daily_snapshots.exp_level),
      battle_wins = COALESCE(excluded.battle_wins, member_daily_snapshots.battle_wins),
      battle_count = COALESCE(excluded.battle_count, member_daily_snapshots.battle_count),
      three_crown_wins = COALESCE(excluded.three_crown_wins, member_daily_snapshots.three_crown_wins),
      account_age_days = COALESCE(excluded.account_age_days, member_daily_snapshots.account_age_days),
      account_age_years = COALESCE(excluded.account_age_years, member_daily_snapshots.account_age_years),
      collection_level = COALESCE(excluded.collection_level, member_daily_snapshots.collection_level),
      clan_war_wins = COALESCE(excluded.clan_war_wins, member_daily_snapshots.clan_war_wins),
      total_clan_donations = COALESCE(excluded.total_clan_donations, member_daily_snapshots.total_clan_donations),
      badge_count = COALESCE(excluded.badge_count, member_daily_snapshots.badge_count)
  `).run(
    row.snapshot_date,
    normalizeTag(row.player_tag),
    row.player_name ?? null,
    row.role ?? null,
    numberOrNull(row.clan_rank),
    numberOrNull(row.previous_clan_rank),
    numberOrNull(row.trophies),
    numberOrNull(row.best_trophies),
    row.arena_name ?? null,
    row.last_seen ?? null,
    numberOrNull(row.donations),
    numberOrNull(row.donations_received),
    numberOrNull(row.exp_level),
    numberOrNull(row.battle_wins),
    numberOrNull(row.battle_count),
    numberOrNull(row.three_crown_wins),
    numberOrNull(row.account_age_days),
    numberOrNull(row.account_age_years),
    numberOrNull(row.collection_level),
    numberOrNull(row.clan_war_wins),
    numberOrNull(row.total_clan_donations),
    numberOrNull(row.badge_count),
  );
}

function buildClanInsights({ clan, roster, members, generatedAt, latestSnapshotDate }) {
  const trophies = members.map((member) => member.trophies).filter(isFiniteNumber);
  const wins = members.map((member) => member.wins).filter(isFiniteNumber);
  const years = members.map((member) => member.years).filter(isFiniteNumber);
  const collection = members.map((member) => member.collectionLevel).filter(isFiniteNumber);
  const badges = members.map((member) => member.badges).filter(isFiniteNumber);
  const memberCount = members.length;

  return {
    generatedAt,
    latestSnapshotDate,
    clan: {
      tag: clan?.tag ?? roster?.clan?.tag ?? null,
      name: clan?.name ?? roster?.clan?.name ?? "POAP KINGS",
      memberCount,
      openSlots: Math.max(0, 50 - memberCount),
      clanScore: clan?.clan_score ?? clan?.clanScore ?? null,
      clanWarTrophies: clan?.clan_war_trophies ?? clan?.clanWarTrophies ?? null,
      donationsPerWeek: clan?.donations_per_week ?? clan?.donationsPerWeek ?? null,
    },
    headlineStats: [
      {
        key: "topTrophyPlayers",
        label: "12k+ Trophy Players",
        value: countWhere(members, (member) => member.trophies >= 12000),
        detail: `${countWhere(members, (member) => member.trophies >= 14000)} members are at 14k+`,
      },
      {
        key: "veterans",
        label: "6+ Year Accounts",
        value: countWhere(members, (member) => member.years >= 6),
        detail: `${Math.round(avg(years) || 0)} average years played`,
      },
      {
        key: "battleWins",
        label: "Average Wins",
        value: Math.round(avg(wins) || 0),
        detail: `${formatCompact(sumNumbers(wins))} total wins across roster`,
      },
      {
        key: "collectionDepth",
        label: "Average Collection Score",
        value: round(avg(collection), 1),
        detail: `${countWhere(members, (member) => member.collectionLevel >= 1000)} members at 1k+`,
      },
    ],
    metrics: {
      averageTrophies: Math.round(avg(trophies) || 0),
      medianTrophies: Math.round(median(trophies) || 0),
      averageWins: Math.round(avg(wins) || 0),
      totalWins: sumNumbers(wins),
      averageYearsPlayed: round(avg(years), 1),
      averageCollectionLevel: round(avg(collection), 1),
      averageBadgeCount: round(avg(badges), 1),
    },
    trophyDistribution: bucketize(members, "trophies", [
      ["<9k", (value) => value < 9000],
      ["9k-10.9k", (value) => value >= 9000 && value < 11000],
      ["11k-11.9k", (value) => value >= 11000 && value < 12000],
      ["12k-13.9k", (value) => value >= 12000 && value < 14000],
      ["14k+", (value) => value >= 14000],
    ]),
    tenureDistribution: bucketize(members, "years", [
      ["<3 years", (value) => value < 3],
      ["3-4.9 years", (value) => value >= 3 && value < 5],
      ["5-6.9 years", (value) => value >= 5 && value < 7],
      ["7+ years", (value) => value >= 7],
    ]),
    leaders: {
      trophies: topBy(members, "trophies", 8),
      wins: topBy(members, "wins", 8),
      collection: topBy(members, "collectionLevel", 8),
      tenure: topBy(members, "years", 8),
      warWins: topBy(members, "warWins", 8),
    },
  };
}

function buildClanTrends(db, { generatedAt }) {
  const clanRows = db.prepare(`
    SELECT snapshot_date, member_count, open_slots, clan_score, total_trophies,
           clan_war_trophies, donations_per_week, required_trophies
    FROM clan_daily_snapshots
    ORDER BY snapshot_date
  `).all();
  const memberRows = db.prepare(`
    SELECT
      snapshot_date,
      COUNT(*) AS tracked_members,
      AVG(trophies) AS average_trophies,
      AVG(battle_wins) AS average_wins,
      AVG(account_age_years) AS average_years_played,
      AVG(collection_level) AS average_collection_level,
      SUM(CASE WHEN trophies >= 12000 THEN 1 ELSE 0 END) AS count_12000_plus,
      SUM(CASE WHEN trophies >= 14000 THEN 1 ELSE 0 END) AS count_14000_plus,
      SUM(CASE WHEN account_age_years >= 6 THEN 1 ELSE 0 END) AS count_6_years_plus,
      SUM(CASE WHEN collection_level >= 1000 THEN 1 ELSE 0 END) AS count_collection_1000_plus
    FROM member_daily_snapshots
    GROUP BY snapshot_date
  `).all();
  const byDate = new Map(memberRows.map((row) => [row.snapshot_date, row]));
  const series = clanRows.map((row) => {
    const member = byDate.get(row.snapshot_date) ?? {};
    return {
      date: row.snapshot_date,
      memberCount: numberOrNull(row.member_count),
      openSlots: numberOrNull(row.open_slots),
      clanScore: numberOrNull(row.clan_score),
      totalTrophies: numberOrNull(row.total_trophies),
      clanWarTrophies: numberOrNull(row.clan_war_trophies),
      donationsPerWeek: numberOrNull(row.donations_per_week),
      averageTrophies: round(member.average_trophies, 0),
      averageWins: round(member.average_wins, 0),
      averageYearsPlayed: round(member.average_years_played, 1),
      averageCollectionLevel: round(member.average_collection_level, 1),
      count12000Plus: numberOrNull(member.count_12000_plus),
      count14000Plus: numberOrNull(member.count_14000_plus),
      count6YearsPlus: numberOrNull(member.count_6_years_plus),
      countCollection1000Plus: numberOrNull(member.count_collection_1000_plus),
      trackedMembers: numberOrNull(member.tracked_members),
    };
  });

  return {
    generatedAt,
    firstDate: series[0]?.date ?? null,
    latestDate: series.at(-1)?.date ?? null,
    series,
  };
}

function buildRosterExplorer({ clan, members, generatedAt }) {
  return {
    generatedAt,
    clan: {
      tag: clan?.tag ?? null,
      name: clan?.name ?? "POAP KINGS",
    },
    dimensions: [
      { key: "trophies", label: "Trophies", format: "integer" },
      { key: "wins", label: "Wins", format: "integer" },
      { key: "years", label: "Years Played", format: "decimal" },
      { key: "collectionLevel", label: "Collection Score", format: "integer" },
      { key: "badges", label: "Badges", format: "integer" },
      { key: "warWins", label: "Clan War Wins", format: "integer" },
      { key: "donations", label: "Weekly Donations", format: "integer" },
    ],
    roles: roleCounts(members),
    members,
  };
}

function buildWarHistory(db, { generatedAt }) {
  const weeks = db.prepare(`
    SELECT season_id, section_index, created_date, our_rank, trophy_change, our_fame,
           total_clans, finish_time, our_clan_score, is_colosseum
    FROM river_race_weeks
    ORDER BY season_id, section_index
  `).all().map((row) => ({
    seasonId: row.season_id,
    sectionIndex: row.section_index,
    weekLabel: `S${row.season_id} W${row.section_index + 1}`,
    createdDate: row.created_date,
    rank: numberOrNull(row.our_rank),
    trophyChange: numberOrNull(row.trophy_change),
    fame: numberOrNull(row.our_fame),
    totalClans: numberOrNull(row.total_clans),
    finishTime: row.finish_time,
    clanScore: numberOrNull(row.our_clan_score),
    isColosseum: Boolean(row.is_colosseum),
  }));
  const seasons = Array.from(groupBy(weeks, (week) => String(week.seasonId)).entries()).map(([seasonId, seasonWeeks]) => ({
    seasonId: Number(seasonId),
    weeks: seasonWeeks,
    averageRank: round(avg(seasonWeeks.map((week) => week.rank).filter(isFiniteNumber)), 1),
    trophyChange: sumNumbers(seasonWeeks.map((week) => week.trophyChange)),
    wins: countWhere(seasonWeeks, (week) => week.rank === 1),
  }));
  const latestWeek = weeks.at(-1) ?? null;
  return {
    generatedAt,
    summary: {
      totalWeeks: weeks.length,
      wins: countWhere(weeks, (week) => week.rank === 1),
      averageRank: round(avg(weeks.map((week) => week.rank).filter(isFiniteNumber)), 1),
      trophyChange: sumNumbers(weeks.map((week) => week.trophyChange)),
      latestWeek,
    },
    seasons,
    weeks,
  };
}

function toExplorerMember(member) {
  return {
    tag: normalizeTag(member.tag),
    name: member.name ?? null,
    role: member.role ?? null,
    clanRank: numberOrNull(member.clan_rank),
    trophies: numberOrNull(member.trophies),
    bestTrophies: numberOrNull(member.best_trophies),
    arena: member.arena ?? null,
    wins: firstNumber(member.battle_wins, member.cr_battle_wins),
    battleCount: numberOrNull(member.battle_count),
    threeCrownWins: numberOrNull(member.three_crown_wins),
    accountAgeDays: numberOrNull(member.cr_account_age_days),
    years: numberOrNull(member.cr_account_age_years),
    collectionLevel: firstNumber(member.collection_level, member.cr_collection_level),
    warWins: firstNumber(member.clan_war_wins, member.cr_clan_war_wins),
    donations: numberOrNull(member.donations),
    donationsReceived: numberOrNull(member.donations_received),
    totalDonations: firstNumber(member.total_donations, member.cr_clan_donations),
    badges: numberOrNull(member.badge_count),
    lastSeen: member.last_seen ?? null,
  };
}

function setMetadata(db, key, value) {
  if (value === undefined || value === null) {
    return;
  }
  db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
}

export function normalizeTag(tag) {
  if (!tag) {
    return null;
  }
  const text = String(tag).trim().toUpperCase();
  return text.startsWith("#") ? text : `#${text}`;
}

export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function roleCounts(members) {
  const roles = new Map();
  for (const member of members) {
    const key = member.role ?? "member";
    roles.set(key, (roles.get(key) ?? 0) + 1);
  }
  return Array.from(roles.entries()).map(([role, count]) => ({ role, count }));
}

function topBy(members, key, limit) {
  return members
    .filter((member) => isFiniteNumber(member[key]))
    .toSorted((a, b) => b[key] - a[key])
    .slice(0, limit)
    .map((member) => ({
      tag: member.tag,
      name: member.name,
      role: member.role,
      value: member[key],
    }));
}

function bucketize(members, key, buckets) {
  return buckets.map(([label, predicate]) => ({
    label,
    count: members.filter((member) => isFiniteNumber(member[key]) && predicate(member[key])).length,
  }));
}

function countWhere(values, predicate) {
  return values.filter(predicate).length;
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const current = groups.get(key) ?? [];
    current.push(value);
    groups.set(key, current);
  }
  return groups;
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

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function avg(values) {
  const numeric = values.filter(isFiniteNumber);
  if (numeric.length === 0) {
    return null;
  }
  return sumNumbers(numeric) / numeric.length;
}

function median(values) {
  const numeric = values.filter(isFiniteNumber).toSorted((a, b) => a - b);
  if (numeric.length === 0) {
    return null;
  }
  const middle = Math.floor(numeric.length / 2);
  return numeric.length % 2 === 0 ? (numeric[middle - 1] + numeric[middle]) / 2 : numeric[middle];
}

function round(value, places = 0) {
  const number = numberOrNull(value);
  if (number === null) {
    return null;
  }
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

function sumNumbers(values) {
  return values.reduce((total, value) => {
    const number = numberOrNull(value);
    return number === null ? total : total + number;
  }, 0);
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
