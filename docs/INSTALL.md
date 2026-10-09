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
- **Similar words** (the default): *nurse* also finds *nurses*.
- **Exactly this:** only that exact word or phrase.
- **Starts with:** *recruit* finds *recruiter*, *recruitment*.
- **Where should we look?** Anywhere in the CV, or only in the skills, location, education, languages or name.
- **Move to** another box, or **Remove word**.

Each word shows a small number: how many of your CVs contain it.
The purple sentence under the boxes says in plain words what you are searching for, so you can check it.
Click **+ a skill** under **Quick add** to use the skills that appear most in your CVs, and use the dropdowns for where, language, experience and hiding AI-written CVs.
**★ Save this search** keeps it all under a name, so next time it's one click. **Start over** clears everything.
If nothing matches, the screen tells you so and offers the words you can remove with one click.

**The AI score (0–100)**
- Green (< 25) means few signals, orange (25–54) some, red (≥ 55) many.
- Hover over the score or open the candidate to see *why*. Typical signals are AI wording ("results-driven", "proven track record"), leftover template text such as "[Company Name]", very uniform sentences, the tool the PDF was made with, and exactly the same text as another applicant.
- **It is an indication, not proof.** Use it to prioritise, never to reject someone on its own.

## 3. Privacy

- CVs and candidate details are never sent anywhere. They exist only in this browser.
- If something breaks, **only the error message** is sent to the developer, anonymously. No names, no file names, no CV text.
- **Delete all CVs** at the bottom of the screen clears everything.

## 4. Reporting problems

Errors are reported automatically. To tell us something yourself, use **Report a problem** at the top right, and leave candidate details out of it.

## 5. Update or remove

- **Update:** unzip the new version over the old folder, then click ↻ on CV Screener in `chrome://extensions`. Your CVs are kept.
- **Remove:** click *Remove* in `chrome://extensions`. This also deletes all stored CVs.
