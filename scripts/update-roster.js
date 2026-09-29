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
  upsertElixirWarWeeks,
  upsertRiverRaceLog,
  writeDataExports,
} from "./clash-data-store.js";
import { clanWarLeague } from "./clan-war-league.js";

const API_BASE = "https://api.clashroyale.com/v1";
// Elixir records all three clans; its JSON API is the default source since
// 2026-09-29. The game API path stays as --source cr, the rollback.
const ELIXIR_API_BASE = "https://elixir.poapkings.com/api/v1";
const ELIXIR_CARDS_URL = "https://elixir.poapkings.com/api/public/cards";
const SOURCES = ["elixir", "cr"];
// Elixir serves a clan's location as the game's id; the names we show.
const LOCATION_NAMES = { 57000006: "International" };
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
function normalizeMemberName(value) {
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
const defaultCrApiEnvPath = resolve(repoRoot, "..", "elixir-bot", ".env");
const defaultElixirEnvPath = join(repoRoot, ".env");

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
  --source NAME      elixir (default) reads Elixir's JSON API for all three
                     clans; cr reads the Clash Royale API for the home clan,
                     the rollback path.
  --clan-tag TAG     Clan tag to fetch. Defaults to src/_data/site.json.
  --env-file PATH    Env file holding the source's key. Defaults to .env here
                     for elixir (ELIXIR_API_KEY), ../elixir-bot/.env for cr
                     (CR_API_KEY).
  --skip-profiles    cr only: fetch only the clan roster and preserve existing
                     profile fields.
  --skip-wars        Skip the war history fetch.
  --dry-run          Fetch and compare without writing files.
  --exit-code        Exit 2 when data changed or would change.
  --help             Show this help.

Each key is read from the current environment first, then from the env file,
and is never printed.`);
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

function requireApiKey(envPath, name = "CR_API_KEY") {
  const fromProcess = (process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const fromFile = (parseEnvFile(envPath)[name] || "").trim();
  if (fromFile) return fromFile;
  throw new Error(`${name} is not set and was not found in ${envPath}`);
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

function displayLeague(warLeague, clanWarTrophies) {
  const apiLeague = typeof warLeague === "object" ? warLeague?.name : warLeague;
  if (apiLeague && String(apiLeague).trim() !== "Unranked") return String(apiLeague);
  return clanWarLeague(clanWarTrophies);
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

function favoriteCardPayload(card) {
  if (!card || typeof card !== "object" || !card.name) return null;
  const imageUrl =
    card.iconUrls?.medium ||
    card.icon_urls?.medium ||
    card.icon_url ||
    "";
  if (!imageUrl) return null;

  const payload = {
    name: card.name,
    image_url: imageUrl,
  };
  const id = numberOrNull(card.id);
  if (id != null) payload.id = id;
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
  const favoriteCard = favoriteCardPayload(profile.currentFavouriteCard);
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
  if (favoriteCard) payload.favorite_card = favoriteCard;

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
    name: normalizeMemberName(member.name) || "Unknown",
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
    clanLeague: displayLeague(clanData.warLeague, clanData.clanWarTrophies),
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

// The game's compact timestamp (20260927T223621.000Z), which roster.json
// and the data store have always carried.
function gameTimestamp(iso) {
  return iso ? String(iso).replace(/[-:]/g, "") : "";
}

function elixirFavoriteCard(cardId, cardsById) {
  const card = cardId == null ? null : cardsById.get(Number(cardId));
  return card ? favoriteCardPayload(card) : null;
}

// Elixir's lifetime block is the latest profile read; a member whose profile
// it has not read yet keeps the fields the site last had. The site's clan
// war wins and clan donations were the ClanWarWins and ClanDonations badges'
// progress, which Elixir does not serve per member: its war_day_wins is the
// retired Clan Wars counter (0 on newer accounts) and total_donations the
// lifetime counter, so neither stands in for them.
function elixirProfilePayload(member, cardsById) {
  const life = member.lifetime;
  if (!life) return null;
  const payload = {};
  assignNumber(payload, "best_trophies", life.best_trophies);
  assignNumber(payload, "battle_count", life.battle_count);
  assignNumber(payload, "three_crown_wins", life.three_crown_wins);
  assignNumber(payload, "cr_account_age_days", member.account_age_days);
  assignNumber(payload, "cr_account_age_years", member.years_played);
  assignNumber(payload, "cr_battle_wins", life.wins);
  assignNumber(payload, "cr_collection_level", life.collection_level);
  assignNumber(payload, "badge_count", member.badge_count);
  const favoriteCard = elixirFavoriteCard(member.favorite_card_id, cardsById);
  if (favoriteCard) payload.favorite_card = favoriteCard;
  return payload;
}

function elixirMemberPayload(member, previousMember, cardsById) {
  const profileFields =
    elixirProfilePayload(member, cardsById) ?? preservedProfilePayload(previousMember);
  return {
    name: normalizeMemberName(member.name) || "Unknown",
    tag: normalizeTag(member.player_tag),
    role: ROLE_MAP[member.role] || "Member",
    trophies: member.trophies || 0,
    arena: member.arena?.name || "",
    clan_rank: member.clan_rank || 0,
    previous_clan_rank: member.previous_clan_rank || null,
    donations: member.donations_this_week || 0,
    donations_received: member.donations_received_this_week || 0,
    last_seen: gameTimestamp(member.last_seen_in_game),
    ...profileFields,
  };
}

function elixirClanPayload(roster, previousClan = {}) {
  const members = roster.members || [];
  const location = LOCATION_NAMES[roster.location_id];
  return {
    memberCount: roster.member_count ?? members.length,
    clanScore: roster.clan_score || 0,
    clanWarTrophies: roster.clan_war_trophies || 0,
    donationsPerWeek: roster.donations_per_week || 0,
    totalTrophies: members.reduce((sum, member) => sum + (member.trophies || 0), 0),
    minTrophies: roster.required_trophies || 0,
    clanLeague: clanWarLeague(roster.clan_war_trophies || 0),
    clanStatus: displayClanType(roster.type),
    clanRegion: location || previousClan.clanRegion || "Not Set",
  };
}

function elixirRosterPayload(roster, now, previousRoster, cardsById) {
  const previousByTag = previousMembersByTag(previousRoster);
  const members = (roster.members || [])
    .map((member) =>
      elixirMemberPayload(member, previousByTag.get(normalizeTag(member.player_tag)), cardsById),
    )
    .sort((a, b) => (a.clan_rank || 999) - (b.clan_rank || 999) || a.name.localeCompare(b.name));
  return { updated: now, members };
}

// The data store's clan row reads the game's field names.
function elixirSnapshotClan(clanTag, roster, nextClan) {
  return {
    tag: `#${clanTag}`,
    name: roster.name ?? null,
    type: roster.type ?? null,
    location: { name: nextClan.clanRegion },
    members: nextClan.memberCount,
    clanScore: nextClan.clanScore,
    clanWarTrophies: nextClan.clanWarTrophies,
    donationsPerWeek: nextClan.donationsPerWeek,
    requiredTrophies: nextClan.minTrophies,
  };
}

