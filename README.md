# POAP KINGS

**Proof of Arena Push** — the official website for the POAP KINGS Clash Royale clan.

Built with [Eleventy](https://www.11ty.dev/) and deployed to [GitHub Pages](https://pages.github.com/).

**Clan Tag:** #J2RGCRVG · **Status:** Invite Only · **Minimum Trophies:** 7,000

Visit [poapkings.com](https://poapkings.com).

## Site

- **Home** — Current clan snapshot, requirements, roster highlights, our clans, and the Powered by Elixir band.
- **Roster** — Sortable current roster with roles, player tags linked to RoyaleAPI, trophies, career wins, years played, and collection score.
- **Data** — Interactive roster scatterplot and historical clan timeline.
- **Members** — Discord/setup links, an Elixir account for the weekly clan email, and current recruiting copy.
- **Our clans** — The POAP KINGS network: POAP KINGS, Ship It! and Elixir Kings, sharing one Discord.
- **Elixir** — How the clans use Elixir, the Clash Royale platform POAP KINGS built, with links out to elixir.poapkings.com. The old `/elixir-mcp/` page redirects here.
- **Recognition** — Durable completed-season War Champ, Iron King, Rookie MVP, Donation Champ, and Pass Royale results.
- **Elixir Drop** — Marketing home for the clan's free Clash Royale elixir-cost trainer.
- **FAQ** — Clan, war, rewards, Discord, and role guidance.
- **Machine-readable surfaces** — `/llms.txt`, `/llms-full.txt`, and current `/data/*.json` exports.

The former Wars and Vault pages are retired. Historical river-race data remains in the updater-owned data set, but it is not published as a standalone route.

The clan originally published POAP digital collectibles for seasons and milestones. The POAP company and product ceased operating, so new collectibles can no longer be published. POAP KINGS keeps its name and uses “Proof of Arena Push” as the clan meaning.

## Local development

Requires Node.js 24 and npm.

```bash
npm ci
npm start
```

The development server runs at `http://localhost:8080`. Build the production site with:

```bash
npm run build
```

Eleventy writes the generated site to `_site/`.

## Clash Royale data

Refresh the roster and generated data locally with:

```bash
npm run update-roster
```

It reads all three clans from Elixir's JSON API with the site's own integration key, `ELIXIR_API_KEY` from the shell first and then this checkout's `.env`, so it belongs on the local host rather than in GitHub Actions. `--source cr` reads the IP-restricted Clash Royale API instead (`CR_API_KEY`, from the shell or `../elixir-bot/.env`), the rollback until the Elixir source has run clean for a week. Never commit or print either key.

Updater-owned artifacts:

- `src/_data/clan.json` — Current clan facts.
- `src/_data/roster.json` — Current members and profile facts.
- `src/_data/clanNetwork.json` — The sister clans' live facts for `/clans/`.
- `src/_data/clanInsights.json` — Aggregate roster metrics.
- `src/_data/clanTrends.json` — Daily historical series.
- `src/_data/rosterExplorer.json` — Current visualization rows.
- `src/_data/warHistory.json` — Retained river-race history used by the data pipeline, not a public route.
- `data/clash-royale.sqlite` — Committed build-time data store.

The updater prints `changed=true|false` and `changed_files=...`. For a read-only probe:

```bash
npm --silent run update-roster -- --dry-run --exit-code
```

Exit `0` means no changes; exit `2` means fresh data is available. Historical data can be imported with `npm run backfill-data`. Daily automation is governed by [`OPERATOR.md`](OPERATOR.md).

## Recognition data

Completed-season recognition is imported separately from Elixir's durable awards ledger:

```bash
npm run update-recognition
```

The importer opens `ELIXIR_DB_PATH` or `../elixir-bot/elixir-v51.db` read-only and writes the privacy-safe `src/_data/recognition.json` projection. It never publishes the site and is not part of the daily data operator; its result is published by a pull request that changes only that file. Check freshness without writing with:

```bash
npm --silent run update-recognition -- --check
```

Exit `0` means current; exit `2` means a completed season is ready to import.

## Current public routes

- `/`
- `/roster/`
- `/data/`
- `/faq/`
- `/members/`
- `/members/setup/`
- `/elixir/`
- `/recognition/`
- `/elixir-drop/`
- `/elixir-drop/free-pass/`
- `/llms.txt`
- `/llms-full.txt`
- `/data/clan.json`
- `/data/roster.json`
- `/data/insights.json`
- `/data/roster-explorer.json`
- `/data/trends.json`
- `/data/recognition.json`
- `/data/site.json`

## Project structure

```text
src/
  _data/                  Build-time JSON
  _includes/
    base.njk              Shared document shell, navigation, footer, and modals
    components.njk        Shared Nunjucks presentation components
  assets/                 Fonts and current image assets
  data/                   Public JSON endpoint templates
  index.njk               Home page
  roster.njk              Roster page
  data.njk                Interactive data page
  faq.njk                 FAQ
  members.njk             Members hub
  setup.njk               Member setup guide
  elixir.njk              Elixir overview
  recognition.njk          Completed-season recognition
  elixir-drop.njk          Elixir Drop marketing page
  gamify.js               Motion effects and on-demand PixiJS star particles
  data.js                 Data explorer and timeline interactions
  roster.js               Roster sorting
  members-promo.js        Member email and copy tools
  styles.css              Site styles
eleventy.config.js        Eleventy configuration, filters, and client bundling
scripts/                  Clash Royale updater and data-store tooling
data/clash-royale.sqlite  Build-time data store
```

## Stack

- Eleventy 3 with Nunjucks templates
- Plain CSS and vanilla JavaScript
- [Motion](https://motion.dev/) for DOM choreography
- [PixiJS](https://pixijs.com/) for on-demand star particles
- Tinylytics for privacy-focused analytics ([public stats](https://tinylytics.app/public/NnbTPjJ2AWXF8GZDuy54))
- GitHub Actions and GitHub Pages

`main` takes only pull requests. Every pull request runs the `validate` check (install, build, workflow lint); a merge to `main` runs it again and then deploys `_site/`. GitHub Pages must use **GitHub Actions** as its source. [`AGENTS.md`](AGENTS.md) has the landing steps.

## Supercell disclaimer

This is an unofficial, non-commercial fan site. Clash Royale is a trademark of Supercell; the "Clash" fonts (`src/assets/Clash_*.otf`), the arena artwork (`src/assets/arenas/`), and the clan/river-race data are Supercell's intellectual property, used under Supercell's Fan Content Policy (see [`LICENSE`](LICENSE) and the per-directory notes in [`src/assets/`](src/assets/README.md)).

> This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy: www.supercell.com/fan-content-policy.
