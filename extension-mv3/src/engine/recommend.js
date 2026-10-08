// Copied from screenbreak/webapp printlab/recommend.js (branch claude/project-thread-2c6roz, 3abca47). Keep the two in step.
// Pick print designs for an article from what it contains. Plain, explainable rules: every score comes
// with the reason a reader would accept ("8 footnotes: they sit in the margin next to the text").
// Runs in a millisecond, so it can rank options before anything is rendered.
//
// Weights were tuned on 41 live articles judged by eight reviewers (runs/2026-10-05-judge40): classic is the safe
// choice they picked most; broadsheet won short news with a photo; magazine won photo features; ecoprint won recipes.
//
// Returns { picks: [{ style, score, why }...] best first, options: { inkSaver, largePrint, ... }, facts }.

const PAGE_AREA = 180 * 262;                       // printable mm² of an A4 page

function facts(f, { man, byId, blocks, heroId, type }) {
  const vis = blocks.map(b => byId[b.id]).filter(Boolean);
  const images = vis.filter(v => (v.kind === 'img' || v.kind === 'css_background') && !v.error && !v.broken);
  // A chart saved as an image file (white ground, few tones: "graphic") is not a photo: Our World in Data charts are
  // PNGs, and counting them as photos sent data stories to photo layouts and full-page covers.
  const photos = images.filter(v => !v.graphic), graphics = images.length - photos.length;
  const pxOf = v => v.px || v.natural || (v.box ? { w: v.box.w * 3, h: v.box.h * 3 } : null);
  // Area each photo will roughly take on paper (200 dpi, never wider than the page or taller than 120mm).
  const photoArea = photos.reduce((a, v) => { const p = pxOf(v); if (!p || !p.w) return a;
    const w = Math.min(180, p.w / 200 * 25.4), h = Math.min(120, w * p.h / p.w); return a + w * h; }, 0);
  const hero = heroId != null && byId[heroId] && !byId[heroId].graphic ? byId[heroId] : null, heroPx = hero && pxOf(hero);
  return {
    type, words: f.words, minutes: Math.max(1, Math.round(f.words / 230)),
    photos: photos.length, charts: f.charts, graphics, code: f.codeBlocks, footnotes: f.footnotes || 0,
    sections: f.sections || 0, quotes: f.quotes || 0, tables: f.tables || 0,
    photoPages: +(photoArea / PAGE_AREA).toFixed(2),                       // how many A4 pages of photo ink
    heroPx: heroPx ? { w: heroPx.w, h: heroPx.h } : null,
    coverReady: !!(heroPx && heroPx.h >= 262 / 25.4 * 150 && heroPx.w >= 180 / 25.4 * 150 * 0.6),
    lang: man.lang || '',
  };
}

