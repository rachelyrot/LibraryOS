// LibraryOS — agron-search Edge Function
//
// Checks books from a supplier book list against the library's real catalog
// (אגרון, hosted by Libnet). Until this existed, "בדוק מול אגרון" compared the
// list against the internal inventory_items table, which is not the catalog.
//
// Why a server-side proxy rather than calling Libnet from the browser:
//   - The Libnet endpoint authenticates with a static ApiKey header. Anything in
//     the Vite bundle is public, so the key would leak to every visitor.
//   - The endpoint sends no CORS headers (OPTIONS returns 404), so a browser
//     fetch is blocked regardless.
//
// What the upstream API can and cannot do (probed 2026-09, not documented):
//   GET https://agron.libnet.co.il/api/WebServiceLoans/GetMainSearchResults
//       ?FilterBy=title|author &Text=... &Initial=0 (starts with) | 1 (contains)
//   - There is no ISBN search, and the catalog rows carry no ISBN at all — so
//     matching is by title + author only.
//   - Search is literal: "חנוכה" does not find "חנכה", and author text must be in
//     catalog order ("ורטהימר, חנה"), so "חנה ורטהימר" finds nothing.
//   - Each row is one title (titleNo) with countCopies / countAvailable.
// So instead of searching for the full title, we search for short, spelling-
// stable fragments of it (then of the author) to get a candidate set, and
// compare candidates locally. See the Matching section for the rules.
//
// Real supplier lists (as imported into SupplierBookList) often have an empty
// author column with the author folded into the title: "אין צייר כאלוקינו -
// גדי פולק". They also split words differently from the catalog ("אליקופטר"
// vs "אלי קופטר") and write volumes as digits where the catalog uses letters
// ("ניקרגואה 2" vs "מבצע ניקרגואה ב").
//
// Tested offline against a full catalog snapshot (4,973 titles): 400 random
// Hebrew titles with injected ktiv errors, dropped subtitles, reversed author
// names and author-in-title → 396 found, 4 flagged "possible" (all genuine
// volume ambiguities), 0 missed; plus hand-picked cases from a real list.
//
// Access: any signed-in user. The catalog is not sensitive (it is what the
// public OPAC shows); the JWT check only stops this from being an open proxy
// that spends the library's API quota.
//
// Secrets (Dashboard → Edge Functions → Secrets): AGRON_CLIENT_ID, AGRON_API_KEY.
// Deploy: paste this file into Dashboard → Edge Functions → Deploy a new
// function named `agron-search`, or `npx supabase functions deploy agron-search`.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const AGRON_URL = 'https://agron.libnet.co.il/api/WebServiceLoans/GetMainSearchResults';
// Keeps one invocation well inside the Edge runtime's wall-clock limit (~3
// upstream calls per book worst case). The client sends larger lists in chunks.
const MAX_BOOKS = 40;
const CONCURRENCY = 4;
const MAX_MATCHES = 3;
// Volumes listed in a series breakdown — "ילדי שי" alone runs past 30.
const MAX_SERIES = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

type CatalogRow = {
  titleNo: number;
  titleName: string | null;
  authorName: string | null;
  publisher: string | null;
  year: string | null;
  countCopies: number | null;
  countAvailable: number | null;
};

type BookIn = { title?: string; author?: string };

