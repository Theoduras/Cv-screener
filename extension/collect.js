// Injected into the active tab on demand (popup -> "Collect vacancies from this page").
// Reads only what the recruiter already has on screen: the page's JobPosting data and the job cards of a
// results list (LinkedIn, Indeed, and a generic fallback). It fetches nothing and clicks nothing.
(() => {
  const txt = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const pick = (root, sels) => { for (const s of sels) { const el = root.querySelector(s); if (txt(el)) return el; } return null; };
  const abs = h => { try { return new URL(h, location.href).href.replace(/[?#].*$/, m => /[?&](jk|currentJobId|vjk)=/.test(m) ? m : ''); } catch { return ''; } };

  const SITES = [
    { // LinkedIn, logged in and public search
      cards: 'li[data-occludable-job-id], .job-card-container, .base-card.job-search-card, ul.jobs-search__results-list > li',
      title: ['.job-card-list__title--link', '.job-card-list__title', 'a.job-card-container__link', '.base-search-card__title', 'h3'],
      company: ['.artdeco-entity-lockup__subtitle', '.job-card-container__primary-description', '.base-search-card__subtitle', 'h4'],
      location: ['.job-card-container__metadata-item', '.artdeco-entity-lockup__caption', '.job-search-card__location'],
      link: ['a[href*="/jobs/view/"]', 'a.base-card__full-link', 'a'],
      id: c => c.dataset.occludableJobId || c.dataset.jobId || '',
      url: (c, a, id) => id ? `https://www.linkedin.com/jobs/view/${id}/` : abs(a?.getAttribute('href')),
    },
    { // Indeed
      cards: '.job_seen_beacon, .tapItem, [data-jk]',
      title: ['h2.jobTitle span[title]', 'h2.jobTitle', '.jobTitle', 'a.jcs-JobTitle'],
      company: ['[data-testid="company-name"]', '.companyName', '.company_location [data-testid]'],
      location: ['[data-testid="text-location"]', '.companyLocation'],
      link: ['a.jcs-JobTitle', 'a[data-jk]', 'h2 a', 'a'],
      id: c => c.dataset.jk || c.querySelector('[data-jk]')?.dataset.jk || '',
      url: (c, a, id) => id ? `${location.origin}/viewjob?jk=${id}` : abs(a?.getAttribute('href')),
    },
  ];

  const cards = [];
  for (const s of SITES) {
    const seen = new Set();
    for (const c of document.querySelectorAll(s.cards)) {
      if ([...seen].some(o => o.contains(c) || c.contains(o))) continue; // nested matches: keep one
      const t = pick(c, s.title); if (!t) continue;
      seen.add(c);
      const a = pick(c, s.link) || c.closest('a'), id = s.id(c);
      cards.push({ title: txt(t), company: txt(pick(c, s.company)), location: txt(pick(c, s.location)), url: s.url(c, a, id) });
    }
    if (cards.length) break;
  }

  // the job that is open in the side pane (LinkedIn/Indeed) or as the whole page
  const pane = document.querySelector('#job-details, .jobs-description, #jobDescriptionText, .jobsearch-JobComponent-description');
  const paneTitle = txt(document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.jobsearch-JobInfoHeader-title, .jobsearch-JobInfoHeader-title, h1'));
  const detail = pane && paneTitle ? { title: paneTitle, url: location.href, text: (pane.innerText || '').trim().slice(0, 20000) } : null;

  // generic fallback: links that look like job ads
  if (!cards.length) {
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      const t = txt(a), href = abs(a.getAttribute('href'));
      if (t.length < 6 || t.length > 120 || !href || seen.has(href)) continue;
      if (!/\/(vacatures?|vacancies|vacancy|jobs?|careers?|positions?|o)\/|[?&](jk|jobid|vacatureid)=/i.test(href) || !/[\d-]/.test(href.split('/').pop())) continue;
      seen.add(href);
      const box = a.closest('li, article, [class*="card"], [class*="result"]');
      cards.push({ title: t, company: '', location: '', url: href, context: box && box !== a ? txt(box).slice(0, 300) : '' });
      if (cards.length >= 100) break;
    }
  }

  return {
    kind: 'jobs', title: document.title.slice(0, 120), url: location.href, host: location.hostname,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).slice(0, 50),
    cards: cards.slice(0, 200), detail,
  };
})();
