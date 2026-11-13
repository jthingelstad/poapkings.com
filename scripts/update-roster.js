#!/usr/bin/env node

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dataDbPath,
  generateDataExports,
  openDataDb,
  upsertCurrentSnapshot,
  upsertRiverRaceLog,
  writeDataExports,
} from "./clash-data-store.js";
import { clanWarLeague } from "./clan-war-league.js";

const API_BASE = "https://api.clashroyale.com/v1";
const PROFILE_FETCH_CONCURRENCY = 5;
const VALID_TAG_CHARS = new Set("0289PYLQGRJCUV".split(""));
const ROLE_MAP = {
  leader: "Leader",
  coLeader: "Co-Leader",
  elder: "Elder",
  member: "Member",
};
// The profile fields the site shows, and the only ones it writes. Adding one
// publishes more about every member, many of them minors: that is a product
// call, not an updater change.
export const PROFILE_FIELD_NAMES = [
  "best_trophies",
  "battle_count",
  "three_crown_wins",
  "cr_account_age_days",
  "cr_account_age_years",
  "cr_battle_wins",
  "cr_collection_level",
  "badge_count",
  "favorite_card",
];

// Invisible / bidi control code points that render oddly in a display name.
// Emoji glue is deliberately excluded so emoji survive intact: the zero-width
// joiner (0x200D) and variation selectors (0xFE0E/0xFE0F) fall outside these
// ranges. This mirrors the intent of elixir-bot's callable_name cleanup.
const NAME_INVISIBLE_RANGES = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad],
  [0x200b, 0x200c], [0x200e, 0x200f], [0x202a, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff],
];
const NAME_INVISIBLES = (() => {
  const hex = (n) => `\\u${n.toString(16).padStart(4, "0")}`;
  const body = NAME_INVISIBLE_RANGES.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join("");
  return new RegExp(`[${body}]`, "gu");
})();

// Normalize a Clash Royale display name for the site. NFKC compatibility
// folding collapses fullwidth Latin (Ｓ→S), superscripts (²⁸→28), and ligatures
// (ﬁ→fi) to a readable form while preserving accents (Sebastián stays intact)
// and emoji (⚡ ♥️ ⚜️ are kept — unlike elixir-bot, which strips them). Invisible
// and bidi control characters are removed and whitespace collapsed. Names that
// collapse to nothing (pure non-decomposable ornamentation) fall back to the
// literal name so we never drop a player.
export function normalizeMemberName(value) {
  if (!value) return value || "";
  const cleaned = value
    .normalize("NFKC")
    .replace(NAME_INVISIBLES, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || value;
}


const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "src", "_data");
const sitePath = join(dataDir, "site.json");
const clanPath = join(dataDir, "clan.json");
const rosterPath = join(dataDir, "roster.json");
const ourClansPath = join(dataDir, "ourClans.json");
const clanNetworkPath = join(dataDir, "clanNetwork.json");
// Where the host keeps CR_API_KEY, in order: this checkout's .env, then the
// one Drop's refresh-cards.mjs and elixir-mcp's `npm run cr` read. The key is
// IP-restricted to this host, so the updater runs here and never in CI.
const defaultEnvPaths = [join(repoRoot, ".env"), join(repoRoot, "..", "drop.poapkings.com", ".env")];

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

Reads the Clash Royale API: the home clan, every member's profile, its
river race log, and the sister clans named in src/_data/ourClans.json.

Options:
  --clan-tag TAG     Clan tag to fetch. Defaults to src/_data/site.json.
  --env-file PATH    Env file holding CR_API_KEY. Defaults to .env here, then
                     ../drop.poapkings.com/.env.
  --skip-profiles    Fetch only the clan roster and preserve existing
                     profile fields.
  --skip-wars        Skip the river race log fetch.
  --dry-run          Fetch and compare without writing files.
  --exit-code        Exit 2 when data changed or would change.
  --help             Show this help.

