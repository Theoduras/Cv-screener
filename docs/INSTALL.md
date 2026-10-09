# Using CV Screener (for testers)

**Two ways to use it:**
- **Web version (nothing to install):** open https://cv-screener-lilac.vercel.app/app/ in any modern browser. Everything works except pulling candidates from your ATS page.
- **Chrome extension:** everything, plus **Capture candidate from this page** in Oleeo and other ATSs. Install it as described below.

In both, CVs are read and stored only in your own browser and are never uploaded. They are separate, though: CVs added in the web version don't appear in the extension, or the other way round.

CV Screener is a Chrome extension that reads, sorts and filters large piles of CVs. It also flags which ones were probably written by an AI tool. It works alongside any ATS (Oleeo and others). **Every CV stays in your own browser.**

## 1. Install the extension (2 minutes, optional)

1. Download **cv-screener.zip** from the link you were sent and **unzip it**: right-click → *Extract All*. You get a folder called `cv-screener`.
2. Open Chrome (or Edge) and go to `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and choose the unzipped folder, the one that contains `manifest.json`.
5. Click the puzzle piece next to the address bar and **pin** *CV Screener*.

> Getting an error at *Load unpacked*? You probably chose the zip itself, or the folder one level too high. Choose the folder that has `manifest.json` in it.
>
> On a work laptop, IT may have blocked Developer mode. Ask them to allow `chrome://extensions` for you.

## 2. Use it

**Add CVs**
- Click the CV Screener icon → **Open screener**.
- Drop CVs (PDF, DOCX or TXT), or a whole folder, into the box. Fill in the vacancy/req number first if you want to filter on it later.
- Or open a candidate in your ATS (e.g. Oleeo), click the icon and choose **Capture candidate from this page**. The extension fetches that page's attachments using your own login. If there is no attachment, it uses the text on the page.

**Filter and sort**
- Search by name, email or text, and filter on location, language, skills (all of them or any), years of experience, AI score and vacancy.
- Click a column header to sort. Click a candidate for the details and the full text.
- **Export CSV** downloads the filtered list. It opens straight in Excel.
- Under **Custom skills** you can add skills that aren't recognised yet.

**Find the right candidates**

Under **Find candidates**, type a word or phrase in a box and press **Enter** (or just click somewhere else):

- ✅ **Must have:** every CV shown contains *all* of these.
- ➕ **At least one of:** any one of these is enough. Need two separate choices, e.g. (*SAP or Oracle*) **and** (*Dutch or Flemish*)? Click **+ add another "at least one of" list**.
- 🚫 **Leave out:** hides CVs that mention these.

**Click any word** for its options:
- **Similar words** (the default): also catches typos and endings, so *nurse* finds *nurses* and *management* finds a CV that says *managment*. A typo in what *you* type is forgiven too, and a word that finds nothing offers **Did you mean …?**
- **Exactly this:** only that exact word or phrase.
- **Starts with:** *recruit* finds *recruiter*, *recruitment*.
- **Where should we look?** Anywhere in the CV, or only in the skills, location, education, languages or name.
- **Move to** another box, or **Remove word**.

Each word shows a small number: how many of your CVs contain it.
The purple sentence under the boxes says in plain words what you are searching for, so you can check it.
Click **+ a skill** under **Quick add** to use the skills that appear most in your CVs, and use the dropdowns for where, language, experience and hiding AI-written CVs.
**★ Save this search** keeps it all under a name, so next time it's one click. **Start over** clears everything.
If nothing matches, the screen tells you so and offers the words you can remove with one click.

**Is this CV written or sent by AI? Two separate checks**

Every CV gets two scores from 0 to 100: green below 25, orange from 25 to 54, red from 55. Hover over a score, or open the candidate, to see *why*.

| | Asks | Looks for |
|---|---|---|
| 🤖 **AI** | Was the text *written* by AI? | Typical AI wording ("results-driven", "proven track record", "I am excited to apply", "gedreven"), lists of three in sentence after sentence, American spelling from a European applicant, a letter that says "your organization" instead of naming you, "Dear Hiring Manager", years of experience that don't match the dates, round results like "by 25%", em-dashes, very uniform sentences, paragraphs and bullets, a letter far more polished than the CV, leftover template text like "[Company Name]", AI CV builders in the PDF details |
| 📨 **Tool** | Was the CV *sent or rewritten per vacancy* by an auto-apply tool? | Sentences copied word-for-word from your vacancy, the same person sending differently worded CVs to several vacancies, exactly the same CV from different applicants, tiny or hidden text stuffed with keywords, file names like *CV_ATS-optimized*, auto-apply tool names in the PDF details, long keyword lists |

To check the copying, click **📄 Vacancy text** at the top and paste the job ad for that vacancy/req. You only need to do this once per vacancy.

In **🤖 AI & tools** you can hide likely AI-written CVs, likely tool-sent CVs, or both.

**These are indications, not proof.** A candidate may tailor their own CV to your vacancy, which is a good thing, and a human can write in a polished style. Use the scores to decide what to read first, never to reject someone on their own.

**Cover letters**

