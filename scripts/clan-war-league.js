const CLAN_WAR_LEAGUE_BANDS = [
  [5000, "Legendary III"],
  [4000, "Legendary II"],
  [3000, "Legendary I"],
  [2500, "Gold III"],
  [2000, "Gold II"],
  [1500, "Gold I"],
  [1200, "Silver III"],
  [900, "Silver II"],
  [600, "Silver I"],
  [400, "Bronze III"],
  [200, "Bronze II"],
  [0, "Bronze I"],
];

export function clanWarLeague(trophies) {
  const value = Number(trophies);
  if (!Number.isFinite(value) || value < 0) return "Unranked";

  for (const [minimum, league] of CLAN_WAR_LEAGUE_BANDS) {
    if (value >= minimum) return league;
  }

  return "Unranked";
}
