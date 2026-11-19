# ADR 0005: Shared v3 posters, optional desktop context and display preferences

Status: accepted, 2026-11-18, following the updated poster-wall issue, supplied
v3 kit, and explicit requests for fixed Cascadia Code, default Simple view with
visible category icon buttons, Advanced view and desktop light/dark modes.

Retain ADR 0004's canonical post/category/crop model and two-origin merge contract.
Replace its single-density shell with shared tiles inside two desktop layouts.
Simple defaults to a spaced wall with top category buttons. Advanced shows the
forum navigation and activity panels. Mobile remains compact and tile-dominant.
Both shells dispatch the same actions and render the same post projection.

Layout/theme are browser display preferences, persisted before paint. Category
selection is shared application state, independent of layout. The database is
authoritative for content, category, crop, votes, comments and moderation.
The activity endpoint derives discussion summaries from the same published,
filtered posts as the wall; it does not invent popularity or online counts.

Migration 5 adds `post_design.text_position`, constrained to auto/top/center/bottom
with default auto. Existing design rows retain their categories and crop values.
New API writes validate placement and persist it atomically with the post/design.
The migration adds no replacement posts and changes no legacy content columns.
Snapshots/merges retain independently created preview posts and source posts.

The supplied kit's final source palette and SVGs are adopted, but its demo font
controls and mock frontend state are excluded. Cascadia Code is served locally
with its OFL notice. Synthetic source photos may be re-rendered while the original
baked poster remains accessible; real baked posters are never rewritten.

Validation covers migration preservation, common filtering/activity, placement,
mode persistence, light/dark screens and real API interactions through isolated
Chromium. Physical camera and another-device network access remain manual checks.
