# ADR 0003: Content-driven editorial views over the existing forum

Status: accepted, 2026-11-18, following the issue and the user's supplied seed pack.

Presentation and room-navigation decisions superseded by [ADR 0004](0004-category-poster-wall.md).
This document records the first iteration; content provenance and preservation remain.

Retain the Node/SQLite API and all four existing post types. Render a mobile wall
and desktop newspaper from the same API projection. UI modules choose typography,
layout and image treatment; they do not own scores, membership, moderation or IDs.
Poster media already containing text is never overlaid again. Detail views show
uncropped media. Sorting/search include older records without silent truncation.

Use the supplied 13-post seed pack and 18 local assets (nine finals and nine
sources). Preserve supplied text, timestamps, synthetic scores and comments.
Fresh installations seed once; existing DBs require an explicit atomic import.
Validate assets before writes and track seed keys for idempotency. Existing rooms
with matching slugs are reused without overwriting their identity or description.

Additive migration 2 creates post_presentation, hereme_demo_imports and
room_memberships. Legacy posts need no metadata. Source-photo/overlay settings
are optional; examples can be used for a new variant without changing originals.
Room joins are typed authenticated API actions, projected alongside room counts.

The editor produces JPEGs using one canvas renderer with bounded zoom/pan, aspect
choices, fitted headline, font/placement/alignment presets and a contrast scrim.
The resulting file uses the existing post-upload endpoint. No separate mobile
data model, external service or runtime credential is introduced.

Migration 3 reserves negative preview IDs atomically in local_sequences so
simultaneous processes cannot select the same ID. Existing positive and negative
IDs are unchanged. Post creation and its initial vote commit together. New posts
start at net +1; existing base_score values are preserved.