Drop cover letters together with the CVs. You don't need to sort them first.
- Each file is recognised as a CV or a cover letter, from things like "Dear…"/"Geachte…", "Kind regards"/"Met vriendelijke groet", a file name like *motivation* or *cover letter*, and prose instead of dates and bullets.
- A letter is attached to its CV automatically: by email address, then name, then the same ATS page, then a matching file name (*jan-jansen-cv.pdf* and *jan-jansen-motivation.pdf*). A 📝 next to the name means the candidate has one. A letter that can't be matched gets its own row, marked "cover letter only".
- Open the candidate and switch between **CV** and **Cover letter**. Was a file recognised wrongly? Click *This is a cover letter* / *This is a CV* above the text.
- Search covers both. Click a word and choose **Only in the CV** or **Only in the cover letter** to narrow it down. The **📝 Cover letter** dropdown shows only candidates with or without one.
- Both checks run on the letter too, shown per document:
  - 🤖 **AI** looks at the wording, which is most of the evidence in prose.
  - 📨 **Tool** looks for the same letter sent to several of your vacancies with only the names changed, nearly the same letter as other applicants (a template or a tool), sentences copied from the vacancy, and a letter addressed to a job or company your vacancy never mentions (needs the 📄 Vacancy text).
- The table shows the higher score of the CV and the letter, and hovering tells you which document it came from.

**Lists and shortlists**
- Tick the box in front of a candidate. Shift-click a second box to tick everything in between, and use the box in the header to tick everyone shown.
- In the bar at the bottom, choose:
  - **📋 Add to list:** an existing list, or a new one with a name;
  - **📄 Add to vacancy:** one of your vacancies/reqs, an ad you found under *Find vacancies*, or a new one. This makes a *Shortlist – …* for that vacancy.
- A list appears as a chip under the search boxes. Click it to see only those candidates, or pick it under **📋 List**. Clicking × deletes the list, never the candidates.
- **Export selected** downloads only the ticked candidates. The CSV has a `lists` column.
- Opening a candidate shows the lists they are on. **Esc** or the **×** in the top-right corner closes it again.

**Find vacancies**
- **Add a site.** Open the **💼 Find vacancies** tab and paste a link:
  - a company careers page;
  - a job board's search results;
  - an RSS feed;
  - a board on Greenhouse, Lever, SmartRecruiters, Workable, Recruitee or Personio.

  You can also click a suggestion. A link with `{q}` in it is filled with your job title words, and `{city}` with the city.
- **Search.** Press **Search now**, then filter on **job title** (a comma between alternatives) and **city**. Ads that are new since your last search are marked *new*. The search runs again by itself when you open the tab and the last one was more than a day ago.
- **Add as vacancy** makes an ad one of your vacancies in one tap. It appears straight away under 📁 Vacancy on the Candidates tab, and the 📨 check uses its text to see which CVs copy it.
- **Add all … as vacancies** next to a site, or **Add these … as vacancies** above the list, adds every ad at once.
- **Candidates are linked to the right vacancy by themselves** when no vacancy was typed while dropping them, in this order:
  1. what their letter or CV says they apply for ("Hierbij solliciteer ik naar de functie van Verpleegkundige", "Application for Sales Manager");
  2. a vacancy title named in the letter;
  3. otherwise the best fit on the skills the ad asks for, marked *best guess*.

  An *auto* label in the Vacancy column says why when you hover over it. Open a candidate to change it, or choose *Not linked to a vacancy*. Each ad shows ✓ Vacancy and how many candidates it has (👥).
- You can also put a shortlist of candidates on a found ad; the ad then shows 📋 and the number of candidates.
- **LinkedIn, Indeed and big job boards.** LinkedIn, Indeed, Werk.nl, Nationale Vacaturebank, Werkzoeken.nl, StepStone, Intermediair, Glassdoor and Jobbird forbid automatic reading, and doing it anyway gets accounts blocked. For those:
  1. Click **Open ↗**. Do your search there as usual.
  2. Click the CV Screener icon → **Collect vacancies from this page**. It reads only the ads you can see, plus the full text of the one you have open.
- **How sites are read.** In the web version, sites are read through a small helper on our server, because a web page can't read other sites itself. It only fetches public pages and honours each site's robots.txt. A site that asks not to be read shows ⚠ with the reason. The extension reads sites itself and asks Chrome's permission once per site.

**Dark mode and phones**
- The **🌓 Auto** button at the top follows your device's light or dark setting. Click it to switch to **🌙 Dark** or **☀️ Light** instead. The choice is remembered on that device.
- The web version works on a phone. Candidates show as cards, you sort with the *Sort* dropdown, and *Select all shown* sits above the list. The candidate opens full screen; close it with the × at the top right. *Choose files* opens your phone's files (iCloud, Google Drive, downloads). Picking a whole folder only works on a computer.

## 3. Privacy

- CVs and candidate details are never sent anywhere. They exist only in this browser. Lists and found vacancies are stored there too.
- Finding vacancies fetches public job pages: in the web version through our helper, which sees only the address of the job page, never your CVs.
- If something breaks, **only the error message** is sent to the developer, anonymously. No names, no file names, no CV text.
- **Delete all CVs** at the bottom of the screen clears everything.

## 4. Reporting problems

Errors are reported automatically. To tell us something yourself, use **Report a problem** at the top right, and leave candidate details out of it.

## 5. Update or remove

- **Update:** unzip the new version over the old folder, then click ↻ on CV Screener in `chrome://extensions`. Your CVs are kept.
- **Remove:** click *Remove* in `chrome://extensions`. This also deletes all stored CVs.
