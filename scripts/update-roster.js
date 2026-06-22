#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.clashroyale.com/v1";
const PROFILE_FETCH_CONCURRENCY = 5;
const VALID_TAG_CHARS = new Set("0289PYLQGRJCUV".split(""));
const ROLE_MAP = {
  leader: "Leader",
  coLeader: "Co-Leader",
  elder: "Elder",
  member: "Member",
};
const BADGE_META = {
  YearsPlayed: { label: "Years Played", category: "career" },
  BattleWins: { label: "Battle Wins", category: "career" },
  ClanWarWins: { label: "Clan War Wins", category: "career" },
  ClanWarsVeteran: { label: "Clan War Wins", category: "career" },
  CollectionLevel: { label: "Collection Level", category: "collection" },
  ClanDonations: { label: "Clan Donations", category: "collection" },
};
const PROFILE_FIELD_NAMES = [
  "exp_level",
  "best_trophies",
  "battle_count",
  "three_crown_wins",
  "cr_account_age_days",
  "cr_account_age_years",
  "cr_battle_wins",
  "cr_collection_level",
  "cr_collection_level_badge_tier",
  "cr_collection_level_badge_max_tier",
  "cr_clan_war_wins",
  "cr_clan_donations",
  "badge_count",
  "badge_highlights",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "src", "_data");
