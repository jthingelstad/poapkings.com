# POAP KINGS

**Proof of Arena Push** -- the official website for the POAP KINGS Clash Royale clan.

Built with [Eleventy (11ty)](https://www.11ty.dev/) and deployed to [GitHub Pages](https://pages.github.com/).

**Clan Tag:** #J2RGCRVG | **League:** Bronze | **Status:** Open | **Min Trophies:** 2,000

Visit the live site at [poapkings.com](https://poapkings.com).

## Features

- **Roster** -- Clan roster refreshed from the Clash Royale API, with member ranks, roles, trophies, donations, arenas, and career-depth badges
- **POAP Vault** -- Browse the clan's POAP (Proof of Attendance Protocol) collection marking milestones and seasons
- **Client-side search and filtering** -- Instantly search roster members or filter Awards-page POAPs by type
- **Members** -- Member hub with clan setup guide, awards, and promotion tools
- **Elixir** -- Public-facing page for the Elixir AI agent
- **FAQ** -- Answers to common questions about the clan, Elixir, and POAPs

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- npm

### Install

```bash
npm install
```

### Development

```bash
npm start
```

This starts a local dev server at `http://localhost:8080` with live reload.

### Build

```bash
npm run build
```

Compiles the site to the `_site/` directory.

## Data

The clan roster is refreshed locally from the Clash Royale API:

```bash
npm run update-roster
```

The updater is meant to be run locally because the Clash Royale API key is IP restricted; do not run it in GitHub Actions. It reads `CR_API_KEY` from the shell first, then falls back to `../elixir-bot/.env` so this repo can use the same API key without copying secrets. It updates the two site data files that come directly from the clan endpoint and current-member player profiles:

- `elixirClan.json` -- Clan-level stats (trophies, league, member count)
- `elixirRoster.json` -- Current roster with ranks, roles, trophies, donations, arenas, last-seen timestamps, career wins, account age, collection level, and compact badge highlights

The script only rewrites files when those clan or roster facts change, so commits should correspond to real website data updates.

For local automation, use quiet npm output and read the first signal lines:

```bash
npm --silent run update-roster
# changed=true
# changed_files=src/_data/elixirClan.json,src/_data/elixirRoster.json
```

Add `-- --dry-run --exit-code` when you want a shell-check mode: exit `0` means no changes, exit `2` means data would change.

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds and deploys the site to GitHub Pages automatically.

The GitHub repo Pages source must be set to **GitHub Actions** (not "Deploy from a branch").

## Project Structure

```
src/                        Site source (Eleventy input)
  _data/                    Build-time data (JSON)
    site.json               Site-wide config (URL, clan tag, etc.)
    elixirClan.json         Clan stats (updated by npm run update-roster)
    elixirRoster.json       Clan roster (updated by npm run update-roster)
    elixirHome.json         Static home page message
    elixirMembers.json      Static members page message
    elixirPromote.json      Promotional copy
    vault.json              POAP collection metadata
  _includes/                Shared layouts and components
    base.njk                Base page layout
    clan-stats.njk          Clan statistics grid
  assets/                   Static files (images, fonts)
  index.njk                 Home page
  roster.njk                Roster page
  vault.njk                 Redirect to the Awards-page POAP vault
  faq.njk                   FAQ page
  members.njk               Members page
  elixir.njk                Elixir page
  setup.njk                 Clan setup guide
  404.njk                   Custom 404 page
  styles.css                All styling
  app.js                    Client-side search and filtering
eleventy.config.js          Eleventy configuration and filters
```

## Tech Stack

- **Static site generator:** [Eleventy](https://www.11ty.dev/) v3
- **Templates:** Nunjucks
- **Styling:** Plain CSS (no framework)
- **Client-side JS:** Vanilla JavaScript
- **Analytics:** [Tinylytics](https://tinylytics.app/) (privacy-focused) -- [public stats](https://tinylytics.app/public/nqAdZqEbeis65byoh2_3?token=poapkings)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions

## Supercell Disclaimer

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. For more information see Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/).
