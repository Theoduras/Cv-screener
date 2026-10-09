# Setup (eenmalig, voor de eigenaar)

Na deze stappen heb je een downloadpagina met installatie-instructies om naar testers te sturen. Elke fout bij een tester wordt automatisch een **GitHub-issue** in deze repo, en GitHub stuurt je daar een mail en een app-melding over.

## 1. GitHub-token voor foutmeldingen

1. Ga naar GitHub → *Settings* → *Developer settings* → *Personal access tokens* → **Fine-grained tokens** → *Generate new token*.
2. Vul het token zo in:
   - **Repository access:** *Only select repositories* → `cv-screener`
   - **Permissions → Issues:** *Read and write*
   - **Expiration:** bijvoorbeeld 1 jaar
3. Kopieer het token (`github_pat_…`).

## 2. Vercel (downloadpagina + meldpunt)

1. Ga naar [vercel.com](https://vercel.com) → *Add New* → *Project* → importeer `cv-screener` uit GitHub.
2. Zet **Root Directory** op `site`. Framework preset is *Other*, en build command en output dir laat je leeg.
3. Voeg onder *Environment Variables* toe:
   - `GITHUB_TOKEN` = het token uit stap 1
   - `GITHUB_REPO` = `theoduras/cv-screener`
4. Klik op **Deploy**. Je krijgt een adres als `https://cv-screener-xxxx.vercel.app`.

## 3. Extensie naar jouw meldpunt laten wijzen

1. Zet je Vercel-adres in `extension/config.js`:
   ```js
   export const REPORT_URL = 'https://cv-screener-xxxx.vercel.app/api/report';
   ```
2. Maak de download opnieuw en push:
   ```sh
   ./scripts/package.sh        # -> site/cv-screener.zip
   git commit -am "Point reports at Vercel" && git push
   ```
   Vercel deployt automatisch opnieuw.

## 4. Testen of meldingen aankomen

```sh
curl -X POST https://cv-screener-xxxx.vercel.app/api/report \
  -H 'Content-Type: application/json' \
  -d '{"message":"testmelding","step":"setup"}'
```
Binnen een paar seconden staat er een issue `[auto] testmelding […]` in de repo. Komt dezelfde fout opnieuw binnen, dan krijg je een "+1"-reactie op hetzelfde issue in plaats van een nieuw issue. Een handmatige melding via **Meld probleem** krijgt het label `tester-report`.

Zorg dat je GitHub-meldingen aan staan (*Watch* → *All activity* op de repo), dan krijg je elk issue ook per mail.

## 5. Testers uitnodigen

Stuur testers het Vercel-adres. Daar staan de download en de installatiestappen uit `docs/INSTALL.md`.

## Nieuwe versie uitbrengen

1. Verhoog `version` in `extension/manifest.json`.
2. Draai `./scripts/package.sh`, commit en push.
3. Laat testers de nieuwe zip uitpakken over de oude map en op ↻ klikken. Die versie staat ook in elke foutmelding, zodat je ziet wie nog een oude versie draait.

## Ontwikkelen

```sh
npm test                 # parser, AI-score en meldpunt (node, geen dependencies)
npm i -D playwright && node tools/e2e.mjs   # volledige extensie in Chromium
```
