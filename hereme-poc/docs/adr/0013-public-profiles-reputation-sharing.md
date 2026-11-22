# ADR 0013: Public identity, reputation and post sharing

## Decision

Public author references use the stable opaque user ID. Published post and comment projections include `author_public_id` only for active linked accounts. Synthetic and inactive authors remain plain bylines. `/u/:id` renders a public profile from `/api/users/:id/public`, which returns only the public ID, username, avatar URL, join date and three reputation values. The private `/me` projection remains separate.

Schema 21 adds one current vote per user and comment. A member may vote on another user's comment under a published post. Repeating a vote removes it and choosing the opposite direction swaps it. The public reputation query sums current votes on published, nonsynthetic posts and comments, excludes author self-votes and historical base scores, and can be negative. It reads canonical rows on each request, so moderation and vote changes take effect without a copied counter. Comment vote controls update their own DOM nodes in place.

Post links remain `/?post=<id>`. The HTTP response inserts post-specific escaped Open Graph and Twitter tags into the same application shell before JavaScript runs. Canonical share URLs use the trusted fixed `https://hereme.no` origin. A cached 1200×630 JPEG uses local validated image media or a category-themed text graphic. The cache key hashes relevant post fields; the image route checks current published state and revision on every request. Hiding or deleting a post revokes access to the old image. Generation runs after post creation, relevant staff changes, video processing, and startup backfill. A first request for an uncached published post waits for its one-time render; rendering failures are logged with a five-minute retry delay and the metadata uses a generic safe image. The derivative cache is not backed up and is regenerated after restore.

## Consequences

No chat request is created by a profile or Start Chat click. `/chat?user=<id>` resolves the existing direct chat or a local draft after authentication; first Send still creates the pending request. Public profiles are intentionally small and do not expose authored content, roles, chat membership or credentials. Private chat files are never preview sources.
