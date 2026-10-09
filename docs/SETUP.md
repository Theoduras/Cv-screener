# Setup (one-off, for the owner)

The live site is **https://cv-screener-lilac.vercel.app**. It is the download page with install steps that you send to testers. Every error a tester hits becomes a **GitHub issue** in this repo, and GitHub emails you about it.

## 1. GitHub token for error reports

1. Open https://github.com/settings/personal-access-tokens/new (Fine-grained tokens → Generate new token).
2. Fill it in:
   - **Repository access:** *Only select repositories* → `Cv-screener`
   - **Permissions → Issues:** *Read and write*
   - **Expiration:** e.g. 1 year
3. Copy the token (`github_pat_…`). GitHub shows it only once.

## 2. Vercel

1. In the Vercel project, open **Settings → Git**. It must be connected to **`Theoduras/Cv-screener`**.
2. Open **Settings → Environment Variables** and add `GITHUB_TOKEN` with the token from step 1. `GITHUB_REPO` is optional; it defaults to `Theoduras/Cv-screener`.
3. Root Directory can be `./` or `site`. The root `vercel.json` makes both work.
4. Redeploy. Every push to `main` deploys automatically after that.

## 3. Point the extension at it

`extension/config.js` holds the report address. It is already set:

```js
export const REPORT_URL = 'https://cv-screener-lilac.vercel.app/api/report';
```

If the address ever changes, update this line, run `./scripts/package.sh` and push.

## 4. Check that reports arrive

```sh
curl -X POST https://cv-screener-lilac.vercel.app/api/report \
  -H 'Content-Type: application/json' \
  -d '{"message":"test report","step":"setup"}'
```

| Response | Meaning |
|---|---|
| `{"ok":true,"issue":N}` | Works. Issue *N* is now in the repo. |
| `{"ok":false,"github":401}` | The token is wrong or has expired. |
| `{"ok":false,"github":403}` or `404` | The token has no access to `Cv-screener`. Fix its Repository access. |
| `{"ok":false,"error":"not configured"}` | `GITHUB_TOKEN` isn't set in Vercel, or you haven't redeployed since adding it. |

When the same error comes in again, you get a "+1" comment on the existing issue instead of a new issue. Reports sent with **Report a problem** get the label `tester-report`. Turn on *Watch → All activity* on the repo to get every issue by email.

## Releasing a new version

1. Raise `version` in `extension/manifest.json`.
2. Run `./scripts/package.sh`, commit and push. Vercel serves the new zip.
3. Testers unzip it over the old folder and click ↻. The version is included in every error report, so you can see who is still on an old one.

## Development

```sh
npm test                    # parser, AI score and report endpoint (node, no dependencies)
node tools/e2e.mjs          # the full extension in Chromium (needs playwright)
node tools/screenshots.mjs  # regenerate docs/screenshots and site/screenshot.png
```
