# HerEme — én lokal plakatvegg

En lokal møteplass for Stavanger, Sandnes og Rogaland. Mobil og desktop åpner
direkte på den samme veggen: kategori, plakatflate og store stemmeknapper.
Fem faste uttrykk gir plass til **Spørsmål, Mening, Historie, Varsel og Tips**.
Rom er borte fra navigasjon og publisering.

## Start

Node.js **24 eller nyere** kreves. Kjør **`run.cmd`** på Windows fra denne mappen,
eller `npm start`. På macOS/Linux kan `./run.sh` brukes.

`run.cmd` sjekker låste avhengigheter og installerer ved endret package/lock-fil
eller manglende moduler.

- Hovedcheckout: `data/`, første port **3000**.
- Git-worktree: `data/preview/`, første port **3001**. En eksisterende snapshot
  kreves; se [migrering](docs/migration.md).
- Hvis porten er opptatt, prøves neste, maksimalt 20 porter. Bruk adressen
  terminalen skriver ut. API, mobiladresse og QR bruker faktisk åpnet port.
- `run-preview.cmd` velger samme preview-oppsett.
- `PORT` velger første port og `HEREME_DATA_DIR` datamappen. Offentlig
  moderering har ingen PIN eller nettleserendepunkt; operatøren bruker privat CLI.

Telefonen må være på samme Wi-Fi/LAN. Mobiladresse og QR ligger i
**Meny → Åpne på mobilen**. Tillat Node i Windows-brannmuren for private nettverk
ved behov. Ikke åpne denne lokale demoen mot internett.

## Bruk veggen

Alle fem kategorier er valgt fra start. Kryss av eller fjern kategorier; flere
kan være aktive samtidig. Ingen valgte kategorier gir en tydelig tom visning.
Innlegg vises med nyeste først. Desktop starter i **Enkel**: synlige kategori-
knapper med ikoner over veggen og litt luft mellom flisene. **Avansert** viser
navigasjon og faktiske samtaler/svar i sidepaneler. Begge deler samme utvalg.
Velg **Lys modus / Mørk modus**; visning og fargevalg huskes i nettleseren.
Mobil beholder en kompakt header, sammenhengende fliser og sammenleggbare filtre.

Hver flis har kategori/tid, plakatflate og en felles handlingsrad med grønn
oppstemme, rød nedstemme, nettoscore og kommentarantall. Stemmeknappene er minst
44 × 44 piksler. Tekstinnlegg og lenker får en fullverdig temaplakat uten bilde.

Åpne flisen for hele innlegget, forfatter, tekst, lenke og trådede svar.
På mobil fyller detaljvisningen skjermen, med **Lukk**, **Del** og **Rapporter**
øverst. Rapportering finnes bare inne i innlegget. Animasjon respekterer
redusert bevegelse. Moderatorkø, roller og anonymisering finnes bare som private
operatørkommandoer.

## Legg ut

1. Trykk **Legg ut** og velg et unikt pseudonym hvis nødvendig. Ta vare på
   gjenopprettingsnøkkelen som bare vises én gang. Velg **Lagre med enheten** for
   å la nettleseren eller mobilens passordbehandler tilby å lagre innloggingen.
2. Velg kategori og skriv overskrift.
3. Ta/velg et bilde hvis du ønsker; uten bilde brukes kategoriens bakgrunn.
4. Legg eventuelt til tekst og lenke. Se den samme plakatflaten i forhåndsvisningen.
5. Publiser direkte på fellesveggen — intet romvalg.

Desktop har i tillegg **Tilpass bildeutsnitt** med zoom og vannrett/loddrett
plassering, samt automatisk/topp/midt/bunn for tekst. Cascadia Code er fast og
leveres lokalt; farger og form følger en av de fem kategoriene.
Originalfoto lagres uendret og immutabelt; serveren validerer dekoding, retter
orientering og lager egne JPEG-varianter for visning og miniatyr. Kategori og
utsnitt lagres i SQLite. Vegg, forhåndsvisning og detalj bruker samme komponent.

Ekte ferdige plakatbilder vises uten et nytt tekstoverlegg. Syntetiske eksempler
med kildebilder bruker den nye v3-malen og lenker til den urørte originalplakaten.
Eksemplene med
kildebilder tilbyr **Lag din egen variant** i detaljvisningen. Det lager et nytt
innlegg og beholder demomerkingen.

## Innhold og bevaring

Det medfølgende settet har 13 syntetiske eksempler: seks plakater, tre bilder,
tre tekstinnlegg og én lenke til UT.no. Kontoer, historier, poeng og kommentarer
er demo; de merkes i vegg og detalj. Se [innholdsmatrisen](docs/content-matrix.md).

En ny database får settet én gang. En eksisterende database får aldri automatisk
flere eksempler, heller ikke hvis den er tom. Eksplisitt, idempotent import:

```powershell
npm run seed:demo
```

Alle gamle ID-er, romtilknytninger, tidspunkt, medier, stemmer, kommentarer,
rapporter og modereringsstatus bevares. Versjon 4 gjør kun romtilknytning valgfri
og legger til `post_design` for kategorier og utsnitt. Nye innlegg har
`room_id = NULL`. Gamle romdata bevares, men rom-API-et er eksplisitt avviklet.
Migrasjon 6–10 legger til sikre sesjoner og recovery, revisjonsspor,
medielivssyklus, FTS-søk, områdegrenser og fremtidig verifikasjonsstatus uten å
endre eksisterende innlegg.

Kategori kommer fra en eksplisitt mapping for seed-settet, ellers fra gammelt
rom/type og en dokumentert standardkategori Historie. Se
[design og migreringsbeslutning](docs/adr/0004-category-poster-wall.md).
Nye innlegg starter med forfatterens ene oppstemme; historiske poeng endres ikke.

[migreringsveiledningen](docs/migration.md) beskriver online backup, sammenslåing
av ekte innlegg fra begge instanser og siste overføring før bytte.
Dette er en eksplisitt operatørhandling, ikke kontinuerlig synkronisering.

## Tester og dokumentasjon

```powershell
npm run check
npm test
npm run test:browser
```

Ved første installasjon av browsertestene:

```powershell
npm ci
npx playwright install chromium
```

Testene bruker midlertidige databaser. Playwright åpner en egen headless browser,
aldri brukerens eksisterende nettleser. De dekker migrering, begge skriveinstanser,
konflikter, metadata, API, fem temaer, kategoriutvalg, publisering med/uten bilde,
44-pikslers knapper, mobil fullskjerm, deling, rapportering, kommentarer og omstart.
Se [releaseimplementasjonen](docs/issue-implementation.md),
[operatørhåndboken](docs/operator-runbook.md) og
[go/no-go-listen](docs/release-checklist.md). Video, områder og verifikasjon er
funksjonsflagg; offentlig v1 starter med dem avslått.

- [Design, komponenter og visuelle eksempler](docs/wall-v3.md)
- [Valideringsrapport](docs/validation.md)
- [Arkitekturbeslutninger](docs/adr/)

`public/themes.js` er den faste temakatalogen, `poster.js` plakatflaten,
`feed.js` flisene/filtrene, `compose.js` publisering og `detail.js`
innlegg/svar. `app.js` sender handlinger til samme API. `server/post-design.js`
validerer og mapper kategorier; SQLite eier tilstand, ID-er, stemmer og moderering.