const sitePath = join(dataDir, "site.json");
const clanPath = join(dataDir, "elixirClan.json");
const rosterPath = join(dataDir, "elixirRoster.json");
const defaultElixirEnvPath = resolve(repoRoot, "..", "elixir-bot", ".env");

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function hasArg(name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`Usage: npm run update-roster -- [options]

Options:
  --clan-tag TAG     Clan tag to fetch. Defaults to src/_data/site.json.
  --env-file PATH    Env file containing CR_API_KEY. Defaults to ../elixir-bot/.env.
  --skip-profiles    Fetch only the clan roster and preserve existing profile fields.
  --dry-run          Fetch and compare without writing files.
  --exit-code        Exit 2 when data changed or would change.
  --help             Show this help.

The script uses CR_API_KEY from the current environment first, then falls back
to the Elixir bot env file so the key is not copied into this repo.`);
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parseEnvFile(path) {
  if (!path || !existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function requireApiKey(envPath) {
  const fromProcess = (process.env.CR_API_KEY || "").trim();
  if (fromProcess) return fromProcess;
  const fromFile = (parseEnvFile(envPath).CR_API_KEY || "").trim();
  if (fromFile) return fromFile;
  throw new Error(`CR_API_KEY is not set and was not found in ${envPath}`);
}

function normalizeTag(raw) {
  const tag = String(raw || "").trim().replace(/^#/, "").toUpperCase();
  if (!tag) throw new Error("Clan tag is required");
  const invalid = [...tag].filter((ch) => !VALID_TAG_CHARS.has(ch));
  if (invalid.length) {
    throw new Error(`Invalid Clash Royale tag "${tag}": unexpected ${invalid.join(", ")}`);
  }
  return tag;
}

function displayClanType(type) {
  return {
    open: "Open",
    inviteOnly: "Invite Only",
    closed: "Closed",
  }[type] || (type ? `${type.slice(0, 1).toUpperCase()}${type.slice(1)}` : "Open");
}

function displayLocation(location) {
  return location && typeof location === "object" && location.name ? location.name : "Not Set";
}

function displayLeague(warLeague) {
  if (!warLeague) return "Unranked";
  if (typeof warLeague === "object") return warLeague.name || "Unranked";
  return String(warLeague);
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assignNumber(target, key, value) {
  const number = numberOrNull(value);
  if (number != null) target[key] = number;
}

function pickNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }
  return null;
}

function findBadge(badges, names) {
  const wanted = new Set(names);
  return (badges || []).find((badge) => wanted.has(badge.name)) || null;
}

function badgeProgress(badge) {
  return numberOrNull(badge && badge.progress);
}

function badgeLevel(badge) {
  return numberOrNull(badge && badge.level);
}

function badgeMaxLevel(badge) {
  return numberOrNull(badge && badge.maxLevel);
}

function badgeTarget(badge) {
  return numberOrNull(badge && badge.target);
}

function badgeIconUrl(badge) {
  return (
    (badge && badge.iconUrls && badge.iconUrls.large) ||
    (badge && badge.icon_urls && badge.icon_urls.large) ||
    (badge && badge.icon_url) ||
    ""
  );
}

function normalizeBadge(badge, overrides = {}) {
  if (!badge || !badge.name) return null;
  const meta = BADGE_META[badge.name] || { label: badge.name, category: "profile" };
  const iconUrl = badgeIconUrl(badge);
  const level = pickNumber(overrides.level, badgeLevel(badge));
  const maxLevel = pickNumber(overrides.max_level, badgeMaxLevel(badge));
  const progress = pickNumber(overrides.progress, badgeProgress(badge));
  const target = pickNumber(overrides.target, badgeTarget(badge));
  const isOneTime = badge.level == null && badge.maxLevel == null && badge.target == null;
  const payload = {
    name: badge.name,
    label: meta.label,
    category: meta.category,
    is_one_time: isOneTime,
  };

  if (level != null) payload.level = level;
  if (maxLevel != null) payload.max_level = maxLevel;
  if (progress != null) payload.progress = progress;
  if (target != null) payload.target = target;
  if (iconUrl) {
    payload.icon_urls = { large: iconUrl };
    payload.icon_url = iconUrl;
  }

  return payload;
}

function profilePayload(profile) {
  if (!profile || typeof profile !== "object") return {};
  const badges = profile.badges || [];
  const yearsBadge = findBadge(badges, ["YearsPlayed"]);
  const battleWinsBadge = findBadge(badges, ["BattleWins"]);
  const warWinsBadge = findBadge(badges, ["ClanWarWins", "ClanWarsVeteran"]);
  const collectionBadge = findBadge(badges, ["CollectionLevel"]);
  const donationBadge = findBadge(badges, ["ClanDonations"]);
  const accountAgeDays = badgeProgress(yearsBadge);
  const accountAgeYears = pickNumber(badgeLevel(yearsBadge), accountAgeDays == null ? null : Math.floor(accountAgeDays / 365));
  const battleWins = pickNumber(profile.wins, badgeProgress(battleWinsBadge));
  const collectionLevel = badgeProgress(collectionBadge);
  const clanWarWins = pickNumber(badgeProgress(warWinsBadge), profile.warDayWins);
  const clanDonations = pickNumber(badgeProgress(donationBadge), profile.totalDonations);
  const payload = {};

  assignNumber(payload, "exp_level", profile.expLevel);
  assignNumber(payload, "best_trophies", profile.bestTrophies);
  assignNumber(payload, "battle_count", profile.battleCount);
  assignNumber(payload, "three_crown_wins", profile.threeCrownWins);
  assignNumber(payload, "cr_account_age_days", accountAgeDays);
  assignNumber(payload, "cr_account_age_years", accountAgeYears);
  assignNumber(payload, "cr_battle_wins", battleWins);
  assignNumber(payload, "cr_collection_level", collectionLevel);
  assignNumber(payload, "cr_collection_level_badge_tier", badgeLevel(collectionBadge));
  assignNumber(payload, "cr_collection_level_badge_max_tier", badgeMaxLevel(collectionBadge));
  assignNumber(payload, "cr_clan_war_wins", clanWarWins);
  assignNumber(payload, "cr_clan_donations", clanDonations);
  if (Array.isArray(badges)) payload.badge_count = badges.length;

  const badgeHighlights = [
    normalizeBadge(yearsBadge),
    normalizeBadge(battleWinsBadge, { progress: battleWins }),
    normalizeBadge(collectionBadge, { progress: collectionLevel }),
    normalizeBadge(warWinsBadge, { progress: clanWarWins }),
    normalizeBadge(donationBadge, { progress: clanDonations }),
  ].filter(Boolean);
  if (badgeHighlights.length) payload.badge_highlights = badgeHighlights;

  return payload;
}

function preservedProfilePayload(previousMember) {
  const payload = {};
  if (!previousMember || typeof previousMember !== "object") return payload;
  for (const key of PROFILE_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(previousMember, key)) {
      payload[key] = previousMember[key];
    }
  }
  return payload;
}

function previousMembersByTag(roster) {
  const map = new Map();
  for (const member of roster.members || []) {
    if (!member || !member.tag) continue;
    map.set(normalizeTag(member.tag), member);
  }
  return map;
}

function memberPayload(member, profile, previousMember) {
  const tag = normalizeTag(member.tag);
  const arena = member.arena && typeof member.arena === "object" ? member.arena.name || "" : "";
  const profileFields = profile ? profilePayload(profile) : preservedProfilePayload(previousMember);

  return {
    name: member.name || "Unknown",
    tag,
    role: ROLE_MAP[member.role] || "Member",
    trophies: member.trophies || 0,
    arena,
    clan_rank: member.clanRank || 0,
    previous_clan_rank: member.previousClanRank || null,
    donations: member.donations || 0,
    donations_received: member.donationsReceived || 0,
    last_seen: member.lastSeen || "",
    ...profileFields,
  };
}

function buildClanPayload(clanData) {
  const members = clanData.memberList || [];
  const memberCount = clanData.members || members.length;
  const totalTrophies = members.reduce((sum, member) => sum + (member.trophies || 0), 0);

  return {
    memberCount,
    clanScore: clanData.clanScore || 0,
    clanWarTrophies: clanData.clanWarTrophies || 0,
    donationsPerWeek: clanData.donationsPerWeek || 0,
    totalTrophies,
    minTrophies: clanData.requiredTrophies || 0,
    clanLeague: displayLeague(clanData.warLeague),
    clanStatus: displayClanType(clanData.type),
    clanRegion: displayLocation(clanData.location),
  };
}

function buildRosterPayload(clanData, now, profileByTag, previousRoster) {
  const previousByTag = previousMembersByTag(previousRoster);
  const members = (clanData.memberList || [])
    .map((member) => {
      const tag = normalizeTag(member.tag);
      return memberPayload(member, profileByTag.get(tag), previousByTag.get(tag));
    })
    .sort((a, b) => (a.clan_rank || 999) - (b.clan_rank || 999) || a.name.localeCompare(b.name));

  return {
    updated: now,
    members,
  };
}

function withoutUpdated(roster) {
  const copy = { ...(roster || {}) };
  delete copy.updated;
  return copy;
}

function writeIfChanged(path, nextData, dryRun) {
  const previousRaw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const nextRaw = stableJson(nextData);
  if (previousRaw === nextRaw) return false;
  if (!dryRun) writeFileSync(path, nextRaw);
  return true;
}

async function fetchClan(clanTag, apiKey) {
  const url = `${API_BASE}/clans/${encodeURIComponent(`#${clanTag}`)}`;
  return fetchApi(url, apiKey, `clan #${clanTag}`);
}

async function fetchPlayer(playerTag, apiKey) {
  const tag = normalizeTag(playerTag);
  const url = `${API_BASE}/players/${encodeURIComponent(`#${tag}`)}`;
  return fetchApi(url, apiKey, `player #${tag}`);
}

async function fetchApi(url, apiKey, description) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "poapkings.com-roster-updater",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Clash Royale API returned ${response.status} ${response.statusText} for ${description}: ${body.slice(0, 240)}`,
    );
  }
  return response.json();
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchPlayerProfiles(members, apiKey) {
  const pairs = await mapLimit(members, PROFILE_FETCH_CONCURRENCY, async (member) => {
    const tag = normalizeTag(member.tag);
    try {
      return [tag, await fetchPlayer(tag, apiKey)];
    } catch (error) {
      throw new Error(`Could not fetch profile for ${member.name || "Unknown"} #${tag}: ${error.message}`);
    }
  });
  return new Map(pairs);
}