CR_API_KEY is read from the current environment first, then from the env
file, and is never printed.`);
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

function requireApiKey(envPaths, name = "CR_API_KEY") {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  for (const path of envPaths) {
    const fromFile = (parseEnvFile(path)[name] || "").trim();
    if (fromFile) return fromFile;
  }
  throw new Error(`${name} is not set and was not found in ${envPaths.join(" or ")}`);
}

export function normalizeTag(raw) {
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

function findBadge(badges, name) {
  return (badges || []).find((badge) => badge && badge.name === name) || null;
}

function favoriteCardPayload(card) {
  if (!card || typeof card !== "object" || !card.name) return null;
  const imageUrl = card.iconUrls?.medium || "";
  if (!imageUrl) return null;
  const payload = { name: card.name, image_url: imageUrl };
  const id = numberOrNull(card.id);
  if (id != null) payload.id = id;
  return payload;
}

// A /players/{tag} profile reduced to PROFILE_FIELD_NAMES. Account age is
// the YearsPlayed badge (progress in days, level in years); Collection Level
// is the profile field, with the CollectionLevel badge's progress for an
// older payload that lacks it.
export function profilePayload(profile) {
  if (!profile || typeof profile !== "object") return {};
  const badges = Array.isArray(profile.badges) ? profile.badges : [];
  const yearsBadge = findBadge(badges, "YearsPlayed");
  const collectionBadge = findBadge(badges, "CollectionLevel");
  const accountAgeDays = numberOrNull(yearsBadge?.progress);
  const payload = {};
  assignNumber(payload, "best_trophies", profile.bestTrophies);
  assignNumber(payload, "battle_count", profile.battleCount);
  assignNumber(payload, "three_crown_wins", profile.threeCrownWins);
  assignNumber(payload, "cr_account_age_days", accountAgeDays);
  assignNumber(
    payload,
    "cr_account_age_years",
    pickNumber(yearsBadge?.level, accountAgeDays == null ? null : Math.floor(accountAgeDays / 365)),
  );
  assignNumber(payload, "cr_battle_wins", profile.wins);
  assignNumber(payload, "cr_collection_level", pickNumber(profile.collectionLevel || null, collectionBadge?.progress));
  if (Array.isArray(profile.badges)) payload.badge_count = badges.length;
  const favoriteCard = favoriteCardPayload(profile.currentFavouriteCard);
  if (favoriteCard) payload.favorite_card = favoriteCard;
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
  for (const member of roster?.members || []) {
    if (!member || !member.tag) continue;
    map.set(normalizeTag(member.tag), member);
  }
  return map;
}

export function memberPayload(member, profile, previousMember) {
  const profileFields = profile ? profilePayload(profile) : preservedProfilePayload(previousMember);
  return {
    name: normalizeMemberName(member.name) || "Unknown",
    tag: normalizeTag(member.tag),
    role: ROLE_MAP[member.role] || "Member",
    trophies: member.trophies || 0,
    arena: member.arena && typeof member.arena === "object" ? member.arena.name || "" : "",
    clan_rank: member.clanRank || 0,
    previous_clan_rank: member.previousClanRank || null,
    donations: member.donations || 0,
    donations_received: member.donationsReceived || 0,
    last_seen: member.lastSeen || "",
    ...profileFields,
  };
}

export function buildClanPayload(clanData) {
  const members = clanData.memberList || [];
  return {
    memberCount: clanData.members ?? members.length,
    clanScore: clanData.clanScore || 0,
    clanWarTrophies: clanData.clanWarTrophies || 0,
    donationsPerWeek: clanData.donationsPerWeek || 0,
    totalTrophies: members.reduce((sum, member) => sum + (member.trophies || 0), 0),
    minTrophies: clanData.requiredTrophies || 0,
    clanLeague: clanWarLeague(clanData.clanWarTrophies || 0),
    clanStatus: displayClanType(clanData.type),
    clanRegion: displayLocation(clanData.location),
  };
}

export function buildRosterPayload(clanData, now, profileByTag, previousRoster) {
  const previousByTag = previousMembersByTag(previousRoster);
  const members = (clanData.memberList || [])
    .map((member) => {
      const tag = normalizeTag(member.tag);
      return memberPayload(member, profileByTag.get(tag), previousByTag.get(tag));
    })
    .sort((a, b) => (a.clan_rank || 999) - (b.clan_rank || 999) || a.name.localeCompare(b.name));
  return { updated: now, members };
}

// The sister clans' facts for /clans/, the ones the home clan's card shows.
export function clanNetworkPayload(clansByTag) {
  const clans = {};
  for (const [tag, clanData] of clansByTag) {
    const facts = buildClanPayload(clanData);
    clans[tag] = {
      name: clanData.name ?? null,
      memberCount: facts.memberCount,
      minTrophies: facts.minTrophies,
      clanWarTrophies: facts.clanWarTrophies,
      clanStatus: facts.clanStatus,
    };
  }
  return { clans };
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

function relativePath(path) {
  return path.replace(`${repoRoot}/`, "");
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

async function fetchClan(clanTag, apiKey) {
  const url = `${API_BASE}/clans/${encodeURIComponent(`#${clanTag}`)}`;
  return fetchApi(url, apiKey, `clan #${clanTag}`);
}

// The log serves the last ten closed weeks whatever the limit; older weeks
// stay in the data store as recorded.
async function fetchRiverRaceLog(clanTag, apiKey) {
  const url = `${API_BASE}/clans/${encodeURIComponent(`#${clanTag}`)}/riverracelog`;
  return fetchApi(url, apiKey, `river race log #${clanTag}`);
}

async function fetchPlayer(playerTag, apiKey) {
  const tag = normalizeTag(playerTag);
  const url = `${API_BASE}/players/${encodeURIComponent(`#${tag}`)}`;
  return fetchApi(url, apiKey, `player #${tag}`);
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
      throw new Error(`Could not fetch profile #${tag}: ${error.message}`);
    }
  });
  return new Map(pairs);
}

