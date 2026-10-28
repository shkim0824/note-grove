/* Note Grove · Markdown core.
 * Pure functions shared by the app and the tests (no DOM, no network).
 * Every parsed block keeps its original source (`raw`); a block that the user did not touch is written back
 * byte-for-byte, so saving one edited paragraph never rewrites the rest of the file. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NGMD = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const ASCII_PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const isAsciiPunct = c => !!c && ASCII_PUNCT.includes(c);
const UNI_PUNCT = /[\p{P}\p{S}]/u;
const isPunct = c => !!c && UNI_PUNCT.test(c);
const isWs = c => !c || /\s/.test(c);
const isAlnum = c => !!c && /[\p{L}\p{N}]/u.test(c);
let seq = 0;
const newId = () => 'b' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/* ---------------------------------------------------------------- inline: parse */
const NAMED = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—', ndash: '–', times: '×', minus: '−', larr: '←', rarr: '→', copy: '©'};
function decodeEntity(body) {
  if (body[0] === '#') {
    const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return null;
    try { return String.fromCodePoint(cp); } catch { return null; }
  }
  return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : null;
}
const decodeEntities = s => s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (m, b) => decodeEntity(b) ?? m);

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 's', 'del', 'strike', 'kbd', 'sub', 'sup', 'a', 'br', 'code']);
const TAG_TYPE = {b: 'strong', strong: 'strong', i: 'em', em: 'em', s: 's', del: 's', strike: 's', kbd: 'kbd', sub: 'sub', sup: 'sup', a: 'link'};
const HTML_TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_.:]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/;
function parseAttrs(s) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_.:]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s || ''))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function runLength(s, i, ch) { let n = 0; while (s[i + n] === ch) n++; return n; }