function recommend(f, ctx) {
  const x = facts(f, ctx), picks = [];
  const add = (style, score, why) => picks.push({ style, score: Math.round(score), why });
  const long = x.words >= 2500, medium = x.words >= 900;
  const newsLength = x.words >= 600 && x.words <= 1800, figures = x.charts + x.graphics;

  // Structure-led types keep their own design; styles only change the look.
  if (x.type === 'tutorial') {
    add('modern', 80, `${x.code} code samples: a clean sans page keeps code and prose easy to tell apart`);
    add('classic', 70, 'the standard layout: every lead-in sentence stays with its code block');
    add('notes', x.words > 1500 ? 55 : 30, 'a margin to annotate while you follow along');
    add('loud', 62, 'a tech piece: dark code blocks and a bold title block');
  } else if (x.type === 'recipe') {
    add('classic', 80, 'ingredients box and numbered steps, on as few pages as possible');
    add('modern', 60, 'all-sans, easy to read at arm\'s length in the kitchen');
    add('riso', 40 + Math.min(20, x.photoPages * 40), 'photos as light halftone dots, if you only need the method');
    add('ecoprint', 85, 'the whole recipe, ingredients and every step, on as few sheets as possible for the kitchen');
  } else {
    // Notes margin: footnotes are the strongest signal, then long reads you would study with a pen.
    add('notes', x.footnotes >= 3 ? 70 + Math.min(25, x.footnotes) : long && x.photos <= 3 ? 62 : medium ? 35 : 15,
      x.footnotes >= 3 ? `${x.footnotes} footnotes: they sit in the margin next to the text that cites them`
        : long ? `a ${x.minutes}-minute read with few pictures: room in the margin to write` : 'a margin to write in');
    // Cover: only with a lead photo sharp enough to fill a page, and an article long enough to deserve one.
    add('cover', x.coverReady && medium ? 72 + Math.min(15, x.photos * 3) : 0,
      x.coverReady ? `a sharp lead photo (${x.heroPx.w}×${x.heroPx.h}px) that can fill page 1` : 'no photo sharp enough for a full-page cover');
    // Riso: the more photo ink, the more it saves.
    add('riso', (x.photoPages >= 0.6 ? 45 + Math.min(15, x.photoPages * 8) : x.photos ? 30 : 5) - (x.charts >= 3 ? 15 : 0),
      x.photoPages >= 0.6 ? `about ${x.photoPages} pages' worth of photos: halftone dots cut the ink a lot` : 'little photo ink to save');
    // Swiss grid: explainers with many sections, charts or tables.
    add('swiss', 30 + Math.min(30, x.sections * 5) + Math.min(20, (x.charts + x.tables) * 5) + (x.type === 'data' ? 20 : 0),
      x.sections >= 4 ? `${x.sections} sections: numbered heads in the margin make it easy to navigate` : x.charts + x.tables ? 'charts and tables on a strict grid' : 'a clean grid');
    // Book: long, mostly words.
    add('book', long && x.photos + figures <= 2 ? 75 : long ? 50 : 20,                  // illustrations count as pictures here
      long ? `${x.minutes} minutes of mostly text: one calm column, like a book` : 'one calm column');
    // Broadsheet: news-length pieces with a photo or two fill whole newspaper pages; not with maps or charts.
    add('broadsheet', newsLength && x.photos >= 1 && x.photos <= 6 && !x.charts ? 64 : 25,
      newsLength ? `a ${x.minutes}-minute story with ${x.photos === 1 ? 'a photo' : x.photos + ' photos'}: one or two dense newspaper pages` : 'a newspaper page');
    // Magazine: photo features, where big pictures and a display title carry the story. Not reference pages.
    const reference = x.words > 7000 && x.sections >= 8;
    add('magazine', reference ? 40 : x.words >= 1500 && x.photos >= 2 ? 60 + Math.min(10, x.photos * 2) + Math.min(5, x.quotes * 2) : 35 + Math.min(10, x.photos * 3),
      x.words >= 1500 && x.photos >= 2 ? `a feature with ${x.photos} photos: large pictures, a display title and pull quotes` : 'a feature layout');
    // Classic: the judges' most frequent choice: compact, photos uncropped beside their text. Best for very short
    // items (one calm page), long reference pages and anything with maps or charts in the text.
    add('classic', 55 + (x.words < 600 ? 12 : 0) + (reference ? 20 : 0) + (figures && figures <= 8 ? 8 : 0),
      x.words < 600 ? 'a short piece: one calm two-column page' : reference ? `${x.sections} sections of reference text: dense, even columns`
        : figures ? `${figures === 1 ? 'a chart stays' : figures + ' charts and diagrams stay'} next to the text that explains ${figures === 1 ? 'it' : 'them'}` : 'the standard two-column layout');
    // Photo essay: many big photos and not much text per photo.
    add('gallery', x.photos >= 5 && x.words / x.photos < 250 ? 70 + Math.min(20, x.photos) : x.photos >= 4 ? 45 : 0,
      `${x.photos} photos: each one large, the text between them`);
    // Conversation: interviews and transcripts.
    add('conversation', x.type === 'interview' ? 80 : 0, 'an interview: speakers named in the margin so you can follow who says what');
    // More styles (styles-more.css).
    add('quiet', medium && x.charts === 0 && x.photos >= 1 && x.photos <= 6 && x.words <= 7000 ? 48 + (long ? 4 : 0) : 20,
      'an essay or culture piece: light type, wide white space, calm pull quotes');
    add('loud', !long && x.photos >= 1 && x.charts === 0 ? 40 : 20, 'a short, punchy story: big black title block and colour pull quotes');
    add('bulletin', x.charts + x.tables >= 2 ? 50 + Math.min(25, (x.charts + x.tables) * 4) + (x.type === 'data' ? 10 : 0) : 15,
      x.charts + x.tables >= 2 ? `${x.charts + x.tables} charts and tables become numbered figures in a dense research brief` : 'a dense research brief');
    add('ecoprint', 38 + (long ? 10 : 0) + Math.min(15, x.photoPages * 10),
      `the fewest pages and least ink: three tight columns, small grey photos${long ? ` (a ${x.minutes}-minute read)` : ''}`);
    add('dossier', long && x.quotes >= 3 && x.photos <= 8 ? 42 : 0, 'a long report as a case file: typewriter text, exhibits, highlighted quotes');
  }
  // Very long articles: single-column and margin layouts run to 30+ pages; prefer denser pages.
  if (x.words > 7000) for (const p of picks) if (['notes', 'book', 'gallery', 'dossier', 'large'].includes(p.style)) {
    p.score -= 25; p.why += ` (but about ${Math.round(x.words / 330)} pages at this length)`; }
  // Design judges 2026-10-07 (40 articles, blind, Opus): two columns beat one column 34 to 6, mostly on paper (one
  // column ran 40-80% longer for about the same comfort), and the one-column designs (swiss, gallery, book) ranked first
  // too often. Yorgos: a column design first for news, data, photo and interview articles; one column second, with its
  // cost. Which column design follows the content, as the judges of 2026-10-05 chose: magazine for photo features,
  // broadsheet for news-length stories with a photo or two (fewer pages), classic for the rest (charts, interviews).
  if (['news', 'data', 'photo', 'interview'].includes(x.type)) {
    const photoFeature = x.type === 'photo' || (x.photos >= 3 && x.photoPages >= 1 && x.words >= 600 && !x.charts && x.graphics <= 1);
    const shortNews = x.type === 'news' && newsLength && x.photos >= 1 && x.photos <= 6 && !x.charts && x.graphics <= 2;  // a logo or a screenshot is a graphic too
    const lead = x.type === 'interview' ? 'classic' : photoFeature ? 'magazine' : shortNews ? 'broadsheet' : 'classic';
    const best = Math.max(...picks.map(p => p.score)), first = picks.find(p => p.style === lead), book = picks.find(p => p.style === 'book');
    if (first) { first.score = best + 2; first.why = {
      magazine: `a feature with ${x.photos} photos: big pictures and a display title, in two columns`,
      broadsheet: `a ${x.minutes}-minute story with ${x.photos === 1 ? 'a photo' : x.photos + ' photos'}: newspaper columns, the fewest pages`,
      classic: figures ? `${figures === 1 ? 'a chart stays' : figures + ' charts and diagrams stay'} next to the text, in two columns` : 'two columns: what readers preferred for this kind of article, on the fewest sheets',
    }[lead]; }
    if (book) { book.score = best + 1; book.why = 'one calm column with larger type, for a slower read: about 40% more pages'; } }
  picks.sort((a, b) => b.score - a.score);
  // The top three should be real alternatives: at most one per family of page layouts.
  const FAMILY = { classic: 'two', house: 'two', magazine: 'two', modern: 'two', quiet: 'two', loud: 'loud', riso: 'loud',
    broadsheet: 'three', bulletin: 'three', ecoprint: 'three', book: 'one', large: 'one', gallery: 'one',
    notes: 'margin', swiss: 'margin', conversation: 'margin', dossier: 'one', cover: 'cover' };
  const ranked = picks.filter(p => p.score > 0), top = [], seen = new Set();
  for (const p of ranked) if (top.length < 3 && !seen.has(FAMILY[p.style] || p.style)) { top.push(p); seen.add(FAMILY[p.style] || p.style); }
  const ordered = [...top, ...ranked.filter(p => !top.includes(p))];
  return {
    picks: ordered,
    // Options offered as switches next to the picks, with a reason when they're worth suggesting.
    options: {
      inkSaver: x.photoPages >= 0.6 ? `turn ${x.photos} photos into halftone dots (about ${x.photoPages} pages of photo ink)` : null,
      dropPictures: x.photoPages >= 1.5 && x.charts === 0 ? 'print words only' : null,
      largePrint: 'always available: one column, 13pt',
    },
    facts: x,
  };
}

export { recommend, facts };
