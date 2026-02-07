# poapkings.com

Static multi-page site for the POAP KINGS Clash Royale clan. The site is plain HTML/CSS/JS with no build step.

## Project layout
- `index.html`: Home page with primary clan overview and call-to-action.
- `roster/index.html`: Dedicated roster page (`/roster`).
- `members/index.html`: "King's Keep" onboarding/resources page (`/members`).
- `styles.css`: All styling.
- `app.js`: Client-side script that loads/renders roster data and handles roster filtering.
- `roster.json`: Public roster data consumed by `app.js`.
- `assets/`: Static assets (logo, local font file).
- `CNAME`: Custom domain for GitHub Pages.

## Key behaviors
- `app.js` fetches `/roster.json` with `cache: "no-store"`.
- Roster page supports search + role filtering.
- Each roster row can render links for:
  - RoyaleAPI (from `tag`)
  - Profile (`profile_url`, optional)
  - POAP (`address`, optional; ENS or ETH address)
- Player tags in `roster.json` can be with or without `#`; the UI normalizes them.
- `date_joined` is optional and shown as "Joined ..."; ISO format (`YYYY-MM-DD`) is recommended.
- Pages share the same top navigation across Home, Roster, and King's Keep.

## Roster schema
`roster.json` expects:

```json
{
  "updated": "YYYY-MM-DD",
  "members": [
    {
      "name": "Display Name",
      "tag": "20JJJ2CCRU",
      "role": "Leader",
      "note": "Founder",
      "profile_url": "https://example.com",
      "address": "name.eth",
      "date_joined": "2025-12-01"
    }
  ]
}
```

Optional per-member fields:
- `role`
- `note`
- `profile_url`
- `address`
- `date_joined`

## Updating the roster
1. Edit `roster.json`.
2. Keep `tag` in `#ABC123` style or raw without `#`.
3. Use `profile_url` only with `http://` or `https://`.
4. Use `address` as ENS or ETH address for POAP linking.
5. Use `date_joined` as `YYYY-MM-DD` when possible.
6. Upload updated `roster.json` to the same host/bucket as the site so `app.js` can fetch it.

## Local preview
Serve the folder with a static server (recommended), for example:

```bash
python3 -m http.server 8000
```

Then open:
- `/` (Home)
- `/roster`
- `/members`

## Notes
- No build tooling or dependencies.
- Google Fonts are loaded on each page; remove those `<link>` tags for fully offline hosting.
