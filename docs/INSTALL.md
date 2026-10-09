# Installing CV Screener (for testers)

CV Screener is a Chrome extension that reads, sorts and filters large piles of CVs. It also flags which ones were probably written by an AI tool. It works alongside any ATS (Oleeo and others). **Every CV stays in your own browser.**

## 1. Install (2 minutes)

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
| 🤖 **AI** | Was the text *written* by AI? | Typical AI wording ("results-driven", "proven track record", "gedreven"), very uniform sentences and bullets, leftover template text like "[Company Name]", AI CV builders in the PDF details |
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

## 3. Privacy

- CVs and candidate details are never sent anywhere. They exist only in this browser.
- If something breaks, **only the error message** is sent to the developer, anonymously. No names, no file names, no CV text.
- **Delete all CVs** at the bottom of the screen clears everything.

## 4. Reporting problems

Errors are reported automatically. To tell us something yourself, use **Report a problem** at the top right, and leave candidate details out of it.

## 5. Update or remove

- **Update:** unzip the new version over the old folder, then click ↻ on CV Screener in `chrome://extensions`. Your CVs are kept.
- **Remove:** click *Remove* in `chrome://extensions`. This also deletes all stored CVs.
