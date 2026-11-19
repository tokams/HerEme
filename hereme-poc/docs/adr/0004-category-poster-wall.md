# ADR 0004: One category-based poster wall

Status: accepted, 2026-11-18. Implements the requested second poster-wall issue.
UI density and text placement are extended by [ADR 0005](0005-square-wall-views.md).
Supersedes ADR 0003's newspaper layout, room navigation and free poster controls.
Its seed provenance, identity allocation and data-preservation decisions remain.

## Canonical model

Five fixed categories also identify five fixed styles: question, opinion, story,
alert and tip. The API validates category/style equality; arbitrary style names
and out-of-range crops are rejected. The shared theme catalog is public/themes.js.
GET /api/categories exposes it to future clients.

Migration 4 adds post_design(post_id, category, image_zoom, image_x, image_y).
The public post projection includes category, poster_style (equal to category)
and crop values. Post creation writes content, design and initial vote in one
transaction. Multipart and JSON requests dispatch the same action.

New posts have no room. Migration 4 rebuilds posts solely to make room_id nullable,
preserving column order, every row, foreign keys and AUTOINCREMENT's high-water
mark, including deleted IDs. Foreign keys are disabled only during the bounded
SQLite rebuild and checked before commit, then restored. A failure rolls back.
All old room associations and membership data remain intact for preservation.
Legacy room endpoints remain available; the new UI never calls them.

## Category migration

Existing supplied examples use seed/categories.json, keyed by their recorded
import key. Other old content maps deterministically: sporsmal → question,
ryktetorget → opinion, hva-skjer or link type → tip, everything else → story.
This is a default mapping, not an inference about the truth or urgency of content.
It never fabricates an alert. The supplied found-property example is explicitly
mapped to alert. User-selected categories are never overwritten by a later merge.

The merge still compares the six unchanged legacy row shapes. It migrates the
target after its backup, then adds category records for newly imported posts in
the merge transaction. Local roomless posts, crops and category choices survive.
The original instance is never changed. New source writes still require a merge.

## Presentation

Every item has a category/time header, square poster face and vote/comment strip.
One PosterSurface implementation serves wall, composer and detail. New uploads
retain their photo; title, fixed theme and bounded crop are rendered from canonical
metadata. Existing baked poster images keep their original text and media bytes;
they receive the category header/actions but no duplicate title overlay.

No-image content is an intentional themed poster. Five theme definitions govern
typography, motifs and accents; desktop adds only bounded photo crop controls.
Mobile detail is full-screen; desktop uses the same detail component in a wider
modal. Report, share, author, body and comments live in detail. Reduced-motion,
focus containment, background inertness and return focus are part of the UI.

The homepage has no editorial lead, discussion sidebar, room directory, search
or alternate feed tabs. Multi-select categories filter a single newest-first wall.
An explicit empty selection shows no posts. No new runtime dependency or service.
