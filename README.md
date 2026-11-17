# Boardwalk — a lean make.fun frontend

An entry for make.fun's `makefun-frontend-01` bounty: a fully functioning
custom make.fun frontend as plain static files, no build step, no framework,
reading make.fun's public API alone (`https://make.fun/api`, GET, read-only).

## Surfaces (each reachable by link and by its own URL)

- `#/` — the live bounty board: each bounty's live pot, entry fee, time left
  and entries; search, sort (closing soon / biggest pot / most entries /
  newest) and an "entries open only" filter. A bounty past its deadline is
  shown as closed even while its status still reads open.
- `#/bounty/<slug>` — one bounty: summary, live pot, base reward, entry fee,
  deadline and time left, entries, category, status, the rewards table with
  live amounts (base + fee share), description and full rules.
- `#/bounty/<slug>/leaderboard` — the bounty's leaderboard: rank, hunter
  (linked to their profile), entry, judge win rate; 50 rows at a time.
- `#/u/<handle>` — an account's public profile: picture, links, record
  (entered / placed / won / podiums / best place / prize money) and entries.

## Performance

- First load: 6 files, 9,438 bytes gzip-9 (25,358 raw) — `index.html`, one
  stylesheet and four small ES modules, nothing else.
- API answers are cached and revalidated: fresh entries served from cache,
  older ones revalidated with `If-None-Match` (the API's ETags are bound to
  the minute), small answers persisted in `localStorage`; in-flight requests
  are deduplicated; board filtering and sorting re-render locally with no
  refetch.
- Works on a phone: single-column layout below 640 px, no horizontal
  overflow; tables scroll horizontally where needed.

## Run it

```sh
node serve.ts            # serves app/ on http://localhost:8080
```

## Hand-in

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
to `/output` and writes `/output/dossier.json` with `buildDossier` from
`vendor/makefun-frontend.ts` (the kit's copy, unchanged). Outside the grader,
`MAKEFUN_OUTPUT_DIR` stands in for `/output`.

`screenshots/` holds 3 JPEGs of the running app on live make.fun data,
taken with `tools/shots.mjs` (headless Chromium via CDP, waiting for
`window.__shotReady`): the board, a bounty page and a leaderboard.
`tools/relay.mjs` is a small CONNECT relay the screenshot script uses on
machines whose browser cannot reach the internet directly.

## License

MIT — see `LICENSE`.
