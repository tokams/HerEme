# Square wall v3

Implements the supplied `HerEme_Square_Wall_Design_Kit_v3` source styles and icons,
with the user's fixed Cascadia Code typography and subsequent desktop choices.
Supersedes [the v2 design](wall-v2.md). The kit's HTML/CSS and final README
refinement define the muted palette; its older neon preview images are not the
implemented palette. No demo font switcher or frontend mock data is imported.

## Browsing

Desktop defaults to **Enkel (Simple)**: one wall, a permanently visible row of
five category icon buttons with labels, and 10px horizontal/vertical tile gaps.
Buttons toggle categories independently and expose selected states to assistive
technology. All five begin selected; selecting none gives an explicit empty wall.
**Avansert (Advanced)** uses left navigation/category filters, the central wall,
and real discussions/recent comments on the right. Category selection, search,
sorting, post actions and canonical data are shared across both modes.

The desktop light/dark control affects the complete shell, filters, tile chrome,
forms and dialogs. Poster artwork keeps its category palette and white headlines.
Dark is the initial theme. Layout and color choices persist in localStorage;
these are display preferences, not server-owned post state. Preferences load
before the stylesheet to avoid a flash of the other layout/theme.

At widths below 1280px the Advanced right panel disappears. Below 900px desktop
mode controls disappear and categories collapse behind the filter control.
Below 700px the wall has two columns, no side panels/search/toolbar, a compact
header and full-screen detail. Below 359px it uses one column. Mobile has touching
tiles regardless of the saved desktop layout. Desktop detail stays a wide focused
overlay with poster and discussion side by side.

## Shared poster system

- Five presets: blue question, purple opinion, ochre story, red alert, green tip.
- Square corners, black borders, tinted category strip, a filled category badge,
  category-colored photo gradient and a short accent bar above uppercase titles.
- CSS column masonry: three central columns, four on very wide Advanced screens.
  Photo faces have height/width 1.12; image-free faces are square.
- Action order is upvote, downvote, score, comments. Supplied green/red square
  vote SVGs have at least 44px targets. Reporting is inside detail only.
- Composition offers category, title, optional photo/body/link. Desktop adds
  bounded crop and auto/top/center/bottom text placement in the same template.
- One `poster.js` component renders tile, composer preview and detail.
  `themes.js` is the canonical palette; `feed.js` renders filters and actions;
  `shell.js` renders activity; `preferences.js` applies display settings;
  `app.js` dispatches API actions. No room navigation returns.

The original 13 supplied seed examples remain idempotently imported. Synthetic
posters with a source photo use that source in the new template while detail links
to the untouched original poster. User-created baked posters remain intact.
Existing posts, votes, nested comments, reports and uploads are retained.

`GET /api/activity` uses the same category/search projection as the wall. Its
discussion lists, recent comments and totals come from published database rows;
moderated posts are excluded. Demo content stays labeled. No fake live counters.

## Font and asset provenance

The user-supplied kit's SVG files are under `public/assets/wall-v3/icons`; their
inline rendering map is `public/icons.js`. Existing supplied seed photographs
remain under `public/assets/demo`. No new image generation is required.

Cascadia Code is bundled locally, without modification, under
`public/assets/fonts/CascadiaCode.ttf`. The accompanying SIL Open Font License
is retained as `CascadiaCode-LICENSE.txt`, from
[Microsoft's Cascadia Code license](https://github.com/microsoft/cascadia-code/blob/main/LICENSE).
No network font service or font selection UI is used.

## Reviewed screen references

- [Simple, dark](screenshots/wall-v3/desktop-simple-dark.png)
- [Simple, light](screenshots/wall-v3/desktop-simple-light.png)
- [Advanced, dark](screenshots/wall-v3/desktop-wall.png)
- [Advanced, light](screenshots/wall-v3/desktop-advanced-light.png)
- [Mobile wall](screenshots/wall-v3/mobile-wall.png)
- [Mobile detail](screenshots/wall-v3/mobile-detail.png)
- [Desktop detail](screenshots/wall-v3/desktop-detail.png)
- [Desktop composition](screenshots/wall-v3/desktop-create-photo.png)

See [validation](validation.md), [schema decision](adr/0005-square-wall-views.md)
and [migration/cutover instructions](migration.md).