// ── Normalization ────────────────────────────────────────────────────────────
const normalize = (s: unknown) => String(s ?? '')
  .replace(/[֑-ׇ]/g, '')                                  // niqqud / cantillation
  .replace(/["'`׳״“”„‘’]/g, '')  // quotes, geresh, gershayim
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLowerCase();

// ktiv male vs. haser: "חנוכה"/"חנכה", "סיפורים"/"ספורים" compare equal once
// every ו/י is dropped. Spaces are dropped too, for "אליקופטר"/"אלי קופטר".
const compact = (s: unknown) => normalize(s).replace(/[וי\s]/g, '');

// Catalog titles carry a subtitle after ':' (or ' / ', ' - ') that lists omit.
const mainTitle = (s: unknown) => String(s ?? '').split(/\s[:\-–—/]\s|:/)[0];

// Supplier lists write "title - author" when the author column is empty.
function splitBookTitle(title: unknown) {
  const [head, ...rest] = String(title ?? '').split(/\s[-–—]\s/);
  return { head, tail: rest.join(' ') };
}

// Volumes: the catalog writes "ב", "ג'", "כ"א"; lists write 2, 3, 21. "א"/1
// means "no volume" in practice, so it is ignored. Numbers ≥ 1000 are years.
//
// Series run past 10 ("עשרים ואחד בבית אחד" כ"א, "ילדי שי" ט"ו), so letters are
// read as Hebrew numerals (gematria). A multi-letter token counts only when it
// is written as a numeral — with gershayim (כ"א) — or right after "חלק"/"כרך"/
// "ספר"/"מס". Bare letter groups are ordinary words far too often ("שי" would
// be 310, "לב" 32, "יד" 14). Capped at 120: no series runs longer, and it keeps
// abbreviations that happen to read as numbers (ת"א, ש"ס) out.
const GEMATRIA: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60,
  'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
};
const VOLUME_MARKERS = new Set(['חלק', 'כרך', 'ספר', 'מס', 'מספר']);
const MAX_VOLUME = 120;

// A Hebrew numeral: letters in non-increasing value (טו/טז stand in for the
// avoided יה/יו). Returns the number, or null.
function hebrewNumeral(t: string): number | null {
  if (!t || t.length > 3 || [...t].some((c) => !GEMATRIA[c])) return null;
  const vals = [...t].map((c) => GEMATRIA[c]);
  const ordered = vals.every((v, k) => k === 0 || v <= vals[k - 1]) || t === 'טו' || t === 'טז';
  const n = vals.reduce((s, v) => s + v, 0);
  return ordered && n <= MAX_VOLUME ? n : null;
}

// כ"א / כ״א / ט'ו → 21 / 15, before normalize() strips the quote marks and the
// numeral becomes indistinguishable from a word.
const numeralsToDigits = (s: unknown) => String(s ?? '').replace(
  /(^|[\s(\-–—:/,])([א-ת]{1,2})["״'׳]([א-ת])(?=$|[\s).,:\-–—/])/g,
  (m, pre, a, b) => {
    const n = hebrewNumeral(a + b);
    return n == null ? m : `${pre}${n}`;
  },
);

// Splits a title into comparison words and volume numbers. Volume tokens are
// removed from the words, so "בבית אחד 21" and "בבית אחד כ"א" compare equal.
function parseTitle(s: unknown) {
  const tokens = normalize(numeralsToDigits(s)).split(' ').filter(Boolean);
  const words: string[] = [];
  const vols = new Set<string>();
  tokens.forEach((t, k) => {
    let n: number | null = null;
    if (/^\d+$/.test(t)) n = Number(t);
    else if (t.length === 1 && t !== 'א' && (GEMATRIA[t] ?? 99) <= 10) n = GEMATRIA[t]; // ב..י, as before
    else if (VOLUME_MARKERS.has(tokens[k - 1] ?? '')) n = hebrewNumeral(t);
    if (n != null) {
      if (n !== 1 && n < 1000) vols.add(String(n));
      return;
    }
    if (t === 'א') return;
    const w = compact(t);
    if (w) words.push(w);
  });
  return { words, vols };
}

const volumes = (s: unknown) => parseTitle(s).vols;

// Title words for comparison, without volume markers, in compact form.
const titleWords = (s: unknown) => parseTitle(s).words;

// Search fragment for a word: its longest stretch without ו/י, which is spelled
// the same in ktiv male and haser ("כאלוקינו" → "כאל", "ניקרגואה" → "קרג").
// Too short to be useful → the word as written.
function searchTerms(s: unknown, count: number) {
  const terms = normalize(s).split(' ')
    .filter((w) => !/^\d+$/.test(w))
    .map((w) => {
      const run = w.split(/[וי]/).sort((a, b) => b.length - a.length)[0];
      return run.length >= 3 ? run : w;
    })
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);
  return [...new Set(terms)].slice(0, count);
}

// Order-insensitive, so "חנה ורטהימר" meets "ורטהימר, חנה".
const authorTokens = (s: unknown) => new Set(normalize(s).split(' ').map(compact).filter((w) => w.length >= 2));

type ParsedBook = { head: string; tail: string; author: string; authorGuess: string };
// member: a catalog title that *starts* with the list title and goes on
// ("ילדי שי" → "ילדי שי במשבר") — a volume of the series the list names.
type Match = { kind: 'exact' | 'near'; specific: boolean; member?: boolean };

// The catalog subtitle — the part after the main title ("ילדי שי : הסוד במערה").
const subtitleOf = (s: unknown) => {
  const full = String(s ?? '');
  return full.slice(mainTitle(full).length);
};

// ── Matching ─────────────────────────────────────────────────────────────────
// exact: every word of the list title appears in the catalog title, every word
//   of the catalog *main* title appears in the list title, volumes agree, and
//   the author doesn't contradict.
// near ("possible", shown for manual review): same title but volume or author
//   disagrees, or one title contains the other and the author agrees.
//
// Series. Supplier lists name a volume of a series either by number ("עשרים
// ואחד בבית אחד 3") or by name after a dash ("ילדי שי - הסוד במערה"). The
// catalog keeps each volume as its own title, the volume name as subtitle. The
// dash text used to be taken as an author guess only, so every volume of the
// series matched the bare main title and their copies were summed. Now:
//   - dash text found in the catalog title → that volume, `specific`
//   - dash text matching the catalog author → still the author, as before
//   - otherwise, if the catalog row has a subtitle, it is a *different* volume
//     of the series → near, not exact
//   - an agreeing volume number is also `specific`
// checkBook keeps only the specific matches when there are any, and reports a
// series breakdown when the list names the series but not the volume.
//
// The real catalog often writes a volume with no separator at all — "ילדי שי
// במשבר", not "ילדי שי : במשבר" — so the rules above never see a subtitle. Two
// more, on whole words in order:
//   - the catalog title starts with the list title and goes on → `member` of
//     the series (near; checkBook turns 2+ members into a series breakdown).
//     Checked before the short-title noise rule, since series names are short.
//   - the list title ends with a catalog title of 2+ words ("עשרים ואחד בבית
//     אחד טסים לאנגליה" vs "טסים לאנגליה") → that volume, `specific`.
function classify(book: ParsedBook, row: CatalogRow): Match | null {
  const bookWords = titleWords(book.head);
  const rowMainWords = titleWords(mainTitle(row.titleName));
  if (bookWords.length === 0 || rowMainWords.length === 0) return null;

  const rowAllWords = titleWords(row.titleName);
  // dash text that is the author ("ילדי שי - חיים לוי") names no volume
  const rowAuthor = authorTokens(row.authorName);
  const tailNamesVolume = titleWords(book.tail).length > 0
    && ![...authorTokens(book.tail)].some((t) => rowAuthor.has(t));
  const noVolume = volumes(book.head).size === 0 && !tailNamesVolume;
  // a one short word is the start of too many unrelated titles ("הבית ...")
  const seriesLike = bookWords.length >= 2 || bookWords.join('').length >= 6;
  if (noVolume && seriesLike && rowAllWords.length > bookWords.length && bookWords.every((w, k) => rowAllWords[k] === w)) {
    return { kind: 'near', specific: false, member: true };
  }
  if (rowAllWords.length >= 2 && rowAllWords.length < bookWords.length
    && rowAllWords.every((w, k) => bookWords[bookWords.length - rowAllWords.length + k] === w)) {
    return { kind: 'exact', specific: true };
  }

  const rowFull = compact(row.titleName);
  const bookFull = compact(book.head);
  const coversBook = bookWords.every((w) => rowFull.includes(w));
  const coversRow = rowMainWords.every((w) => bookFull.includes(w));
  if (!coversBook && !coversRow) return null;
  // One-sided containment of a very short title is noise ("המוח" is inside many).
  const shorter = coversBook && !coversRow ? bookWords : rowMainWords;
  if (!(coversBook && coversRow) && shorter.join('').length < 6) return null;

  // Every list volume must appear somewhere in the catalog title; catalog
  // volumes count only from the main title or the very end ("מבצע ניקרגואה ב"),
  // since subtitles are full of unrelated numbers ("בת 12 נפשות").
  const bookVols = volumes(book.head);
  const rowVols = volumes(row.titleName);
  const rowKeyVols = new Set([
    ...volumes(mainTitle(row.titleName)),
    // last word only, read after the gershayim → digits step so "כ"א" counts
    ...volumes(normalize(numeralsToDigits(row.titleName)).split(' ').pop()),
  ]);
  const volumesAgree = [...bookVols].every((n) => rowVols.has(n)) && [...rowKeyVols].every((n) => bookVols.has(n));

  // Only a real conflict counts against a match: a missing or initials-only
  // author is not evidence of a different book. A guessed author (text after
  // " - " in the title) may be a subtitle, so it can support but never veto.
  const a = authorTokens(book.author);
  const b = authorTokens(row.authorName);
  const authorMatch = a.size > 0 && b.size > 0 && [...a].some((t) => b.has(t));
  const authorConflict = a.size > 0 && b.size > 0 && !authorMatch;
  const guessMatch = !!book.authorGuess && [...authorTokens(book.authorGuess)].some((t) => b.has(t));

  const near: Match = { kind: 'near', specific: false };
  const sameTitle = coversBook && coversRow;
  if (sameTitle && volumesAgree && !authorConflict) {
    // The dash text names the volume when it is not the author (see header).
    const tailWords = titleWords(book.tail);
    const tailIsAuthor = tailWords.length > 0 && [...authorTokens(book.tail)].some((t) => b.has(t));
    if (tailWords.length > 0 && !tailIsAuthor) {
      if (tailWords.every((w) => rowFull.includes(w))) return { kind: 'exact', specific: true };
      if (titleWords(subtitleOf(row.titleName)).length > 0) return near; // another volume
    }
    return { kind: 'exact', specific: bookVols.size > 0 };
  }
  if (sameTitle) return near;
  if (authorConflict) return null;
  return authorMatch || guessMatch ? near : null;
}

// ── Upstream ─────────────────────────────────────────────────────────────────
async function searchAgron(filterBy: 'title' | 'author', text: string, cache: Map<string, Promise<CatalogRow[]>>) {
  const key = `${filterBy}|${text}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const res = await fetch(`${AGRON_URL}?${new URLSearchParams({ FilterBy: filterBy, Text: text, Initial: '1' })}`, {
        headers: {
          clientId: Deno.env.get('AGRON_CLIENT_ID') ?? '',
          ApiKey: Deno.env.get('AGRON_API_KEY') ?? '',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Agron responded ${res.status}`);
      const body = await res.json();
      // Libnet rejects bad credentials with 200 + `null`, not 401. A search that
      // simply finds nothing returns [] — and we never send empty text (the other
      // way to get null) — so null here means the secrets are wrong. Treating it
      // as [] would silently mark every book "not found".
      if (!Array.isArray(body)) throw new Error('אגרון דחה את פרטי הגישה — בדקו את AGRON_CLIENT_ID / AGRON_API_KEY');
      return body;
    })());
  }
  return cache.get(key)!;
}

