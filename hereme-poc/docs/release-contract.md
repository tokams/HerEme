# Release behavior contract

This checklist freezes the poster-wall behavior that release work must preserve.

| Area | Required behavior |
| --- | --- |
| Stream | One shared published wall; rooms remain historical and absent from navigation/composition. API and UI default to newest. |
| Categories | Exactly question, opinion, story, alert and tip; category is also the fixed poster design key. Empty and multi-category filters remain valid. |
| Content | Text, link, image and baked poster records remain readable. Photo crop/zoom and auto/top/center/bottom title placement survive. |
| Votes | One current vote per user; repeat removes it; opposite replaces it; score includes historical base score; creation adds author upvote atomically. |
| Discussion | Four levels including root; parent must belong to the same post. |
| Moderation | Report only in detail; one unresolved report per person/post; three distinct reporters move published content to review. |
| Mobile | Compact header, collapsed filters, touching one/two-column gallery, no sidebars, full-screen detail. |
| Desktop | Simple remains default with five visible icon filters and 10px gaps. Advanced retains left navigation, central wall and real filtered activity. |
| Visual | Cascadia Code; five muted category accents; square cards; photo face near 1:1.12; UP/DOWN/SCORE/COMMENTS; targets at least 44px. |
| Preferences | Light/dark and Simple/Advanced persist. Closing detail restores wall position and filter selection. Reduced motion and keyboard focus work. |
| Identity | Reading is anonymous. First write creates a pseudonym. Existing valid token holders can claim only their own identity. |
| URLs/data | Existing `/?post=<id>`, IDs including negatives, authors, timestamps, scores, comments, reports, media URLs, seed markers and legacy room links remain. |

Intentional release changes are secure recoverable sessions, bounded SQL feed
queries, server-owned media processing, private moderation operations, abuse
limits, public policies, readiness/backups and reproducible Linux deployment.

Known baseline discrepancy resolved here: the UI used newest while an omitted API
sort used hot. The release contract defines newest as the default everywhere.
