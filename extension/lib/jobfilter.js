// Which found vacancies to show for the job-title words and city in the search box.
// Separate from jobs.js, which the server-side fetch proxy also loads and must stay free of other imports.
import { compile, fromWords } from './query.js';

export function jobFilter({ terms = [], city = '', wholeText = false } = {}) {
  const t = terms.map(s => s.trim()).filter(Boolean);
  const q = t.length ? compile(fromWords({ groups: [t.map(text => ({ text, mode: 'similar', field: 'any' }))] })) : null;
  const asked = new Set(t.map(s => s.toLowerCase()));
  const c = city.trim().toLowerCase();
  // The title, not the whole ad (nearly every ad mentions "recruitment" in its small print)…
  // …unless the site itself was searched for this word: then it already decided the ad fits,
  // and "Sales medewerker" found by searching "verkoop" must not be thrown away again.
  const byWords = j => !q || (j.searchedFor || []).some(s => asked.has(s)) ||
    q.test({ name: j.title, text: wholeText ? `${j.title}\n${j.company}\n${j.text || ''}` : `${j.title}\n${j.company}`, location: j.location });
  const byCity = j => !c || `${j.location} ${j.text}`.toLowerCase().includes(c);
  return { byWords, byCity, test: j => byWords(j) && byCity(j) };
}
