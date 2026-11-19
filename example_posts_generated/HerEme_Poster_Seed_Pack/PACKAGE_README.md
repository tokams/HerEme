# HerEme — local poster-wall demo content

**Synthetic demo dataset, not real local news.** All accounts, stories, votes, and comments are fictional examples. Photographs are generated/derived from generated imagery; the incidents suggested by some posts are not reports of actual events.

## Included

- `example_posts.json` — 13 locally written example posts, their rooms, votes, comments, timestamps and image paths, plus editable poster overlay settings.
- `public/assets/demo/posts/` — **6 finished poster JPGs**, with the exact example headline drawn into the photo, and **3 unedited photo-post JPGs**.
- `public/assets/demo/sources/` — **9 image sources**, including the six photos used for the posters before text was added. This can seed the future editor's "reopen poster" flow.
- `content_matrix.csv` — post types, rooms, asset paths and overlay phrases.
- `preview.jpg` — contact sheet of all nine post-facing images.
- `tools/import-hereme-demo.cjs` — optional opt-in, idempotent importer for the original PoC's built-in SQLite database.

## Try it in the existing VS Code PoC

1. Back up `data/hereme.sqlite` and `data/uploads/` if you already have content you care about.
2. Unzip this pack **into the existing `hereme-poc` project root**. The archive paths are already laid out correctly.
3. From the repository root, run:

   ```powershell
   node tools/import-hereme-demo.cjs
   ```

4. Start the PoC using `run.cmd`. Open `http://localhost:3000`, or the LAN QR URL from your phone on the same Wi-Fi.

The importer needs **Node.js 24+**, matching the PoC requirement. It only adds demo content to the existing SQLite DB. It doesn't alter or delete current posts, images, rooms, comments, reports, votes, or IDs. The seed tracking table `hereme_demo_imports` prevents duplicate imports if you rerun the command.

**Important:** the current frontend is still Reddit-like. The `ui_hint` and `poster` fields in JSON describe the *future* editorial/poster UI; the original PoC SQL schema doesn't yet store this metadata. The existing backend displays the finished JPEGs and imports posts/comments, while the extra source/editing data stays in JSON for the redesign.

## JSON structure

```json
{
  "schema_version": "1.0",
  "dataset_id": "hereme-poster-demo-nov-2026",
  "synthetic_demo": true,
  "rooms": ["room objects"],
  "posts": [
    {
      "seed_key": "hereme-2026-p01",
      "type": "poster",
      "room_slug": "stavanger",
      "demo_author": "regnjakka",
      "title": "Så va det regn igjen",
      "body": "Andre som blei klissvåte på vei hjem? 😅",
      "image_url": "/assets/demo/posts/poster-01-rain_bus_stop.jpg",
      "base_score": 38,
      "poster": {
        "source_image_url": "/assets/demo/sources/source-01-rain_bus_stop.jpg",
        "overlay_text": "SÅ VA DET\nREGN IGJEN",
        "style": "gradient-bottom"
      },
      "comments": []
    }
  ]
}
```

Post `type` values match the existing application: `poster`, `image`, `text`, `link`. Empty media is `null`. `base_score` is synthetic demo engagement, not actual user votes. All dates are ISO 8601 UTC in the JSON and converted to the existing SQLite timestamp format on import. Link posts use a real public landing URL, not an invented local news article.

## Format counts

- **6 poster posts**: photo + explicit user-written headline + separate caption.
- **3 photo posts**: no user text overlay.
- **3 text posts**: conversations without forced imagery.
- **1 link post**: links to UT.no, rather than inventing a news story.

The imagery deliberately varies in polish. Some secondary images originated as smaller regions of AI-generated composite artwork and will look softer at full screen; they are suitable for layout/testing and can be replaced with higher-quality standalone photos later. Original/synthetic images were exported without EXIF metadata. No font file is distributed.

## Project fit

This pack supplies **Phase 0** of the feature request in `issue.md`: generate natural local content before building the redesign, allow both the original photo and rendered poster to be viewed, and preserve current SQLite content when importing examples. It is **not** itself the new frontend or a full migration.