async function main() {
  if (hasArg("--help")) {
    printHelp();
    return;
  }

  const dryRun = hasArg("--dry-run");
  const skipProfiles = hasArg("--skip-profiles");
  const exitCodeSignal = hasArg("--exit-code");
  const site = readJson(sitePath, {});
  const clanTag = normalizeTag(argValue("--clan-tag") || site.clanTag);
  const envPath = resolve(argValue("--env-file") || process.env.ELIXIR_BOT_ENV || defaultElixirEnvPath);
  const apiKey = requireApiKey(envPath);

  const previousClan = readJson(clanPath, {});
  const previousRoster = readJson(rosterPath, {});
  const clanData = await fetchClan(clanTag, apiKey);
  const clanMembers = clanData.memberList || [];
  const profileByTag = skipProfiles ? new Map() : await fetchPlayerProfiles(clanMembers, apiKey);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nextClan = buildClanPayload(clanData);
  const nextRoster = buildRosterPayload(clanData, now, profileByTag, previousRoster);

  const clanChanged = stableJson(previousClan) !== stableJson(nextClan);
  const rosterChanged = stableJson(withoutUpdated(previousRoster)) !== stableJson(withoutUpdated(nextRoster));

  const changedFiles = [];
  if (clanChanged && writeIfChanged(clanPath, nextClan, dryRun)) changedFiles.push("src/_data/elixirClan.json");
  if (rosterChanged && writeIfChanged(rosterPath, nextRoster, dryRun)) changedFiles.push("src/_data/elixirRoster.json");

  const mode = dryRun ? "Dry run" : "Updated";
  const changed = changedFiles.length > 0;
  console.log(`changed=${changed ? "true" : "false"}`);
  console.log(`changed_files=${changedFiles.join(",")}`);
  if (changedFiles.length) {
    console.log(`${mode}: ${changedFiles.join(", ")}`);
  } else {
    console.log("No clan roster changes detected.");
  }
  console.log(
    `Fetched #${clanTag}: ${nextClan.memberCount}/50 members, ${nextClan.clanScore.toLocaleString("en-US")} clan score, ${nextClan.donationsPerWeek.toLocaleString("en-US")} donations/week.`,
  );
  if (skipProfiles) {
    console.log("Skipped player profile fetch; preserved existing profile fields where available.");
  } else {
    console.log(`Fetched player profiles: ${profileByTag.size}/${clanMembers.length}.`);
  }
  if (exitCodeSignal && changed) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