// The sister clans' facts for /clans/, the ones the home clan's card shows.
function clanNetworkPayload(rostersByTag, previousNetwork = {}) {
  const clans = {};
  for (const [tag, roster] of rostersByTag) {
    const facts = elixirClanPayload(roster, previousNetwork.clans?.[tag]);
    clans[tag] = {
      name: roster.name ?? null,
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

async function fetchClan(clanTag, apiKey) {
  const url = `${API_BASE}/clans/${encodeURIComponent(`#${clanTag}`)}`;
  return fetchApi(url, apiKey, `clan #${clanTag}`);
}

async function fetchRiverRaceLog(clanTag, apiKey) {
  const url = `${API_BASE}/clans/${encodeURIComponent(`#${clanTag}`)}/riverracelog?limit=20`;
  return fetchApi(url, apiKey, `river race log #${clanTag}`);
}

async function fetchPlayer(playerTag, apiKey) {
  const tag = normalizeTag(playerTag);
  const url = `${API_BASE}/players/${encodeURIComponent(`#${tag}`)}`;
  return fetchApi(url, apiKey, `player #${tag}`);
}

async function fetchElixir(path, apiKey, description) {
  const response = await fetch(`${ELIXIR_API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "poapkings.com-roster-updater",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Elixir API returned ${response.status} ${response.statusText} for ${description}: ${body.slice(0, 240)}`,
    );
  }
  return (await response.json()).data;
}

async function fetchElixirRoster(clanTag, apiKey) {
  return fetchElixir(`/clans/${encodeURIComponent(`#${clanTag}`)}/roster`, apiKey, `roster #${clanTag}`);
}

async function fetchElixirWarHistory(clanTag, apiKey) {
  return fetchElixir(`/clans/${encodeURIComponent(`#${clanTag}`)}/war-history`, apiKey, `war history #${clanTag}`);
}

async function fetchCardCatalog() {
  const response = await fetch(ELIXIR_CARDS_URL, {
    headers: { Accept: "application/json", "User-Agent": "poapkings.com-roster-updater" },
  });
  if (!response.ok) throw new Error(`Elixir card catalog returned ${response.status} ${response.statusText}`);
  const { cards } = await response.json();
  return new Map((cards || []).map((card) => [Number(card.id), card]));
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

function updateDataStore(db, { shouldRecordCurrentSnapshot, clanTag, now, clanData, nextClan, nextRoster, riverRaceLog, warWeeks }) {
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
  if (warWeeks) upsertElixirWarWeeks(db, { weeks: warWeeks });
  else upsertRiverRaceLog(db, { clanTag, items: riverRaceLog?.items ?? [] });
  return generateDataExports(db, { clan: nextClan, roster: nextRoster });
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

async function readElixir({ clanTag, envPath, skipWars, previousClan, previousRoster, now }) {
  const apiKey = requireApiKey(envPath, "ELIXIR_API_KEY");
  const sisterTags = (readJson(ourClansPath, {}).clans || [])
    .map((clan) => normalizeTag(clan.tag))
    .filter((tag) => tag !== clanTag);
  const [roster, cardsById, warHistory, ...sisters] = await Promise.all([
    fetchElixirRoster(clanTag, apiKey),
    fetchCardCatalog(),
    skipWars ? null : fetchElixirWarHistory(clanTag, apiKey),
    ...sisterTags.map((tag) => fetchElixirRoster(tag, apiKey)),
  ]);
  const nextClan = elixirClanPayload(roster, previousClan);
  const withProfiles = (roster.members || []).filter((member) => member.lifetime).length;
  return {
    clanData: elixirSnapshotClan(clanTag, roster, nextClan),
    nextClan,
    nextRoster: elixirRosterPayload(roster, now, previousRoster, cardsById),
    warWeeks: warHistory?.weeks ?? [],
    nextNetwork: clanNetworkPayload(
      new Map(sisterTags.map((tag, index) => [tag, sisters[index]])),
      readJson(clanNetworkPath, {}),
    ),
    report: [
      `Read #${clanTag} from Elixir: ${withProfiles}/${roster.members?.length ?? 0} members with a recorded profile.`,
      skipWars ? "Skipped war history fetch." : `Fetched war history weeks: ${warHistory?.weeks?.length ?? 0}.`,
      `Read ${sisterTags.length} sister clans: ${sisterTags.map((tag, index) => `${sisters[index].name} ${sisters[index].member_count}/50`).join(", ")}.`,
    ],
  };
}

async function readClashRoyale({ clanTag, envPath, skipProfiles, skipWars, previousRoster, now }) {
  const apiKey = requireApiKey(envPath, "CR_API_KEY");
  const clanData = await fetchClan(clanTag, apiKey);
  const clanMembers = clanData.memberList || [];
  const profileByTag = skipProfiles ? new Map() : await fetchPlayerProfiles(clanMembers, apiKey);
  const riverRaceLog = skipWars ? { items: [] } : await fetchRiverRaceLog(clanTag, apiKey);
  return {
    clanData,
    nextClan: buildClanPayload(clanData),
    nextRoster: buildRosterPayload(clanData, now, profileByTag, previousRoster),
    riverRaceLog,
    report: [
      skipProfiles
        ? "Skipped player profile fetch; preserved existing profile fields where available."
        : `Fetched player profiles: ${profileByTag.size}/${clanMembers.length}.`,
      skipWars ? "Skipped clan war log fetch." : `Fetched river race log weeks: ${riverRaceLog.items?.length ?? 0}.`,
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
  const source = argValue("--source") || "elixir";
  if (!SOURCES.includes(source)) throw new Error(`--source must be one of ${SOURCES.join(", ")}`);
  const site = readJson(sitePath, {});
  const clanTag = normalizeTag(argValue("--clan-tag") || site.clanTag);
  const envPath = resolve(
    argValue("--env-file") ||
      (source === "elixir"
        ? defaultElixirEnvPath
        : process.env.CR_API_ENV || process.env.ELIXIR_BOT_ENV || defaultCrApiEnvPath),
  );

  const previousClan = readJson(clanPath, {});
  const previousRoster = readJson(rosterPath, {});
  const previousNetwork = readJson(clanNetworkPath, null);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const read = source === "elixir"
    ? await readElixir({ clanTag, envPath, skipWars, previousClan, previousRoster, now })
    : await readClashRoyale({ clanTag, envPath, skipProfiles, skipWars, previousRoster, now });
  const { clanData, nextClan, nextRoster, riverRaceLog, warWeeks, nextNetwork } = read;

  const clanChanged = stableJson(previousClan) !== stableJson(nextClan);
  const rosterChanged = stableJson(withoutUpdated(previousRoster)) !== stableJson(withoutUpdated(nextRoster));
  const networkChanged = Boolean(nextNetwork) && stableJson(previousNetwork) !== stableJson(nextNetwork);
  const shouldRecordCurrentSnapshot = clanChanged || rosterChanged || !existsSync(dataDbPath);
  const store = { shouldRecordCurrentSnapshot, clanTag, now, clanData, nextClan, nextRoster, riverRaceLog, warWeeks };
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
    `Fetched #${clanTag} (${source}): ${nextClan.memberCount}/50 members, ${nextClan.clanScore.toLocaleString("en-US")} clan score, ${nextClan.donationsPerWeek.toLocaleString("en-US")} donations/week.`,
  );
  for (const line of read.report) console.log(line);
  if (exitCodeSignal && changed) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
