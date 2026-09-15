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

// Volumes: the catalog writes "ב", "ג'"; lists write 2, 3. "א"/1 means "no
// volume" in practice, so it is ignored. Numbers ≥ 1000 are years, not volumes.
const VOLUME_LETTERS: Record<string, string> = {
  'ב': '2', 'ג': '3', 'ד': '4', 'ה': '5', 'ו': '6',
  'ז': '7', 'ח': '8', 'ט': '9', 'י': '10',
};
const volumes = (s: unknown) => new Set(normalize(s).split(' ')
  .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : VOLUME_LETTERS[t]))
  .filter((n) => n && n !== '1' && Number(n) < 1000));

// Title words for comparison, without volume markers, in compact form.
const titleWords = (s: unknown) => normalize(s).split(' ')
  .filter((w) => w && !/^\d+$/.test(w) && !VOLUME_LETTERS[w] && w !== 'א')
  .map(compact)
  .filter(Boolean);

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

type ParsedBook = { head: string; author: string; authorGuess: string };

// ── Matching ─────────────────────────────────────────────────────────────────
// exact: every word of the list title appears in the catalog title, every word
//   of the catalog *main* title appears in the list title, volumes agree, and
//   the author doesn't contradict.
// near ("possible", shown for manual review): same title but volume or author
//   disagrees, or one title contains the other and the author agrees.
function classify(book: ParsedBook, row: CatalogRow): 'exact' | 'near' | null {
  const bookWords = titleWords(book.head);
  const rowMainWords = titleWords(mainTitle(row.titleName));
  if (bookWords.length === 0 || rowMainWords.length === 0) return null;

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
  const rowKeyVols = new Set([...volumes(mainTitle(row.titleName)), ...volumes(normalize(row.titleName).split(' ').pop())]);
  const volumesAgree = [...bookVols].every((n) => rowVols.has(n)) && [...rowKeyVols].every((n) => bookVols.has(n));

  // Only a real conflict counts against a match: a missing or initials-only
  // author is not evidence of a different book. A guessed author (text after
  // " - " in the title) may be a subtitle, so it can support but never veto.
  const a = authorTokens(book.author);
  const b = authorTokens(row.authorName);
  const authorMatch = a.size > 0 && b.size > 0 && [...a].some((t) => b.has(t));
  const authorConflict = a.size > 0 && b.size > 0 && !authorMatch;
  const guessMatch = !!book.authorGuess && [...authorTokens(book.authorGuess)].some((t) => b.has(t));

  const sameTitle = coversBook && coversRow;
  if (sameTitle && volumesAgree && !authorConflict) return 'exact';
  if (sameTitle) return 'near';
  if (authorConflict) return null;
  return authorMatch || guessMatch ? 'near' : null;
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
  const parsed: ParsedBook = { head, author, authorGuess: author ? '' : tail };

  const queries: ['title' | 'author', string][] = [
    ...searchTerms(mainTitle(head), 2).map((t) => ['title', t] as ['title', string]),
    ...searchTerms(author || tail, 1).map((t) => ['author', t] as ['author', string]),
  ];

  const hits = new Map<number, { row: CatalogRow; kind: 'exact' | 'near' }>();
  for (const [filterBy, text] of queries) {
    for (const row of await searchAgron(filterBy, text, cache)) {
      const kind = classify(parsed, row);
      if (kind && hits.get(row.titleNo)?.kind !== 'exact') hits.set(row.titleNo, { row, kind });
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
  const exact = [...hits.values()].filter((h) => h.kind === 'exact').map((h) => h.row);
  const near = [...hits.values()].filter((h) => h.kind === 'near').map((h) => h.row);

  if (exact.length > 0) {
    // Several catalog titles can be the same book (editions, reprints) — sum them.
    return {
      status: 'found' as const,
      copies: exact.reduce((s, r) => s + (r.countCopies ?? 0), 0),
      available: exact.reduce((s, r) => s + (r.countAvailable ?? 0), 0),
      matches: exact.slice(0, MAX_MATCHES).map(summarize),
    };
  }
  if (near.length > 0) return { status: 'possible' as const, matches: near.slice(0, MAX_MATCHES).map(summarize) };
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
