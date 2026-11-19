# Snow Line

A quiet atlas of the world's high places: 53 famous peaks, 100 great hiking routes and 70 gear lines from 23 brands, drawn as an aurora-lit 3D point cloud on a single screen. Available in English, French, Japanese, Korean and Chinese.

Heights and figures are approximate. Not for navigation.

## Run locally

```bash
node serve.js
```

Then open http://localhost:5173. Sections: `#peaks` (default), `#routes`, `#gear`.

## Files

- `index.html`, `css/style.css` — the single-screen layout
- `js/data.js` — peaks, routes and gear data
- `js/i18n.js` — translations
- `js/app.js` — the 3D stage (three.js) and interaction
- `js/gearforms.js` — the dot-relief design for each gear product line

Brand names are used as plain text only; no logos or product photos.