async function checkBook(book: BookIn, cache: Map<string, Promise<CatalogRow[]>>) {
  if (!String(book.title ?? '').trim()) return { status: 'no_title' as const };

  const { head, tail } = splitBookTitle(book.title);
  const author = String(book.author ?? '').trim();
  const parsed: ParsedBook = { head, tail, author, authorGuess: author ? '' : tail };

  const queries: ['title' | 'author', string][] = [
    ...searchTerms(mainTitle(head), 2).map((t) => ['title', t] as ['title', string]),
    ...searchTerms(author || tail, 1).map((t) => ['author', t] as ['author', string]),
  ];

  const hits = new Map<number, { row: CatalogRow } & Match>();
  // every row the searches returned — the series breakdown is drawn from these,
  // not only from rows that matched the list title
  const seen = new Map<number, CatalogRow>();
  for (const [filterBy, text] of queries) {
    for (const row of await searchAgron(filterBy, text, cache)) {
      seen.set(row.titleNo, row);
      const m = classify(parsed, row);
      if (m && hits.get(row.titleNo)?.kind !== 'exact') hits.set(row.titleNo, { row, ...m });
    }
    if ([...hits.values()].some((h) => h.kind === 'exact')) break;
  }

  const summarize = (r: CatalogRow) => ({
    title_no: r.titleNo,
    title: r.titleName,
    author: r.authorName,
    publisher: r.publisher,
    year: r.year,
    copies: r.countCopies ?? 0,
    available: r.countAvailable ?? 0,
  });
  const all = [...hits.values()];
  const specific = all.filter((h) => h.kind === 'exact' && h.specific).map((h) => h.row);
  const exact = specific.length > 0 ? specific : all.filter((h) => h.kind === 'exact').map((h) => h.row);
  const near = all.filter((h) => h.kind === 'near' && !h.member).map((h) => h.row);
  const members = all.filter((h) => h.member).map((h) => h.row);

  // The volumes of the series in the catalog — every row whose title starts
  // with the series name (the list's main title, before any dash), with or
  // without a separator after it — for the per-book breakdown on screen.
  const headWords = titleWords(head);
  const inSeries = (r: CatalogRow) => {
    const w = titleWords(r.titleName);
    return w.length >= headWords.length && headWords.every((x, k) => w[k] === x);
  };
  const seriesRows = (rows: CatalogRow[]) => rows
    .filter(inSeries)
    .sort((x, y) => String(x.titleName).localeCompare(String(y.titleName), 'he', { numeric: true }))
    .slice(0, MAX_SERIES)
    .map(summarize);
  const seriesResult = (rows: CatalogRow[]) => ({
    status: 'series' as const,
    copies: rows.reduce((s, r) => s + (r.countCopies ?? 0), 0),
    available: rows.reduce((s, r) => s + (r.countAvailable ?? 0), 0),
    matches: seriesRows(rows),
  });

  if (exact.length > 0) {
    // Several catalog titles can be the same book (editions, reprints) — sum
    // them. But when the list names only the series and the catalog holds
    // several *different* volumes under it, summing would answer "how many
    // books of the series" instead of "this book": report the series instead.
    const distinctBooks = new Set(exact.map((r) => compact(r.titleName)));
    if (specific.length === 0 && distinctBooks.size > 1) return seriesResult([...exact, ...members]);
    const exactNos = new Set(exact.map((r) => r.titleNo));
    return {
      status: 'found' as const,
      copies: exact.reduce((s, r) => s + (r.countCopies ?? 0), 0),
      available: exact.reduce((s, r) => s + (r.countAvailable ?? 0), 0),
      matches: exact.slice(0, MAX_MATCHES).map(summarize),
      series: seriesRows([...seen.values()].filter((r) => !exactNos.has(r.titleNo))),
    };
  }
  // The list names only the series ("ילדי שי") and the catalog has its volumes
  // as continuing titles ("ילדי שי במשבר", "ילדי שי בסכנה"...).
  if (members.length >= 2) return seriesResult(members);
  const candidates = [...near, ...members];
  if (candidates.length > 0) {
    return { status: 'possible' as const, matches: candidates.slice(0, MAX_MATCHES).map(summarize), series: seriesRows(candidates) };
  }
  return { status: 'not_found' as const };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Missing Authorization header' }, 401);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    if (!Deno.env.get('AGRON_API_KEY') || !Deno.env.get('AGRON_CLIENT_ID')) {
      return json({ error: 'החיבור לאגרון לא הוגדר בשרת (חסרים AGRON_CLIENT_ID / AGRON_API_KEY)' }, 500);
    }

    const { books } = await req.json();
    if (!Array.isArray(books)) return json({ error: 'חסרה רשימת ספרים' }, 400);
    if (books.length > MAX_BOOKS) return json({ error: `ניתן לבדוק עד ${MAX_BOOKS} ספרים בקריאה אחת` }, 400);

    const cache = new Map<string, Promise<CatalogRow[]>>();
    const results = new Array(books.length);
    let next = 0;
    // A failure on one book is reported on that book, not the whole batch.
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, books.length) }, async () => {
      while (next < books.length) {
        const i = next++;
        try {
          results[i] = await checkBook(books[i] ?? {}, cache);
        } catch (error) {
          console.error('agron-search book failed:', error);
          results[i] = { status: 'error', error: (error as Error).message };
        }
      }
    }));

    return json({ results });
  } catch (error) {
    console.error('agron-search failed:', error);
    return json({ error: (error as Error).message ?? 'Unexpected error' }, 500);
  }
});
