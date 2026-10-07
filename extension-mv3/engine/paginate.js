// Screenbreak page builder. Runs inside the print page before Chrome prints it.
// Chrome's own column flow leaves holes: a figure that doesn't fit jumps to the next column or page
// and leaves white space behind. This builds each A4 page explicitly instead:
//  - wide charts, diagrams, screenshots and tables print across the columns right after their text; when that
//    page has no room left, at the top of the next page (never above their text, never further away);
//  - wide photos float to the top of the page where they are met, or of the next one; one waits at a time, and a
//    photo met while another waits prints at column width in the text instead;
//  - a column figure that doesn't fit below its text first shrinks a little (to 75% of its height at least), else
//    opens the next column while the text after it fills this one (the next page only from the last column);
//  - pictures still waiting when the text ends go to the head of the last page, not after the end;
//  - paragraphs are split exactly at the page edge (with a hyphen if the browser hyphenated there);
//  - headings never end a page; the last page's columns are balanced.
// Load every declared font face before measuring: a face that is first used on a page built later (a caption
// marker, a label) would otherwise load after pagination and reflow the text past the page edge.
window.addEventListener('load', () => Promise.all([...document.fonts].map(f => f.load().catch(() => null))).then(() => document.fonts.ready).then(function () {
  const MM = 96 / 25.4;
  const H = 262 * MM;                          // content height of an A4 page with 16/18mm margins (+1mm safety)
  const FLOAT_BUDGET = 0.62 * H;               // floats met on a page may take at most this much of it
  const OVERDUE_BUDGET = 0.85 * H;             // floats carried over from the page before may take this much
  const GAP_OK = 14 * MM;                      // white space we tolerate above a column figure
  const BAND_MIN = 20 * MM;                    // thinnest band of two-column text between pictures across the page
  const book = document.createElement('div'); book.id = 'book';
  const src = document.querySelector('main.flow');
  const masthead = document.querySelector('header.masthead'), hero = document.querySelector('figure.hero'), source = document.querySelector('footer.source');
  // Loose text/inline nodes become paragraphs so everything in the flow is a block.
  for (const n of [...src.childNodes]) if (n.nodeType === 3 ? n.textContent.trim() : n.nodeType === 1 && getComputedStyle(n).display.startsWith('inline'))
    { const p = document.createElement('p'); n.replaceWith(p); p.append(n); } else if (n.nodeType !== 1) n.remove();
  let flow = [...src.children];
  flow.forEach((el, i) => { el.dataset.seq = i; });          // source order, kept by clones and split parts (placement report)
  const isWide = el => el.classList.contains('wide');
  const isPhoto = el => el.classList.contains('photo');
  const isHeading = el => /^H[1-6]$/.test(el.tagName);
  const splittable = el => el.matches('p:not(.pullquote), ul, ol, pre') && el.textContent.trim().length > 0;
  [masthead, hero, source, src].forEach(e => e && e.remove());
  document.body.append(book);
  // Cover opener: the lead photo fills page 1 with the headline set on it; the article starts on page 2.
  const cover = document.body.classList.contains('has-cover') && hero;
  if (cover) { const pg = document.createElement('section'); pg.className = 'page cover'; pg.append(hero); if (masthead) pg.append(masthead); book.append(pg); }

  function newPage(tops) {
    const page = document.createElement('section'); page.className = 'page';
    const top = document.createElement('div'); top.className = 'tops flow';
    tops.forEach(t => top.append(t.cloneNode(true)));
    const cols = document.createElement('div'); cols.className = 'cols flow';
    page.append(top, cols); book.append(page);
    cols.style.height = Math.max(0, H - top.offsetHeight) + 'px';
    return { page, top, cols };
  }
  const overflows = cols => cols.scrollWidth > cols.clientWidth + 2;
  const colRight = cols => cols.getBoundingClientRect().left + cols.clientWidth;

  // Split element c (already in cols) at the first character that lands outside the page. Returns the remainder or null.
  function split(c, cols) {
    if (c.matches('ul, ol')) {
      const items = [...c.children], right = colRight(cols);
      const crosses = li => [...li.getClientRects()].some(r => r.right > right + 1);
      let k = items.findIndex(li => crosses(li));
      if (k < 0) return null;
      const rest = c.cloneNode(false);
      if (c.tagName === 'OL') { const st = (+c.getAttribute('start') || 1) + k; rest.setAttribute('start', st);
        rest.style.counterReset = `step ${st - 1}`; }                         // designs that number steps with a CSS counter
      // A long item (e.g. an endnote with several paragraphs) that straddles the edge is split inside itself.
      const li = items[k], startsInside = li.getClientRects()[0] && li.getClientRects()[0].left < right - 1;
      if (startsInside) { const keep = li.cloneNode(true), liRest = splitText(li, cols);
        if (liRest) { liRest.classList.add('cont'); rest.append(liRest); k++; } else li.replaceWith(items[k] = keep); }
      if (k === 0 && !rest.children.length) return null;
      items.slice(k).forEach(x => rest.append(x));
      return rest.children.length ? rest : null;
    }
    return splitText(c, cols);
  }

  // Split any block at the first character that lands outside the page (or at `edge`, a column's left edge);
  // returns the remainder or null.
  function splitText(c, cols, edge) {
    const right = edge || colRight(cols), r = document.createRange();
    const out = (node, i) => { r.setStart(node, i); r.setEnd(node, i + 1); const rects = r.getClientRects(); return rects.length ? rects[0].left >= right - 1 : false; };
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let node, hit = null;
    while ((node = walker.nextNode())) {
      const t = node.textContent; if (!t.trim()) continue;
      let last = t.length - 1; while (last > 0 && !t[last].trim()) last--;
      if (!out(node, last)) continue;
      let lo = 0, hi = last; while (lo < hi) { const mid = (lo + hi) >> 1; if (out(node, mid)) hi = mid; else lo = mid + 1; }
      hit = { node, i: lo }; break;
    }
    if (!hit) return null;
    let { node: n, i } = hit; let t = n.textContent;
    if (c.tagName === 'PRE') {                                                    // code splits between lines
      // Highlighted code is many small text nodes: the line break before the hit can sit in an earlier one.
      let nl = t.lastIndexOf('\n', i - 1);
      if (nl < 0) { const nodes = []; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) nodes.push(x);
        for (let k = nodes.indexOf(n) - 1; k >= 0; k--) { const j = nodes[k].textContent.lastIndexOf('\n'); if (j >= 0) { n = nodes[k]; t = n.textContent; nl = j; break; } } }
      if (nl < 0) return null; i = nl + 1;
      if (i >= t.length) { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); w.currentNode = n; const nx = w.nextNode(); if (!nx) return null; n = nx; t = n.textContent; i = 0; } }
    else while (i < t.length && !t[i].trim()) i++;                              // don't start the remainder with a space
    const midWord = c.tagName !== 'PRE' && i > 0 && /[\p{L}]/u.test(t[i - 1]) && /[\p{L}]/u.test(t[i] || '');
    r.setStart(n, i); r.setEndAfter(c.lastChild);
    // Need at least two lines on each side (no orphans/widows); otherwise move the whole paragraph.
    const lineH = parseFloat(getComputedStyle(c).lineHeight) || 16;
    const before = c.getBoundingClientRect();
    const frag = r.extractContents();
    if (midWord) n.textContent = n.textContent.replace(/\s*$/, '') + '‐';
    const rest = c.cloneNode(false); rest.removeAttribute('id'); rest.classList.add('cont'); rest.classList.remove('lede'); rest.append(frag);
    c.classList.add('split');
    const firstLines = c.getClientRects().length ? Math.round(c.getBoundingClientRect().height / lineH) : 0;
    if (firstLines < 2) { return null; }
    return rest;
  }

  // Move the last line of code from the end of c to the start of rest. Returns false when c has no line to give.
  function moveLastLine(c, rest) {
    const texts = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = []; let n; while ((n = w.nextNode())) out.push(n); return out; };
    const last = texts(c).filter(n => n.textContent.trim()).pop(), head = texts(rest)[0];
    if (!last || !head) return false;
    const t = last.textContent.replace(/\n+$/, ''), nl = t.lastIndexOf('\n');
    if (nl < 0 || c.textContent.trim().split('\n').length <= 2) return false;
    head.textContent = t.slice(nl + 1) + '\n' + head.textContent; last.textContent = t.slice(0, nl);
    return true;
  }

  // A wide photo printed at column width (another picture already waits for a later page).
  function asColumn(el) { const c = el.cloneNode(true); c.classList.remove('wide'); c.classList.add('col');
    const img = c.querySelector('img'); if (img) img.style.width = '100%'; return c; }
  // Shrink a figure's picture so the whole figure fits in `space` px: never below 75% of its height or 25mm.
  function shrinkInto(c, space) {
    const img = c.querySelector('img'); if (!img) return false;
    const ir = img.getBoundingClientRect(), need = c.getBoundingClientRect().height + 7.5 * MM - space;   // 7.5mm: the figure's margins
    const h = ir.height - need; if (need <= 0 || h < 0.75 * ir.height || h < 25 * MM) return false;
    img.style.width = (ir.width * h / ir.height) + 'px'; img.style.height = 'auto'; img.style.maxHeight = 'none'; return true; }

  // Fill one page. tops: floats at the head of the page; pending: floats still waiting for a later page.
  // Returns what is left of the flow.
  function fill(tops, flowIn, colQueue, pending = 0) {
    const P = newPage(tops), cols = P.cols, met = [], deferred = [], wait = [], seen = new Map();
    let waitLeft = 0;                                   // left edge of the column the waiting figures come after
    let strip = null, spliced = -1;                     // a picture with only a thin strip of page under it
    const waitAfter = new Map();                        // a waiting figure -> the block it came after
    const colBottom = () => cols.getBoundingClientRect().top + cols.clientHeight;
    const items = [...colQueue.map(el => ({ el, wasDeferred: true })), ...flowIn.map(el => ({ el }))];
    let k = 0, rest = null;
    for (; k < items.length; k++) {
      let { el } = items[k];
      if (isWide(el)) {
        if (tops.includes(el)) { met.push(el); continue; }
        if (!isPhoto(el) && !wait.length) {             // a graphic or table: across the columns, right after its text
          const c = el.cloneNode(true); cols.append(c);
          const fits = () => c.getBoundingClientRect().bottom <= colBottom() + 1 && !overflows(cols);
          if (fits()) {
            // No thin band of text (under ~4 lines a column) between two pictures, or between the page head and a
            // picture: the picture moves up over the band, which then follows it.
            const kids = [...cols.children], prevWide = kids.slice(0, -1).reverse().find(x => isWide(x)), from = prevWide ? kids.indexOf(prevWide) + 1 : 0;
            const band = kids.slice(from, -1);
            const rs = band.flatMap(x => [...x.getClientRects()]).filter(r => r.height > 0);
            const bandH = rs.length ? Math.max(...rs.map(r => r.bottom)) - Math.min(...rs.map(r => r.top)) : 0;
            if (band.length && band.every(x => x.tagName !== 'FIGURE' && !isWide(x)) && bandH < BAND_MIN) {
              cols.insertBefore(c, band[0]); if (!fits()) cols.append(c); }
            // A thin strip of text left under it at the foot of the page: unless the article ends in it, the text
            // goes on the next page instead (see after the loop).
            if (!strip && k + 1 < items.length && colBottom() - c.getBoundingClientRect().bottom < 0.8 * BAND_MIN) strip = { k, c };
            continue; }
          c.remove(); }
        // Else it floats (photos to the top of this page or the next, graphics to the next): one at a time. A
        // picture met while another waits prints at column width in the text; tables and code can't, they wait too.
        if (!pending && !met.some(m => !tops.includes(m)) || el.tagName !== 'FIGURE') { seen.set(el, k); met.push(el); continue; }
        el = items[k].el = asColumn(el);
      }
      if (wait.length && el.tagName === 'FIGURE') { wait.push(el); continue; }    // pictures keep their order
      let c = el.cloneNode(true); cols.append(c);
      if (c.tagName === 'FIGURE') {
        const prev = c.previousElementSibling, fr = c.getBoundingClientRect(), pr = prev && [...prev.getClientRects()].pop();
        const over = overflows(cols), gap = !!pr && fr.left > pr.left + 10 && colBottom() - pr.bottom > GAP_OK;
        if (!over && !gap) continue;
        // It doesn't fit below its text: a little smaller it may ...
        if (pr && pr.left < colRight(cols) && shrinkInto(c, colBottom() - pr.bottom) && !overflows(cols) && c.getBoundingClientRect().left <= pr.left + 10) continue;
        c.remove();
        // ... else it opens the next column while the text after it fills this one; from the last column, the next page.
        if (!over) { wait.push(el); waitAfter.set(el, prev); waitLeft = pr.left; continue; }
        seen.set(el, k); deferred.push(el); continue;
      }
      if (wait.length) {                                // the text reaches the next column: the waiting figures go in there
        const rs = [...c.getClientRects()].filter(r => r.height > 0), beyond = rs.filter(r => r.left > waitLeft + 10);
        if (beyond.length) {
          const figs = wait.splice(0).map(w => ({ w, f: w.cloneNode(true) }));
          let after = null;
          if (beyond.length < rs.length && c.matches('p:not(.pullquote)')) {
            after = splitText(c, cols, Math.min(...beyond.map(r => r.left)));
            if (!after) { const fresh = el.cloneNode(true); c.replaceWith(fresh); c = fresh; } }
          if (after) { c.after(...figs.map(x => x.f)); c = null; items.splice(k + 1, 0, { el: after }); spliced = k; }
          else c.before(...figs.map(x => x.f));
          for (const x of figs) if (x.f.getBoundingClientRect().left >= colRight(cols) - 1) { x.f.remove(); deferred.push(x.w); }
          if (!c) continue;
        }
      }
      if (!overflows(cols)) continue;
      if (splittable(c)) {
        const r = split(c, cols);
        // Code keeps its padding below the last line, which can still spill into a phantom column: move lines back until it fits.
        if (r && overflows(cols) && c.tagName === 'PRE') for (let t = 0; t < 12 && overflows(cols) && moveLastLine(c, r); t++);
        // Any other block whose first part still overflows: move the cut up until it fits.
        if (r && c.tagName !== 'UL' && c.tagName !== 'OL') for (let g = 0; g < 60 && overflows(cols); g++) { const r2 = splitText(c, cols); if (!r2) break;
          // The earlier cut may have hyphenated a word ("dec‐" | "ided"); now that both halves rejoin, drop that hyphen.
          const tw = document.createTreeWalker(r2, NodeFilter.SHOW_TEXT); let last = null, t; while ((t = tw.nextNode())) last = t;
          if (last && /‐\s*$/.test(last.textContent)) last.textContent = last.textContent.replace(/‐\s*$/, '');
          r.prepend(...r2.childNodes); }
        if (r && !overflows(cols)) { rest = r; k++; break; }
        c.remove(); if (!cols.children.length) { cols.append(el.cloneNode(true)); k++; break; }   // never leave a page empty
        break;
      }
      c.remove(); if (!cols.children.length) { cols.append(c); k++; } break;       // unsplittable block moves to the next page
    }
    // The page didn't end the article: what followed the picture with a thin strip under it goes to the next page.
    if (strip && (k < items.length || rest) && spliced < strip.k) {
      while (strip.c.nextSibling) strip.c.nextSibling.remove();
      const back = el => !seen.has(el) || seen.get(el) <= strip.k;
      met.splice(0, met.length, ...met.filter(back)); deferred.splice(0, deferred.length, ...deferred.filter(back));
      wait.length = 0; rest = null; k = strip.k + 1; }
    // Figures still waiting for a column: if the article ended on this page, back in their own place (the last page
    // is balanced, so no gap stays); else after the text if they fit, else on the next page.
    const ended = k >= items.length && !rest;
    for (const w of wait) { const f = w.cloneNode(true), at = waitAfter.get(w);
      if (ended && at && at.isConnected) at.after(f); else cols.append(f);
      if (overflows(cols) || f.getBoundingClientRect().bottom > colBottom() + 1) { f.remove(); deferred.push(w); } }
    // headings never end a page
    // and neither does a short label such as "HTML" or "CSS" whose code block went to the next page
    const next = () => rest || (items[k] && items[k].el);
    const isLabel = el => el.tagName === 'P' && el.textContent.trim().length <= 24 && next() && next().tagName === 'PRE';
    while (cols.lastElementChild && (isHeading(cols.lastElementChild) || (!rest && isLabel(cols.lastElementChild))) && (cols.children.length > 1 || P.top.children.length)) { cols.lastElementChild.remove(); k--; }
    const remainingItems = items.slice(k).map(x => x.el);
    const remaining = (rest ? [rest] : []).concat(remainingItems.filter(el => !colQueue.includes(el) || true));
    // items that came from colQueue but weren't consumed stay in front
    return { P, met, deferred, remaining: remaining.filter(el => !deferred.includes(el)), consumedAll: k >= items.length && !rest };
  }

  let floats = [], colQueue = [], first = true, guard = 0;
  while ((flow.length || floats.length || colQueue.length) && guard++ < 400) {
    const fixed = first && !cover ? [masthead, hero].filter(Boolean) : [];
    const fitFloats = (cands, budget, used = 0) => { const out = []; let h = used;
      for (const f of cands) { const probe = newPage([f]); const fh = probe.top.offsetHeight; probe.page.remove();
        if (h + fh <= (flow.length ? budget : 0.98 * H) || (!out.length && !used && !fixed.length && fh <= 0.9 * H)) { out.push(f); h += fh; } }
      return out; };
    const topsHeight = list => { if (!list.length) return 0; const probe = newPage(list); const h = probe.top.offsetHeight; probe.page.remove(); return h; };
    // Floats from the page before are overdue: they may take most of this page.
    let tops = fitFloats(floats, OVERDUE_BUDGET);
    if (!tops.length && floats.length && !fixed.length) tops = [floats[0]];   // oversize float: give it a page of its own
    const pend = () => floats.filter(f => !tops.includes(f)).length;
    const inFlow = flow, inQueue = colQueue;
    let res = fill([...fixed, ...tops], flow, colQueue, pend());
    // Photos met on this page: pull them to the top of this page if they fit, so they sit next to their text.
    // (Graphics never go above their text: they wait for the next page.)
    for (let pass = 0; pass < 2 && res.met.length; pass++) {
      const more = fitFloats(res.met.filter(f => isPhoto(f) && !tops.includes(f)), FLOAT_BUDGET, topsHeight(tops));
      if (!more.length) break;
      res.P.page.remove();
      const trial = fill([...fixed, ...tops, ...more], flow, colQueue, pend());
      const keep = more.filter(f => trial.met.includes(f) || trial.consumedAll);
      if (keep.length === more.length) { tops = [...tops, ...more]; res = trial; break; }
      trial.P.page.remove(); tops = [...tops, ...keep]; res = fill([...fixed, ...tops], flow, colQueue, pend());
    }
    const pendHere = pend();
    floats = [...floats.filter(f => !tops.includes(f)), ...res.met.filter(f => !tops.includes(f))];
    colQueue = res.deferred.concat(colQueue.filter(el => !res.P.cols.contains(el) && res.deferred.indexOf(el) < 0 && false));
    flow = res.remaining.filter(el => !colQueue.includes(el));
    // The text ends on this page with pictures still waiting: set them at the head of this page if the text still
    // fits there, rather than on a page after the end.
    if (!flow.length && !colQueue.length && floats.length) {
      const all = fitFloats([...tops, ...floats], 0.98 * H);
      if (all.length === tops.length + floats.length) {
        res.P.page.remove();
        const trial = fill([...fixed, ...all], inFlow, inQueue, 0);
        if (trial.consumedAll && !trial.deferred.length && trial.met.every(f => all.includes(f))) { res = trial; tops = all; floats = []; }
        else { trial.P.page.remove(); res = fill([...fixed, ...tops], inFlow, inQueue, pendHere); } }
    }
    first = false;
    if (!flow.length && !floats.length && !colQueue.length) {
      const cols = res.P.cols, h = cols.style.height; cols.classList.add('last'); cols.style.height = 'auto';
      // Balancing the last page can push a figure past the last column, off the page: then keep the normal fill,
      // and anything that still doesn't fit goes on a page of its own.
      const off = () => overflows(cols) || cols.getBoundingClientRect().bottom > res.P.page.getBoundingClientRect().bottom + 2;
      if (off()) { cols.classList.remove('last'); cols.style.height = h; }
      if (overflows(cols)) { const right = colRight(cols), spill = [...cols.children].filter(e => e.getBoundingClientRect().left >= right - 1);
        spill.forEach(e => e.remove());
        if (spill.length) { res = fill([], spill, []); res.P.cols.classList.add('last'); res.P.cols.style.height = 'auto'; } }
      if (source) res.P.page.append(source); }
  }
  // Safety net: anything that still sits past the last column of a page (a figure pushed out by a late reflow)
  // moves to the top of the next page, or to a new page after it, instead of being clipped away.
  for (let i = 0; i < book.children.length; i++) {
    const pg = book.children[i], c = pg.querySelector('.cols'); if (!c || !overflows(c)) continue;
    const right = colRight(c), spill = [...c.children].filter(e => e.getBoundingClientRect().left >= right - 1);
    spill.forEach(e => e.remove());
    // A block that straddles the page edge (a long notes list) is split there; its remainder moves on.
    const lastEl = c.lastElementChild;
    if (overflows(c) && lastEl && splittable(lastEl)) { const r = split(lastEl, c); if (r) spill.unshift(r); }
    if (!spill.length) continue;
    let nx = book.children[i + 1];
    if (!nx || !nx.querySelector('.cols')) { const P = newPage([]); nx = P.page; book.insertBefore(nx, book.children[i + 1] || null); P.cols.classList.add('last'); P.cols.style.height = 'auto';
      const src = pg.querySelector('footer.source'); if (src && i === book.children.length - 2) nx.append(src); }
    nx.querySelector('.cols').prepend(...spill);
  }
  // empty trailing page cleanup
  for (const p of [...book.children]) if (p.querySelector('.cols') && !p.querySelector('.cols').children.length && !p.querySelector('.tops').children.length) p.remove();
  // Placement report (measures layout changes; changes nothing on the page): for each picture, how far it prints
  // from the text block before it (its anchor), whether it comes after the end mark or is clipped by the page edge;
  // and how much of each page stays empty.
  const report = (() => {
    const pgs = [...book.children], end = book.querySelector('.endmark'), pageOf = el => pgs.indexOf(el.closest('.page'));
    const endSeq = end && end.closest('[data-seq]') ? +end.closest('[data-seq]').dataset.seq : Infinity;
    const isFig = el => el.matches('figure, table.wide, pre.wide');
    const bySeq = new Map(); for (const el of book.querySelectorAll('[data-seq]')) { const k = +el.dataset.seq; if (!bySeq.has(k)) bySeq.set(k, []); bySeq.get(k).push(el); }
    const seqs = [...bySeq.keys()].sort((a, b) => a - b), textAt = k => { const els = bySeq.get(k); return els && !isFig(els[0]) && els[0].textContent.trim() ? els : null; };
    const figs = [];
    for (const k of seqs) { const f = bySeq.get(k)[0]; if (!isFig(f) || f.classList.contains('hero')) continue;
      // anchor: where the text block before the picture ends (or, for a picture before any text, where the next one starts)
      let a = null; for (let j = seqs.indexOf(k) - 1; j >= 0 && !a; j--) { const t = textAt(seqs[j]); if (t) a = t[t.length - 1]; }
      if (!a) for (let j = seqs.indexOf(k) + 1; j < seqs.length && !a; j++) { const t = textAt(seqs[j]); if (t) a = t[0]; }
      const pf = pageOf(f), pa = a ? pageOf(a) : pf, pg = f.closest('.page'), c = pg.querySelector('.cols');
      // at the head of its page: a top float, or nothing printed before it in the page's columns
      const head = !c || !c.contains(f) || ![...c.children].some(x => x !== f && (x.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && x.textContent.trim());
      const fr = f.getBoundingClientRect(), pr = pg.getBoundingClientRect();
      figs.push({ seq: k, cls: f.className || f.tagName.toLowerCase(), page: pf + 1, pages: pf - pa, head,
        before: !!(a && (f.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)),     // printed before its text
        // printed after the end mark although the article has text after it (a picture last in the article may follow it)
        afterEnd: !!(end && end.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && k < endSeq,
        clipped: fr.bottom > pr.bottom + 2 || fr.right > pr.right + 2 }); }
    // Empty share of each page's text area (columns below their last line), last page apart.
    const empty = pgs.map(pg => { const c = pg.querySelector('.cols'); if (!c || !c.children.length) return pg.querySelector('.tops') && pg.querySelector('.tops').children.length ? 0 : 1;
      const n = parseInt(getComputedStyle(c).columnCount) || 1, cr = c.getBoundingClientRect(), bottoms = new Array(n).fill(cr.top);
      for (const ch of c.children) for (const r of ch.getClientRects()) { if (!r.height) continue; const i = Math.min(n - 1, Math.max(0, Math.floor((r.left - cr.left + 2) / (cr.width / n)))); bottoms[i] = Math.max(bottoms[i], r.bottom); }
      const pr = pg.getBoundingClientRect(), h = pr.bottom - cr.top; return +(bottoms.reduce((s, b) => s + Math.max(0, pr.bottom - b), 0) / (n * Math.max(1, h)) * (h / H)).toFixed(2); });
    return { figs, empty: empty.slice(0, -1), lastEmpty: empty[empty.length - 1] };
  })();
  // Reading progress on every page: how far through, and minutes of reading left (230 words a minute).
  const pages = [...book.children], wordsOf = el => (el.innerText || '').split(/\s+/).filter(Boolean).length;
  const per = pages.map(p => wordsOf(p)), total = per.reduce((a, b) => a + b, 0) || 1;
  let done = 0;
  pages.forEach((p, i) => { done += per[i]; const left = Math.round((total - done) / 230);
    const bar = document.createElement('div'); bar.className = 'progress'; bar.style.setProperty('--p', (100 * done / total).toFixed(1) + '%');
    bar.innerHTML = `<span class="left">${i === pages.length - 1 ? 'The end' : left < 1 ? 'Under a minute left' : left + ' min left'}</span><span class="of">${i + 1} / ${pages.length}</span>`;
    p.append(bar); });
  window.__paged = { pages: book.children.length, report };
}));
