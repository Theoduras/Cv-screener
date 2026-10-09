// Is this file a CV or a cover letter? Pure, tested in node. Ambiguous -> 'cv'.
const GREETING = /^\s*(dear|to whom it may concern|hello|geachte|beste|hallo|sehr geehrte|madame|monsieur)\b/im;
const CLOSING = /^\s*(sincerely|yours (sincerely|faithfully)|kind regards|best regards|warm regards|regards|met vriendelijke groet(en)?|vriendelijke groet(en)?|hoogachtend|mit freundlichen grüßen|cordialement)\b/im;
const LETTER_WORDS = /\b(cover ?letter|motivation letter|letter of motivation|motivatiebrief|sollicitatiebrief|motivatie ?brief|anschreiben|lettre de motivation)\b/i;
const LETTER_FILE = /(cover|motivat|letter|brief|anschreiben|lettre)/i;
const CV_FILE = /(^|[^a-z])(cv|resume|résumé|curriculum|lebenslauf)([^a-z]|$)/i;
const CV_HEADINGS = /^\s*(work experience|experience|employment|education|skills|werkervaring|opleiding(en)?|vaardigheden|talen|languages|personal details|persoonlijke gegevens|berufserfahrung|ausbildung)\s*:?\s*$/gim;
const DATE_RANGE = /\b(19|20)\d{2}\s*(-|–|—|to|tot|t\/m)\s*((19|20)\d{2}|present|heden|now|nu|current|huidig)\b/gi;

export function docKind(text = '', fileName = '') {
  let letter = 0, cv = 0;
  if (GREETING.test(text)) letter += 3;
  if (CLOSING.test(text)) letter += 3;
  if (LETTER_WORDS.test(text.slice(0, 600))) letter += 2;
  if (LETTER_FILE.test(fileName)) letter += 3;
  if (CV_FILE.test(fileName)) cv += 3;
  cv += Math.min(4, (text.match(DATE_RANGE) || []).length);
  cv += Math.min(4, (text.match(CV_HEADINGS) || []).length * 2);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^[•▪●◦\-*–]\s/.test(l)).length;
  if (bullets >= 4) cv += 2;
  // letters are prose: few, long lines
  const long = lines.filter(l => l.length > 120).length;
  if (lines.length && long / lines.length > 0.3) letter += 2;
  return letter >= 4 && letter > cv ? 'letter' : 'cv';
}

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.]+/g, ' ').trim();
// "jan-jansen-cv.pdf" and "Jan_Jansen_motivation.docx" share the stem "jan jansen".
export function fileStem(name = '') {
  return norm(name.replace(/\.[a-z0-9]+$/i, ''))
    .replace(/\b(cv|resume|curriculum|vitae|cover|letter|motivation|motivatie|motivatiebrief|sollicitatiebrief|brief|final|def|v\d+|nl|en|\d+)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Attach each letter to a CV: same email, else same name, else same ATS capture, else same file-name stem.
// Returns { [letterId]: cvId } for the letters it could place.
export function linkLetters(docs) {
  const cvs = docs.filter(d => d.kind !== 'letter' && !d.error);
  const out = {};
  for (const l of docs.filter(d => d.kind === 'letter' && !d.error)) {
    const same = [
      c => l.email && c.email && c.email.toLowerCase() === l.email.toLowerCase(),
      c => l.name && c.name && norm(c.name) === norm(l.name),
      c => l.captureId && c.captureId === l.captureId,
      c => fileStem(l.fileName).length > 2 && fileStem(c.fileName) === fileStem(l.fileName),
    ];
    for (const rule of same) {
      // prefer a CV for the same vacancy, then the most recent one
      const hit = cvs.filter(rule).sort((a, b) => (b.tag === l.tag) - (a.tag === l.tag) || b.addedAt - a.addedAt)[0];
      if (hit) { out[l.id] = hit.id; break; }
    }
  }
  return out;
}