/* Scan a link `[text](dest "title")` starting at src[i] === '['. */
function parseLinkAt(src, i) {
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '`') {
      const n = runLength(src, j, '`');
      let k = j + n, close = -1;
      while (k < src.length) { if (src[k] === '`') { const m = runLength(src, k, '`'); if (m === n) { close = k; break; } k += m; } else k++; }
      if (close >= 0) { j = close + n - 1; continue; }
      j += n - 1; continue;
    }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) break; }
  }
  if (j >= src.length || src[j + 1] !== '(') return null;
  const text = src.slice(i + 1, j);
  let k = j + 2;
  while (src[k] === ' ' || src[k] === '\t') k++;
  let dest = '';
  if (src[k] === '<') {
    const close = src.indexOf('>', k + 1);
    if (close < 0 || src.slice(k + 1, close).includes('\n')) return null;
    dest = src.slice(k + 1, close); k = close + 1;
  } else {
    let paren = 0;
    const st = k;
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === '\\' && isAsciiPunct(src[k + 1])) { k++; continue; }
      if (/\s/.test(c)) break;
      if (c === '(') paren++;
      else if (c === ')') { if (paren === 0) break; paren--; }
    }
    dest = src.slice(st, k);
  }
  while (src[k] === ' ' || src[k] === '\t' || src[k] === '\n') k++;
  let title = null;
  if (src[k] === '"' || src[k] === "'" || src[k] === '(') {
    const closeCh = src[k] === '(' ? ')' : src[k];
    let e = k + 1;
    for (; e < src.length; e++) { if (src[e] === '\\') { e++; continue; } if (src[e] === closeCh) break; }
    if (e >= src.length) return null;
    title = src.slice(k + 1, e); k = e + 1;
    while (src[k] === ' ' || src[k] === '\t' || src[k] === '\n') k++;
  }
  if (src[k] !== ')') return null;
  return {text, dest: unescapeMd(dest), title: title == null ? null : unescapeMd(title), end: k + 1};
}
const unescapeMd = s => decodeEntities(s.replace(/\\([!-/:-@[-`{-~])/g, '$1'));

function tokenize(src) {
  const out = [];
  let buf = '', i = 0;
  const flush = () => { if (buf) { out.push({t: 'text', v: buf}); buf = ''; } };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const nx = src[i + 1];
      if (nx === '\n') { flush(); out.push({t: 'br'}); i += 2; while (src[i] === ' ') i++; continue; }
      if (isAsciiPunct(nx)) { buf += nx; i += 2; continue; }
      buf += c; i++; continue;
    }
    if (c === '`') {
      const n = runLength(src, i, '`');
      let j = i + n, found = -1;
      while (j < src.length) {
        if (src[j] === '`') { const m = runLength(src, j, '`'); if (m === n) { found = j; break; } j += m; } else j++;
      }
      if (found >= 0) {
        flush();
        let code = src.slice(i + n, found).replace(/\n/g, ' ');
        if (code.length >= 2 && code[0] === ' ' && code[code.length - 1] === ' ' && code.trim() !== '') code = code.slice(1, -1);
        out.push({t: 'code', v: code});
        i = found + n; continue;
      }
      buf += '`'.repeat(n); i += n; continue;
    }
    if (c === '*' || c === '_' || c === '~') {
      const n = runLength(src, i, c);
      if (c === '~' && n !== 2) { buf += c.repeat(n); i += n; continue; }
      flush();
      const before = i > 0 ? src[i - 1] : '', after = src[i + n] || '';
      const lf = !isWs(after) && (!isPunct(after) || isWs(before) || isPunct(before));
      const rf = !isWs(before) && (!isPunct(before) || isWs(after) || isPunct(after));
      let canOpen = lf, canClose = rf;
      if (c === '_') { canOpen = lf && (!rf || isPunct(before)); canClose = rf && (!lf || isPunct(after)); }
      out.push({t: 'delim', ch: c, n, orig: n, canOpen, canClose});
      i += n; continue;
    }
    if (c === '!' && src[i + 1] === '[') {
      const r = parseLinkAt(src, i + 1);
      if (r) { flush(); out.push({t: 'img', src: r.dest, alt: plainText(parseInline(r.text)), title: r.title}); i = r.end; continue; }
      buf += c; i++; continue;
    }
    if (c === '[') {
      const r = parseLinkAt(src, i);
      if (r) { flush(); out.push({t: 'link', href: r.dest, title: r.title, c: parseInline(r.text)}); i = r.end; continue; }
      buf += c; i++; continue;
    }
    if (c === '<') {
      const rest = src.slice(i);
      let m = /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/.exec(rest);
      if (m) { flush(); out.push({t: 'link', href: m[1], c: [{t: 'text', v: m[1]}], auto: true}); i += m[0].length; continue; }
      m = HTML_TAG.exec(rest);
      if (m && INLINE_TAGS.has(m[2].toLowerCase())) {
        const tag = m[2].toLowerCase();
        if (tag === 'br') { flush(); out.push({t: 'br', html: true}); i += m[0].length; continue; }
        if (tag === 'code') {
          if (!m[1]) {
            const close = src.toLowerCase().indexOf('</code>', i + m[0].length);
            if (close >= 0) { flush(); out.push({t: 'code', v: decodeEntities(src.slice(i + m[0].length, close)), html: true}); i = close + 7; continue; }
          }
        } else {
          flush();
          out.push({t: m[1] ? 'hclose' : 'hopen', tag, attrs: parseAttrs(m[3]), raw: m[0]});
          i += m[0].length; continue;
        }
      }
      buf += c; i++; continue;
    }
    if (c === '&') {
      const m = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(src.slice(i));
      if (m) { const d = decodeEntity(m[1]); if (d !== null) { buf += d; i += m[0].length; continue; } }
      buf += c; i++; continue;
    }
    if (c === '\n') {
      const hard = /( {2,})$/.exec(buf);
      if (hard) { buf = buf.slice(0, -hard[1].length); flush(); out.push({t: 'br'}); }
      else { buf = buf.replace(/ +$/, ''); flush(); out.push({t: 'soft'}); }
      i++;
      while (src[i] === ' ' || src[i] === '\t') i++;
      continue;
    }
    buf += c; i++;
  }
  flush();
  return out;
}

function pairHtml(list) {
  const stack = [];
  for (let k = 0; k < list.length; k++) {
    const tk = list[k];
    if (tk.t === 'hopen') stack.push(k);
    else if (tk.t === 'hclose') {
      let s = stack.length - 1;
      while (s >= 0 && list[stack[s]].tag !== tk.tag && TAG_TYPE[list[stack[s]].tag] !== TAG_TYPE[tk.tag]) s--;
      if (s < 0) continue;
      const openIdx = stack[s];
      stack.length = s;
      const open = list[openIdx];
      const inner = list.slice(openIdx + 1, k);
      const type = TAG_TYPE[open.tag];
      const node = type === 'link' ? {t: 'link', href: open.attrs.href || '', c: inner, html: true} : {t: type, c: inner, html: true};
      list.splice(openIdx, k - openIdx + 1, node);
      k = openIdx;
    }
  }
  for (let k = 0; k < list.length; k++) if (list[k].t === 'hopen' || list[k].t === 'hclose') list[k] = {t: 'text', v: list[k].raw};
  return list;
}

function processEmphasis(list) {
  for (let ci = 0; ci < list.length; ci++) {
    const closer = list[ci];
    if (closer.t !== 'delim' || !closer.canClose || closer.n === 0) continue;
    let found = -1;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const op = list[oi];
      if (op.t !== 'delim' || op.ch !== closer.ch || !op.canOpen || op.n === 0) continue;
      if (closer.ch === '~') { if (op.n === closer.n) { found = oi; break; } continue; }
      if ((op.canClose || closer.canOpen) && (op.orig + closer.orig) % 3 === 0 && !(op.orig % 3 === 0 && closer.orig % 3 === 0)) continue;
      found = oi; break;
    }
    if (found < 0) continue;
    const op = list[found];
    const use = closer.ch === '~' ? 2 : (op.n >= 2 && closer.n >= 2 ? 2 : 1);
    const type = closer.ch === '~' ? 's' : (use === 2 ? 'strong' : 'em');
    const node = {t: type, c: list.slice(found + 1, ci), mark: closer.ch};
    op.n -= use; closer.n -= use;
    list.splice(found + 1, ci - found - 1, node);
    ci = found + 1;
  }
  return list;
}

function finishInline(list) {
  const out = [];
  for (const nd of list) {
    if (nd.t === 'delim') { if (nd.n > 0) out.push({t: 'text', v: nd.ch.repeat(nd.n)}); continue; }
    if (nd.c) nd.c = finishInline(nd.c);
    out.push(nd);
  }
  return mergeText(out);
}
function mergeText(list) {
  const out = [];
  for (const nd of list) {
    if (nd.t === 'text') { if (!nd.v) continue; const last = out[out.length - 1]; if (last && last.t === 'text') { last.v += nd.v; continue; } }
    out.push(nd);
  }
  return out;
}
function parseInline(src) {
  if (!src) return [];
  return finishInline(processEmphasis(pairHtml(tokenize(String(src)))));
}

function plainText(nodes) {
  let s = '';
  for (const nd of nodes || []) {
    if (nd.t === 'text' || nd.t === 'code') s += nd.v;
    else if (nd.t === 'soft') s += ' ';
    else if (nd.t === 'br') s += '\n';
    else if (nd.t === 'img') s += nd.alt || '';
    else if (nd.c) s += plainText(nd.c);
  }
  return s;
}

/* ---------------------------------------------------------------- inline: normalize & serialize */
const FORMAT = new Set(['strong', 'em', 's', 'kbd', 'sub', 'sup']);
function normalizeInline(list) {
  let out = [];
  for (let nd of list || []) {
    if (nd.c) nd = {...nd, c: normalizeInline(nd.c)};
    if (FORMAT.has(nd.t) || nd.t === 'link') {
      if (!nd.c.length) continue;
      if (FORMAT.has(nd.t) && nd.t !== 'kbd') {
        // Markdown emphasis cannot start or end with a space: move edge spaces outside the node.
        const first = nd.c[0], last = nd.c[nd.c.length - 1];
        let lead = '', trail = '';
        if (first.t === 'text') { const m = /^\s+/.exec(first.v); if (m) { lead = m[0]; nd.c = [{t: 'text', v: first.v.slice(lead.length)}, ...nd.c.slice(1)]; } }
        const l2 = nd.c[nd.c.length - 1];
        if (l2 && l2.t === 'text') { const m = /\s+$/.exec(l2.v); if (m) { trail = m[0]; nd.c = [...nd.c.slice(0, -1), {t: 'text', v: l2.v.slice(0, -trail.length)}]; } }
        nd.c = mergeText(nd.c);
        if (lead) out.push({t: 'text', v: lead});
        if (nd.c.length) out.push(nd);
        if (trail) out.push({t: 'text', v: trail});
        continue;
      }
    }
    if (nd.t === 'code' && !nd.v) continue;
    const prev = out[out.length - 1];
    if (prev && FORMAT.has(nd.t) && prev.t === nd.t) { prev.c = normalizeInline([...prev.c, ...nd.c]); continue; }
    if (prev && nd.t === 'link' && prev.t === 'link' && prev.href === nd.href && !prev.auto && !nd.auto) { prev.c = normalizeInline([...prev.c, ...nd.c]); continue; }
    if (prev && nd.t === 'code' && prev.t === 'code') { prev.v += nd.v; continue; }
    out.push(nd);
  }
  out = mergeText(out);
  return out;
}

const firstChar = nd => {
  if (!nd) return '';
  if (nd.t === 'text') return nd.v[0] || '';
  if (nd.t === 'code') return '`';
  if (nd.t === 'link' || nd.t === 'img') return '[';
  if (nd.t === 'br') return '<';
  if (nd.c && nd.c.length) return firstChar(nd.c[0]);
  return '';
};

function escapeText(v, ctx, prev, next) {
  if (ctx === 'html') return v.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  let s = '';
  for (let k = 0; k < v.length; k++) {
    const c = v[k], p = k ? v[k - 1] : prev, n = k + 1 < v.length ? v[k + 1] : next;
    if (c === '\\') { s += isAsciiPunct(n) || !n ? '\\\\' : c; continue; }
    if (c === '*' || c === '`') { s += '\\' + c; continue; }
    if (c === '_') { s += (isAlnum(p) && isAlnum(n)) ? c : '\\_'; continue; }
    if (c === '~') { s += (isWs(p) && isWs(n)) ? c : '\\~'; continue; }
    if (c === ']' && (n === '(' || n === '[')) { s += '\\]'; continue; }
    if (c === '<' && n && /[A-Za-z/!?]/.test(n)) { s += '\\<'; continue; }
    if (c === '&' && /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.test(v.slice(k) + (next || ''))) { s += '\\&'; continue; }
    if (c === '!' && n === '[') { s += '\\!'; continue; }
    s += c;
  }
  return s;
}

function fenceFor(code) {
  let max = 0;
  for (const m of code.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  const f = '`'.repeat(max + 1);
  const pad = code[0] === '`' || code[code.length - 1] === '`' || (code[0] === ' ' && code[code.length - 1] === ' ' && code.trim() !== '') ? ' ' : '';
  return [f, pad];
}

function lastChar(s) { return s ? s[s.length - 1] : ''; }
function nodeMd(nd, ctx, prev, next) {
  switch (nd.t) {
    case 'text': return escapeText(nd.v, ctx, prev, next);
    case 'soft': return '\n';
    case 'br': return '<br>';
    case 'code': {
      if (ctx === 'html' || nd.html && ctx === 'html') return '<code>' + escHtml(nd.v).replace(/&#39;/g, "'").replace(/&quot;/g, '"') + '</code>';
      const [f, pad] = fenceFor(nd.v);
      return f + pad + nd.v + pad + f;
    }
    case 'kbd': return '<kbd>' + escHtml(plainText(nd.c)).replace(/&#39;/g, "'").replace(/&quot;/g, '"') + '</kbd>';
    case 'sub': case 'sup': return `<${nd.t}>` + inlineToMd(nd.c, ctx === 'html' ? 'html' : 'md') + `</${nd.t}>`;
    case 'img': return '![' + escapeText(nd.alt || '', 'md', '', '') + '](' + destMd(nd.src) + (nd.title ? ' "' + nd.title.replace(/"/g, '\\"') + '"' : '') + ')';
    case 'link': {
      if (ctx === 'html') return '<a href="' + escHtml(nd.href) + '">' + inlineToMd(nd.c, 'html') + '</a>';
      if (nd.auto && plainText(nd.c) === nd.href) return '<' + nd.href + '>';
      return '[' + inlineToMd(nd.c, ctx === 'table' ? 'table' : 'md') + '](' + destMd(nd.href) + (nd.title ? ' "' + nd.title.replace(/"/g, '\\"') + '"' : '') + ')';
    }
    case 'strong': case 'em': case 's': {
      const inner = inlineToMd(nd.c, ctx);
      const htmlTag = {strong: 'b', em: 'i', s: 's'}[nd.t];
      if (ctx === 'html') return `<${htmlTag}>${inner}</${htmlTag}>`;
      const mark = nd.t === 'strong' ? '**' : nd.t === 'em' ? '*' : '~~';
      const a = inner[0], z = inner[inner.length - 1];
      const leftOk = !isWs(a) && (!isPunct(a) || isWs(prev) || isPunct(prev));
      const rightOk = !isWs(z) && (!isPunct(z) || isWs(next) || isPunct(next));
      if (leftOk && rightOk) return mark + inner + mark;
      return `<${htmlTag}>${inner}</${htmlTag}>`;
    }
    default: return '';
  }
}
function destMd(href) {
  const h = String(href || '');
  if (!h || /[\s<>]/.test(h) || /[()]/.test(h) && !balancedParens(h)) return '<' + h.replace(/[<>]/g, c => '\\' + c) + '>';
  return h.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\');
}
function balancedParens(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false; } } return d === 0; }

function inlineToMd(nodes, ctx = 'md') {
  let out = '';
  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k];
    out += nodeMd(nd, ctx, lastChar(out), firstChar(nodes[k + 1]));
  }
  return out;
}

/* Escape characters that would turn the start of a block's text into another block type. */
function escapeBlockStart(md, type) {
  let s = md.replace(/^[ \t]+/, '');
  if (/^#{1,6}(\s|$)/.test(s) || /^[-+](\s|$)/.test(s) || /^>/.test(s) || /^(=+|-{2,})\s*$/.test(s)) return '\\' + s;
  if (/^\d{1,9}[.)](\s|$)/.test(s)) return s.replace(/^(\d+)([.)])/, '$1\\$2');
  if ((type === 'bullet' || type === 'number') && /^\[[ xX]\](\s|$)/.test(s)) return '\\' + s;
  return s;
}

/* ---------------------------------------------------------------- inline: HTML for the editor */
const SAFE_HREF = /^(https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;
function inlineToHtml(nodes) {
  let s = '';
  for (const nd of nodes || []) {
    switch (nd.t) {
      case 'text': s += escHtml(nd.v); break;
      case 'soft': s += ' '; break;
      case 'br': s += '<br>'; break;
      case 'code': s += '<code>' + escHtml(nd.v) + '</code>'; break;
      case 'strong': s += '<strong>' + inlineToHtml(nd.c) + '</strong>'; break;
      case 'em': s += '<em>' + inlineToHtml(nd.c) + '</em>'; break;
      case 's': s += '<s>' + inlineToHtml(nd.c) + '</s>'; break;
      case 'kbd': s += '<kbd>' + inlineToHtml(nd.c) + '</kbd>'; break;
      case 'sub': case 'sup': s += `<${nd.t}>` + inlineToHtml(nd.c) + `</${nd.t}>`; break;
      case 'img': s += '<span class="ng-iimg" contenteditable="false" data-src="' + escHtml(nd.src) + '" data-alt="' + escHtml(nd.alt || '') + '">🖼 ' + escHtml(nd.alt || nd.src) + '</span>'; break;
      case 'link': {
        const href = SAFE_HREF.test(nd.href) ? nd.href : '#';
        s += '<a href="' + escHtml(href) + '" data-href="' + escHtml(nd.href) + '"' + (nd.auto ? ' data-auto="1"' : '') + (nd.title ? ' title="' + escHtml(nd.title) + '"' : '') + '>' + inlineToHtml(nd.c) + '</a>';
        break;
      }
    }
  }
  return s;
}

/* ---------------------------------------------------------------- blocks: parse */
const RE = {
  blank: /^[ \t]*$/,
  fence: /^( {0,3})(`{3,}|~{3,})(.*)$/,
  atx: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/,
  quote: /^ {0,3}>/,
  bullet: /^( {0,3})([-+*])([ \t]+|$)(.*)$/,
  ordered: /^( {0,3})(\d{1,9})([.)])([ \t]+|$)(.*)$/,
  details: /^ {0,3}<details(?:\s[^>]*)?>/i,
  htmlBlock: /^ {0,3}<(?:\/?(?:address|article|aside|blockquote|body|center|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul|summary|details)(?:\s|\/?>|$)|!--)/i,
  setext: /^ {0,3}(=+|-+)[ \t]*$/,
  sepCell: /^:?-+:?$/,
  alert: /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i,
  image: /^!\[[^\]]*\]\([^)]*\)$/,
};
const expandTabs = l => l.replace(/^\t+/, t => '    '.repeat(t.length));
const indentOf = l => /^ */.exec(l)[0].length;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') { cur += '\\|'; k++; continue; }
    if (c === '|') { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}
function isTableStart(lines, i) {
  const line = lines[i], next = lines[i + 1];
  if (!line || next == null || !line.includes('|')) return false;
  if (!/^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(next) || !/-/.test(next)) return false;
  const head = splitRow(line), sep = splitRow(next);
  return head.length === sep.length && sep.every(c => RE.sepCell.test(c));
}
function startsList(line, interruptingParagraph) {
  let m = RE.bullet.exec(line);
  if (m) return !(interruptingParagraph && !m[4].trim());
  m = RE.ordered.exec(line);
  if (m) return !(interruptingParagraph && (m[2] !== '1' || !m[5].trim()));
  return false;
}
function interruptsParagraph(lines, i) {
  const l = lines[i];
  return RE.fence.test(l) || RE.atx.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.details.test(l) || RE.htmlBlock.test(l)
    || startsList(l, true) || isTableStart(lines, i);
}

function parseBlocks(lines) {
  const out = [];
  let i = 0, blank = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (RE.blank.test(line)) { blank++; i++; continue; }
    const start = i;
    let r;
    if (RE.fence.test(line) && !(RE.fence.exec(line)[2][0] === '`' && RE.fence.exec(line)[3].includes('`'))) r = parseFence(lines, i);
    else if (RE.atx.test(line)) r = {b: parseAtx(line), i: i + 1};
    else if (RE.hr.test(line)) r = {b: {type: 'hr'}, i: i + 1};
    else if (RE.quote.test(line)) r = parseQuote(lines, i);
    else if (RE.details.test(line)) r = parseDetails(lines, i);
    else if (RE.bullet.test(line) || RE.ordered.test(line)) r = parseListItem(lines, i);
    else if (isTableStart(lines, i)) r = parseTable(lines, i);
    else if (RE.htmlBlock.test(line)) r = parseRawUntilBlank(lines, i);
    else r = parseParagraph(lines, i);
    const b = r.b;
    i = r.i;
    b.id = newId();
    b.raw = lines.slice(start, i).join('\n');
    b.before = blank;
    b.origPrev = out.length ? out[out.length - 1].id : null;
    blank = 0;
    out.push(b);
  }
  return out;
}

function parseAtx(line) {
  const m = RE.atx.exec(line);
  return {type: 'h', level: m[1].length, text: (m[2] || '').trim()};
}
function parseFence(lines, i) {
  const m = RE.fence.exec(lines[i]);
  const ind = m[1].length, fence = m[2], info = m[3].trim();
  const body = [];
  let k = i + 1, closed = false;
  for (; k < lines.length; k++) {
    const cm = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[k]);
    if (cm && cm[1][0] === fence[0] && cm[1].length >= fence.length) { closed = true; break; }
    let l = lines[k], strip = 0;
    while (strip < ind && l[strip] === ' ') strip++;
    body.push(l.slice(strip));
  }
  const lang = info.split(/\s+/)[0] || '';
  const b = {type: lang.toLowerCase() === 'mermaid' ? 'mermaid' : 'code', lang, info, code: body.join('\n'), fence};
  return {b, i: closed ? k + 1 : k};
}
function parseParagraph(lines, i) {
  const buf = [lines[i]];
  let k = i + 1;
  for (; k < lines.length; k++) {
    const l = lines[k];
    if (RE.blank.test(l)) break;
    const se = RE.setext.exec(l);
    if (se) {
      const text = buf.map(s => s.replace(/^[ \t]+/, '')).join('\n').replace(/[ \t]+$/, '');
      return {b: {type: 'h', level: se[1][0] === '=' ? 1 : 2, text, setext: true}, i: k + 1};
    }
    if (interruptsParagraph(lines, k)) break;
    buf.push(l);
  }
  const text = buf.map(s => s.replace(/^[ \t]+/, '')).join('\n').replace(/[ \t]+$/, '');
  if (RE.image.test(text)) {
    const nodes = parseInline(text);
    if (nodes.length === 1 && nodes[0].t === 'img') return {b: {type: 'image', src: nodes[0].src, alt: nodes[0].alt, title: nodes[0].title}, i: k};
  }
  return {b: {type: 'p', text}, i: k};
}
function parseQuote(lines, i) {
  const inner = [];
  let k = i;
  for (; k < lines.length; k++) {
    const l = lines[k];
    const m = /^ {0,3}>(.*)$/.exec(l);
    if (m) { inner.push(m[1].startsWith(' ') ? m[1].slice(1) : m[1]); continue; }
    if (RE.blank.test(l)) break;
    const last = inner[inner.length - 1];
    if (last != null && !RE.blank.test(last) && !interruptsParagraph(lines, k) && !RE.fence.test(last)) { inner.push(l); continue; }
    break;
  }
  const am = inner.length ? RE.alert.exec(inner[0]) : null;
  if (am) {
    const kids = parseBlocks(inner.slice(1));
    return {b: {type: 'callout', kind: am[1].toUpperCase(), children: kids}, i: k};
  }
  return {b: {type: 'quote', children: parseBlocks(inner)}, i: k};
}
function parseDetails(lines, i) {
  const first = lines[i];
  const open = /<details[^>]*\sopen\b/i.test(first);
  let j = i;
  let s = first.replace(/^ {0,3}<details(?:\s[^>]*)?>/i, '');
  if (!s.trim()) { j = i + 1; while (j < lines.length && RE.blank.test(lines[j])) j++; s = j < lines.length ? lines[j] : ''; }
  const sm = /^\s*<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>\s*$/i.exec(s);
  if (!sm) return parseRawUntilBlank(lines, i);
  let depth = 1, k = j + 1, fence = null;
  const body = [];
  for (; k < lines.length; k++) {
    const l = lines[k];
    if (fence) {
      const cm = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(l);
      if (cm && cm[1][0] === fence[0] && cm[1].length >= fence.length) fence = null;
      body.push(l); continue;
    }
    const fm = RE.fence.exec(l);
    if (fm) { fence = fm[2]; body.push(l); continue; }
    if (RE.details.test(l)) depth++;
    if (/^ {0,3}<\/details>\s*$/i.test(l)) { depth--; if (depth === 0) break; }
    body.push(l);
  }
  if (k >= lines.length) return parseRawUntilBlank(lines, i);
  let tail = 0;
  while (body.length && RE.blank.test(body[body.length - 1])) { body.pop(); tail++; }
  const kids = parseBlocks(body);
  return {b: {type: 'toggle', text: sm[1].trim(), open, children: kids, tail}, i: k + 1};
}
function parseRawUntilBlank(lines, i) {
  let k = i;
  while (k < lines.length && !RE.blank.test(lines[k])) k++;
  return {b: {type: 'raw', md: lines.slice(i, k).join('\n')}, i: k};
}
function parseTable(lines, i) {
  const head = splitRow(lines[i]);
  const sepLine = lines[i + 1];
  const align = splitRow(sepLine).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null);
  const rows = [head], rowRaw = [lines[i]];
  let k = i + 2;
  for (; k < lines.length; k++) {
    const l = lines[k];
    if (RE.blank.test(l) || RE.fence.test(l) || RE.atx.test(l) || RE.quote.test(l) || RE.details.test(l) || RE.htmlBlock.test(l) || startsList(l, false) || RE.hr.test(l)) break;
    const cells = splitRow(l);
    while (cells.length < head.length) cells.push('');
    rows.push(cells.slice(0, head.length));
    rowRaw.push(l);
  }
  const unpipe = c => c.replace(/\\\|/g, '|');
  return {b: {type: 'table', rows: rows.map(r => r.map(unpipe)), align, sep: sepLine, rowRaw, rowDirty: rows.map(() => false)}, i: k};
}
function parseListItem(lines, i) {
  const line = lines[i];
  let m = RE.bullet.exec(line), ordered = false;
  if (!m) { m = RE.ordered.exec(line); ordered = true; }
  const ind = m[1].length;
  const marker = ordered ? m[2] + m[3] : m[2];
  const spaces = ordered ? m[4] : m[3];
  const first = ordered ? m[5] : m[4];
  let pad = spaces.length;
  if (!first.trim()) pad = 1;
  else if (pad > 4) pad = 1;
  const col = ind + marker.length + pad;
  const body = [first.slice(Math.max(0, (spaces.length - pad)))];
  let k = i + 1, inPara = !!first.trim();
  while (k < lines.length) {
    const l = lines[k];
    if (RE.blank.test(l)) {
      let e = k;
      while (e < lines.length && RE.blank.test(lines[e])) e++;
      if (e < lines.length && indentOf(lines[e]) >= col) { for (let t = k; t < e; t++) body.push(''); k = e; inPara = false; continue; }
      break;
    }
    if (indentOf(l) >= col) { body.push(l.slice(col)); k++; inPara = inPara && !interruptsParagraph([l.slice(col)], 0); continue; }
    if (inPara && !interruptsParagraph(lines, k) && !RE.bullet.test(l) && !RE.ordered.test(l)) { body.push(l.replace(/^[ \t]+/, '')); k++; continue; }
    break;
  }
  // first paragraph = the item's text; the rest are child blocks
  let p = 0;
  const textLines = [];
  if (body[0].trim()) {
    textLines.push(body[0]);
    p = 1;
    while (p < body.length && !RE.blank.test(body[p]) && !interruptsParagraph(body, p)) { textLines.push(body[p]); p++; }
  } else p = 1;
  let gap = 0;
  while (p < body.length && RE.blank.test(body[p])) { gap++; p++; }
  const children = parseBlocks(body.slice(p));
  if (children.length) children[0].before = gap;
  let text = textLines.map(s => s.replace(/^[ \t]+/, '')).join('\n').replace(/[ \t]+$/, '');
  const b = {children, ind, pad};
  if (ordered) Object.assign(b, {type: 'number', num: parseInt(m[2], 10), delim: m[3]});
  else {
    b.bullet = m[2];
    const tm = /^\[([ xX])\](?:[ \t]+|$)/.exec(text);
    if (tm) { b.type = 'todo'; b.checked = tm[1] !== ' '; text = text.slice(tm[0].length); }
    else b.type = 'bullet';
  }
  b.text = text;
  return {b, i: k};
}

/* ---------------------------------------------------------------- blocks: serialize */
const isItem = b => b.type === 'bullet' || b.type === 'number' || b.type === 'todo';
const listKind = b => b.type === 'number' ? 'n' + (b.delim || '.') : 'b' + (b.bullet || '-');
function minGap(prev, b) {
  if (isItem(prev) && isItem(b)) return listKind(prev) === listKind(b) ? 0 : 1;
  if (['table', 'raw', 'toggle', 'quote', 'callout'].includes(prev.type)) return 1;
  if (isItem(prev)) return 1;
  if ((b.type === 'p' || b.type === 'image') && (prev.type === 'p' || prev.type === 'image')) return 1;
  if (b.type === 'table' && (prev.type === 'p' || prev.type === 'image')) return 1;
  if (b.type === 'number' && (prev.type === 'p' || prev.type === 'image') && (b.num ?? 1) !== 1) return 1;
  if (b.type === 'h' && b.setext) return 1;
  return 0;
}
const defaultGap = (prev, b) => (isItem(prev) && isItem(b) && listKind(prev) === listKind(b)) ? 0 : 1;
const indentLines = (s, pfx) => s.split('\n').map(l => l ? pfx + l : '').join('\n');
const quoteLines = s => s.split('\n').map(l => l ? '> ' + l : '>').join('\n');

function serializeSeq(blocks, opts = {}) {
  const out = [];
  let prev = null, num = 0;
  blocks.forEach((b, idx) => {
    let n = null;
    if (b.type === 'number') { n = prev && prev.type === 'number' && (prev.delim || '.') === (b.delim || '.') ? num + 1 : (b.num ?? 1); num = n; }
    if (prev) {
      const keep = !prev.dirty && !b.dirty && b.origPrev === prev.id && b.before != null;
      const gap = keep ? b.before : Math.max(b.before ?? defaultGap(prev, b), minGap(prev, b));
      for (let g = 0; g < gap; g++) out.push('');
    } else if (idx === 0 && opts.leading) {
      for (let g = 0; g < (b.before || 0); g++) out.push('');
    }
    out.push(blockText(b, n));
    prev = b;
  });
  return out.join('\n');
}

function blockText(b, num) {
  if (!b.dirty && b.raw != null && (b.type !== 'number' || num === b.num)) return b.raw;
  switch (b.type) {
    case 'p': return b.text;
    case 'h': return b.setext ? b.text + '\n' + (b.level === 1 ? '===' : '---') : '#'.repeat(b.level || 1) + (b.text ? ' ' + b.text : '');
    case 'bullet': case 'todo': case 'number': {
      const marker = b.type === 'number' ? (num ?? b.num ?? 1) + (b.delim || '.') : (b.bullet || '-');
      const pad = ' ';
      const ind = ' '.repeat(marker.length + 1);
      const text = (b.type === 'todo' ? '[' + (b.checked ? 'x' : ' ') + '] ' : '') + (b.text || '');
      let s = marker + (text ? pad + text.replace(/\n/g, '\n' + ind) : (b.type === 'todo' ? pad : ''));
      if (b.children && b.children.length) {
        const c0 = b.children[0];
        const keep = !b.dirty && c0.before != null;
        const firstGap = Math.max(c0.before ?? (isItem(c0) ? 0 : 1), (c0.type === 'p' || c0.type === 'table' || c0.type === 'image') && (text || '').trim() ? 1 : 0);
        s += '\n'.repeat((keep ? c0.before : firstGap) + 1) + indentLines(serializeSeq(b.children), ind);
      }
      return s;
    }
    case 'quote': return quoteLines(serializeSeq(b.children || []));
    case 'callout': {
      const kids = b.children || [];
      const head = '[!' + (b.kind || 'NOTE') + ']';
      if (!kids.length) return quoteLines(head);
      return quoteLines(head + '\n'.repeat((kids[0].before || 0) + 1) + serializeSeq(kids));
    }
    case 'toggle': {
      const kids = b.children || [];
      const body = kids.length ? serializeSeq(kids) + '\n\n' : '';
      return '<details' + (b.open ? ' open' : '') + '>\n<summary>' + (b.text || '') + '</summary>\n\n' + body + '</details>';
    }
    case 'code': case 'mermaid': {
      const code = b.code || '';
      let max = 2;
      for (const m of code.matchAll(/^ {0,3}(`{3,})/gm)) max = Math.max(max, m[1].length);
      const fence = '`'.repeat(Math.max(3, max + 1));
      const info = b.type === 'mermaid' ? 'mermaid' : (b.lang || '');
      return fence + info + '\n' + (code ? code + '\n' : '') + fence;
    }
    case 'table': return tableText(b);
    case 'hr': return '---';
    case 'image': return '![' + escapeText(b.alt || '', 'md', '', '') + '](' + destMd(b.src || '') + (b.title ? ' "' + b.title.replace(/"/g, '\\"') + '"' : '') + ')';
    case 'raw': return b.md != null ? b.md : (b.raw || '');
    default: return b.raw || '';
  }
}
function tableText(b) {
  const cols = b.rows[0].length;
  const cell = c => (c || '').replace(/\|/g, '\\|');
  const row = cells => '| ' + cells.map(cell).join(' | ') + ' |';
  const sameShape = b.rowRaw && !b.shapeDirty;
  const lines = [];
  b.rows.forEach((r, k) => {
    if (sameShape && !b.rowDirty[k] && b.rowRaw[k] != null) lines.push(b.rowRaw[k]);
    else lines.push(row(r));
    if (k === 0) {
      const sepCols = b.sep ? splitRow(b.sep).length : -1;
      lines.push(sameShape && b.sep && sepCols === cols ? b.sep : '|' + (b.align || []).concat(Array(cols).fill(null)).slice(0, cols).map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---').join('|') + '|');
    }
  });
  return lines.join('\n');
}

/* ---------------------------------------------------------------- pages */
const EMOJI_HEAD = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier}|⃣)*)\s+/u;
function parsePage(text) {
  const norm = String(text ?? '').replace(/\r\n?/g, '\n');
  const endsNL = norm.endsWith('\n');
  const lines = (endsNL ? norm.slice(0, -1) : norm).split('\n').map(expandTabs);
  let tail = 0;
  while (lines.length && RE.blank.test(lines[lines.length - 1])) { lines.pop(); tail++; }
  const blocks = parseBlocks(lines);
  const page = {icon: '', titleMd: '', titleBlock: null, props: null, blocks, endsNL, tail, lead: blocks[0] ? blocks[0].before : 0};
  if (blocks[0] && blocks[0].type === 'h' && blocks[0].level === 1 && !blocks[0].setext) {
    const tb = blocks.shift();
    page.titleBlock = tb;
    const m = EMOJI_HEAD.exec(tb.text);
    page.icon = m ? m[1] : '';
    page.titleMd = m ? tb.text.slice(m[0].length) : tb.text;
  }
  if (blocks[0] && blocks[0].type === 'table' && blocks[0].rows[0].length === 2
      && plainText(parseInline(blocks[0].rows[0][0])).trim() === '속성' && plainText(parseInline(blocks[0].rows[0][1])).trim() === '내용') {
    page.props = blocks.shift();
  }
  return page;
}
function pageTitle(page) { return plainText(parseInline(page.titleMd)).trim(); }
function serializePage(page) {
  const seq = [];
  if (page.titleBlock || page.titleDirty) {
    if (page.titleDirty || !page.titleBlock) {
      const t = {type: 'h', level: 1, text: (page.icon ? page.icon + ' ' : '') + page.titleMd, dirty: true, id: 'title'};
      if (page.titleBlock) { t.before = page.titleBlock.before; t.origPrev = page.titleBlock.origPrev; }
      seq.push(t);
    } else seq.push(page.titleBlock);
  }
  if (page.props) seq.push(page.props);
  seq.push(...page.blocks);
  const s = seq.length ? serializeSeq(seq, {leading: true}) : '';
  const nl = page.endsNL !== false ? '\n' : '';
  if (!s) return '\n'.repeat(Math.max(0, (page.tail || 0) - 1)) + nl;
  return s + '\n'.repeat(page.tail || 0) + nl;
}
/* For a title typed as plain text in the app. */
function titleToMd(plain) { return escapeText(String(plain).replace(/\s+/g, ' ').trim(), 'md', ' ', ''); }

