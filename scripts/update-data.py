#!/usr/bin/env python3
"""Update roster.json and site.json from the Clash Royale API + roster-extra.json custom data."""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

CLAN_TAG = "J2RGCRVG"
API_BASE = "https://api.clashroyale.com/v1"
ROLE_ORDER = {"Leader": 0, "Co-Leader": 1, "Elder": 2, "Member": 3}
ROLE_MAP = {"leader": "Leader", "coLeader": "Co-Leader", "elder": "Elder", "member": "Member"}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROSTER_PATH = PROJECT_ROOT / "src" / "_data" / "roster.json"
SITE_PATH = PROJECT_ROOT / "src" / "_data" / "site.json"
EXTRAS_PATH = PROJECT_ROOT / "roster-extra.json"
ENV_PATH = PROJECT_ROOT / ".env"


def load_api_key():
    """Read CR_API_KEY from environment or .env file."""
    key = os.environ.get("CR_API_KEY", "").strip()
    if key:
        return key
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == "CR_API_KEY":
                return v.strip()
    return ""


def fetch_clan_data(api_key):
    """Fetch clan data (including memberList) from the Clash Royale API."""
    url = f"{API_BASE}/clans/%23{CLAN_TAG}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            err = json.loads(body)
        except json.JSONDecodeError:
            err = {}
        reason = err.get("reason", "")
        message = err.get("message", body)
        if e.code == 403 and reason == "accessDenied.invalidIp":
            print(f"ERROR: IP not whitelisted for this API key.", file=sys.stderr)
            print(f"API message: {message}", file=sys.stderr)
            print("", file=sys.stderr)
            print("Go to https://developer.clashroyale.com to update your", file=sys.stderr)
            print("API key's allowed IP list.", file=sys.stderr)
        else:
            print(f"ERROR: HTTP {e.code} — {reason or 'unknown'}", file=sys.stderr)
            print(f"Message: {message}", file=sys.stderr)
        sys.exit(1)


def update_site_json(clan_data, member_list):
    """Update site.json with clan-level statistics from the API and calculated stats."""
    with open(SITE_PATH, "r") as f:
        site = json.load(f)

    # Direct from API
    site["memberCount"] = clan_data.get("members", 0)
    site["clanScore"] = clan_data.get("clanScore", 0)
    site["clanWarTrophies"] = clan_data.get("clanWarTrophies", 0)
    site["donationsPerWeek"] = clan_data.get("donationsPerWeek", 0)
    site["minTrophies"] = clan_data.get("requiredTrophies", 0)

    # Calculated from memberList
    site["totalTrophies"] = sum(m.get("trophies", 0) for m in member_list)
    count = len(member_list)
    if count > 0:
        site["avgLevel"] = round(sum(m.get("expLevel", 0) for m in member_list) / count, 1)
    else:
        site["avgLevel"] = 0

    with open(SITE_PATH, "w") as f:
        json.dump(site, f, indent=2)
        f.write("\n")

    print(f"Updated site.json: members={site['memberCount']}, "
          f"score={site['clanScore']}, warTrophies={site['clanWarTrophies']}, "
          f"donations/wk={site['donationsPerWeek']}, "
          f"totalTrophies={site['totalTrophies']}, avgLevel={site['avgLevel']}")


def load_extras():
    """Load roster-extra.json custom data."""
    if not EXTRAS_PATH.exists():
        return {}
    with open(EXTRAS_PATH, "r") as f:
        return json.load(f)


def build_roster(api_members, extras):
    """Merge API data with custom extras into roster members list."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    members = []

    new_tags = []
    for m in api_members:
        tag = m.get("tag", "").lstrip("#")
        role = ROLE_MAP.get(m.get("role", "member"), "Member")

        # Auto-create extras entry for new members
        if tag not in extras:
            extras[tag] = {
                "note": "",
                "profile_url": "",
                "address": "",
                "date_joined": today,
            }
            new_tags.append(tag)

        extra = extras[tag]

        arena = m.get("arena", {})
        arena_name = arena.get("name", "") if isinstance(arena, dict) else ""

        member = {
            "name": m.get("name", "Unknown"),
            "tag": tag,
            "role": role,
            "exp_level": m.get("expLevel", 0),
            "trophies": m.get("trophies", 0),
            "arena": arena_name,
            "clan_rank": m.get("clanRank", 0),
            "donations": m.get("donations", 0),
            "donations_received": m.get("donationsReceived", 0),
            "last_seen": m.get("lastSeen", ""),
            "note": extra.get("note", ""),
            "profile_url": extra.get("profile_url", ""),
            "address": extra.get("address", ""),
            "date_joined": extra.get("date_joined", today),
        }
        members.append(member)

    # Sort: date joined ascending (longest-tenured first), then alphabetical
    members.sort(key=lambda m: (m["date_joined"], m["name"].lower()))
    return members, today, new_tags


def main():
    api_key = load_api_key()
    if not api_key:
        print("ERROR: No API key found.", file=sys.stderr)
        print("Set CR_API_KEY in your environment or in .env at the project root.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching clan #{CLAN_TAG}...")
    clan_data = fetch_clan_data(api_key)

    member_list = clan_data.get("memberList", [])
    if not member_list:
        print("ERROR: API returned 0 members. Aborting to prevent accidental wipe.", file=sys.stderr)
        sys.exit(1)

    update_site_json(clan_data, member_list)

    extras = load_extras()
    members, today, new_tags = build_roster(member_list, extras)

    roster = {"updated": today, "members": members}
    with open(ROSTER_PATH, "w") as f:
        json.dump(roster, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(members)} members to roster.json (updated: {today})")

    # Persist any new extras entries
    if new_tags:
        with open(EXTRAS_PATH, "w") as f:
            json.dump(extras, f, indent=2)
            f.write("\n")
        print(f"Added {len(new_tags)} new member(s) to roster-extra.json: {', '.join(new_tags)}")


if __name__ == "__main__":
    main()
