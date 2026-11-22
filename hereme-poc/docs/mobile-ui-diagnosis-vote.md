# Mobile vote/media diagnosis

The supplied captures show the same wall region with populated image/video faces and, one minute earlier, several category-only faces. They support the reported transient symptom but cannot establish whether the assets failed or the DOM was rebuilt.

Reproduced in the Playwright mobile wall flow at 390 × 844. Before the fix, a successful vote replaced `#feed.innerHTML` through `renderWall()`. The observed post-card node and its `.poster-photo` descendant became disconnected and were replaced even though the media URL did not change. No vote-path media request or image error was responsible: the replacement came directly after the vote response, when `renderWall()` assigned the full generated card collection to `#feed.innerHTML`. This resets browser-owned image/video state and makes scroll anchoring dependent on a full feed relayout. While the request was pending, the `state.voting` set also discarded subsequent taps for the same post.

The vote response changes only `score` and `my_vote`. The fix updates the existing vote buttons and score node in place, leaving card identity, media identity, post order, and scroll position intact. Per-post vote operations now queue rapid taps, optimistically project the queue, serialize requests in tap order, and roll back to the last server-confirmed state if a request fails.
