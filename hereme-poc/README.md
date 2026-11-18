# HerEme — lokal forum-PoC

En fungerende, lokal proof of concept av en Stavanger/Vestlandet-forumplattform. Én server, en SQLite-database, og to skreddersydde responsive grensesnitt: en kompakt mobilvisning og en full desktopvisning.

## Start på Windows (VS Code)

1. Pakk ut ZIP-filen, og åpne **hele mappen `hereme-poc`** i VS Code.
2. Installer [Node.js 24 LTS eller nyere](https://nodejs.org/) hvis du ikke allerede har det.
3. Dobbeltklikk **`run.cmd`** fra filutforskeren. Eller kjør `./run.cmd` i VS Code-terminal (PowerShell). Den kjører en automatisk avhengighetssjekk ved første oppstart (ingen tredjepartspakker kreves).
4. Åpne **http://localhost:3000** i nettleseren på PC-en.
5. Finn **mobiladressen** i terminalen eller se QR-koden på høyre side av desktop-grensesnittet. Eksempel: `http://192.168.1.42:3000`.
6. Koble telefonen til **samme lokale Wi-Fi/LAN** som PC-en. Åpne mobiladressen i Safari/Chrome.

**Hvis telefonen ikke får kontakt:** Tillat Node.js gjennom Windows Defender Firewall på **Private networks** når Windows spør. Sørg for at PC-nettverket er satt til *Private*. Hvis popupen allerede ble avvist, åpne Windows Security → Firewall & network protection → Allow an app through firewall. Eventuelt, fra en administrator-kommandolinje:

```cmd
netsh advfirewall firewall add rule name="HerEme Local 3000" dir=in action=allow protocol=TCP localport=3000 profile=private
```

Enkelte gjestenett og rutere har klientisolering som blokkerer enheter på samme Wi-Fi. Deaktiver dette på ditt eget nettverk ved behov. Ikke åpne port 3000 i ruteren mot internett.

## Start på macOS/Linux

```sh
./run.sh
```

For manuelt utviklingsoppsett:

```sh
npm ci
npm start
# alternativt: npm run dev (restart ved serverendringer)
```

## Dette fungerer

- Persistente **rom/subforum**, innlegg, kommentarer, stemmer og rapportering i SQLite.
- Mobiltilpasset forum med bunnnavigasjon og rask opprettelse av innlegg.
- Desktopvisning med sidepaneler, søk, sortering og QR-kode for mobil.
- Tekstinnlegg, deling av http(s)-lenker, vanlige bildeinnlegg.
- **Plakatgenerator:** velg eller ta bilde på mobil, skriv stor tekst oppå, velg stil/plassering, og publiser det sammensatte bildet.
- Upvotes/downvotes: synlig nettoscore, én stemme per lokal demokonto (trykk igjen for å angre).
- Trådede kommentarer, med svar på svar (maks 4 nivåer).
- Lokale demoprofiler (kallenavn) på hver nettleser.
- Rapporter innlegg; ved **3 rapporter fra forskjellige demokontoer** settes innlegget på vent til manuell vurdering.
- Moderatorkø (demo-PIN `2468`, kan overstyres med miljøvariabelen `HEREME_ADMIN_PIN`).
- Eksempelinnhold fylles på automatisk **kun første gang** databasen opprettes.

## Dette er *ikke* produksjonsklart

- **Ingen BankID**, ekte innlogging eller verifisering. Demoprofiler er kun en lokal browser-token, uten HTTPS; pålitelig identitetskontroll mangler.
- **Ingen AI-bildemoderasjon eller faktisk lenkeskanning**. Rapportering + enkel automatisk ventestatus er implementert; alle opplastinger bør modereres skikkelig før en offentlig lansering.
- Demo-PIN er usikker og er kun egnet for lokal test. Moderatorkø er ikke et produksjons-autoriseringoppsett.
- Ingen automatisk EXIF-fjerning. Opplastede bilder kan inneholde GPS-/kamera-metadata. En offentlig tjeneste må strippe metadata og re-enkode alle bilder, kontrollere innhold og begrense belastning.
- Bilder i demoen valideres kun med enkle signaturer, ikke en fullstendig dekoder/sikker mediepipeline.
- Ingen databasebackup, HTTPS, e-post, rate limiting, anti-spam, skalerbar hosting eller DSA/GDPR-compliance.
- Innholdet er synlig for alle på ditt lokale nettverk så lenge serveren kjører. Bruk **kun testdata**.

## Struktur

```
hereme-poc/
├── run.cmd                 Start på Windows
├── run.sh                  Start på macOS/Linux
├── package.json
├── package-lock.json
├── server/
│   ├── index.js            HTTP API + LAN/QR
│   ├── mini-web.js         Innebygd HTTP router (ingen dependencies)
│   ├── mini-upload.js      Avgrenset filopplasting
│   ├── qr.js               Innebygd QR-kodegenerator
│   └── db.js               SQLite-skjema og demodata
├── public/
│   ├── index.html          Semantisk app-skall
│   ├── styles.css          Mobil- og desktop-design
│   ├── app.js              Forumklient + bilde/plakat-editor
│   └── assets/             Lokale illustrasjonsbilder
├── tests/
│   └── api.test.js         API-røykprøver
└── data/
    ├── hereme.sqlite       Genereres automatisk
    └── uploads/            Lokalt opplastede bilder
```

## Nullstill demo

Stopp serveren med `Ctrl+C`. Slett `data/hereme.sqlite` og eventuelle `data/hereme.sqlite-wal` / `data/hereme.sqlite-shm`-filer. Slett eventuelle bilder i `data/uploads/`. Start `run.cmd` på nytt. Husk også å bruke «Bytt profil» i nettleseren hvis den gamle demokontoen var lagret.

## Konfigurasjon

- `PORT` — HTTP-port, standard `3000`
- `HEREME_ADMIN_PIN` — lokal mod-kode, standard `2468` (kun test)

Eksempel PowerShell:

```powershell
$env:PORT = '3005'
$env:HEREME_ADMIN_PIN = 'bytt-denne-koden'
.\run.cmd
```

## Neste steg for en reell tjeneste

HTTPS/reverse proxy; BankID/OIDC-integrasjon; ekte kontoadministrasjon; pålitelige filbehandling og moderasjonskøer; abuse/rate-limiting; publiseringsregler; personvernvilkår; backup; database-migrasjoner; og automatiserte tester.
