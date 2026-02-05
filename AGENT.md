# poapkings.com

Static single-page site for the POAP KINGS Clash Royale clan. The site is plain HTML/CSS/JS with a small roster loader and no build step.

## Project layout
- `index.html`: Main page markup and content sections.
- `styles.css`: All styling.
- `app.js`: Small client-side script to load/render the clan roster.
- `roster.json`: Public roster data (name, tag, optional role/note) consumed by `app.js`.
- `CNAME`: Custom domain for GitHub Pages.

## Key behaviors
- `app.js` fetches `./roster.json` with `cache: "no-store"`, builds cards, and links each member to their RoyaleAPI profile.
- Player tags in `roster.json` can be with or without `#`; the UI normalizes them.
- The roster UI expects `data.members` to be an array of objects with `name`, `tag`, and optional `role`/`note`.

## Content placeholders to update
- `POAP_COLLECTION_URL_HERE` in `index.html` should be replaced with the clan’s POAP collection URL.
- `#PUT_TAG_HERE` in the Join section should be replaced once the clan tag is finalized.

## Updating the roster
1. Edit `roster.json`.
2. Keep tags in the `#ABC123` style or raw without `#`.
3. Upload the updated `roster.json` to the same host/bucket as the site so `app.js` can fetch it.

## Local preview
Open `index.html` directly in a browser or serve the folder with any static server.

## Notes
- No build tooling or dependencies.
- Fonts are loaded from Google Fonts in `index.html`; remove those `<link>` tags for fully offline hosting.