function createScratchDb() {
  const tempDir = mkdtempSync(join(tmpdir(), "poapkings-roster-"));
  const tempDbPath = join(tempDir, "clash-royale.sqlite");
  if (existsSync(dataDbPath)) {
    copyFileSync(dataDbPath, tempDbPath);
  }
  const db = openDataDb({ path: tempDbPath });
  return {
    db,
    cleanup() {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function updateDataStore(db, { shouldRecordCurrentSnapshot, clanTag, now, clanData, nextClan, nextRoster, riverRaceLog }) {
  if (shouldRecordCurrentSnapshot) {
    upsertCurrentSnapshot(db, {
      snapshotDate: null,
      observedAt: now,
      clanTag,
      clanData,
      clanPayload: nextClan,
      rosterPayload: nextRoster,
    });
  }
  upsertRiverRaceLog(db, { clanTag, items: riverRaceLog?.items ?? [] });
  return generateDataExports(db, { clan: nextClan, roster: nextRoster });
}

async function readClashRoyale({ clanTag, envPaths, skipProfiles, skipWars, previousRoster, now }) {
  const apiKey = requireApiKey(envPaths, "CR_API_KEY");
  const sisterTags = (readJson(ourClansPath, {}).clans || [])
    .map((clan) => normalizeTag(clan.tag))
    .filter((tag) => tag !== clanTag);
  const [clanData, riverRaceLog, ...sisters] = await Promise.all([
    fetchClan(clanTag, apiKey),
    skipWars ? { items: [] } : fetchRiverRaceLog(clanTag, apiKey),
    ...sisterTags.map((tag) => fetchClan(tag, apiKey)),
  ]);
  const clanMembers = clanData.memberList || [];
  const profileByTag = skipProfiles ? new Map() : await fetchPlayerProfiles(clanMembers, apiKey);
  return {
    clanData,
    nextClan: buildClanPayload(clanData),
    nextRoster: buildRosterPayload(clanData, now, profileByTag, previousRoster),
    riverRaceLog,
    nextNetwork: clanNetworkPayload(new Map(sisterTags.map((tag, index) => [tag, sisters[index]]))),
    report: [
      skipProfiles
        ? "Skipped player profile fetch; preserved existing profile fields where available."
        : `Fetched player profiles: ${profileByTag.size}/${clanMembers.length}.`,
      skipWars ? "Skipped river race log fetch." : `Fetched river race log weeks: ${riverRaceLog.items?.length ?? 0}.`,
      `Read ${sisterTags.length} sister clans: ${sisterTags.map((tag, index) => `#${tag} ${sisters[index].members ?? 0}/50`).join(", ")}.`,
    ],
  };
}

async function main() {
  if (hasArg("--help")) {
    printHelp();
    return;
  }

  const dryRun = hasArg("--dry-run");
  const skipProfiles = hasArg("--skip-profiles");
  const skipWars = hasArg("--skip-wars");
  const exitCodeSignal = hasArg("--exit-code");
  const site = readJson(sitePath, {});
  const clanTag = normalizeTag(argValue("--clan-tag") || site.clanTag);
  const envPaths = argValue("--env-file") ? [resolve(argValue("--env-file"))] : defaultEnvPaths;

  const previousClan = readJson(clanPath, {});
  const previousRoster = readJson(rosterPath, {});
  const previousNetwork = readJson(clanNetworkPath, null);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const read = await readClashRoyale({ clanTag, envPaths, skipProfiles, skipWars, previousRoster, now });
  const { clanData, nextClan, nextRoster, riverRaceLog, nextNetwork } = read;

  const clanChanged = stableJson(previousClan) !== stableJson(nextClan);
  const rosterChanged = stableJson(withoutUpdated(previousRoster)) !== stableJson(withoutUpdated(nextRoster));
  const networkChanged = stableJson(previousNetwork) !== stableJson(nextNetwork);
  const shouldRecordCurrentSnapshot = clanChanged || rosterChanged || !existsSync(dataDbPath);
  const store = { shouldRecordCurrentSnapshot, clanTag, now, clanData, nextClan, nextRoster, riverRaceLog };
  const scratch = createScratchDb();
  let exportChangedFiles = [];
  try {
    const scratchExports = updateDataStore(scratch.db, store);
    exportChangedFiles = writeDataExports(scratchExports, { dryRun: true }).map(relativePath);
  } finally {
    scratch.cleanup();
  }

  const changedFiles = [];
  if (clanChanged) changedFiles.push("src/_data/clan.json");
  if (rosterChanged) changedFiles.push("src/_data/roster.json");
  if (networkChanged) changedFiles.push("src/_data/clanNetwork.json");
  if (shouldRecordCurrentSnapshot || exportChangedFiles.length) changedFiles.push("data/clash-royale.sqlite");
  changedFiles.push(...exportChangedFiles);

  const changed = changedFiles.length > 0;
  if (!dryRun && changed) {
    if (clanChanged) writeIfChanged(clanPath, nextClan, dryRun);
    if (rosterChanged) writeIfChanged(rosterPath, nextRoster, dryRun);
    if (networkChanged) writeIfChanged(clanNetworkPath, nextNetwork, dryRun);
    const db = openDataDb();
    try {
      writeDataExports(updateDataStore(db, store), { dryRun });
    } finally {
      db.close();
    }
  }

  const mode = dryRun ? "Dry run" : "Updated";
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
  for (const line of read.report) console.log(line);
  if (exitCodeSignal && changed) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
