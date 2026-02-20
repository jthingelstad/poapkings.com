# POAP KINGS

**Proof of Arena Push** -- the official website for the POAP KINGS Clash Royale clan.

Built with [Eleventy (11ty)](https://www.11ty.dev/) and deployed to [GitHub Pages](https://pages.github.com/).

**Clan Tag:** #J2RGCRVG | **League:** Bronze | **Status:** Open | **Min Trophies:** 2,000

Visit the live site at [poapkings.com](https://poapkings.com).

## Features

- **Roster** -- Live clan roster synced from the Clash Royale API with player stats, roles, and links to RoyaleAPI profiles
- **POAP Vault** -- Browse the clan's POAP (Proof of Attendance Protocol) collection marking milestones and seasons
- **Client-side search and filtering** -- Instantly search roster members or filter vault POAPs by type
- **Members** -- Member hub with clan setup guide, awards, and promotion tools
- **FAQ** -- Answers to common questions about the clan and POAPs

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

## Updating the Roster

The roster is synced from the Clash Royale API using a Python script. You need an API key from [developer.clashroyale.com](https://developer.clashroyale.com).

1. Store your API key in a `.env` file at the project root:
   ```
   CR_API_KEY=your_key_here
   ```
2. Run the sync script:
   ```bash
   python3 scripts/sync-roster.py
   ```
3. Custom member data (POAP wallets, profile URLs, notes, join dates) is maintained in `roster-extra.json` at the project root. Do **not** hand-edit `src/_data/roster.json` directly.

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds and deploys the site to GitHub Pages automatically.

The GitHub repo Pages source must be set to **GitHub Actions** (not "Deploy from a branch").

## Project Structure

```
src/                        Site source (Eleventy input)
  _data/                    Build-time data (JSON)
    site.json               Site-wide config (URL, clan tag, etc.)
    roster.json             Clan roster (auto-generated)
    vault.json              POAP collection metadata
  _includes/                Shared layouts and components
    base.njk                Base page layout
    clan-stats.njk          Clan statistics grid
  assets/                   Static files (images, fonts)
  index.njk                 Home page
  roster.njk                Roster page
  vault.njk                 Vault page
  faq.njk                   FAQ page
  members.njk               Members page
  setup.njk                 Clan setup guide
  404.njk                   Custom 404 page
  styles.css                All styling
  app.js                    Client-side search and filtering
scripts/
  sync-roster.py            Clash Royale API sync script
roster-extra.json           Custom member data (not served)
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
