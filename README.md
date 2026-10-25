# YouTube Flow

A browser extension for Firefox and Chrome: instead of opening interesting YouTube videos in new tabs that pile up, send them to pipelines and work through them later, one decision at a time.

- [docs/SPEC.md](docs/SPEC.md): the full spec
- [prototypes/](prototypes/): UI mockups for the main screens

Status: all v1 features from the spec are implemented: capture (intercept, context menu, tab, sweep), rules, processing with keyboard shortcuts, archive, stats, reminders, AI summaries, JSON export/import, light and dark theme.

Dev: `npm install`, then `npm run dev` (Chrome) or `npm run dev:firefox`. Build: `npm run build`, load `.output/chrome-mv3` unpacked. Tests: `npm test`.
