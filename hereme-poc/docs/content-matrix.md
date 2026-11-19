# HerEme supplied demo content

The user-supplied HerEme Poster Seed Pack is the authoritative example set. All
13 accounts/stories/scores/comments are fictional; images are synthetic. Each
imported item is labeled **Syntetisk demo** in both feed and detail. The six finished
poster JPGs retain their authored text; no additional overlay is applied to them.

| Format | Category | Original room (retained) | Title | Original on-image text | Ratio |
|---|---|---|---|---|
| poster | Historie | Stavanger | Så va det regn igjen | SÅ VA DET / REGN IGJEN | 1:1 |
| poster | Spørsmål | Ka skjer? | Ka skjer i helgå? | KA SKJER / I HELGÅ? | 1:1 |
| poster | Spørsmål | Sandnes | Kor e folkå? | KOR E / FOLKÅ? | 1:1 |
| poster | Historie | Fotoprat | Detta lyset, då | DETTA / LYSET, DÅ | 1:1 |
| poster | Varsel | Spørsmål & hjelp | Någen som savne denne? | NÅGEN SOM / SAVNE DEN? | 1:1 |
| poster | Tips | Rogaland | Verdt å gå ut for | VERDT Å / GÅ UT FOR | 1:1 |
| image | Historie | Stavanger | Litt farge i gråværet | — | 1:1 |
| image | Historie | Fotoprat | Han nekta å gå videre | — | 1:1 |
| image | Tips | Sandnes | Kaffe eller is? | — | 1:1 |
| text | Spørsmål | Spørsmål & hjelp | Nylig flytta hit. Kor møte en folk utenom jobb? | — | — |
| text | Mening | Ryktetorget | Kva e det villaste vær-ryktet du har hørt? | — | — |
| text | Mening | Rogaland | Ka e den mest undervurderte plassen på Jæren? | — | — |
| link | Tips | Ka skjer? | Fant en oversikt med turforslag | — | — |

There are six posters, three ordinary images, three text discussions and one link
post attributed to UT.no. The JSON is in `seed/example_posts.json`, the original
matrix is [content_matrix.csv](content_matrix.csv), and the contact sheet is
[seed-preview.jpg](seed-preview.jpg). JPEGs are 960 × 960, 105–295 KiB each, and
contain no EXIF metadata. Some source images are intentionally soft, as described
in the supplied [pack notes](seed-pack.md).

Fresh databases receive this set once. Existing databases require `npm run seed:demo`;
`hereme_demo_imports` tracks each seed key. Import validates all assets before any
write and commits as one transaction. It preserves existing rooms with matching
slugs, existing posts, IDs, media, timestamps, votes, comments and moderation state.
Generated source photos are retained under `public/assets/demo/sources` so the
poster editor can create a new variant without altering the original poster.

The second iteration uses `seed/categories.json` for the category mapping above.
Original rooms remain as preserved historical data, not navigation. Text, link
and ordinary image tiles now render the title through the selected fixed theme;
finished poster JPGs retain their baked text. All five categories are represented.
