# HerEme — Square poster wall design kit

Open **demo.html** directly in Chrome, Edge or Firefox. No server, internet, dependencies or setup needed. The complete preview, all photos and all SVG symbols are embedded in that one HTML file. `demo.html` works when copied elsewhere by itself.

## Contents
- `demo.html` — interactive, fully self-contained design preview with a **font switcher**, category filters, clickable up/downvotes, expanding post details, share/close/report actions, and responsive phone/desktop layout.
- `icons/*.svg` — 28 original reusable SVG icons, including the green and red square voting icons in the supplied sketch.
- `assets/*.webp` — 9 original synthetic demo photos copied from the earlier HerEme sample pack; these are already embedded in the HTML and are provided separately for reuse.
- `posts.demo.json` — demonstration post content used by the preview. The preview embeds its own copy of this data.
- `icon-manifest.json` — catalog of SVG files and usage guidance.

## Design rules
- Sharp edges: **zero border radius** across the wall/cards/buttons.
- Adjacent tiles touch, separated by black 1px borders (with adjacent boundaries visually forming 2px lines).
- Photo cards have a media aspect of `1 / 1.12`, approximately **12% taller** than text-only cards (`1 / 1`).
- Five category themes: **Question / Spørsmål**, **Opinion / Mening**, **Story / Historie**, **Alert / Varsel**, **Tip / Tips**.
- Header: category + relative post age. Body: themed poster/photo with big title. Footer: large green upvote, net score, large red downvote, and comment count.
- Report is accessible **only in expanded post details**.
- Default font is monospace. Use the top `SKRIFT` selector to compare installed fonts instantly. Local font availability varies per machine.
- The layout is masonry via CSS columns. Everything stays physically adjacent without gutters; reading order is column-major in this prototype.

## Prototype interactions
Font selector, category filters, sorting, voting, modal detail, comments and a demo create action are all front-end only. Voting/comments are held in memory and reset on refresh. Share uses native sharing when available, otherwise copies a demo link when the browser allows it. No real post submission, reporting, sign-in, or backend is connected.

All visible posts are fictional, sample imagery is synthetic and must not be treated as real news.

## Reusing icons
```html
<img src="icons/vote-up.svg" width="56" height="56" alt="Upvote">
<img src="icons/question.svg" width="20" height="20" alt="Question">
```
For monochrome icons, use their SVG paths inline when you need CSS `currentColor` inheritance. `vote-up.svg` and `vote-down.svg` include their own color backgrounds to exactly match the sketch.


## Palette update
This version uses a softer, more unified dark palette with toned-down category colors, simplified vote arrows, and category-tinted bottom-up gradients on photo posters.


## v3 tile refinement
- Compact square vote panels: **up, down, score, comments**, in that exact order.
- More distinguishable category styling on photo cards: category-hue top edge, tinted header, filled icon badge, stronger bottom-up gradient behind the title.
- Colors remain muted against the dark wall rather than neon.