function walkBlocks(blocks, fn, parent = null) {
  for (const b of blocks) { fn(b, parent); if (b.children) walkBlocks(b.children, fn, b); }
}
function markAllDirty(page) {
  walkBlocks(page.blocks, b => { b.dirty = true; if (b.rowDirty) b.rowDirty = b.rowDirty.map(() => true); });
  if (page.props) { page.props.dirty = true; page.props.rowDirty = page.props.rowDirty.map(() => true); }
  page.titleDirty = !!page.titleBlock;
}

function newBlock(type, extra = {}) {
  const b = {id: newId(), type, dirty: true};
  if (['p', 'h', 'bullet', 'number', 'todo', 'toggle'].includes(type)) b.text = '';
  if (type === 'h') b.level = 2;
  if (type === 'number') { b.num = 1; b.delim = '.'; }
  if (type === 'bullet' || type === 'todo') b.bullet = '-';
  if (type === 'todo') b.checked = false;
  if (['bullet', 'number', 'todo', 'quote', 'callout', 'toggle'].includes(type)) b.children = [];
  if (type === 'callout') b.kind = 'NOTE';
  if (type === 'code' || type === 'mermaid') { b.code = ''; b.lang = type === 'mermaid' ? 'mermaid' : ''; }
  if (type === 'table') { b.rows = [['', ''], ['', '']]; b.align = [null, null]; b.rowDirty = [true, true]; b.shapeDirty = true; }
  if (type === 'raw') b.md = '';
  return Object.assign(b, extra);
}

return {
  parseInline, inlineToMd, inlineToHtml, normalizeInline, plainText, escapeText, escapeBlockStart, escHtml,
  parseBlocks, serializeSeq, blockText, parsePage, serializePage, pageTitle, titleToMd, walkBlocks, markAllDirty, newBlock, newId,
  splitRow, decodeEntities, isItem,
};
});
