# CV Screener

Chrome extension for screening large volumes of CVs on top of any ATS (Oleeo and others).

- **Parses** PDF, DOCX and TXT into name, contact details, location, languages, skills, years of experience and education level.
- **Flags likely AI-written CVs** with a 0–100 score and the reasons behind it. The score is an indicator, not proof.
- **Filters and sorts** on every one of those fields, and exports the filtered list to CSV.
- **Captures** a candidate straight from the open ATS page, using the recruiter's own session.
- **Runs locally.** CVs never leave the browser, and there is no API key or cost. Only anonymous error reports are sent; they become GitHub issues in this repo.

| For | Read |
|---|---|
| Testers | [docs/INSTALL.md](docs/INSTALL.md) (also served as the Vercel page) |
| Owner: hosting and error reports | [docs/SETUP.md](docs/SETUP.md) |

```
extension/          the Chrome extension (MV3, no build step)
  lib/parse.js      text -> candidate fields
  lib/aiscore.js    AI-likelihood heuristics
  lib/dict.js       skills, cities, languages, AI phrase lists
  capture.js        reads the open ATS tab
site/               Vercel: download page + /api/report -> GitHub issue
test/               node:test unit tests     tools/e2e.mjs  full extension in Chromium
```
