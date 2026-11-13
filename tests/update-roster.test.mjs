// The updater reads the Clash Royale API and writes only the fields the site
// shows. Fixtures are invented players; names are untrusted text that the
// updater keeps as data (pages escape it, tests/hostile-names.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROFILE_FIELD_NAMES,
  buildClanPayload,
  clanNetworkPayload,
  memberPayload,
  profilePayload,
} from "../scripts/update-roster.js";

const HOSTILE = `<img src=x onerror=alert(1)>"'><b class=HOSTILE>`;

const profile = {
  tag: "#P0LYQ2GV",
  name: "Fixture Player",
  expLevel: 0,
  bestTrophies: 9100,
  battleCount: 4200,
  threeCrownWins: 900,
  wins: 2300,
  losses: 1800,
  collectionLevel: 1500,
  totalDonations: 12000,
  warDayWins: 3,
  clanCardsCollected: 777,
  currentWinLoseStreak: 2,
  currentDeck: [{ name: "Knight" }],
  cards: [{ name: "Knight" }],
  currentFavouriteCard: {
    name: "Knight",
    id: 26000000,
    iconUrls: { medium: "https://api-assets.clashroyale.com/cards/300/knight.png" },
  },
  badges: [
    { name: "YearsPlayed", level: 3, maxLevel: 10, progress: 1200, target: 1460, iconUrls: { large: "x" } },
    { name: "CollectionLevel", level: 5, maxLevel: 9, progress: 1490, target: 2000, iconUrls: { large: "x" } },
    { name: "ClanWarWins", level: 2, maxLevel: 8, progress: 40, target: 50, iconUrls: { large: "x" } },
    { name: "ClanDonations", level: 4, maxLevel: 9, progress: 9000, target: 10000, iconUrls: { large: "x" } },
    { name: "EasterEgg", progress: 1, iconUrls: { large: "x" } },
  ],
};

test("the profile fields written are pinned", () => {
  // Adding one publishes more about every member, many of them minors.
  assert.deepEqual(PROFILE_FIELD_NAMES, [
    "best_trophies",
    "battle_count",
    "three_crown_wins",
    "cr_account_age_days",
    "cr_account_age_years",
    "cr_battle_wins",
    "cr_collection_level",
    "badge_count",
    "favorite_card",
  ]);
});

test("a profile becomes exactly the pinned fields", () => {
  assert.deepEqual(profilePayload(profile), {
    best_trophies: 9100,
    battle_count: 4200,
    three_crown_wins: 900,
    cr_account_age_days: 1200,
    cr_account_age_years: 3,
    cr_battle_wins: 2300,
    cr_collection_level: 1500,
    badge_count: 5,
    favorite_card: {
      name: "Knight",
      image_url: "https://api-assets.clashroyale.com/cards/300/knight.png",
      id: 26000000,
    },
  });
});

test("Collection Level falls back to the badge when the field is missing or a zero stub", () => {
  assert.equal(profilePayload({ ...profile, collectionLevel: 0 }).cr_collection_level, 1490);
  const { collectionLevel, ...older } = profile;
  assert.equal(profilePayload(older).cr_collection_level, 1490);
});

test("a member row keeps the roster fields and the profile, nothing else", () => {
  const row = memberPayload(
    {
      tag: "#p0lyq2gv",
      name: HOSTILE,
      role: "coLeader",
      expLevel: 0,
      trophies: 9000,
      arena: { id: 1, name: "Fixture Arena" },
      clanRank: 2,
      previousClanRank: 3,
      donations: 40,
      donationsReceived: 20,
      lastSeen: "20261113T120000.000Z",
    },
    profile,
    null,
  );
  assert.equal(row.name, HOSTILE, "names stay data; output escapes them");
  assert.equal(row.tag, "P0LYQ2GV");
  assert.equal(row.role, "Co-Leader");
  assert.deepEqual(Object.keys(row).sort(), [
    "arena", "clan_rank", "donations", "donations_received", "last_seen", "name",
    "previous_clan_rank", "role", "tag", "trophies", ...PROFILE_FIELD_NAMES,
  ].sort());
});

test("without a profile a member keeps only the pinned fields it had", () => {
  const row = memberPayload(
    { tag: "#P0LYQ2GV", name: "Fixture Player", role: "member", trophies: 1 },
    null,
    { tag: "P0LYQ2GV", best_trophies: 5, cr_clan_war_wins: 9, exp_level: 4 },
  );
  assert.equal(row.best_trophies, 5);
  assert.equal("cr_clan_war_wins" in row, false);
  assert.equal("exp_level" in row, false);
});

test("the clan and sister clan facts come from /clans/{tag}", () => {
  const clan = {
    tag: "#J2RGCRVG",
    name: "POAP KINGS",
    type: "inviteOnly",
    location: { id: 57000006, name: "International", isCountry: false },
    members: 2,
    clanScore: 5000,
    clanWarTrophies: 1500,
    donationsPerWeek: 300,
    requiredTrophies: 7500,
    memberList: [{ trophies: 9000 }, { trophies: 8000 }],
  };
  assert.deepEqual(buildClanPayload(clan), {
    memberCount: 2,
    clanScore: 5000,
    clanWarTrophies: 1500,
    donationsPerWeek: 300,
    totalTrophies: 17000,
    minTrophies: 7500,
    clanLeague: "Gold I",
    clanStatus: "Invite Only",
    clanRegion: "International",
  });
  const sister = { name: HOSTILE, type: "open", members: 3, clanWarTrophies: 0, requiredTrophies: 1000, memberList: [] };
  assert.deepEqual(clanNetworkPayload(new Map([["GCYQR9VY", sister]])), {
    clans: {
      GCYQR9VY: { name: HOSTILE, memberCount: 3, minTrophies: 1000, clanWarTrophies: 0, clanStatus: "Open" },
    },
  });
});

test("the data path never calls Elixir", () => {
  for (const file of ["scripts/update-roster.js", "scripts/clash-data-store.js"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /elixir\.poapkings\.com|ELIXIR_API_KEY/, file);
  }
});
