# POAP KINGS

**Proof of Arena Push** -- the official website for the POAP KINGS Clash Royale clan.

Built with [Eleventy (11ty)](https://www.11ty.dev/) and deployed to [GitHub Pages](https://pages.github.com/).

**Clan Tag:** #J2RGCRVG | **Status:** Invite Only | **Members:** 43/50 | **Min Trophies:** 5,000

Visit the live site at [poapkings.com](https://poapkings.com).

## Features

- **Roster** -- Clan roster refreshed from the Clash Royale API, with member ranks, roles, trophies, donations, arenas, and career-depth badges
- **Clan Wars** -- River race history by season and week, generated from Clash Royale API data
- **Data dashboards** -- Homepage proof metrics, roster scatterplot explorer, trend data, and public JSON endpoints
- **POAP Vault** -- Browse the clan's POAP (Proof of Attendance Protocol) collection marking milestones and seasons
- **Client-side search and filtering** -- Search, role-filter, and sort the roster table; filter Vault POAPs by type
- **Members** -- Member hub with clan setup guide and promotion tools
- **FAQ** -- Answers to common questions about the clan, Clan Wars, POAPs, Discord, and roles

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 LTS with built-in `node:sqlite`
- npm

### Install

```bash
npm ci
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

The clan roster and generated data exports are refreshed locally from the Clash Royale API:

```bash
npm run update-roster
```

The updater is meant to be run locally because the Clash Royale API key is IP restricted; do not run it in GitHub Actions. It reads `CR_API_KEY` from the shell first, then falls back to `../elixir-bot/.env` so this repo can use the same API key without copying secrets. SQLite is build-time only; the website runtime still uses static files.

- `clan.json` -- Clan-level stats (trophies, league, member count)
- `roster.json` -- Current roster with ranks, roles, trophies, donations, arenas, last-seen timestamps, career wins, account age, collection score, and compact badge highlights
- `data/clash-royale.sqlite` -- Build helper database committed with the repo
- `clanInsights.json`, `clanTrends.json`, `rosterExplorer.json`, `warHistory.json` -- Generated static data for the homepage, roster explorer, and Clan Wars page

The script compares generated output before touching the real database, then prints `changed=true|false` and `changed_files=...` so local automation can skip commits when the CR API data is unchanged.

Historical CR API data can be imported locally with:

```bash
npm run backfill-data
```

For local automation, use quiet npm output and read the first signal lines:

```bash
npm --silent run update-roster
# changed=true
# changed_files=src/_data/clan.json,src/_data/roster.json,data/clash-royale.sqlite
```

Add `-- --dry-run --exit-code` when you want a shell-check mode: exit `0` means no changes, exit `2` means data would change.

The daily host-local agent is defined in [`OPERATOR.md`](OPERATOR.md). It performs a read-only probe first, validates the complete generated-data set, and publishes only a clean refresh that passes the production install and build gates. Its dependency audit is advisory; security remediation is handled by the weekly Agentic Sys Admin review.

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds and deploys the site to GitHub Pages automatically.

The GitHub repo Pages source must be set to **GitHub Actions** (not "Deploy from a branch").

## Project Structure

```
src/                        Site source (Eleventy input)
  _data/                    Build-time data (JSON)
    site.json               Site-wide config (URL, clan tag, etc.)
    clan.json               Clan stats (updated by npm run update-roster)
    roster.json             Clan roster (updated by npm run update-roster)
    clanInsights.json       Homepage proof metrics and distributions
    clanTrends.json         Daily historical trend data
    rosterExplorer.json     Current roster explorer dimensions
    warHistory.json         Clan Wars season/week history
    promotionCopy.json      Promotional copy
    vault.json              POAP collection metadata
  _includes/                Shared layouts and components
    base.njk                Base page layout
    clan-stats.njk          Clan statistics grid
  assets/                   Static files (images, fonts)
  index.njk                 Home page
  roster.njk                Roster page
  wars.njk                  Clan Wars page
  vault.njk                 POAP vault page
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
