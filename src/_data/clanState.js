import { readFileSync } from "node:fs";

/* Derived clan capacity facts. Lives here so the layout, the home page, and
   the FAQ all read one definition of "full" instead of each rolling their own
   — the footer JOIN button used to contradict the header WAIT button. */
const clan = JSON.parse(readFileSync(new URL("./clan.json", import.meta.url), "utf8"));

const maxMembers = 50;
const memberCount = Number(clan.memberCount) || 0;

export default {
  maxMembers,
  memberCount,
  openSlots: Math.max(0, maxMembers - memberCount),
  isFull: memberCount >= maxMembers,
};
