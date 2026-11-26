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
- `data/terrain.bin`, `data/terrain.json` — real elevation grids for every peak, built by `tools/build_terrain.py`
- `data/tracks.json` — each route's track from OpenStreetMap, fetched by `tools/fetch_routes.py`
- `data/routes.bin`, `data/routes.json` — the real landscape around each route, with its track, built by `tools/build_terrain.py`

## Terrain data

Terrain comes from the [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) open dataset (Mapzen Terrarium format), which combines SRTM, USGS 3DEP, GMTED2010, ETOPO1 and other public elevation sources. Rebuild it with:

Route tracks come from [OpenStreetMap](https://www.openstreetmap.org/copyright) hiking-route relations (© OpenStreetMap contributors, ODbL), read through the [Waymarked Trails](https://hiking.waymarkedtrails.org) API. A few routes with no relation in OSM are traced along mapped paths between waypoints (Overpass API), so they are approximate.

Rebuild both (tracks first, then terrain for peaks and routes):

```bash
python3 tools/fetch_routes.py /tmp/osm-cache
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/build_terrain.py -- /tmp/terrain-tiles
```

Brand names are used as plain text only; no logos or product photos.
