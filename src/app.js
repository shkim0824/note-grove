/* Note Grove · app.
 * A single-page Notion-style editor over Markdown files in two GitHub repositories:
 * private notes (token required) and public notes (anyone can read them on this site).
 * The token stays in this browser; it is never written to a repository or sent anywhere except api.github.com. */
'use strict';
(() => {
const MD = window.NGMD;
const VERSION = document.querySelector('meta[name=application-version]').content;
const CONFIG = {owner: 'shkim0824', repos: {private: 'ai-notes', public: 'ai-notes-public'}, branch: 'main', site: 'https://shkim0824.github.io/note-grove/', name: 'SHKim의 노트'};
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const QS = new URLSearchParams(location.search);
const API = (LOCAL && QS.get('api')) || 'https://api.github.com';
const RAW = (LOCAL && QS.get('raw')) || 'https://raw.githubusercontent.com';
if (LOCAL && QS.get('owner')) CONFIG.owner = QS.get('owner');
if (LOCAL && QS.get('priv')) CONFIG.repos.private = QS.get('priv');
if (LOCAL && QS.get('pub')) CONFIG.repos.public = QS.get('pub');
const MANIFEST = 'workspace.json';
const MERMAID = {src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', sri: 'sha384-rbtjAdnIQE/aQJGEgXrVUlMibdfTSa4PQju4HDhN3sR2PmaKFzhEafuePsl9H/9I'};
const TOKEN_KEY = 'note-grove-token', UI_KEY = 'note-grove-ui';
const REPO_LABEL = {private: '🔒 비공개', public: '🌐 공개'};
const CALLOUT = {NOTE: ['ℹ️', '참고'], TIP: ['💡', '팁'], IMPORTANT: ['❗', '중요'], WARNING: ['⚠️', '주의'], CAUTION: ['🛑', '경고']};
const EMOJIS = '📄 📋 🧪 📖 📚 🗂️ 📁 📎 📝 ✏️ 🔬 🧠 🤖 📊 📈 📉 🧮 🎯 🚀 ✅ ⏳ 🔄 ⏸️ 🛠️ ⚙️ 🔑 🔒 🌐 💡 ❗ ⚠️ 🧩 🧭 🗺️ 🏁 🌿 🌱 🌳 🍀 ⭐ 🔥 💬 📌 🗓️ 🧾 🏠 💼 🎓 📦 🔍 🧹 🗑️ 🧷 🪄 🎨 🖼️ 🔗 🧑‍💻 📑'.split(' ');

/* ---------------------------------------------------------------- small helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = MD.escHtml;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function uid() {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}
function utf8Bytes(s) { return new TextEncoder().encode(s); }
function bytesToB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(s); }
function b64ToText(b64) { const bin = atob(b64.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
function toast(msg, {action, onAction, ms = 5000} = {}) {
  const t = $('#toast');
  t.innerHTML = '';
  t.append(h('span', {text: msg}));
  if (action) t.append(h('button', {text: action, onclick: () => { t.hidden = true; onAction(); }}));
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}
function errorText(e) {
  if (!e) return '알 수 없는 오류';
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'GitHub 응답이 너무 늦어요. 잠시 뒤 다시 시도해 주세요.';
  if (e instanceof TypeError) return '네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.';
  switch (e.status) {
    case 401: return '토큰이 만료됐거나 올바르지 않아요. 연결 설정에서 새 토큰을 입력해 주세요.';
    case 403: return /rate limit/i.test(e.message) ? 'GitHub 요청 한도를 넘었어요. 잠시 뒤 다시 시도해 주세요.' : '권한이 없어요. 토큰에 두 저장소의 Contents 읽기·쓰기 권한이 있는지 확인해 주세요.';
    case 404: return '저장소나 파일을 찾을 수 없어요. 토큰이 이 저장소에 접근할 수 있는지 확인해 주세요.';
    case 409: case 422: return '다른 곳에서 먼저 저장된 내용과 충돌했어요.';
  }
  return e.message || String(e);
}
const nowIso = () => new Date().toISOString();
const relTime = iso => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return '방금 전';
  if (d < 3600) return Math.floor(d / 60) + '분 전';
  if (d < 86400) return Math.floor(d / 3600) + '시간 전';
  if (d < 86400 * 30) return Math.floor(d / 86400) + '일 전';
  return new Date(iso).toLocaleDateString('ko-KR');
};

/* ---------------------------------------------------------------- local storage (drafts) */
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('note-grove-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { try { const d = await db(); return await new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch { return undefined; } }
async function kvSet(k, v) { try { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); if (v === undefined) tx.objectStore('kv').delete(k); else tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch {} }
const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } })();
ui.expanded ||= {};
function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} }
function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function storeToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {}
}

/* ---------------------------------------------------------------- GitHub */
const rate = {remaining: null};
class Repo {
  constructor(key, name, token) {
    this.key = key; this.name = name; this.token = token; this.owner = CONFIG.owner;
    this.base = API + '/repos/' + encodeURIComponent(this.owner) + '/' + encodeURIComponent(name);
    this.queue = Promise.resolve();
  }
  serial(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }
  async req(path, {method = 'GET', body, raw = false, missing = false, timeout = 60000} = {}) {
    const r = await fetch(this.base + path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(timeout),
      headers: {Authorization: 'Bearer ' + this.token, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
    });
    const left = r.headers.get('x-ratelimit-remaining');
    if (left != null) rate.remaining = +left;
    if (missing && r.status === 404) return null;
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch {}
      const e = new Error('GitHub ' + r.status + (msg ? ': ' + msg : ''));
      e.status = r.status;
      throw e;
    }
    if (r.status === 204) return null;
    return raw ? r : r.json();
  }
  cpath(p) { return '/contents/' + p.split('/').map(encodeURIComponent).join('/'); }
  info() { return this.req(''); }
  async readText(p, ref = CONFIG.branch) {
    const m = await this.req(this.cpath(p) + '?ref=' + encodeURIComponent(ref), {missing: true});
    if (!m) return null;
    if (Array.isArray(m) || m.type !== 'file') { const e = new Error(p + ' 는 파일이 아니에요'); e.status = 400; throw e; }
    let text;
    if (m.encoding === 'base64' && m.content) text = b64ToText(m.content);
    else if (m.size === 0) text = '';
    else text = await (await this.req(this.cpath(p) + '?ref=' + encodeURIComponent(ref), {raw: true})).text();
    return {text, sha: m.sha};
  }
  async meta(p) {
    const m = await this.req(this.cpath(p) + '?ref=' + CONFIG.branch, {missing: true});
    return m && !Array.isArray(m) ? m : null;
  }
  async writeBytes(p, bytes, sha, message) {
    const r = await this.req(this.cpath(p), {method: 'PUT', timeout: 180000, body: {message, content: bytesToB64(bytes), branch: CONFIG.branch, ...(sha ? {sha} : {})}});
    return r.content.sha;
  }
  writeText(p, text, sha, message) { return this.writeBytes(p, utf8Bytes(text), sha, message); }
  remove(p, sha, message) { return this.req(this.cpath(p), {method: 'DELETE', body: {message, sha, branch: CONFIG.branch}}); }
  async blob(p) { return (await this.req(this.cpath(p) + '?ref=' + CONFIG.branch, {raw: true, timeout: 180000})).blob(); }
  commits(p, n = 40) { return this.req('/commits?sha=' + CONFIG.branch + '&per_page=' + n + '&path=' + encodeURIComponent(p)); }
  list(dir) { return this.req(this.cpath(dir) + '?ref=' + CONFIG.branch, {missing: true}); }
  tree() { return this.req('/git/trees/' + CONFIG.branch + '?recursive=1'); }
  webUrl(p, ref = CONFIG.branch) { return 'https://github.com/' + this.owner + '/' + this.name + '/blob/' + ref + '/' + p.split('/').map(encodeURIComponent).join('/'); }
}
const rawUrl = (key, p) => RAW + '/' + CONFIG.owner + '/' + CONFIG.repos[key] + '/' + CONFIG.branch + '/' + p.split('/').map(encodeURIComponent).join('/');

/* ---------------------------------------------------------------- state */
const S = {
  mode: 'boot',          // 'boot' | 'owner' | 'visitor'
  token: '', repos: {}, writable: {private: false, public: false}, publicMissing: false,
  man: {private: {data: {pages: []}, sha: null}, public: {data: {pages: []}, sha: null}},
  pages: new Map(), kids: new Map(), dups: [],
  cur: null, hist: {undo: [], redo: [], lastAt: 0, lastBid: null},
  parentOf: new Map(), blobUrls: new Map(), mermaidCache: new Map(), textCache: new Map(),
  manKnown: {private: new Set(), public: new Set()},
  fresh: new Map(),       // repo:path -> what this browser wrote last (GitHub reads can lag behind writes)
};
const emptyManifest = () => ({app: 'note-grove', version: 1, pages: []});
function normManifest(d) {
  if (!d || !Array.isArray(d.pages)) throw new Error('workspace.json 형식이 올바르지 않아요');
  return d;
}

function rebuildIndex() {
  S.pages = new Map(); S.dups = [];
  for (const key of ['private', 'public']) {
    for (const p of S.man[key].data.pages || []) {
      if (S.pages.has(p.id)) { S.dups.push(p.id); continue; }
      S.pages.set(p.id, {...p, repo: key});
    }
  }
  S.kids = new Map();
  for (const e of S.pages.values()) {
    const pid = e.parent && S.pages.has(e.parent) ? e.parent : '';
    if (!S.kids.has(pid)) S.kids.set(pid, []);
    S.kids.get(pid).push(e);
  }
  for (const arr of S.kids.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.title || '').localeCompare(b.title || '', 'ko'));
}
const kidsOf = id => (S.kids.get(id || '') || []);
function isHidden(e) { for (let x = e, n = 0; x && n < 50; x = S.pages.get(x.parent), n++) if (x.trashed) return true; return false; }
function ancestors(e) { const out = []; for (let x = S.pages.get(e.parent), n = 0; x && n < 50; x = S.pages.get(x.parent), n++) out.unshift(x); return out; }
function descendants(id) { const out = []; const walk = pid => { for (const k of kidsOf(pid)) { out.push(k); walk(k.id); } }; walk(id); return out; }
const pageIcon = e => e.icon || (e.template ? '📑' : '📄');
const pageTitle = e => (e.title || '').trim() || '제목 없음';

async function loadManifest(key) {
  const repo = S.repos[key];
  const r = await repo.readText(MANIFEST);
  if (!r) return {data: emptyManifest(), sha: null};
  let data;
  try { data = normManifest(JSON.parse(r.text)); } catch (e) { e.message = CONFIG.repos[key] + '/workspace.json: ' + e.message; throw e; }
  return {data, sha: r.sha};
}
function mutateManifest(key, fn, message) {
  const repo = S.repos[key];
  if (!repo) return Promise.reject(new Error('저장소가 연결되지 않았어요'));
  return repo.serial(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await loadManifest(key);
      const next = JSON.parse(JSON.stringify(cur.data));
      if (fn(next) === false) { S.man[key] = cur; rebuildIndex(); return next; }
      try {
        const sha = await repo.writeText(MANIFEST, JSON.stringify(next, null, 2) + '\n', cur.sha, message || 'docs: 노트 목록 갱신 (Note Grove)');
        if (cur.sha) S.manKnown[key].add(cur.sha);
        S.manKnown[key].add(sha);
        S.man[key] = {data: next, sha};
        rebuildIndex();
        return next;
      } catch (e) {
        if (![409, 422].includes(e.status) || attempt === 4) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
  });
}
function updateEntry(id, patch, message) {
  const e = S.pages.get(id);
  if (!e) return Promise.resolve();
  return mutateManifest(e.repo, m => {
    const x = m.pages.find(p => p.id === id);
    if (!x) return false;
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) { if (k in x) { delete x[k]; changed = true; } }
      else if (JSON.stringify(x[k]) !== JSON.stringify(v)) { x[k] = v; changed = true; }
    }
    return changed ? undefined : false;
  }, message);
}

/* ---------------------------------------------------------------- page text I/O */
function noteWrite(key, path, text, sha, prevSha) {
  const k = key + ':' + path, old = S.fresh.get(k);
  const older = new Set(old ? old.older : []);
  if (prevSha) older.add(prevSha);
  if (old && old.sha && old.sha !== sha) older.add(old.sha);
  S.fresh.set(k, {text, sha, at: Date.now(), older});
}
async function readEntry(e) {
  if (S.mode === 'owner' && S.repos[e.repo]) {
    const r = await S.repos[e.repo].readText(e.path);
    const f = S.fresh.get(e.repo + ':' + e.path);
    if (f && Date.now() - f.at < 120000 && (!r || (r.sha !== f.sha && f.older.has(r.sha)))) return {text: f.text, sha: f.sha};
    return r;
  }
  const r = await fetch(rawUrl(e.repo, e.path), {cache: 'no-cache'});
  if (r.status === 404) return null;
  if (!r.ok) { const err = new Error('GitHub ' + r.status); err.status = r.status; throw err; }
  return {text: await r.text(), sha: null};
}
function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
function normPath(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/') + (p.endsWith('/') && out.length ? '/' : '');
}
function relPath(fromFile, to) {
  const a = dirOf(fromFile).split('/').filter(Boolean), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}
function findByPath(key, p) { for (const e of S.pages.values()) if (e.repo === key && e.path === p) return e; return null; }
function resolveLink(href, from) {
  if (!href) return {kind: 'none'};
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return /^(https?|mailto):/i.test(href) ? {kind: 'external', url: href} : {kind: 'none'};
  if (href.startsWith('#')) return {kind: 'anchor', hash: href};
  const [p0] = href.split(/[?#]/);
  let p;
  try { p = decodeURIComponent(p0); } catch { p = p0; }
  const target = p.startsWith('/') ? normPath(p.slice(1)) : normPath(dirOf(from.path) + p);
  const other = from.repo === 'private' ? 'public' : 'private';
  const cands = [target];
  if (target.endsWith('/') || !/\.[A-Za-z0-9]+$/.test(target)) cands.push(target.replace(/\/?$/, '/') + 'README.md');
  for (const c of cands) { const e = findByPath(from.repo, c) || findByPath(other, c); if (e) return {kind: 'page', id: e.id}; }
  return {kind: 'file', repo: from.repo, path: target, dir: target.endsWith('/') || !/\.[A-Za-z0-9]+$/.test(target)};
}
async function fileUrl(key, p) {
  if (S.mode !== 'owner' || key === 'public') return rawUrl(key, p);
  const k = key + ':' + p;
  if (!S.blobUrls.has(k)) S.blobUrls.set(k, S.repos[key].blob(p).then(b => URL.createObjectURL(b)).catch(e => { S.blobUrls.delete(k); throw e; }));
  return S.blobUrls.get(k);
}
async function openLink(href, from) {
  const r = resolveLink(href, from);
  if (r.kind === 'external') { window.open(r.url, '_blank', 'noopener'); return; }
  if (r.kind === 'page') { go(r.id); return; }
  if (r.kind === 'file') {
    if (/\.md$/i.test(r.path)) {
      if (S.mode !== 'owner') { toast('비공개 페이지이거나 없는 페이지라서 열 수 없어요.'); return; }
      window.open(S.repos[r.repo] ? S.repos[r.repo].webUrl(r.path) : rawUrl(r.repo, r.path), '_blank', 'noopener');
      toast('노트 목록에 없는 Markdown 파일이라 GitHub에서 열었어요. 「레포 파일 가져오기」로 페이지로 등록할 수 있어요.', {ms: 8000});
      return;
    }
    if (r.dir) { window.open('https://github.com/' + CONFIG.owner + '/' + CONFIG.repos[r.repo] + '/tree/' + CONFIG.branch + '/' + r.path.replace(/\/$/, ''), '_blank', 'noopener'); return; }
    const w = window.open('', '_blank');
    try {
      const url = await fileUrl(r.repo, r.path);
      if (w) w.location = url; else window.open(url, '_blank');
    } catch (e) { if (w) w.close(); toast('파일을 열 수 없어요: ' + errorText(e)); }
  }
}

/* ---------------------------------------------------------------- boot & connection */
async function boot() {
  $('#sbVer').textContent = 'Note Grove ' + VERSION;
  $('#wsName').textContent = CONFIG.name;
  if (ui.sbOff) $('#app').classList.add('sb-off');
  syncSbButtons();
  bindStatic();
  const token = readToken();
  if (token) {
    try { await connect(token); return; }
    catch (e) { toast('GitHub 연결 실패 — 공개 페이지만 보여요. ' + errorText(e), {ms: 9000}); }
  }
  await bootVisitor();
}
async function connect(token) {
  const priv = new Repo('private', CONFIG.repos.private, token), pub = new Repo('public', CONFIG.repos.public, token);
  const pi = await priv.info();
  if (!pi.private) throw new Error(CONFIG.repos.private + ' 저장소가 공개 상태예요. 비공개 노트를 보호하려고 연결을 멈췄어요.');
  let ui2 = null;
  try { ui2 = await pub.info(); } catch (e) { if (e.status !== 404) throw e; }
  if (ui2 && ui2.private) throw new Error(CONFIG.repos.public + ' 저장소가 비공개 상태예요. 공개 노트용 저장소는 public이어야 해요.');
  S.token = token;
  S.repos = {private: priv};
  S.writable.private = !!(pi.permissions && pi.permissions.push);
  S.publicMissing = !ui2;
  if (ui2) { S.repos.public = pub; S.writable.public = !!(ui2.permissions && ui2.permissions.push); }
  const [m1, m2] = await Promise.all([loadManifest('private'), ui2 ? loadManifest('public') : Promise.resolve({data: emptyManifest(), sha: null})]);
  S.man.private = m1; S.man.public = m2;
  for (const [k, m] of [['private', m1], ['public', m2]]) if (m.sha) S.manKnown[k].add(m.sha);
  S.mode = 'owner';
  rebuildIndex();
  document.body.classList.remove('visitor');
  renderChrome();
  renderSidebar();
  await route();
  startSync();
}
async function bootVisitor() {
  S.mode = 'visitor';
  S.repos = {};
  try {
    const r = await fetch(rawUrl('public', MANIFEST), {cache: 'no-cache'});
    S.man.public = r.ok ? {data: normManifest(await r.json()), sha: null} : {data: emptyManifest(), sha: null};
  } catch { S.man.public = {data: emptyManifest(), sha: null}; }
  S.man.private = {data: emptyManifest(), sha: null};
  rebuildIndex();
  document.body.classList.add('visitor');
  renderChrome();
  renderSidebar();
  await route();
}
function renderChrome() {
  const owner = S.mode === 'owner';
  for (const el of $$('[data-owner]')) el.hidden = !owner;
  const dot = $('#connDot');
  dot.className = 'conn ' + (owner ? (S.writable.private ? 'on' : 'ro') : '');
  dot.title = owner ? 'GitHub 연결됨' + (S.writable.private ? '' : ' (읽기 전용)') : '연결 안 됨 · 공개 페이지만 보기';
  $('#actSettingsLabel').textContent = owner ? '연결 설정' : 'GitHub 연결 (소유자)';
  const banners = $('#banners');
  banners.innerHTML = '';
  if (owner && S.publicMissing) banners.append(h('div', {class: 'banner info'}, '공개 노트 저장소 ' + CONFIG.owner + '/' + CONFIG.repos.public + '가 없거나 이 토큰으로 볼 수 없어요. 공개 기능은 꺼 둘게요.'));
  if (owner && S.dups.length) banners.append(h('div', {class: 'banner'}, `같은 ID의 페이지가 두 저장소에 함께 있어요 (${S.dups.length}개). 공개 전환 도중 멈춘 것 같아요 — 비공개 쪽을 보여 줍니다.`));
}
function openConnect() {
  const n = $('#connectNotice');
  n.innerHTML = '';
  n.append(
    h('div', {html: '연결할 저장소: <b>' + esc(CONFIG.owner + '/' + CONFIG.repos.private) + '</b> (비공개 노트) · <b>' + esc(CONFIG.owner + '/' + CONFIG.repos.public) + '</b> (공개 노트)'}),
    h('div', {html: '토큰: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained PAT 만들기 ↗</a> → Repository access는 위 두 저장소만 선택 → Permissions의 <b>Contents: Read and write</b>'}),
    h('div', {text: '토큰은 이 브라우저에만 보관되고 GitHub API로만 전송돼요. 저장소나 이 사이트에는 올라가지 않아요.'}),
  );
  $('#tokenIn').value = S.token || '';
  $('#rememberIn').checked = !sessionStorage.getItem(TOKEN_KEY);
  $('#connectErr').textContent = '';
  $('#disconnectBtn').hidden = S.mode !== 'owner';
  $('#connectDlg').showModal();
  setTimeout(() => $('#tokenIn').focus(), 30);
}

/* ---------------------------------------------------------------- sidebar */
function renderSidebar() {
  const cur = S.cur && S.cur.id;
  const owner = S.mode === 'owner';
  const roots = kidsOf('').filter(e => !e.trashed && !e.template);
  const fill = (box, list, emptyText) => {
    box.innerHTML = '';
    if (!list.length) { box.append(h('div', {class: 'sb-empty', text: emptyText})); return; }
    for (const e of list) box.append(...treeItem(e, 0, cur, owner));
  };
  fill($('#treePrivate'), roots.filter(e => e.repo === 'private'), '페이지가 없어요');
  fill($('#treePublic'), roots.filter(e => e.repo === 'public'), owner ? '공개한 페이지가 없어요' : '공개된 페이지가 아직 없어요');
  const tpl = [...S.pages.values()].filter(e => e.template && !e.trashed);
  fill($('#treeTemplates'), tpl, '템플릿이 없어요');
  $('#secTemplates').hidden = !owner;
  $('#secPrivate').hidden = !owner;
}
function treeItem(e, depth, cur, owner) {
  const kids = e.template ? [] : kidsOf(e.id).filter(k => !k.trashed && !k.template);
  const open = !!ui.expanded[e.id];
  const parent = S.pages.get(e.parent);
  const badge = parent && parent.repo !== e.repo ? (e.repo === 'public' ? '🌐' : '🔒') : '';
  const row = h('div', {class: 'ti' + (e.id === cur ? ' on' : ''), style: '--d:' + depth, dataset: {id: e.id}, draggable: owner ? 'true' : null, title: pageTitle(e)},
    h('button', {class: 'ti-caret' + (kids.length ? (open ? ' open' : '') : ' none'), dataset: {act: 'toggle'}, 'aria-label': '펼치기'}, '▶'),
    h('span', {class: 'ti-icon', text: pageIcon(e)}),
    h('span', {class: 'ti-title', text: pageTitle(e)}),
    badge ? h('span', {class: 'ti-badge', title: e.repo === 'public' ? '공개 저장소에 있음' : '비공개 저장소에 있음', text: badge}) : null,
    owner ? h('span', {class: 'ti-acts'}, h('button', {dataset: {act: 'menu'}, title: '메뉴'}, '⋯'), e.template ? null : h('button', {dataset: {act: 'add'}, title: '하위 페이지 추가'}, '＋')) : null,
  );
  const out = [row];
  if (open && kids.length) for (const k of kids) out.push(...treeItem(k, depth + 1, cur, owner));
  return out;
}
function expandTo(id) {
  const e = S.pages.get(id);
  if (!e) return;
  let changed = false;
  for (const a of ancestors(e)) if (!ui.expanded[a.id]) { ui.expanded[a.id] = 1; changed = true; }
  if (changed) saveUi();
}

/* ---------------------------------------------------------------- routing */
function go(id) { if (location.hash !== '#/p/' + id) location.hash = '#/p/' + id; else route(); }
async function route() {
  const m = /^#\/p\/([A-Za-z0-9_-]+)/.exec(location.hash);
  let id = m && m[1];
  if (!id) {
    const last = ui.last && S.pages.get(ui.last);
    const first = kidsOf('').filter(e => !e.trashed && !e.template && (S.mode === 'owner' || e.repo === 'public'))[0];
    id = (last && (S.mode === 'owner' || last.repo === 'public') ? last : first)?.id;
    if (id) { history.replaceState(null, '', '#/p/' + id); }
  }
  if (!id) { await leaveCurrent(); showEmpty(); return; }
  await openPage(id);
}
function showEmpty() {
  S.cur = null;
  setTop(null);
  const v = $('#view');
  v.innerHTML = '';
  const owner = S.mode === 'owner';
  v.append(h('div', {class: 'empty-state'},
    h('div', {style: 'font-size:56px', text: '🌿'}),
    h('h2', {text: owner ? '첫 페이지를 만들어 보세요' : 'Note Grove'}),
    h('p', {text: owner ? '왼쪽의 ＋ 새 페이지로 시작하거나, 레포에 있는 Markdown 파일을 가져올 수 있어요.' : '공개된 페이지가 아직 없어요. 노트 주인이라면 GitHub 토큰을 연결하세요.'}),
    h('div', {style: 'display:flex;gap:8px;justify-content:center;margin-top:16px'},
      owner ? h('button', {class: 'btn primary', text: '＋ 새 페이지', onclick: () => createPage({repoKey: 'private'})}) : h('button', {class: 'btn primary', text: 'GitHub 연결', onclick: openConnect}),
      owner ? h('button', {class: 'btn', text: '📥 레포 파일 가져오기', onclick: openImport}) : null)));
  renderSidebar();
}

/* ---------------------------------------------------------------- open / render page */
const isOwnerEditable = e => S.mode === 'owner' && S.writable[e.repo];
async function leaveCurrent() {
  const cur = S.cur;
  if (!cur || !cur.page) return;
  if (unsaved(cur)) await saveNow(cur);
}
async function openPage(id, {keepScroll = false} = {}) {
  const e = S.pages.get(id);
  if (S.cur && S.cur.id === id && S.cur.page && !keepScroll) { expandTo(id); renderSidebar(); return; }
  await leaveCurrent();
  closePops();
  if (!e) { notFound(id); return; }
  ui.last = id; saveUi();
  expandTo(id);
  const token = Symbol('open');
  S.cur = {id, entry: e, loading: token};
  S.hist = {undo: [], redo: [], lastAt: 0, lastBid: null};
  renderSidebar();
  setTop(S.cur);
  if (!keepScroll) skeleton();
  let file;
  try { for (let k = 0; k < 4 && !file; k++) { if (k) await sleep(500 * k); file = await readEntry(e); if (!S.cur || S.cur.loading !== token) return; } }
  catch (err) { if (S.cur && S.cur.loading === token) failView('페이지를 불러오지 못했어요', errorText(err), () => openPage(id)); return; }
  if (!S.cur || S.cur.loading !== token) return;
  if (!file) { missingFile(e); return; }
  const page = MD.parsePage(file.text);
  const cur = {id, entry: e, repoKey: e.repo, path: e.path, sha: file.sha, page, savedText: MD.serializePage(page), ro: !isOwnerEditable(e), known: new Set([file.sha])};
  S.cur = cur;
  syncTitleToManifest(cur);
  renderPage({keepScroll});
  if (!cur.ro) checkDraft(cur);
  if (S.focusTitle === id) { S.focusTitle = null; const t = $('.pg-title'); if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); } }
}
function syncTitleToManifest(cur) {
  if (S.mode !== 'owner' || !S.writable[cur.repoKey]) return;
  const title = MD.pageTitle(cur.page), icon = cur.page.icon || undefined;
  if (!cur.page.titleBlock) return;
  if (title !== (cur.entry.title || '') || (icon || '') !== (cur.entry.icon || '')) updateEntry(cur.id, {title, icon}).then(() => { renderSidebar(); setTop(S.cur); }).catch(() => {});
}
function skeleton() {
  const v = $('#view');
  v.innerHTML = '';
  const pg = h('div', {class: 'page'}, h('div', {class: 'pg-icon-row'}), h('div', {class: 'skeleton', style: 'height:38px;width:45%'}));
  for (const w of [92, 80, 86, 60, 75]) pg.append(h('div', {class: 'skeleton', style: 'width:' + w + '%'}));
  v.append(pg);
}
function failView(title, msg, retry) {
  const v = $('#view');
  v.innerHTML = '';
  v.append(h('div', {class: 'empty-state'}, h('div', {style: 'font-size:48px', text: '⚠️'}), h('h2', {text: title}), h('p', {text: msg}), retry ? h('button', {class: 'btn', text: '다시 시도', onclick: retry}) : null));
}
function notFound(id) {
  S.cur = null;
  setTop(null);
  failView('페이지를 찾을 수 없어요', S.mode === 'owner' ? '삭제됐거나 다른 저장소로 옮겨졌을 수 있어요.' : '비공개 페이지이거나 없는 페이지예요. 노트 주인이라면 GitHub 토큰을 연결하세요.', null);
  if (S.mode !== 'owner') $('#view .empty-state').append(h('button', {class: 'btn primary', text: 'GitHub 연결', onclick: openConnect}));
  renderSidebar();
}
function missingFile(e) {
  setTop(S.cur);
  failView('파일이 없어요', CONFIG.repos[e.repo] + '/' + e.path + ' 파일을 찾을 수 없어요. GitHub에서 지웠거나 옮긴 것 같아요.', null);
  if (S.mode === 'owner') $('#view .empty-state').append(h('div', {style: 'display:flex;gap:8px;justify-content:center'},
    h('button', {class: 'btn', text: '빈 파일로 다시 만들기', onclick: async () => { await S.repos[e.repo].writeText(e.path, '# ' + (e.icon ? e.icon + ' ' : '') + MD.titleToMd(e.title || '새 페이지') + '\n', null, 'docs: ' + pageTitle(e) + ' 다시 만들기'); openPage(e.id, {keepScroll: true}); }}),
    h('button', {class: 'btn danger', text: '목록에서 지우기', onclick: async () => { await mutateManifest(e.repo, m => { m.pages = m.pages.filter(p => p.id !== e.id); }); S.cur = null; renderSidebar(); route(); }})));
}

function setTop(cur) {
  const crumbs = $('#crumbs');
  crumbs.innerHTML = '';
  const owner = S.mode === 'owner';
  if (!cur) { for (const id of ['#visBtn', '#histBtn', '#shareBtn', '#moreBtn']) $(id).hidden = true; setStatus(''); return; }
  const e = S.pages.get(cur.id) || cur.entry;
  crumbs.append(h('span', {class: 'crumb', style: 'color:var(--ink3)', text: REPO_LABEL[e.repo]}));
  for (const a of [...ancestors(e), e]) {
    crumbs.append(h('span', {class: 'crumb-sep', text: '/'}));
    crumbs.append(h('a', {class: 'crumb', href: '#/p/' + a.id, text: pageIcon(a) + ' ' + pageTitle(a)}));
  }
  const vis = $('#visBtn');
  vis.hidden = !owner || S.publicMissing && e.repo === 'private';
  vis.className = 'vis-pill' + (e.repo === 'public' ? ' pub' : '');
  vis.textContent = e.repo === 'public' ? '🌐 공개' : '🔒 비공개';
  vis.title = e.repo === 'public' ? '공개 저장소에 있어요 — 누구나 볼 수 있어요. 눌러서 비공개로 옮기기' : '비공개 저장소에 있어요. 눌러서 공개로 옮기기';
  $('#histBtn').hidden = !owner;
  $('#shareBtn').hidden = false;
  $('#moreBtn').hidden = false;
  if (!owner) setStatus('읽기 전용');
}
function setStatus(kind, detail) {
  const el = $('#status');
  el.className = 'status';
  el.onclick = null;
  el.title = detail || '';
  const map = {saved: '저장됨', editing: '편집 중…', saving: '저장 중…', offline: '오프라인 · 기기에 보관됨', conflict: '충돌 확인 필요'};
  if (kind === 'error') { el.textContent = '저장 실패 · 다시 시도'; el.classList.add('err'); el.onclick = () => saveNow(S.cur); return; }
  el.textContent = map[kind] ?? kind ?? '';
}

function renderPage({keepScroll = false} = {}) {
  const cur = S.cur;
  const v = $('#view'), sc = $('#scroller');
  const top = sc.scrollTop;
  v.innerHTML = '';
  const ro = cur.ro;
  const e = S.pages.get(cur.id) || cur.entry;
  const page = h('article', {class: 'page' + (ui.wide ? ' wide' : '') + (ro ? ' ro' : '')});
  if (e.trashed) v.append(h('div', {class: 'banner'}, '🗑 휴지통에 있는 페이지예요.', h('button', {text: '복원', onclick: () => restoreFromTrash(e.id)}), h('button', {text: '영구 삭제', onclick: () => deleteForever(e.id)})));
  if (e.repo === 'public' && S.mode === 'owner') v.append(h('div', {class: 'banner info'}, '🌐 공개 저장소에 있는 페이지예요. 저장하는 즉시 누구나 볼 수 있어요.'));
  if (cur.ro && S.mode === 'owner') v.append(h('div', {class: 'banner'}, '이 토큰은 ' + CONFIG.repos[e.repo] + ' 저장소에 쓰기 권한이 없어 읽기 전용으로 열었어요.'));
  // icon + title
  const iconRow = h('div', {class: 'pg-icon-row'});
  if (cur.page.icon) iconRow.append(h('button', {class: 'pg-icon', dataset: {act: 'icon'}, title: '아이콘 바꾸기', text: cur.page.icon}));
  else if (!ro) iconRow.append(h('button', {class: 'pg-add-icon', dataset: {act: 'icon'}, text: '☺ 아이콘 추가'}));
  page.append(iconRow);
  const title = h('h1', {class: 'pg-title', 'data-ph': '제목 없음', dataset: {role: 'title'}, text: MD.pageTitle(cur.page)});
  if (!ro) { title.contentEditable = 'plaintext-only'; if (title.contentEditable !== 'plaintext-only') title.contentEditable = 'true'; }
  page.append(title);
  // meta
  const meta = h('div', {class: 'pg-meta'}, h('span', {text: REPO_LABEL[e.repo] + ' · ' + CONFIG.repos[e.repo] + '/' + e.path}));
  if (S.mode === 'owner') meta.append(h('a', {href: S.repos[e.repo].webUrl(e.path), target: '_blank', rel: 'noopener', text: 'GitHub ↗'}));
  else meta.append(h('a', {href: 'https://github.com/' + CONFIG.owner + '/' + CONFIG.repos.public + '/blob/' + CONFIG.branch + '/' + e.path, target: '_blank', rel: 'noopener', text: 'Markdown 원문 ↗'}));
  page.append(meta);
  // properties
  page.append(renderProps(cur.page, ro));
  // blocks
  const ed = h('div', {class: 'editor', id: 'editor'});
  page.append(ed);
  renderBlocksInto(ed, cur.page.blocks, ro);
  if (!ro && !cur.page.blocks.length) ed.append(h('div', {class: 'txt ph', 'data-ph': '여기를 눌러 내용을 쓰세요. / 로 블록을 추가할 수 있어요.', dataset: {act: 'first-block'}}));
  // child pages
  const kids = kidsOf(cur.id).filter(k => !k.trashed && !k.template && (S.mode === 'owner' || k.repo === 'public'));
  if (kids.length || !ro && S.mode === 'owner') {
    const box = h('div', {class: 'pg-kids'}, h('div', {class: 'pg-kids-h'}, kids.length ? h('span', {text: '하위 페이지 ' + kids.length}) : null,
      !ro ? h('button', {class: 'prop-add', dataset: {act: 'add-child-page'}, text: '＋ 하위 페이지 추가'}) : null));
    for (const k of kids) box.append(h('div', {class: 'pg-kid', dataset: {go: k.id}}, h('span', {text: pageIcon(k)}), h('span', {class: 't', text: pageTitle(k)}), k.repo !== e.repo ? h('span', {class: 'ti-badge', text: k.repo === 'public' ? '🌐' : '🔒'}) : null));
    page.append(box);
  }
  v.append(page);
  setTop(cur);
  if (!ro) setStatus(unsaved(cur) ? 'editing' : 'saved');
  if (keepScroll) sc.scrollTop = top; else sc.scrollTop = 0;
  hydrateMedia(page);
}
function renderProps(pg, ro) {
  const box = h('div', {class: 'props-box'});
  if (pg.props) {
    const wrap = h('div', {class: 'props'});
    pg.props.rows.slice(1).forEach((r, i) => {
      const k = h('div', {class: 'prop-k', dataset: {role: 'pk', row: i + 1}, html: MD.inlineToHtml(MD.parseInline(r[0]))});
      const val = h('div', {class: 'prop-v', dataset: {role: 'pv', row: i + 1}, html: MD.inlineToHtml(MD.parseInline(r[1]))});
      if (!ro) { k.contentEditable = 'true'; val.contentEditable = 'true'; }
      wrap.append(h('div', {class: 'prop'}, k, val, ro ? null : h('button', {class: 'prop-del', dataset: {act: 'prop-del', row: i + 1}, title: '속성 삭제', text: '×'})));
    });
    if (!ro) wrap.append(h('button', {class: 'prop-add', dataset: {act: 'prop-add'}, text: '＋ 속성 추가'}));
    box.append(wrap);
  } else if (!ro) box.append(h('button', {class: 'prop-add', dataset: {act: 'prop-add'}, text: '＋ 속성 추가', style: 'margin-bottom:8px'}));
  return box;
}

/* ---------------------------------------------------------------- block rendering */
const TEXTUAL = new Set(['p', 'h', 'bullet', 'number', 'todo', 'toggle']);
const NESTABLE = new Set(['bullet', 'number', 'todo', 'toggle', 'callout', 'quote']);
const PH = {p: '텍스트를 입력하거나 / 를 눌러 블록 추가', h: '제목', bullet: '목록', number: '목록', todo: '할 일', toggle: '토글 제목'};
function renderBlocksInto(container, blocks, ro, parent = null) {
  let num = 0, prev = null;
  for (const b of blocks) {
    S.parentOf.set(b.id, parent);
    if (b.type === 'number') num = prev && prev.type === 'number' && (prev.delim || '.') === (b.delim || '.') ? num + 1 : (b.num ?? 1);
    container.append(blockEl(b, ro, num));
    prev = b;
  }
}
function textEl(b, ro, role = 'text', cls = '') {
  const el = h('div', {class: 'txt' + (cls ? ' ' + cls : ''), 'data-ph': PH[b.type] || '', dataset: {role, bid: b.id}});
  el.innerHTML = MD.inlineToHtml(MD.parseInline(b.text || ''));
  if (!ro) el.contentEditable = 'true';
  return el;
}
function kidsEl(b, ro) {
  const k = h('div', {class: 'kids'});
  renderBlocksInto(k, b.children || [], ro, b);
  if (!ro && ['toggle', 'callout', 'quote'].includes(b.type) && !(b.children || []).length) k.append(h('button', {class: 'kid-add', dataset: {act: 'kid-add', bid: b.id}, text: '＋ 내용 추가'}));
  return k;
}
function blockEl(b, ro, num) {
  const cls = ['blk', b.type];
  if (b.type === 'h') cls.push('h' + Math.min(b.level || 1, 6));
  if (b.type === 'todo' && b.checked) cls.push('done');
  if (b.type === 'toggle' && (S.openToggles?.has(b.id) || b.open)) cls.push('open');
  const el = h('div', {class: cls.join(' '), dataset: {id: b.id}});
  if (!ro) el.append(h('div', {class: 'gut'}, h('button', {class: 'g-add', dataset: {act: 'g-add', bid: b.id}, title: '아래에 블록 추가', text: '+'}), h('span', {class: 'g-drag', draggable: 'true', dataset: {act: 'g-menu', bid: b.id}, title: '드래그해서 옮기기 · 눌러서 메뉴', text: '⋮⋮'})));
  const bd = h('div', {class: 'bd'});
  el.append(bd);
  switch (b.type) {
    case 'p': bd.append(textEl(b, ro)); break;
    case 'h': bd.append(textEl(b, ro)); break;
    case 'bullet': bd.append(h('div', {class: 'li'}, h('span', {class: 'mk dot', text: '•'}), textEl(b, ro)), kidsEl(b, ro)); break;
    case 'number': bd.append(h('div', {class: 'li'}, h('span', {class: 'mk num', text: num + (b.delim || '.')}), textEl(b, ro)), kidsEl(b, ro)); break;
    case 'todo': {
      const cb = h('input', {type: 'checkbox', class: 'todo-cb', dataset: {act: 'todo', bid: b.id}});
      cb.checked = !!b.checked;
      if (ro) cb.disabled = true;
      bd.append(h('div', {class: 'li'}, cb, textEl(b, ro)), kidsEl(b, ro));
      break;
    }
    case 'toggle': bd.append(h('div', {class: 'tg'}, h('button', {class: 'tg-arrow', dataset: {act: 'tg', bid: b.id}, text: '▶'}), textEl(b, ro)), kidsEl(b, ro)); break;
    case 'quote': bd.append(h('div', {class: 'qt'}, kidsEl(b, ro))); break;
    case 'callout': {
      const [ic, label] = CALLOUT[b.kind] || CALLOUT.NOTE;
      bd.append(h('div', {class: 'co ' + (b.kind || 'NOTE')}, h('button', {class: 'co-ic', dataset: {act: 'co-kind', bid: b.id}, title: '콜아웃 종류 바꾸기 (' + label + ')', text: ic}), h('div', {class: 'co-body'}, kidsEl(b, ro))));
      break;
    }
    case 'code': {
      const area = ro ? h('pre', {class: 'cb-code', text: b.code}) : h('textarea', {class: 'cb-code', spellcheck: 'false', dataset: {role: 'code', bid: b.id}, rows: Math.max(1, (b.code || '').split('\n').length)});
      if (!ro) area.value = b.code || '';
      const lang = ro ? h('span', {text: b.lang || ''}) : h('input', {class: 'cb-lang', value: b.lang || '', placeholder: '언어', dataset: {role: 'lang', bid: b.id}});
      bd.append(h('div', {class: 'cb'}, h('div', {class: 'cb-bar'}, lang, h('button', {class: 'cb-copy', dataset: {act: 'copy', bid: b.id}, text: '복사'})), area));
      break;
    }
    case 'mermaid': {
      const view = h('div', {class: 'mm-view', dataset: {mm: b.id}});
      const src = h('details', {class: 'mm-src'}, h('summary', {text: '다이어그램 코드' + (ro ? ' 보기' : ' 편집')}));
      if (ro) src.append(h('pre', {class: 'cb-code', text: b.code}));
      else { const ta = h('textarea', {class: 'cb-code', spellcheck: 'false', dataset: {role: 'code', bid: b.id}, rows: Math.max(2, (b.code || '').split('\n').length)}); ta.value = b.code || ''; src.append(ta); if (!b.code) src.open = true; }
      bd.append(h('div', {class: 'mm'}, view, src));
      break;
    }
    case 'table': {
      const t = h('table', {class: 'tbl'});
      b.rows.forEach((r, ri) => {
        const tr = h('tr');
        r.forEach((c, ci) => {
          const nodes = MD.parseInline(c);
          const cell = h(ri === 0 ? 'th' : 'td', {class: MD.plainText(nodes).length <= 14 ? 'nw' : null, dataset: {role: 'cell', bid: b.id, r: ri, c: ci, align: (b.align || [])[ci] || null}, html: MD.inlineToHtml(nodes)});
          if (!ro) cell.contentEditable = 'true';
          tr.append(cell);
        });
        t.append(tr);
      });
      bd.append(h('div', {class: 'tb-wrap'}, t));
      if (!ro) bd.append(h('div', {class: 'tb-tools'}, h('button', {dataset: {act: 'row-add', bid: b.id}, text: '＋ 행'}), h('button', {dataset: {act: 'col-add', bid: b.id}, text: '＋ 열'}), h('button', {dataset: {act: 'tbl-menu', bid: b.id}, text: '⋯ 표 편집'})));
      break;
    }
    case 'hr': bd.append(h('div', {class: 'hr-wrap'}, h('hr'))); break;
    case 'image': {
      const img = h('img', {alt: b.alt || '', dataset: {src: b.src || '', act: 'img-open'}});
      const cap = h('figcaption', {dataset: {role: 'caption', bid: b.id}, text: b.alt || ''});
      if (!ro) cap.contentEditable = 'plaintext-only';
      bd.append(h('figure', {class: 'img-fig'}, img, cap));
      break;
    }
    case 'raw': {
      const ta = ro ? h('pre', {class: 'cb-code', text: b.md ?? b.raw}) : h('textarea', {class: 'cb-code', spellcheck: 'false', dataset: {role: 'raw', bid: b.id}, rows: Math.max(1, (b.md ?? b.raw ?? '').split('\n').length)});
      if (!ro) ta.value = b.md ?? b.raw ?? '';
      bd.append(h('div', {class: 'rawb'}, h('div', {class: 'rawb-h', text: 'Markdown 원문 블록 — GitHub에서는 렌더링되어 보여요'}), ta));
      break;
    }
    default: bd.append(h('pre', {class: 'cb-code', text: b.raw || ''}));
  }
  return el;
}
async function hydrateMedia(root) {
  const cur = S.cur;
  if (!cur) return;
  for (const view of $$('[data-mm]', root)) {
    const b = findBlock(view.dataset.mm);
    if (b) renderMermaid(view, b.b.code || '');
  }
  for (const img of $$('img[data-src]', root)) {
    const src = img.dataset.src;
    const r = resolveLink(src, cur.entry);
    if (r.kind === 'external') { img.src = r.url; continue; }
    if (r.kind !== 'file') continue;
    fileUrl(r.repo, r.path).then(u => { img.src = u; }).catch(() => { img.alt = '이미지를 불러오지 못했어요: ' + src; });
  }
  autosizeAll(root);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
function autosizeAll(root) { requestAnimationFrame(() => { for (const ta of $$('textarea.cb-code', root)) autosize(ta); }); }
let mermaidP;
function loadMermaid() {
  return mermaidP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = MERMAID.src; s.integrity = MERMAID.sri; s.crossOrigin = 'anonymous';
    s.onload = () => { try { window.mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'inherit'}); res(window.mermaid); } catch (e) { rej(e); } };
    s.onerror = () => { mermaidP = null; rej(new Error('다이어그램 라이브러리를 불러오지 못했어요')); };
    document.head.append(s);
  });
}
async function renderMermaid(view, code) {
  if (!code.trim()) { view.innerHTML = '<div class="mm-err" style="color:var(--ink3)">아래에 mermaid 코드를 입력하면 다이어그램이 그려져요.</div>'; return; }
  if (S.mermaidCache.has(code)) { view.innerHTML = S.mermaidCache.get(code); return; }
  try {
    const m = await loadMermaid();
    const id = 'mmd' + uid();
    const {svg} = await m.render(id, code);
    S.mermaidCache.set(code, svg);
    view.innerHTML = svg;
  } catch (e) {
    view.innerHTML = '<div class="mm-err">다이어그램 오류: ' + esc((e && e.message || String(e)).slice(0, 400)) + '</div>';
  } finally {
    for (const x of $$('body > [id^="dmmd"], body > [id^="mmd"]')) x.remove();
  }
}

/* ---------------------------------------------------------------- model helpers */
function findBlock(id, blocks = S.cur && S.cur.page && S.cur.page.blocks, parent = null) {
  if (!blocks) return null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.id === id) return {b, arr: blocks, idx: i, parent};
    if (b.children) { const r = findBlock(id, b.children, b); if (r) return r; }
  }
  return null;
}
function markDirty(b) {
  for (let x = b, n = 0; x && n < 100; n++) { x.dirty = true; const loc = findBlock(x.id); x = loc && loc.parent; }
}
function touchContainer(parent) { if (parent) markDirty(parent); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function snapshot() {
  const p = S.cur.page;
  const a = document.activeElement;
  return {blocks: clone(p.blocks), titleMd: p.titleMd, icon: p.icon, titleDirty: !!p.titleDirty, props: p.props ? clone(p.props) : null,
    focus: a && a.dataset && a.dataset.bid ? {bid: a.dataset.bid, off: a.isContentEditable ? caretOffset(a) : 0} : null};
}
function pushHistory(force = false) {
  const cur = S.cur;
  if (!cur || cur.ro) return;
  const t = Date.now();
  const bid = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.bid : null;
  if (!force && t - S.hist.lastAt < 1200 && bid === S.hist.lastBid) return;
  S.hist.undo.push(snapshot());
  if (S.hist.undo.length > 120) S.hist.undo.shift();
  S.hist.redo = [];
  S.hist.lastAt = t; S.hist.lastBid = bid;
}
function restoreSnap(snap) {
  const p = S.cur.page;
  p.blocks = snap.blocks; p.titleMd = snap.titleMd; p.icon = snap.icon; p.titleDirty = snap.titleDirty; p.props = snap.props;
  renderPage({keepScroll: true});
  if (snap.focus) focusBlock(snap.focus.bid, snap.focus.off);
  changed();
}
function undo() { if (!S.hist.undo.length) return; S.hist.redo.push(snapshot()); restoreSnap(S.hist.undo.pop()); S.hist.lastAt = 0; }
function redo() { if (!S.hist.redo.length) return; S.hist.undo.push(snapshot()); restoreSnap(S.hist.redo.pop()); S.hist.lastAt = 0; }
function rerender(focus) {
  const sc = $('#scroller'), top = sc.scrollTop;
  const ed = $('#editor');
  if (!ed) return;
  ed.innerHTML = '';
  S.parentOf.clear();
  renderBlocksInto(ed, S.cur.page.blocks, S.cur.ro);
  if (!S.cur.ro && !S.cur.page.blocks.length) ed.append(h('div', {class: 'txt ph', 'data-ph': '여기를 눌러 내용을 쓰세요. / 로 블록을 추가할 수 있어요.', dataset: {act: 'first-block'}}));
  sc.scrollTop = top;
  hydrateMedia(ed);
  if (focus) focusBlock(focus.bid, focus.off);
}

/* ---------------------------------------------------------------- caret */
function textLen(node) {
  let n = 0;
  const walk = x => { for (const c of x.childNodes) { if (c.nodeType === 3) n += c.nodeValue.length; else if (c.nodeName === 'BR') n += 1; else walk(c); } };
  walk(node);
  return n;
}
function caretOffset(el) {
  const sel = getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return textLen(pre.cloneContents());
}
function pointAt(el, offset) {
  let left = offset;
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = tw.nextNode())) {
    if (node.nodeType === 3) { if (left <= node.nodeValue.length) return [node, left]; left -= node.nodeValue.length; }
    else if (node.nodeName === 'BR') { if (left === 0) return [node.parentNode, [...node.parentNode.childNodes].indexOf(node)]; left -= 1; }
  }
  return [el, el.childNodes.length];
}
function setCaret(el, offset) {
  el.focus({preventScroll: true});
  const sel = getSelection();
  const r = document.createRange();
  if (offset === 'end' || offset == null) { r.selectNodeContents(el); r.collapse(false); }
  else { const [n, o] = pointAt(el, Math.max(0, offset)); r.setStart(n, o); r.collapse(true); }
  sel.removeAllRanges(); sel.addRange(r);
  const rect = (r.getClientRects()[0]) || el.getBoundingClientRect();
  const sc = $('#scroller'), sr = sc.getBoundingClientRect();
  if (rect.bottom > sr.bottom - 40 || rect.top < sr.top + 20) el.scrollIntoView({block: 'nearest'});
}
function focusBlock(bid, off) {
  const el = $('[data-bid="' + bid + '"][data-role="text"]') || $('[data-bid="' + bid + '"][data-role="code"]') || $('[data-bid="' + bid + '"][data-role="cell"]');
  if (!el) return;
  if (el.tagName === 'TEXTAREA') { el.focus(); const p = off === 'end' || off == null ? el.value.length : off; el.setSelectionRange(p, p); return; }
  setCaret(el, off);
}
function selCollapsed() { const s = getSelection(); return !s.rangeCount || s.getRangeAt(0).collapsed; }
function caretLine(el) {
  const s = getSelection();
  if (!s.rangeCount) return {first: true, last: true};
  const r = s.getRangeAt(0).cloneRange();
  r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect) { const tmp = document.createElement('span'); tmp.textContent = '​'; r.insertNode(tmp); rect = tmp.getBoundingClientRect(); tmp.remove(); el.normalize(); }
  const er = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return {first: rect.top - er.top < lh * 0.8, last: er.bottom - rect.bottom < lh * 0.8};
}

/* ---------------------------------------------------------------- DOM -> markdown */
const BLOCKISH = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR']);
function domToInline(root) {
  const out = [];
  const walk = (nodes, acc) => {
    for (const n of nodes) {
      if (n.nodeType === 3) { const v = n.nodeValue.replace(/ /g, ' ').replace(/​/g, ''); if (v) acc.push({t: 'text', v}); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.nodeName;
      if (tag === 'BR') { acc.push({t: 'br'}); continue; }
      if (n.classList && n.classList.contains('ng-iimg')) { acc.push({t: 'img', src: n.dataset.src || '', alt: n.dataset.alt || ''}); continue; }
      if (tag === 'CODE') { const v = n.textContent.replace(/ /g, ' ').replace(/​/g, ''); if (v) acc.push({t: 'code', v}); continue; }
      const kids = [];
      walk(n.childNodes, kids);
      if (tag === 'A') { acc.push({t: 'link', href: n.getAttribute('data-href') ?? n.getAttribute('href') ?? '', c: kids, auto: n.dataset.auto === '1' && n.textContent === n.getAttribute('data-href')}); continue; }
      let type = null;
      if (tag === 'STRONG' || tag === 'B') type = 'strong';
      else if (tag === 'EM' || tag === 'I') type = 'em';
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') type = 's';
      else if (tag === 'KBD') type = 'kbd';
      else if (tag === 'SUB' || tag === 'SUP') type = tag.toLowerCase();
      else if (tag === 'SPAN' && n.style) {
        const fw = n.style.fontWeight;
        if (fw === 'bold' || +fw >= 600) type = 'strong';
        else if (n.style.fontStyle === 'italic') type = 'em';
        else if (/line-through/.test(n.style.textDecoration || n.style.textDecorationLine || '')) type = 's';
      }
      if (type) { acc.push({t: type, c: kids}); continue; }
      if (BLOCKISH.has(tag) && acc.length && acc[acc.length - 1].t !== 'br') acc.push({t: 'br'});
      acc.push(...kids);
    }
  };
  walk(root.childNodes, out);
  while (out.length && out[out.length - 1].t === 'br') out.pop();
  return out;
}
function domMd(el, type) {
  const nodes = MD.normalizeInline(domToInline(el));
  let md = MD.inlineToMd(nodes, type === 'toggle' ? 'html' : 'md');
  if (type === 'p' || MD.isItem({type})) md = MD.escapeBlockStart(md, type);
  if (type === 'h') md = md.replace(/^[ \t]+/, '').replace(/\s+#+$/, m => m.replace(/#/g, '\\#'));
  if (type === 'cell') md = md.replace(/\n/g, ' ');
  return md;
}

/* ---------------------------------------------------------------- change tracking & saving */
function unsaved(cur) { return !!(cur && cur.page && !cur.ro && MD.serializePage(cur.page) !== cur.savedText); }
function changed() {
  const cur = S.cur;
  if (!cur || cur.ro) return;
  cur.firstChange ||= Date.now();
  setStatus('editing');
  clearTimeout(S.saveTimer);
  const waited = Date.now() - cur.firstChange;
  S.saveTimer = setTimeout(() => saveNow(cur), waited > 15000 ? 50 : 1500);
  clearTimeout(S.draftTimer);
  S.draftTimer = setTimeout(() => saveDraft(cur), 400);
}
const draftKey = cur => 'draft:' + cur.repoKey + ':' + cur.path;
function saveDraft(cur) {
  if (!cur || !cur.page) return;
  const text = MD.serializePage(cur.page);
  if (text === cur.savedText) return kvSet(draftKey(cur), undefined);
  return kvSet(draftKey(cur), {text, baseSha: cur.sha, at: nowIso(), id: cur.id});
}
async function checkDraft(cur) {
  const d = await kvGet(draftKey(cur));
  if (!d || d.text === cur.savedText || S.cur !== cur) return;
  if (d.baseSha === cur.sha) {
    toast('저장되지 않은 초안이 이 브라우저에 있어요 (' + relTime(d.at) + ').', {action: '초안 복구', ms: 15000, onAction: () => {
      if (S.cur !== cur) return;
      pushHistory(true);
      cur.page = MD.parsePage(d.text);
      renderPage({keepScroll: true});
      changed();
    }});
  } else {
    toast('이 페이지의 오래된 초안이 있어요. 그 사이 GitHub의 내용이 바뀌었어요.', {action: '초안 내려받기', ms: 15000, onAction: () => download(d.text, (cur.entry.title || 'draft') + ' (초안).md')});
  }
}
async function saveNow(cur = S.cur) {
  if (!cur || !cur.page || cur.ro || S.mode !== 'owner') return;
  clearTimeout(S.saveTimer);
  if (cur.saving) { cur.again = true; return cur.saving; }
  const text = MD.serializePage(cur.page);
  if (text === cur.savedText) { cur.firstChange = 0; if (S.cur === cur) setStatus('saved'); return; }
  const run = (async () => {
    if (S.cur === cur) setStatus('saving');
    const title = MD.pageTitle(cur.page) || '제목 없음';
    try {
      const sha = await S.repos[cur.repoKey].writeText(cur.path, text, cur.sha, 'docs: ' + title + ' 수정');
      noteWrite(cur.repoKey, cur.path, text, sha, cur.sha);
      cur.sha = sha; cur.savedText = text; cur.firstChange = 0; cur.known.add(sha);
      await kvSet(draftKey(cur), undefined);
      const e = S.pages.get(cur.id);
      const icon = cur.page.icon || undefined;
      if (e && (title !== (e.title || '') || (icon || '') !== (e.icon || ''))) {
        await updateEntry(cur.id, {title, icon}, 'docs: ' + title + ' 제목 갱신');
        renderSidebar();
        if (S.cur === cur) setTop(cur);
      }
      if (S.cur === cur) setStatus(unsaved(cur) ? 'editing' : 'saved');
    } catch (e) {
      if ([409, 422].includes(e.status)) await resolveConflict(cur, text);
      else {
        if (S.cur === cur) setStatus(navigator.onLine ? 'error' : 'offline', errorText(e));
        await saveDraft(cur);
        if (navigator.onLine) toast('저장하지 못했어요: ' + errorText(e) + ' 초안은 이 브라우저에 남아 있어요.', {ms: 8000});
      }
    }
  })();
  cur.saving = run;
  try { await run; } finally {
    cur.saving = null;
    if (cur.again) { cur.again = false; if (unsaved(cur)) saveNow(cur); }
  }
}
async function resolveConflict(cur, mine) {
  const repo = S.repos[cur.repoKey];
  let remote;
  try { remote = await repo.readText(cur.path); } catch (e) { if (S.cur === cur) setStatus('error', errorText(e)); return; }
  if (remote && remote.text === mine) { cur.sha = remote.sha; cur.savedText = mine; cur.known.add(remote.sha); if (S.cur === cur) setStatus('saved'); return; }
  if (S.cur === cur) setStatus('conflict');
  const choice = await confirmBox({
    title: '다른 곳에서 이 페이지가 바뀌었어요',
    body: [h('p', {text: '다른 기기나 GitHub에서 이 페이지를 먼저 저장했어요. 어떻게 할까요?'}), h('ul', {}, h('li', {text: '내 버전으로 덮어쓰기: 지금 화면의 내용을 저장해요. 다른 곳의 변경은 GitHub 기록에 남아요.'}), h('li', {text: '다른 곳의 버전 불러오기: 내 변경은 .md 파일로 내려받아 둬요.'}))],
    actions: [{label: '다른 곳의 버전 불러오기', value: 'theirs'}, {label: '내 버전으로 덮어쓰기', value: 'mine', primary: true}],
  });
  if (choice === 'mine') {
    try {
      const fresh = remote ? remote.sha : null;
      cur.sha = await repo.writeText(cur.path, mine, fresh, 'docs: ' + (MD.pageTitle(cur.page) || '제목 없음') + ' 수정 (충돌 후 덮어쓰기)');
      cur.known.add(cur.sha);
      noteWrite(cur.repoKey, cur.path, mine, cur.sha, fresh);
      cur.savedText = mine;
      await kvSet(draftKey(cur), undefined);
      if (S.cur === cur) setStatus('saved');
    } catch (e) { if (S.cur === cur) setStatus('error', errorText(e)); }
  } else if (choice === 'theirs') {
    download(mine, (MD.pageTitle(cur.page) || 'page') + ' (내 버전).md');
    if (!remote) { toast('다른 곳에서 이 파일을 지웠어요.'); return; }
    cur.page = MD.parsePage(remote.text); cur.sha = remote.sha; cur.savedText = MD.serializePage(cur.page); cur.known.add(remote.sha);
    await kvSet(draftKey(cur), undefined);
    if (S.cur === cur) renderPage({keepScroll: true});
  }
}
function download(text, name) {
  const a = h('a', {href: URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'})), download: name.replace(/[\\/:*?"<>|]/g, '_')});
  document.body.append(a); a.click(); a.remove();
}

/* ---------------------------------------------------------------- sync */
function startSync() {
  if (S.syncTimer) return;
  S.syncTimer = setInterval(syncNow, 30000);
  window.addEventListener('focus', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S.cur && unsaved(S.cur)) saveNow(S.cur); } else syncNow(); });
}
async function syncNow() {
  if (S.mode !== 'owner' || document.hidden || S.syncing) return;
  S.syncing = true;
  try {
    let changedAny = false;
    for (const key of Object.keys(S.repos)) {
      const m = await loadManifest(key);
      // GitHub can briefly return an older version right after a write: ignore versions we have already seen
      if (m.sha !== S.man[key].sha && !S.manKnown[key].has(m.sha)) { S.man[key] = m; S.manKnown[key].add(m.sha); changedAny = true; }
    }
    if (changedAny) { rebuildIndex(); renderSidebar(); if (S.cur && S.cur.page) setTop(S.cur); }
    const cur = S.cur;
    if (cur && cur.page && !cur.saving) {
      const e = S.pages.get(cur.id);
      if (!e) { toast('다른 곳에서 이 페이지를 목록에서 지웠어요.'); return; }
      if (e.repo !== cur.repoKey || e.path !== cur.path) { if (!unsaved(cur)) { S.cur = null; openPage(cur.id); } return; }
      const meta = await S.repos[cur.repoKey].meta(cur.path);
      if (meta && meta.sha !== cur.sha && !cur.known.has(meta.sha) && S.cur === cur) {
        if (!unsaved(cur) && !document.activeElement?.isContentEditable) {
          const f = await S.repos[cur.repoKey].readText(cur.path);
          if (f && S.cur === cur && !unsaved(cur)) {
            cur.page = MD.parsePage(f.text); cur.sha = f.sha; cur.savedText = MD.serializePage(cur.page); cur.known.add(f.sha);
            renderPage({keepScroll: true});
            toast('다른 기기에서 바뀐 내용을 반영했어요.');
          }
        }
      }
    }
    if (rate.remaining != null && rate.remaining < 150) toast('GitHub 요청 한도가 얼마 남지 않았어요 (' + rate.remaining + '회).');
  } catch (e) {
    if (e.status === 401) { setStatus('error', errorText(e)); toast(errorText(e), {action: '연결 설정', onAction: openConnect, ms: 12000}); }
  } finally { S.syncing = false; }
}

/* ---------------------------------------------------------------- editor: text editing */
function textTarget(node) { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el && el.closest('[data-role]'); }
function syncText(el) {
  const loc = findBlock(el.dataset.bid);
  if (!loc) return;
  const b = loc.b;
  if (el.innerHTML === '<br>') el.innerHTML = '';
  const md = domMd(el, b.type);
  if (md !== b.text) { b.text = md; markDirty(b); changed(); }
}
function onInput(ev) {
  const el = textTarget(ev.target);
  if (!el || !S.cur || S.cur.ro) return;
  const role = el.dataset.role;
  const loc = el.dataset.bid ? findBlock(el.dataset.bid) : null;
  if (role === 'text' && loc) {
    syncText(el);
    if (!ev.isComposing) { if (markdownShortcut(el, loc)) return; slashCheck(el, ev); }
    return;
  }
  if (role === 'title') {
    const plain = el.textContent.replace(/\n/g, ' ');
    S.cur.page.titleMd = MD.titleToMd(plain); S.cur.page.titleDirty = true;
    const item = $('.ti.on .ti-title'); if (item) item.textContent = plain.trim() || '제목 없음';
    changed(); return;
  }
  if (role === 'cell' && loc) {
    const r = +el.dataset.r, c = +el.dataset.c;
    if (el.innerHTML === '<br>') el.innerHTML = '';
    const md = domMd(el, 'cell');
    if (loc.b.rows[r][c] !== md) { loc.b.rows[r][c] = md; loc.b.rowDirty[r] = true; markDirty(loc.b); changed(); }
    return;
  }
  if ((role === 'pk' || role === 'pv') && S.cur.page.props) {
    const r = +el.dataset.row, md = domMd(el, 'cell');
    const props = S.cur.page.props;
    if (props.rows[r][role === 'pk' ? 0 : 1] !== md) { props.rows[r][role === 'pk' ? 0 : 1] = md; props.rowDirty[r] = true; props.dirty = true; changed(); }
    return;
  }
  if (role === 'code' && loc) {
    loc.b.code = el.value; markDirty(loc.b); autosize(el); changed();
    if (loc.b.type === 'mermaid') { clearTimeout(el._mm); el._mm = setTimeout(() => { const v = $('[data-mm="' + loc.b.id + '"]'); if (v) renderMermaid(v, loc.b.code); }, 700); }
    return;
  }
  if (role === 'lang' && loc) { loc.b.lang = el.value.trim(); markDirty(loc.b); changed(); return; }
  if (role === 'raw' && loc) { loc.b.md = el.value; markDirty(loc.b); autosize(el); changed(); return; }
  if (role === 'caption' && loc) { loc.b.alt = el.textContent.replace(/\n/g, ' '); markDirty(loc.b); changed(); }
}
function onBeforeInput(ev) {
  if (!S.cur || S.cur.ro) return;
  if (ev.inputType === 'historyUndo') { ev.preventDefault(); undo(); return; }
  if (ev.inputType === 'historyRedo') { ev.preventDefault(); redo(); return; }
  const el = textTarget(ev.target);
  if (el) pushHistory();
}
function markdownShortcut(el, loc) {
  const b = loc.b;
  if (b.type !== 'p') return false;
  const text = el.textContent;
  const off = caretOffset(el);
  const rules = [[/^#\s/, 'h1'], [/^##\s/, 'h2'], [/^###\s/, 'h3'], [/^[-*+]\s/, 'bullet'], [/^1[.)]\s/, 'number'], [/^\[\s?\]\s/, 'todo'], [/^\[x\]\s/i, 'todo-x'], [/^>\s/, 'toggle'], [/^["“]\s/, 'quote'], [/^```$/, 'code'], [/^---$/, 'hr']];
  for (const [re, type] of rules) {
    const m = re.exec(text);
    if (!m || off !== m[0].length) continue;
    pushHistory(true);
    // remove the trigger characters from the DOM, keep the rest
    const [n0, o0] = pointAt(el, 0), [n1, o1] = pointAt(el, m[0].length);
    const r = document.createRange(); r.setStart(n0, o0); r.setEnd(n1, o1); r.deleteContents();
    b.text = domMd(el, 'p');
    const rest = b.text;
    if (type === 'hr' || type === 'code') {
      const nb = MD.newBlock(type === 'hr' ? 'hr' : 'code');
      loc.arr.splice(loc.idx, 1, nb);
      touchContainer(loc.parent);
      if (type === 'hr') { const p = MD.newBlock('p'); loc.arr.splice(loc.idx + 1, 0, p); rerender({bid: p.id, off: 0}); }
      else rerender({bid: nb.id, off: 0});
      changed(); return true;
    }
    const target = type === 'todo-x' ? 'todo' : type;
    const nb = convert(b, target, loc);
    if (type === 'todo-x') nb.checked = true;
    nb.text = rest;
    rerender({bid: nb.id, off: 0});
    changed();
    return true;
  }
  return false;
}
/* Replace block `b` with a block of another type in place, keeping text and children when possible. */
function convert(b, type, loc = findBlock(b.id)) {
  let kind = null, level = null, ty = type;
  if (/^h[1-6]$/.test(type)) { ty = 'h'; level = +type[1]; }
  if (type.startsWith('callout:')) { ty = 'callout'; kind = type.split(':')[1]; }
  const nb = MD.newBlock(ty);
  if (level) nb.level = level;
  if (kind) nb.kind = kind;
  if (TEXTUAL.has(ty)) nb.text = b.text != null ? (ty === 'toggle' || b.type === 'toggle' ? reCtx(b.text, b.type, ty) : b.text) : '';
  const kids = b.children || [];
  const extra = [];
  if (ty === 'callout' || ty === 'quote') {
    const p = MD.newBlock('p'); p.text = b.text && b.type !== 'toggle' ? b.text : (b.text ? reCtx(b.text, 'toggle', 'p') : '');
    nb.children = [p, ...kids];
  } else if (NESTABLE.has(ty)) nb.children = kids;
  else extra.push(...kids);
  loc.arr.splice(loc.idx, 1, nb, ...extra);
  touchContainer(loc.parent);
  return nb;
}
function reCtx(md, fromType, toType) {
  if (fromType === toType) return md;
  const nodes = MD.normalizeInline(MD.parseInline(md));
  let out = MD.inlineToMd(nodes, toType === 'toggle' ? 'html' : 'md');
  if (toType !== 'toggle') out = MD.escapeBlockStart(out, toType);
  return out;
}
function prevTextual(b) {
  // visually previous text block (deepest last descendant of previous sibling, or parent)
  const loc = findBlock(b.id);
  if (!loc) return null;
  if (loc.idx === 0) return loc.parent && TEXTUAL.has(loc.parent.type) ? loc.parent : null;
  let p = loc.arr[loc.idx - 1];
  while (p.children && p.children.length && !(p.type === 'toggle' && !$('.blk.open[data-id="' + p.id + '"]'))) p = p.children[p.children.length - 1];
  return p;
}
function visibleFocusables() { return $$('#editor [data-role="text"], #editor [data-role="code"], #editor [data-role="cell"]').filter(x => x.offsetParent !== null); }
function moveFocus(el, dir) {
  const all = visibleFocusables();
  const i = all.indexOf(el);
  const t = all[i + dir];
  if (!t) return false;
  if (t.tagName === 'TEXTAREA') { t.focus(); const p = dir < 0 ? t.value.length : 0; t.setSelectionRange(p, p); }
  else setCaret(t, dir < 0 ? 'end' : 0);
  return true;
}
function onKeyDown(ev) {
  if (ev.isComposing || ev.keyCode === 229) return;
  const el = textTarget(ev.target);
  if (!el || !S.cur || S.cur.ro) return;
  if (slash.open && slashKey(ev)) return;
  const role = el.dataset.role;
  const mod = ev.metaKey || ev.ctrlKey;
  if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if (mod && (ev.shiftKey && ev.key.toLowerCase() === 'z' || ev.key.toLowerCase() === 'y')) { ev.preventDefault(); redo(); return; }
  if (role === 'title') {
    if (ev.key === 'Enter') { ev.preventDefault(); const first = S.cur.page.blocks[0]; if (first && TEXTUAL.has(first.type)) focusBlock(first.id, 0); else { pushHistory(true); const p = MD.newBlock('p'); S.cur.page.blocks.unshift(p); rerender({bid: p.id, off: 0}); changed(); } }
    if (ev.key === 'ArrowDown') { const all = visibleFocusables(); if (all[0]) { ev.preventDefault(); setCaret(all[0], 0); } }
    return;
  }
  if (role === 'code' || role === 'raw') {
    if (ev.key === 'Tab') { ev.preventDefault(); const s = el.selectionStart, e2 = el.selectionEnd; el.setRangeText('  ', s, e2, 'end'); el.dispatchEvent(new Event('input', {bubbles: true})); }
    if (ev.key === 'Enter' && mod) { ev.preventDefault(); const loc = findBlock(el.dataset.bid); if (loc) { pushHistory(true); const p = MD.newBlock('p'); loc.arr.splice(loc.idx + 1, 0, p); touchContainer(loc.parent); rerender({bid: p.id, off: 0}); changed(); } }
    if (ev.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) { if (moveFocus(el, -1)) ev.preventDefault(); }
    if (ev.key === 'ArrowDown' && el.selectionStart === el.value.length) { if (moveFocus(el, 1)) ev.preventDefault(); }
    if (ev.key === 'Backspace' && !el.value && role === 'code') { ev.preventDefault(); const loc = findBlock(el.dataset.bid); if (loc) { pushHistory(true); const p = MD.newBlock('p'); loc.arr.splice(loc.idx, 1, p); touchContainer(loc.parent); rerender({bid: p.id, off: 0}); changed(); } }
    return;
  }
  if (role === 'cell') { cellKey(ev, el); return; }
  if (role === 'pk' || role === 'pv') { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } return; }
  if (role !== 'text') return;
  const loc = findBlock(el.dataset.bid);
  if (!loc) return;
  const b = loc.b;
  if (mod && !ev.shiftKey && ['b', 'i', 'e', 'k'].includes(ev.key.toLowerCase())) {
    ev.preventDefault();
    const k = ev.key.toLowerCase();
    if (k === 'b') fmt('bold'); else if (k === 'i') fmt('italic'); else if (k === 'e') fmt('code'); else if (!selCollapsed()) fmt('link');
    return;
  }
  if (mod && ev.shiftKey && ev.key.toLowerCase() === 's') { ev.preventDefault(); fmt('strike'); return; }
  if (mod && ev.key === 'Enter' && b.type === 'todo') { ev.preventDefault(); pushHistory(true); b.checked = !b.checked; markDirty(b); rerender({bid: b.id, off: caretOffset(el)}); changed(); return; }
  if (ev.key === 'Enter' && ev.shiftKey) { ev.preventDefault(); document.execCommand('insertLineBreak'); return; }
  if (ev.key === 'Enter') { ev.preventDefault(); splitBlock(el, loc); return; }
  if (ev.key === 'Backspace' && selCollapsed() && caretOffset(el) === 0) { ev.preventDefault(); backspaceAtStart(el, loc); return; }
  if (ev.key === 'Delete' && selCollapsed() && caretOffset(el) === textLen(el)) { ev.preventDefault(); deleteAtEnd(el, loc); return; }
  if (ev.key === 'Tab') { ev.preventDefault(); if (ev.shiftKey) outdent(loc); else indent(loc); return; }
  if (ev.key === 'ArrowUp' && caretLine(el).first) { if (moveFocus(el, -1)) ev.preventDefault(); return; }
  if (ev.key === 'ArrowDown' && caretLine(el).last) { if (moveFocus(el, 1)) ev.preventDefault(); return; }
  if (ev.key === 'Escape') { el.blur(); }
}
function splitBlock(el, loc) {
  const b = loc.b;
  pushHistory(true);
  const sel = getSelection();
  const r = sel.getRangeAt(0);
  if (!r.collapsed) r.deleteContents();
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(el, el.childNodes.length);
  const frag = tail.extractContents();
  const holder = document.createElement('div');
  holder.append(frag);
  const left = domMd(el, b.type), rightType = (MD.isItem(b) ? b.type : 'p');
  const right = domMd(holder, rightType === 'toggle' ? 'toggle' : rightType);
  // empty list item: leave the list
  if ((MD.isItem(b)) && !left && !right) {
    if (loc.parent && MD.isItem(loc.parent)) { b.text = ''; outdent(loc, true); return; }
    const nb = convert(b, 'p', loc); nb.text = '';
    rerender({bid: nb.id, off: 0}); changed(); return;
  }
  // caret at the very start of a non-empty block: open an empty block above
  if (!left && right && b.type !== 'toggle') {
    b.text = right; markDirty(b);
    const nb = MD.newBlock(MD.isItem(b) ? b.type : 'p');
    if (b.type === 'number') nb.delim = b.delim;
    if (MD.isItem(b)) nb.bullet = b.bullet;
    loc.arr.splice(loc.idx, 0, nb); touchContainer(loc.parent);
    rerender({bid: b.id, off: 0}); changed(); return;
  }
  b.text = left; markDirty(b);
  let nb;
  if (b.type === 'toggle') {
    nb = MD.newBlock('p'); nb.text = MD.escapeBlockStart(reCtx(right, 'toggle', 'p'), 'p');
    S.openToggles ||= new Set(); S.openToggles.add(b.id);
    b.children = b.children || []; b.children.unshift(nb); markDirty(b);
  } else {
    nb = MD.newBlock(MD.isItem(b) ? b.type : 'p');
    if (b.type === 'number') nb.delim = b.delim;
    if (MD.isItem(b)) nb.bullet = b.bullet;
    nb.text = right;
    if (MD.isItem(b) && b.children && b.children.length && !right) { nb.children = []; }
    loc.arr.splice(loc.idx + 1, 0, nb); touchContainer(loc.parent);
  }
  rerender({bid: nb.id, off: 0});
  changed();
}
function backspaceAtStart(el, loc) {
  const b = loc.b;
  if (b.type !== 'p') {
    pushHistory(true);
    const nb = convert(b, 'p', loc);
    rerender({bid: nb.id, off: 0}); changed(); return;
  }
  if (loc.parent && loc.idx === 0 && !MD.isItem(loc.parent) && loc.parent.type !== 'toggle' && loc.arr.length > 1) {
    // first paragraph inside a callout/quote: move it out above the container
    pushHistory(true);
    const outer = findBlock(loc.parent.id);
    loc.arr.splice(0, 1); markDirty(loc.parent);
    outer.arr.splice(outer.idx, 0, b); touchContainer(outer.parent);
    rerender({bid: b.id, off: 0}); changed(); return;
  }
  if (loc.parent && loc.idx === loc.arr.length - 1 && loc.arr.length > 1 && (MD.isItem(loc.parent) || loc.parent.type === 'toggle')) { pushHistory(true); outdent(loc, true); return; }
  const prev = prevTextual(b);
  if (!prev) {
    if (loc.parent && !b.text && loc.arr.length === 1) { pushHistory(true); loc.arr.splice(loc.idx, 1); markDirty(loc.parent); rerender(TEXTUAL.has(loc.parent.type) ? {bid: loc.parent.id, off: 'end'} : null); changed(); }
    return;
  }
  pushHistory(true);
  if (!TEXTUAL.has(prev.type)) {
    if (!b.text) { loc.arr.splice(loc.idx, 1); touchContainer(loc.parent); rerender(); const f = $('[data-bid="' + prev.id + '"]'); if (f) f.focus(); changed(); }
    return;
  }
  const prevEl = $('[data-bid="' + prev.id + '"][data-role="text"]');
  const joinAt = prevEl ? textLen(prevEl) : MD.plainText(MD.parseInline(prev.text)).length;
  const holder = document.createElement('div');
  holder.innerHTML = MD.inlineToHtml(MD.parseInline(prev.text)) + MD.inlineToHtml(MD.parseInline(b.text));
  prev.text = domMd(holder, prev.type);
  markDirty(prev);
  loc.arr.splice(loc.idx, 1, ...(b.children || []));
  touchContainer(loc.parent);
  rerender({bid: prev.id, off: joinAt});
  changed();
}
function deleteAtEnd(el, loc) {
  const all = visibleFocusables();
  const next = all[all.indexOf(el) + 1];
  if (!next || next.dataset.role !== 'text') return;
  const nloc = findBlock(next.dataset.bid);
  if (!nloc || (nloc.b.children && nloc.b.children.length)) return;
  pushHistory(true);
  const at = textLen(el);
  const holder = document.createElement('div');
  holder.innerHTML = MD.inlineToHtml(MD.parseInline(loc.b.text)) + MD.inlineToHtml(MD.parseInline(nloc.b.text));
  loc.b.text = domMd(holder, loc.b.type); markDirty(loc.b);
  nloc.arr.splice(nloc.idx, 1); touchContainer(nloc.parent);
  rerender({bid: loc.b.id, off: at}); changed();
}
function indent(loc) {
  if (loc.idx === 0) return;
  const prev = loc.arr[loc.idx - 1];
  if (!NESTABLE.has(prev.type)) return;
  pushHistory(true);
  const off = caretOffset(document.activeElement);
  loc.arr.splice(loc.idx, 1);
  prev.children = prev.children || [];
  prev.children.push(loc.b);
  markDirty(prev);
  if (prev.type === 'toggle') { S.openToggles ||= new Set(); S.openToggles.add(prev.id); }
  rerender({bid: loc.b.id, off}); changed();
}
function outdent(loc, keepCaretStart) {
  const P = loc.parent;
  if (!P) return;
  pushHistory(true);
  const off = keepCaretStart ? 0 : caretOffset(document.activeElement);
  const outer = findBlock(P.id);
  const moved = loc.arr.splice(loc.idx);
  const b = moved.shift();
  markDirty(P);
  if (moved.length) { if (NESTABLE.has(b.type)) { b.children = [...(b.children || []), ...moved]; markDirty(b); } }
  outer.arr.splice(outer.idx + 1, 0, b, ...(NESTABLE.has(b.type) ? [] : moved));
  touchContainer(outer.parent);
  rerender({bid: b.id, off}); changed();
}

/* ---------------------------------------------------------------- table editing */
function cellKey(ev, el) {
  const loc = findBlock(el.dataset.bid);
  if (!loc) return;
  const b = loc.b, r = +el.dataset.r, c = +el.dataset.c;
  const cols = b.rows[0].length;
  const focusCell = (rr, cc) => { const t = $('[data-bid="' + b.id + '"][data-r="' + rr + '"][data-c="' + cc + '"]'); if (t) setCaret(t, 'end'); };
  if (ev.key === 'Tab') {
    ev.preventDefault();
    let rr = r, cc = c + (ev.shiftKey ? -1 : 1);
    if (cc >= cols) { cc = 0; rr++; } if (cc < 0) { cc = cols - 1; rr--; }
    if (rr >= b.rows.length) { pushHistory(true); b.rows.push(Array(cols).fill('')); b.rowDirty.push(true); markDirty(b); rerender(); changed(); }
    if (rr >= 0) focusCell(rr, cc);
    return;
  }
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    if (r + 1 >= b.rows.length) { pushHistory(true); b.rows.push(Array(cols).fill('')); b.rowDirty.push(true); markDirty(b); rerender(); changed(); }
    focusCell(r + 1, c);
    return;
  }
  if (ev.key === 'Enter' && ev.shiftKey) { ev.preventDefault(); document.execCommand('insertLineBreak'); }
}
function tableOp(b, op, ri, ci) {
  pushHistory(true);
  const cols = b.rows[0].length;
  if (op === 'row-add') { b.rows.splice(ri, 0, Array(cols).fill('')); b.rowDirty.splice(ri, 0, true); if (b.rowRaw) b.rowRaw.splice(ri, 0, null); }
  if (op === 'row-del' && b.rows.length > 2 && ri > 0) { b.rows.splice(ri, 1); b.rowDirty.splice(ri, 1); if (b.rowRaw) b.rowRaw.splice(ri, 1); }
  if (op === 'col-add') { b.rows.forEach(r => r.splice(ci, 0, '')); (b.align ||= []).splice(ci, 0, null); b.shapeDirty = true; }
  if (op === 'col-del' && cols > 1) { b.rows.forEach(r => r.splice(ci, 1)); (b.align || []).splice(ci, 1); b.shapeDirty = true; }
  if (op.startsWith('align-')) { (b.align ||= Array(cols).fill(null))[ci] = op === 'align-none' ? null : op.slice(6); b.shapeDirty = true; }
  markDirty(b); rerender(); changed();
}

/* ---------------------------------------------------------------- inline format toolbar */
let fmtBar = null;
function fmt(kind) {
  const el = textTarget(getSelection().anchorNode);
  if (!el) return;
  pushHistory(true);
  if (kind === 'bold') document.execCommand('bold');
  else if (kind === 'italic') document.execCommand('italic');
  else if (kind === 'strike') document.execCommand('strikeThrough');
  else if (kind === 'code') toggleCode(el);
  else if (kind === 'link') { showLinkInput(el); return; }
  el.dispatchEvent(new Event('input', {bubbles: true}));
  placeFmtBar();
}
function toggleCode(el) {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const anc = r.commonAncestorContainer;
  const inCode = (anc.nodeType === 1 ? anc : anc.parentElement).closest('code');
  if (inCode && el.contains(inCode)) { inCode.replaceWith(document.createTextNode(inCode.textContent)); el.normalize(); return; }
  const text = r.toString();
  if (!text) return;
  r.deleteContents();
  const c = document.createElement('code');
  c.textContent = text;
  r.insertNode(c);
  const after = document.createRange(); after.setStartAfter(c); after.collapse(true);
  sel.removeAllRanges(); sel.addRange(after);
}
function showLinkInput(el, existing) {
  const sel = getSelection();
  const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const bar = fmtBar || makeFmtBar();
  bar.innerHTML = '';
  const input = h('input', {placeholder: '링크 주소 또는 페이지 경로 (예: 2-phase1.md)', value: existing ? existing.getAttribute('data-href') || existing.getAttribute('href') || '' : ''});
  const apply = () => {
    const url = input.value.trim();
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (existing) {
      if (!url) existing.replaceWith(...existing.childNodes);
      else { existing.setAttribute('href', /^javascript:/i.test(url) ? '#' : url); existing.setAttribute('data-href', url); existing.removeAttribute('data-auto'); }
    } else if (url) document.execCommand('createLink', false, url);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    hideFmtBar();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { e.preventDefault(); hideFmtBar(); el.focus(); } });
  bar.append(input, h('button', {text: '확인', onmousedown: e => { e.preventDefault(); apply(); }}));
  bar.hidden = false;
  const rect = (existing || range) ? (existing || range).getBoundingClientRect() : el.getBoundingClientRect();
  bar.style.left = Math.max(8, Math.min(rect.left, innerWidth - 330)) + 'px';
  bar.style.top = Math.max(8, rect.top - 42) + 'px';
  setTimeout(() => input.focus(), 0);
}
function makeFmtBar() { fmtBar = h('div', {class: 'fmt', hidden: true}); document.body.append(fmtBar); return fmtBar; }
function hideFmtBar() { if (fmtBar) fmtBar.hidden = true; }
function placeFmtBar() {
  if (!S.cur || S.cur.ro) return hideFmtBar();
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { if (!fmtBar || !fmtBar.contains(document.activeElement)) hideFmtBar(); return; }
  const el = textTarget(sel.anchorNode);
  if (!el || !['text', 'cell', 'pv', 'pk'].includes(el.dataset.role) || !el.contains(sel.focusNode)) return hideFmtBar();
  const bar = fmtBar || makeFmtBar();
  if (bar.contains(document.activeElement)) return;
  bar.innerHTML = '';
  for (const [k, label, title] of [['bold', 'B', '굵게 ⌘B'], ['italic', 'i', '기울임 ⌘I'], ['strike', 'S', '취소선 ⌘⇧S'], ['code', '</>', '코드 ⌘E'], ['link', '🔗 링크', '링크 ⌘K']]) {
    bar.append(h('button', {title, html: k === 'bold' ? '<b>B</b>' : k === 'italic' ? '<i>i</i>' : k === 'strike' ? '<s>S</s>' : esc(label), onmousedown: e => { e.preventDefault(); fmt(k); }}));
  }
  bar.hidden = false;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  bar.style.left = Math.max(8, Math.min(rect.left, innerWidth - 260)) + 'px';
  bar.style.top = Math.max(8, rect.top - 40) + 'px';
}

/* ---------------------------------------------------------------- slash menu */
const SLASH = [
  ['p', '텍스트', '¶', 'text paragraph 텍스트 본문'], ['h1', '제목 1', 'H1', 'heading h1 제목 큰'], ['h2', '제목 2', 'H2', 'heading h2 제목'], ['h3', '제목 3', 'H3', 'heading h3 제목 작은'],
  ['bullet', '글머리 기호 목록', '•', 'bullet list ul 목록 글머리'], ['number', '번호 목록', '1.', 'number ordered ol 번호'], ['todo', '할 일 목록', '☑', 'todo task check 할일 체크'],
  ['toggle', '토글', '▸', 'toggle details 토글 접기'],
  ['callout:NOTE', '콜아웃 · 참고', 'ℹ️', 'callout note 콜아웃 참고 메모'], ['callout:TIP', '콜아웃 · 팁', '💡', 'callout tip 콜아웃 팁'], ['callout:IMPORTANT', '콜아웃 · 중요', '❗', 'callout important 콜아웃 중요'],
  ['callout:WARNING', '콜아웃 · 주의', '⚠️', 'callout warning 콜아웃 주의'], ['callout:CAUTION', '콜아웃 · 경고', '🛑', 'callout caution 콜아웃 경고 위험'],
  ['quote', '인용', '❝', 'quote 인용'], ['hr', '구분선', '—', 'divider hr line 구분선 선'], ['code', '코드', '</>', 'code 코드'], ['mermaid', '다이어그램', '◇', 'mermaid diagram flowchart 다이어그램 흐름도 그림'],
  ['table', '표', '▦', 'table 표 테이블'], ['image', '이미지 업로드', '🖼', 'image picture 이미지 사진 그림'], ['file', '파일 첨부', '📎', 'file pdf attach 파일 첨부'],
  ['subpage', '하위 페이지', '📄', 'page subpage 하위 페이지 새'], ['linkpage', '페이지 링크', '↗', 'link mention 링크 페이지 연결'],
];
const slash = {open: false, el: null, bid: null, start: 0, items: [], sel: 0, box: null};
function slashCheck(el, ev) {
  const off = caretOffset(el);
  if (slash.open && slash.bid === el.dataset.bid) {
    const text = el.textContent;
    if (off <= slash.start || text[slash.start] !== '/') return closeSlash();
    const q = text.slice(slash.start + 1, off);
    if (q.length > 24 || /\s{2}/.test(q)) return closeSlash();
    renderSlash(q);
    return;
  }
  if (ev.data === '/' && ev.inputType === 'insertText') {
    const text = el.textContent;
    const before = text[off - 2];
    if (off >= 1 && text[off - 1] === '/' && (off === 1 || /\s/.test(before))) {
      Object.assign(slash, {open: true, el, bid: el.dataset.bid, start: off - 1, sel: 0});
      renderSlash('');
    }
  }
}
function renderSlash(q) {
  const ql = q.trim().toLowerCase();
  const items = SLASH.filter(([, label, , kw]) => !ql || label.toLowerCase().includes(ql) || kw.toLowerCase().includes(ql));
  if (!items.length && ql.length > 2) return closeSlash();
  slash.items = items;
  slash.sel = Math.min(slash.sel, Math.max(0, items.length - 1));
  slash.box ||= document.body.appendChild(h('div', {class: 'pop', role: 'listbox'}));
  const box = slash.box;
  box.innerHTML = '';
  box.append(h('div', {class: 'pop-h', text: items.length ? '블록' : '결과 없음'}));
  items.forEach(([k, label, ic], i) => box.append(h('button', {class: 'pop-i' + (i === slash.sel ? ' on' : ''), dataset: {k}, onmousedown: e => { e.preventDefault(); applySlash(k); }}, h('span', {class: 'pi', text: ic}), h('span', {text: label}))));
  const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : slash.el.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px';
  const below = r.bottom + 6, height = Math.min(420, box.scrollHeight);
  box.style.top = (below + height > innerHeight - 10 ? Math.max(8, r.top - height - 6) : below) + 'px';
  box.hidden = false;
  const on = box.querySelector('.pop-i.on'); if (on) on.scrollIntoView({block: 'nearest'});
}
function closeSlash() { slash.open = false; if (slash.box) slash.box.hidden = true; }
function slashKey(ev) {
  if (ev.key === 'ArrowDown') { ev.preventDefault(); slash.sel = (slash.sel + 1) % Math.max(1, slash.items.length); renderSlash(currentSlashQuery()); return true; }
  if (ev.key === 'ArrowUp') { ev.preventDefault(); slash.sel = (slash.sel - 1 + slash.items.length) % Math.max(1, slash.items.length); renderSlash(currentSlashQuery()); return true; }
  if (ev.key === 'Enter' || ev.key === 'Tab') { if (!slash.items.length) { closeSlash(); return false; } ev.preventDefault(); applySlash(slash.items[slash.sel][0]); return true; }
  if (ev.key === 'Escape') { ev.preventDefault(); closeSlash(); return true; }
  return false;
}
function currentSlashQuery() { return slash.el ? slash.el.textContent.slice(slash.start + 1, caretOffset(slash.el)) : ''; }
async function applySlash(k) {
  const el = slash.el;
  closeSlash();
  const loc = el && findBlock(el.dataset.bid);
  if (!loc) return;
  pushHistory(true);
  const end = caretOffset(el);
  const [n0, o0] = pointAt(el, slash.start), [n1, o1] = pointAt(el, end);
  const r = document.createRange(); r.setStart(n0, o0); r.setEnd(n1, o1); r.deleteContents();
  loc.b.text = domMd(el, loc.b.type); markDirty(loc.b);
  const empty = !el.textContent.trim() && !(loc.b.children || []).length;
  await insertKind(k, loc, empty);
}
async function insertKind(k, loc, replace) {
  const place = nb => { if (replace) loc.arr.splice(loc.idx, 1, nb); else loc.arr.splice(loc.idx + 1, 0, nb); touchContainer(loc.parent); };
  if (k === 'image' || k === 'file') { pickFiles(k === 'image' ? 'image/*' : '', files => uploadAndInsert(files, loc.b.id, replace)); if (replace) { rerender(); } changed(); return; }
  if (k === 'subpage') { const id = await createPage({repoKey: S.cur.repoKey, parentId: S.cur.id, insertLinkInto: {loc, replace}}); return id; }
  if (k === 'linkpage') { openSearch({pick: e => { const p = MD.newBlock('p'); p.text = '[' + MD.escapeText(pageIcon(e) + ' ' + pageTitle(e), 'md', ' ', '') + '](' + encodeURI(relPath(S.cur.path, e.path)) + ')'; place(p); rerender({bid: p.id, off: 'end'}); changed(); }}); return; }
  if (k === 'hr') { const nb = MD.newBlock('hr'); place(nb); const p = MD.newBlock('p'); const l2 = findBlock(nb.id); l2.arr.splice(l2.idx + 1, 0, p); rerender({bid: p.id, off: 0}); changed(); return; }
  if (['code', 'mermaid', 'table'].includes(k)) { const nb = MD.newBlock(k); place(nb); rerender(k === 'table' ? null : {bid: nb.id, off: 0}); if (k === 'table') { const c = $('[data-bid="' + nb.id + '"][data-r="0"][data-c="0"]'); if (c) setCaret(c, 0); } changed(); return; }
  if (replace) { const nb = convert(loc.b, k, loc); if (['toggle', 'callout', 'quote'].includes(nb.type)) { const first = nb.children && nb.children[0]; if (nb.type === 'toggle') { S.openToggles ||= new Set(); S.openToggles.add(nb.id); } rerender({bid: nb.type === 'toggle' ? nb.id : first ? first.id : nb.id, off: 0}); } else rerender({bid: nb.id, off: 0}); changed(); return; }
  const tmp = MD.newBlock('p');
  loc.arr.splice(loc.idx + 1, 0, tmp);
  const nb = convert(tmp, k, findBlock(tmp.id));
  touchContainer(loc.parent);
  const focusId = ['callout', 'quote'].includes(nb.type) ? nb.children[0].id : nb.id;
  if (nb.type === 'toggle') { S.openToggles ||= new Set(); S.openToggles.add(nb.id); }
  rerender({bid: focusId, off: 0});
  changed();
}

/* ---------------------------------------------------------------- block menu & drag */
let pop = null;
function closePops() { if (pop) { pop.remove(); pop = null; } closeSlash(); hideFmtBar(); }
function popMenu(anchor, items, opts = {}) {
  closePops();
  pop = h('div', {class: 'pop', role: 'menu'});
  for (const it of items) {
    if (it === '-') { pop.append(h('div', {class: 'pop-sep'})); continue; }
    if (it.head) { pop.append(h('div', {class: 'pop-h', text: it.head})); continue; }
    pop.append(h('button', {class: 'pop-i' + (it.danger ? ' danger' : ''), onclick: () => { closePops(); it.run(); }}, it.icon ? h('span', {class: 'pi', text: it.icon}) : null, h('span', {}, it.label, it.sub ? h('small', {text: it.sub}) : null)));
  }
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, ht = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(opts.right ? r.right - w : r.left, innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 4 + ht > innerHeight - 8 ? Math.max(8, r.top - ht - 4) : r.bottom + 4) + 'px';
}
function blockMenu(anchor, bid) {
  const loc = findBlock(bid);
  if (!loc) return;
  const b = loc.b;
  const turn = (k, label, ic) => ({label, icon: ic, run: () => { pushHistory(true); const nb = convert(b, k, findBlock(b.id)); rerender({bid: nb.id, off: 'end'}); changed(); }});
  const items = [
    {label: '삭제', icon: '🗑', danger: true, run: () => { pushHistory(true); const l = findBlock(bid); l.arr.splice(l.idx, 1); touchContainer(l.parent); rerender(); changed(); }},
    {label: '복제', icon: '⧉', run: () => { pushHistory(true); const l = findBlock(bid); const c = clone(l.b); MD.walkBlocks([c], x => { x.id = MD.newId(); }); c.id = MD.newId(); c.before = undefined; l.arr.splice(l.idx + 1, 0, c); touchContainer(l.parent); rerender(); changed(); }},
    {label: '위로 이동', icon: '↑', run: () => moveSibling(bid, -1)},
    {label: '아래로 이동', icon: '↓', run: () => moveSibling(bid, 1)},
  ];
  if (TEXTUAL.has(b.type)) {
    items.push('-', {head: '전환'}, turn('p', '텍스트', '¶'), turn('h1', '제목 1', 'H1'), turn('h2', '제목 2', 'H2'), turn('h3', '제목 3', 'H3'), turn('bullet', '글머리 기호 목록', '•'), turn('number', '번호 목록', '1.'), turn('todo', '할 일 목록', '☑'), turn('toggle', '토글', '▸'), turn('callout:NOTE', '콜아웃', 'ℹ️'), turn('quote', '인용', '❝'));
  }
  popMenu(anchor, items);
}
function moveSibling(bid, dir) {
  const l = findBlock(bid);
  const j = l.idx + dir;
  if (j < 0 || j >= l.arr.length) return;
  pushHistory(true);
  const [b] = l.arr.splice(l.idx, 1);
  l.arr.splice(j, 0, b);
  touchContainer(l.parent);
  rerender(); changed();
}
const drag = {bid: null, target: null, where: null};
function onDragStart(ev) {
  const handle = ev.target.closest && ev.target.closest('.g-drag');
  const ti = ev.target.closest && ev.target.closest('.ti');
  if (ti && S.mode === 'owner') { treeDrag.id = ti.dataset.id; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', 'page:' + ti.dataset.id); return; }
  if (!handle) return;
  drag.bid = handle.dataset.bid;
  const blk = handle.closest('.blk');
  blk.classList.add('dragging');
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', 'block:' + drag.bid);
  try { ev.dataTransfer.setDragImage(blk, 20, 12); } catch {}
}
function clearDropMarks() { for (const x of $$('.drop-before, .drop-after, .drop-in')) x.classList.remove('drop-before', 'drop-after', 'drop-in'); }
function onDragOver(ev) {
  if (treeDrag.id) return treeDragOver(ev);
  if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files') && S.cur && !S.cur.ro) { ev.preventDefault(); $('#app').classList.add('dropping'); return; }
  if (!drag.bid) return;
  const blk = ev.target.closest && ev.target.closest('#editor .blk');
  if (!blk || blk.dataset.id === drag.bid || blk.closest('[data-id="' + drag.bid + '"]')) return;
  ev.preventDefault();
  clearDropMarks();
  const r = blk.getBoundingClientRect();
  const where = ev.clientY < r.top + r.height / 2 ? 'before' : 'after';
  blk.classList.add('drop-' + where);
  drag.target = blk.dataset.id; drag.where = where;
}
function onDrop(ev) {
  if (treeDrag.id) return treeDrop(ev);
  const files = ev.dataTransfer && [...ev.dataTransfer.files];
  if (files && files.length && S.cur && !S.cur.ro) {
    ev.preventDefault();
    const blk = ev.target.closest && ev.target.closest('#editor .blk');
    const bid = blk ? blk.dataset.id : (S.cur.page.blocks[S.cur.page.blocks.length - 1] || {}).id;
    uploadAndInsert(files, bid, false);
    return;
  }
  if (!drag.bid || !drag.target) return;
  ev.preventDefault();
  const src = findBlock(drag.bid), dst = findBlock(drag.target);
  if (src && dst) {
    pushHistory(true);
    const [b] = src.arr.splice(src.idx, 1);
    touchContainer(src.parent);
    const d2 = findBlock(drag.target);
    d2.arr.splice(d2.idx + (drag.where === 'after' ? 1 : 0), 0, b);
    touchContainer(d2.parent);
    rerender(); changed();
  }
  onDragEnd();
}
function onDragEnd() { drag.bid = drag.target = null; treeDrag.id = null; clearDropMarks(); for (const x of $$('.dragging')) x.classList.remove('dragging'); }

/* ---------------------------------------------------------------- sidebar drag (reorder / nest pages) */
const treeDrag = {id: null, target: null, where: null};
function treeDragOver(ev) {
  const ti = ev.target.closest && ev.target.closest('.ti');
  if (!ti || ti.dataset.id === treeDrag.id) return;
  if (descendants(treeDrag.id).some(d => d.id === ti.dataset.id)) return;
  ev.preventDefault();
  clearDropMarks();
  const r = ti.getBoundingClientRect(), y = ev.clientY - r.top;
  const where = y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'in';
  ti.classList.add('drop-' + where);
  treeDrag.target = ti.dataset.id; treeDrag.where = where;
}
async function treeDrop(ev) {
  ev.preventDefault();
  const id = treeDrag.id, tid = treeDrag.target, where = treeDrag.where;
  onDragEnd();
  if (!id || !tid) return;
  const t = S.pages.get(tid);
  if (!t) return;
  let parent, order;
  if (where === 'in') { parent = tid; const ks = kidsOf(tid); order = ks.length ? (ks[ks.length - 1].order ?? 0) + 1 : 1; ui.expanded[tid] = 1; saveUi(); }
  else {
    parent = t.parent && S.pages.has(t.parent) ? t.parent : null;
    const sib = kidsOf(parent).filter(x => x.id !== id);
    const i = sib.findIndex(x => x.id === tid);
    const a = where === 'before' ? sib[i - 1] : sib[i], b = where === 'before' ? sib[i] : sib[i + 1];
    order = a && b ? ((a.order ?? 0) + (b.order ?? 0)) / 2 : a ? (a.order ?? 0) + 1 : (b.order ?? 0) - 1;
  }
  try { await updateEntry(id, {parent, order}, 'docs: 페이지 위치 바꾸기'); renderSidebar(); if (S.cur) setTop(S.cur); }
  catch (e) { toast('옮기지 못했어요: ' + errorText(e)); }
}

/* ---------------------------------------------------------------- files */
function pickFiles(accept, cb) {
  const fi = $('#fileIn');
  fi.value = ''; fi.accept = accept || '';
  fi.onchange = () => { if (fi.files.length) cb([...fi.files]); };
  fi.click();
}
function safeName(name) {
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(name.normalize('NFC'));
  const base = (m[1] || 'file').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
  return base + (m[2] || '').toLowerCase();
}
async function uploadAndInsert(files, afterBid, replace) {
  const cur = S.cur;
  if (!cur || cur.ro) return;
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) { toast(f.name + ': 25MB 이하 파일만 올릴 수 있어요.'); continue; }
    const path = 'files/' + cur.id + '/' + Date.now().toString(36) + '-' + safeName(f.name);
    toast('올리는 중… ' + f.name, {ms: 60000});
    try {
      await S.repos[cur.repoKey].writeBytes(path, new Uint8Array(await f.arrayBuffer()), null, 'docs: 첨부 파일 추가 (' + f.name + ')');
      if (S.cur !== cur) return;
      const rel = encodeURI(relPath(cur.path, path));
      pushHistory(true);
      let nb;
      if (f.type.startsWith('image/')) nb = MD.newBlock('image', {src: rel, alt: f.name.replace(/\.[^.]+$/, '')});
      else { nb = MD.newBlock('p'); nb.text = '📎 [' + MD.escapeText(f.name, 'md', ' ', '') + '](' + rel + ')'; }
      const loc = afterBid && findBlock(afterBid);
      if (loc) { if (replace && TEXTUAL.has(loc.b.type) && !loc.b.text) loc.arr.splice(loc.idx, 1, nb); else loc.arr.splice(loc.idx + 1, 0, nb); touchContainer(loc.parent); }
      else cur.page.blocks.push(nb);
      afterBid = nb.id; replace = false;
      rerender(); changed();
      toast('올렸어요: ' + f.name);
    } catch (e) { toast(f.name + ' 업로드 실패: ' + errorText(e), {ms: 8000}); }
  }
}

/* ---------------------------------------------------------------- pages: create, trash, delete, move */
function newPagePath(repoKey, parentId, id) {
  const parent = parentId && S.pages.get(parentId);
  let dir = 'pages';
  if (parent && parent.repo === repoKey && /(^|\/)README\.md$/i.test(parent.path) && parent.path.includes('/')) dir = parent.path.replace(/\/README\.md$/i, '');
  return dir + '/' + id + '.md';
}
function nextOrder(parentId) { const ks = kidsOf(parentId || ''); return ks.length ? Math.max(...ks.map(k => k.order ?? 0)) + 1 : 1; }
async function createPage({repoKey = 'private', parentId = null, templateId = null, title = '새 페이지', icon = '', insertLinkInto = null} = {}) {
  if (S.mode !== 'owner') return openConnect();
  if (!S.repos[repoKey]) { toast('공개 노트 저장소가 연결되지 않았어요.'); return; }
  if (!S.writable[repoKey]) { toast('이 토큰은 ' + CONFIG.repos[repoKey] + '에 쓰기 권한이 없어요.'); return; }
  if (repoKey === 'public') {
    const ok = await confirmBox({title: '공개 페이지를 만들까요?', body: [h('p', {text: '공개 저장소(' + CONFIG.owner + '/' + CONFIG.repos.public + ')에 저장돼서, 쓰는 내용이 저장될 때마다 누구나 볼 수 있어요.'})], actions: [{label: '취소', value: false}, {label: '공개 페이지 만들기', value: true, primary: true}]});
    if (!ok) return;
  }
  await leaveCurrent();
  const id = uid();
  const path = newPagePath(repoKey, parentId, id);
  let text = '# ' + (icon ? icon + ' ' : '') + MD.titleToMd(title) + '\n';
  if (templateId) {
    const t = S.pages.get(templateId);
    const f = t && await readEntry(t);
    if (f) { const pg = MD.parsePage(f.text); icon = icon || pg.icon; pg.icon = icon; pg.titleMd = MD.titleToMd(title); pg.titleDirty = true; text = MD.serializePage(pg); }
  }
  toast('페이지를 만드는 중…', {ms: 20000});
  try {
    noteWrite(repoKey, path, text, await S.repos[repoKey].writeText(path, text, null, 'docs: ' + title + ' 페이지 만들기'));
    await mutateManifest(repoKey, m => { m.pages.push({id, title, ...(icon ? {icon} : {}), path, parent: parentId || null, order: nextOrder(parentId), created: nowIso()}); }, 'docs: ' + title + ' 페이지 추가');
  } catch (e) { toast('페이지를 만들지 못했어요: ' + errorText(e), {ms: 8000}); return; }
  $('#toast').hidden = true;
  if (parentId) { ui.expanded[parentId] = 1; saveUi(); }
  if (insertLinkInto && S.cur) {
    const {loc, replace} = insertLinkInto;
    const p = MD.newBlock('p');
    p.text = '📄 [' + MD.escapeText(title, 'md', ' ', '') + '](' + encodeURI(relPath(S.cur.path, path)) + ')';
    const l = findBlock(loc.b.id);
    if (l) { if (replace) l.arr.splice(l.idx, 1, p); else l.arr.splice(l.idx + 1, 0, p); touchContainer(l.parent); }
    changed();
    await saveNow(S.cur);
  }
  S.focusTitle = id;
  go(id);
  return id;
}
async function duplicatePage(id) {
  const e = S.pages.get(id);
  const f = await readEntry(e);
  if (!f) return toast('원본 파일을 읽지 못했어요.');
  const nid = uid(), path = newPagePath(e.repo, e.parent, nid);
  const pg = MD.parsePage(f.text);
  const title = pageTitle(e) + ' (복사본)';
  pg.titleMd = MD.titleToMd(title); pg.titleDirty = true;
  const dupText = MD.serializePage(pg);
  noteWrite(e.repo, path, dupText, await S.repos[e.repo].writeText(path, dupText, null, 'docs: ' + title + ' 만들기'));
  await mutateManifest(e.repo, m => { m.pages.push({id: nid, title, ...(e.icon ? {icon: e.icon} : {}), path, parent: e.parent || null, order: (e.order ?? 0) + 0.5, created: nowIso()}); });
  renderSidebar();
  go(nid);
}
async function trashPage(id) {
  const e = S.pages.get(id);
  if (!e) return;
  await leaveCurrent();
  const ks = descendants(id).filter(k => !k.trashed).length;
  try {
    await updateEntry(id, {trashed: true, trashedAt: nowIso()}, 'docs: ' + pageTitle(e) + ' 휴지통으로');
    toast('휴지통으로 옮겼어요' + (ks ? ' (하위 페이지 ' + ks + '개 포함)' : '') + '.', {action: '되돌리기', onAction: () => restoreFromTrash(id)});
    renderSidebar();
    if (S.cur && (S.cur.id === id || descendants(id).some(d => d.id === S.cur.id))) { S.cur = null; history.replaceState(null, '', '#/'); route(); }
  } catch (err) { toast('옮기지 못했어요: ' + errorText(err)); }
}
async function restoreFromTrash(id) {
  const e = S.pages.get(id);
  if (!e) return;
  try { await updateEntry(id, {trashed: undefined, trashedAt: undefined}, 'docs: ' + pageTitle(e) + ' 복원'); renderSidebar(); if (S.cur && S.cur.id === id) renderPage({keepScroll: true}); toast('복원했어요.'); }
  catch (err) { toast('복원하지 못했어요: ' + errorText(err)); }
}
async function deleteForever(id) {
  const e = S.pages.get(id);
  if (!e) return;
  const kids = descendants(id);
  const ok = await confirmBox({title: '영구 삭제할까요?', body: [h('p', {text: '“' + pageTitle(e) + '”' + (kids.length ? '과 하위 페이지 ' + kids.length + '개' : '') + '의 파일을 저장소에서 지워요. GitHub 커밋 기록에는 이전 내용이 남아 있어서, 필요하면 GitHub에서 되살릴 수 있어요.'})], actions: [{label: '취소', value: false}, {label: '영구 삭제', value: true, danger: true}]});
  if (!ok) return;
  try {
    for (const x of [...kids.reverse(), e]) {
      const repo = S.repos[x.repo];
      const meta = await repo.meta(x.path);
      if (meta) await repo.remove(x.path, meta.sha, 'docs: ' + pageTitle(x) + ' 영구 삭제');
      const att = await repo.list('files/' + x.id).catch(() => null);
      if (Array.isArray(att)) for (const f of att) if (f.type === 'file') await repo.remove(f.path, f.sha, 'docs: ' + pageTitle(x) + ' 첨부 파일 삭제');
      await mutateManifest(x.repo, m => { m.pages = m.pages.filter(p => p.id !== x.id); }, 'docs: ' + pageTitle(x) + ' 목록에서 삭제');
    }
    toast('영구 삭제했어요.');
    if (S.cur && !S.pages.has(S.cur.id)) { S.cur = null; history.replaceState(null, '', '#/'); route(); }
    renderSidebar();
    if ($('#listDlg').open) openTrash();
  } catch (err) { toast('삭제하지 못했어요: ' + errorText(err), {ms: 8000}); }
}
function attachmentsOf(text, pagePath) {
  const page = MD.parsePage(text);
  const out = new Set();
  const visit = nodes => { for (const n of nodes || []) { if ((n.t === 'link' && n.href) || (n.t === 'img' && n.src)) { const href = n.href || n.src; if (!/^[a-z][a-z0-9+.-]*:|^#/i.test(href) && !/\.md(#.*)?$/i.test(href) && !href.endsWith('/')) { let p; try { p = decodeURIComponent(href.split(/[?#]/)[0]); } catch { p = href; } out.add(normPath(dirOf(pagePath) + p)); } } if (n.c) visit(n.c); } };
  MD.walkBlocks(page.blocks, b => {
    if (b.text) visit(MD.parseInline(b.text));
    if (b.rows) for (const r of b.rows) for (const c of r) visit(MD.parseInline(c));
    if (b.type === 'image' && b.src && !/^[a-z][a-z0-9+.-]*:/i.test(b.src)) { let p; try { p = decodeURIComponent(b.src); } catch { p = b.src; } out.add(normPath(dirOf(pagePath) + p)); }
  });
  if (page.props) for (const r of page.props.rows) for (const c of r) visit(MD.parseInline(c));
  return [...out];
}
async function openMove(id) {
  const e = S.pages.get(id);
  if (!e) return;
  const to = e.repo === 'private' ? 'public' : 'private';
  if (to === 'public' && S.publicMissing) return toast('공개 노트 저장소가 없어요.');
  const kids = descendants(id).filter(k => k.repo !== to && !k.trashed);
  const pub = to === 'public';
  const kidsBox = kids.length ? h('label', {class: 'check'}, h('input', {type: 'checkbox', id: 'mvKids'}), h('span', {text: '하위 페이지 ' + kids.length + '개도 함께 ' + (pub ? '공개' : '비공개로 전환')})) : null;
  const ack = pub ? h('label', {class: 'check'}, h('input', {type: 'checkbox', id: 'mvAck'}), h('span', {text: '공개 저장소에 올라간 내용은 나중에 비공개로 돌려도 커밋 기록, 다른 사람의 포크, 검색 캐시에 남을 수 있다는 것을 이해했어요.'})) : null;
  const body = [
    h('p', {html: pub ? '“<b>' + esc(pageTitle(e)) + '</b>”을 공개 저장소 <b>' + esc(CONFIG.owner + '/' + CONFIG.repos.public) + '</b>로 옮겨요. 누구나 이 사이트와 GitHub에서 읽을 수 있게 돼요.' : '“<b>' + esc(pageTitle(e)) + '</b>”을 비공개 저장소 <b>' + esc(CONFIG.owner + '/' + CONFIG.repos.private) + '</b>로 옮겨요.'}),
    h('div', {class: 'notice' + (pub ? ' warn' : ''), text: pub ? '페이지가 링크한 첨부 파일(이미지·PDF)도 공개 저장소로 복사돼요. 링크한 다른 비공개 페이지는 공개되지 않아요 — 방문자에게는 열리지 않는 링크로 보여요.' : '공개 저장소의 파일은 지워지지만, 이미 공개된 동안의 내용은 공개 저장소의 커밋 기록에 남아요. 완전히 지우려면 GitHub에서 저장소 기록을 정리해야 해요.'}),
    kidsBox, ack,
  ];
  const ok = await confirmBox({title: pub ? '이 페이지를 공개할까요?' : '비공개로 옮길까요?', body, actions: [{label: '취소', value: false}, {label: pub ? '공개로 옮기기' : '비공개로 옮기기', value: true, primary: true, needs: pub ? '#mvAck' : null}]});
  if (!ok) return;
  const withKids = !!(kids.length && $('#mvKids') && $('#mvKids').checked);
  await moveVisibility(id, to, withKids);
}
async function moveVisibility(id, to, withKids) {
  await leaveCurrent();
  const root = S.pages.get(id);
  const list = [root, ...(withKids ? descendants(id).filter(k => k.repo !== to && !k.trashed) : [])].filter(x => x.repo !== to);
  const dst = S.repos[to];
  let done = 0;
  toast((to === 'public' ? '공개로' : '비공개로') + ' 옮기는 중… 0/' + list.length, {ms: 120000});
  try {
    for (const e of list) {
      const src = S.repos[e.repo];
      const f = await src.readText(e.path);
      if (!f) throw new Error(e.path + ' 파일이 없어요');
      for (const ap of attachmentsOf(f.text, e.path)) {
        const m = await src.meta(ap).catch(() => null);
        if (!m || m.type !== 'file') continue;
        const there = await dst.meta(ap).catch(() => null);
        if (there && there.sha === m.sha) continue;
        const blob = await src.blob(ap);
        await dst.writeBytes(ap, new Uint8Array(await blob.arrayBuffer()), there ? there.sha : null, 'docs: 첨부 파일 복사 (' + ap.split('/').pop() + ')');
      }
      let path = e.path;
      const clash = await dst.meta(path);
      if (clash) path = 'pages/' + e.id + '.md';
      if (path !== e.path && await dst.meta(path)) throw new Error(path + ' 경로가 이미 있어요');
      noteWrite(to, path, f.text, await dst.writeText(path, f.text, null, 'docs: ' + pageTitle(e) + (to === 'public' ? ' 공개' : ' 비공개로 이동')));
      const entry = {...S.man[e.repo].data.pages.find(p => p.id === e.id)};
      entry.path = path;
      await mutateManifest(to, m => { m.pages = m.pages.filter(p => p.id !== e.id); m.pages.push(entry); }, 'docs: ' + pageTitle(e) + (to === 'public' ? ' 공개 목록에 추가' : ' 비공개 목록에 추가'));
      await mutateManifest(e.repo, m => { m.pages = m.pages.filter(p => p.id !== e.id); }, 'docs: ' + pageTitle(e) + ' 목록에서 이동');
      await src.remove(e.path, f.sha, 'docs: ' + pageTitle(e) + (to === 'public' ? ' 공개 저장소로 이동' : ' 비공개 저장소로 이동'));
      if (e.repo === 'public') await cleanupPublicAttachments(attachmentsOf(f.text, e.path));
      done++;
      toast((to === 'public' ? '공개로' : '비공개로') + ' 옮기는 중… ' + done + '/' + list.length, {ms: 120000});
    }
    toast(to === 'public' ? '공개했어요. 링크를 공유할 수 있어요.' : '비공개로 옮겼어요.', to === 'public' ? {action: '링크 복사', onAction: () => copyText(CONFIG.site + '#/p/' + id)} : {});
  } catch (err) {
    toast('옮기는 도중 멈췄어요 (' + done + '/' + list.length + '): ' + errorText(err) + ' — 다시 시도하면 이어서 옮겨요.', {ms: 15000});
  }
  S.cur = null;
  rebuildIndex(); renderChrome(); renderSidebar();
  route();
}
async function cleanupPublicAttachments(paths) {
  if (!paths.length || !S.repos.public) return;
  const still = new Set();
  for (const e of S.man.public.data.pages) {
    const f = await S.repos.public.readText(e.path).catch(() => null);
    if (f) for (const p of attachmentsOf(f.text, e.path)) still.add(p);
  }
  for (const p of paths) {
    if (still.has(p)) continue;
    const m = await S.repos.public.meta(p).catch(() => null);
    if (m && m.type === 'file') await S.repos.public.remove(p, m.sha, 'docs: 비공개로 옮긴 페이지의 첨부 파일 삭제').catch(() => {});
  }
}

/* ---------------------------------------------------------------- dialogs */
function confirmBox({title, body = [], actions = []}) {
  return new Promise(res => {
    const dlg = $('#confirmDlg');
    $('#cfTitle').textContent = title;
    const b = $('#cfBody'); b.innerHTML = ''; b.append(...body.filter(Boolean));
    const a = $('#cfActions'); a.innerHTML = '';
    // Resolve from the click itself: Chrome can deliver the dialog's close event late (seen after IME input),
    // and a late close event must not cancel the next dialog.
    const token = {};
    dlg._token = token;
    let done = false;
    const finish = v => { if (done) return; done = true; res(v); };
    const gated = [];
    for (const act of actions) {
      const btn = h('button', {class: 'btn' + (act.primary ? ' primary' : '') + (act.danger ? ' danger' : ''), type: 'button', text: act.label, onclick: () => { finish(act.value); dlg.close(); }});
      if (act.needs) { btn.disabled = true; gated.push([btn, act.needs]); }
      a.append(btn);
    }
    b.onchange = () => { for (const [btn, sel] of gated) { const x = $(sel); btn.disabled = !(x && x.checked); } };
    dlg.oncancel = () => { if (dlg._token === token) finish(undefined); };
    dlg.onclose = () => { if (dlg._token === token && !dlg.open) finish(undefined); };
    dlg.showModal();
  });
}
function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('복사했어요.'), () => toast(t, {ms: 12000})); }
function openShare() {
  const e = S.cur && S.pages.get(S.cur.id);
  if (!e) return;
  const url = CONFIG.site + '#/p/' + e.id;
  const pub = e.repo === 'public';
  confirmBox({title: pub ? '공개 페이지 링크' : '비공개 페이지 링크', body: [
    h('p', {text: pub ? '누구나 이 링크로 페이지를 읽을 수 있어요 (편집은 토큰을 연결한 나만 할 수 있어요).' : '이 페이지는 비공개라서, 링크는 토큰을 연결한 내 브라우저에서만 열려요. 다른 사람에게 보여 주려면 먼저 공개로 옮기세요.'}),
    h('input', {type: 'text', value: url, readonly: true, onclick: ev => ev.target.select(), style: 'margin-top:8px'}),
    pub ? h('p', {html: 'Markdown 원문: <a target="_blank" rel="noopener" href="https://github.com/' + esc(CONFIG.owner + '/' + CONFIG.repos.public) + '/blob/' + CONFIG.branch + '/' + esc(e.path) + '">GitHub ↗</a>'}) : null,
  ], actions: [{label: '닫기', value: false}, {label: '링크 복사', value: true, primary: true}]}).then(ok => { if (ok) copyText(url); });
}
function moreMenu(anchor) {
  const cur = S.cur;
  const e = cur && S.pages.get(cur.id);
  if (!e) return;
  const owner = S.mode === 'owner';
  const items = [];
  items.push({label: ui.wide ? '보통 너비' : '전체 너비', icon: '↔', run: () => { ui.wide = !ui.wide; saveUi(); renderPage({keepScroll: true}); }});
  if (cur.page) items.push({label: 'Markdown 내려받기', icon: '⬇', run: () => download(MD.serializePage(cur.page), pageTitle(e) + '.md')});
  items.push({label: '인쇄 · PDF로 저장', icon: '🖨', run: () => { $$('.blk.toggle').forEach(t => t.classList.add('open')); setTimeout(() => window.print(), 50); }});
  if (owner) {
    items.push('-');
    items.push({label: '하위 페이지 추가', icon: '＋', run: () => createPage({repoKey: e.repo, parentId: e.id})});
    items.push({label: '복제', icon: '⧉', run: () => duplicatePage(e.id)});
    items.push({label: e.template ? '템플릿에서 빼기' : '템플릿으로 지정', icon: '📑', run: async () => { await updateEntry(e.id, {template: e.template ? undefined : true}); renderSidebar(); }});
    if (!S.publicMissing) items.push({label: e.repo === 'private' ? '공개로 옮기기…' : '비공개로 옮기기…', icon: e.repo === 'private' ? '🌐' : '🔒', run: () => openMove(e.id)});
    items.push({label: 'GitHub에서 보기', icon: '↗', run: () => window.open(S.repos[e.repo].webUrl(e.path), '_blank', 'noopener')});
    items.push('-');
    items.push({label: '휴지통으로', icon: '🗑', danger: true, run: () => trashPage(e.id)});
  }
  popMenu(anchor, items, {right: true});
}
function pageMenu(anchor, id) {
  const e = S.pages.get(id);
  if (!e) return;
  const items = [
    {label: '하위 페이지 추가', icon: '＋', run: () => createPage({repoKey: e.repo, parentId: id})},
    {label: '복제', icon: '⧉', run: () => duplicatePage(id)},
    {label: e.template ? '템플릿에서 빼기' : '템플릿으로 지정', icon: '📑', run: async () => { await updateEntry(id, {template: e.template ? undefined : true}); renderSidebar(); }},
  ];
  if (!S.publicMissing) items.push({label: e.repo === 'private' ? '공개로 옮기기…' : '비공개로 옮기기…', icon: e.repo === 'private' ? '🌐' : '🔒', run: () => openMove(id)});
  items.push({label: '맨 위 단계로 꺼내기', icon: '⇤', run: async () => { await updateEntry(id, {parent: null, order: nextOrder(null)}); renderSidebar(); }});
  items.push('-', {label: '휴지통으로', icon: '🗑', danger: true, run: () => trashPage(id)});
  popMenu(anchor, items);
}
function newPageMenu(anchor, repoKey) {
  const tpl = [...S.pages.values()].filter(e => e.template && !e.trashed);
  const items = [{label: '빈 페이지', icon: '📄', run: () => createPage({repoKey})}];
  if (tpl.length) { items.push('-', {head: '템플릿에서'}); for (const t of tpl) items.push({label: pageTitle(t), icon: pageIcon(t), run: () => createPage({repoKey, templateId: t.id, icon: t.icon || ''})}); }
  if (items.length === 1) return createPage({repoKey});
  popMenu(anchor, items);
}
function emojiPicker(anchor) {
  closePops();
  pop = h('div', {class: 'pop'});
  const grid = h('div', {class: 'emoji-grid'});
  for (const em of EMOJIS) grid.append(h('button', {text: em, onclick: () => { setIcon(em); closePops(); }}));
  const custom = h('input', {type: 'text', placeholder: '다른 이모지 붙여넣기', style: 'width:100%;padding:6px 8px;border:1px solid var(--line2);border-radius:6px;margin:4px 0', onkeydown: e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { setIcon([...v][0] === v ? v : v.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u)?.[0] || ''); closePops(); } } }});
  pop.append(grid, custom, h('button', {class: 'pop-i', text: '아이콘 없애기', onclick: () => { setIcon(''); closePops(); }}));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = Math.min(r.bottom + 4, innerHeight - pop.offsetHeight - 8) + 'px';
}
function setIcon(em) {
  const cur = S.cur;
  if (!cur || cur.ro) return;
  pushHistory(true);
  cur.page.icon = em; cur.page.titleDirty = true;
  if (!cur.page.titleMd) cur.page.titleMd = MD.titleToMd(cur.entry.title || '');
  renderPage({keepScroll: true});
  const ti = $('.ti.on .ti-icon'); if (ti) ti.textContent = em || '📄';
  changed();
}

/* search */
const search = {sel: 0, items: [], pick: null, full: null};
function openSearch(opts = {}) {
  search.pick = opts.pick || null; search.sel = 0; search.full = null;
  $('#searchIn').value = '';
  $('#searchIn').placeholder = search.pick ? '링크할 페이지 찾기…' : '페이지 검색…';
  renderSearch();
  $('#searchDlg').showModal();
  setTimeout(() => $('#searchIn').focus(), 20);
}
function renderSearch() {
  const q = $('#searchIn').value.trim().toLowerCase();
  const all = [...S.pages.values()].filter(e => !isHidden(e) && (S.mode === 'owner' || e.repo === 'public'));
  let items = all.map(e => ({e, path: ancestors(e).map(pageTitle).join(' / ')}));
  if (q) items = items.filter(x => (pageTitle(x.e) + ' ' + x.path).toLowerCase().includes(q));
  if (search.full && q) {
    for (const [id, snip] of search.full) if (!items.some(x => x.e.id === id)) { const e = S.pages.get(id); if (e) items.push({e, path: ancestors(e).map(pageTitle).join(' / '), snip}); }
    for (const x of items) if (search.full.has(x.e.id)) x.snip = search.full.get(x.e.id);
  }
  items.sort((a, b) => (pageTitle(a.e).toLowerCase().startsWith(q) ? 0 : 1) - (pageTitle(b.e).toLowerCase().startsWith(q) ? 0 : 1));
  search.items = items.slice(0, 60);
  search.sel = Math.min(search.sel, Math.max(0, search.items.length - 1));
  const box = $('#searchRes');
  box.innerHTML = '';
  if (!search.items.length) box.append(h('div', {class: 'sb-empty', style: 'padding:14px', text: q ? '찾는 페이지가 없어요.' : '페이지가 없어요.'}));
  search.items.forEach((x, i) => box.append(h('div', {class: 'sr' + (i === search.sel ? ' on' : ''), dataset: {i}},
    h('span', {class: 'sr-ic', text: pageIcon(x.e)}),
    h('div', {}, h('div', {class: 'sr-t', text: pageTitle(x.e) + (x.e.template ? ' · 템플릿' : '')}), h('div', {class: 'sr-p', text: REPO_LABEL[x.e.repo] + (x.path ? ' · ' + x.path : '')}), x.snip ? h('div', {class: 'sr-s', html: x.snip}) : null))));
}
function chooseSearch(i) {
  const x = search.items[i];
  if (!x) return;
  $('#searchDlg').close();
  if (search.pick) search.pick(x.e); else go(x.e.id);
}
async function fullSearch() {
  const q = $('#searchIn').value.trim();
  if (!q) return toast('검색어를 먼저 입력하세요.');
  const btn = $('#fullSearchBtn');
  btn.textContent = '본문 읽는 중…';
  search.full = new Map();
  const ql = q.toLowerCase();
  const list = [...S.pages.values()].filter(e => !isHidden(e));
  let n = 0;
  await Promise.all(list.map(async e => {
    try {
      const key = e.repo + ':' + e.path;
      let text = S.textCache.get(key);
      if (text == null) { const f = await readEntry(e); text = f ? f.text : ''; S.textCache.set(key, text); }
      const i = text.toLowerCase().indexOf(ql);
      if (i >= 0) { const a = Math.max(0, i - 40); search.full.set(e.id, (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, i + q.length + 60)) + '…'); }
    } catch {}
    btn.textContent = '본문 읽는 중… ' + (++n) + '/' + list.length;
  }));
  btn.textContent = '본문까지 검색';
  renderSearch();
}

/* history */
async function openHistory() {
  const cur = S.cur;
  if (!cur || S.mode !== 'owner') return;
  const e = S.pages.get(cur.id);
  await leaveCurrent();
  const dlg = $('#histDlg');
  $('#histTitle').textContent = '🕘 ' + pageTitle(e) + ' — GitHub 기록';
  $('#histList').innerHTML = '<div class="sb-empty" style="padding:10px">불러오는 중…</div>';
  $('#histView').innerHTML = '<p style="color:var(--ink3);font-size:14px;margin-top:20px">왼쪽에서 버전을 고르면 그때의 내용을 미리 볼 수 있어요.</p>';
  $('#histRestore').disabled = true;
  $('#histGh').href = 'https://github.com/' + CONFIG.owner + '/' + CONFIG.repos[e.repo] + '/commits/' + CONFIG.branch + '/' + e.path.split('/').map(encodeURIComponent).join('/');
  dlg.showModal();
  let commits;
  try { commits = await S.repos[e.repo].commits(e.path); }
  catch (err) { $('#histList').innerHTML = ''; $('#histList').append(h('div', {class: 'sb-empty', text: errorText(err)})); return; }
  const list = $('#histList');
  list.innerHTML = '';
  if (!commits.length) list.append(h('div', {class: 'sb-empty', text: '기록이 없어요.'}));
  commits.forEach((c, i) => {
    const when = c.commit.author && c.commit.author.date || c.commit.committer.date;
    list.append(h('div', {class: 'hist-i', dataset: {sha: c.sha}}, h('b', {text: (i === 0 ? '현재 · ' : '') + new Date(when).toLocaleString('ko-KR', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}), h('span', {text: c.commit.message.split('\n')[0]})));
  });
  list.onclick = async ev => {
    const it = ev.target.closest('.hist-i');
    if (!it) return;
    for (const x of $$('.hist-i', list)) x.classList.toggle('on', x === it);
    const view = $('#histView');
    view.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const f = await S.repos[e.repo].readText(e.path, it.dataset.sha);
      if (!f) { view.innerHTML = '<p>이 버전에는 파일이 없어요.</p>'; return; }
      const pg = MD.parsePage(f.text);
      view.innerHTML = '';
      const art = h('div', {class: 'page ro'}, h('h1', {class: 'pg-title', style: 'font-size:28px', text: (pg.icon ? pg.icon + ' ' : '') + MD.pageTitle(pg)}));
      art.append(renderProps(pg, true));
      const ed = h('div', {class: 'editor'});
      renderBlocksInto(ed, pg.blocks, true);
      art.append(ed);
      view.append(art);
      $('#histGh').href = S.repos[e.repo].webUrl(e.path, it.dataset.sha);
      $('#histRestore').disabled = it === list.firstElementChild;
      $('#histRestore').onclick = async () => {
        dlg.close();
        if (!S.cur || S.cur.id !== cur.id) await openPage(cur.id);
        pushHistory(true);
        S.cur.page = MD.parsePage(f.text);
        renderPage({keepScroll: false});
        changed();
        toast('이전 버전 내용을 불러왔어요. 저장되면 새 기록으로 남아요.', {action: '되돌리기', onAction: undo});
      };
    } catch (err) { view.innerHTML = ''; view.append(h('p', {text: errorText(err)})); }
  };
}

/* trash & import */
function openTrash() {
  const list = [...S.pages.values()].filter(e => e.trashed).sort((a, b) => (b.trashedAt || '').localeCompare(a.trashedAt || ''));
  $('#listTitle').textContent = '🗑 휴지통';
  $('#listIntro').textContent = list.length ? '복원하거나 영구 삭제할 수 있어요. 영구 삭제해도 GitHub 커밋 기록에는 남아 있어요.' : '휴지통이 비어 있어요.';
  const body = $('#listBody');
  body.innerHTML = '';
  for (const e of list) body.append(h('div', {class: 'trash-i'}, h('span', {text: pageIcon(e)}), h('span', {class: 't', text: pageTitle(e)}), h('span', {class: 'ti-badge', text: (e.repo === 'public' ? '🌐 ' : '🔒 ') + (e.trashedAt ? relTime(e.trashedAt) : '')}),
    h('button', {class: 'btn', text: '열기', onclick: () => { $('#listDlg').close(); go(e.id); }}),
    h('button', {class: 'btn', text: '복원', onclick: async () => { await restoreFromTrash(e.id); openTrash(); }}),
    h('button', {class: 'btn danger', text: '영구 삭제', onclick: () => deleteForever(e.id)})));
  $('#listActions').innerHTML = '';
  $('#listActions').append(h('button', {class: 'btn', text: '닫기', onclick: () => $('#listDlg').close()}));
  if (!$('#listDlg').open) $('#listDlg').showModal();
}
async function openImport() {
  if (S.mode !== 'owner') return;
  $('#listTitle').textContent = '📥 레포 파일 가져오기';
  $('#listIntro').textContent = '저장소에 있지만 노트 목록에 없는 Markdown 파일을 페이지로 등록해요. 파일 내용은 바꾸지 않아요.';
  const body = $('#listBody');
  body.innerHTML = '<div class="sb-empty">파일 목록을 읽는 중…</div>';
  $('#listActions').innerHTML = '';
  const go2 = h('button', {class: 'btn primary', text: '선택한 파일 등록', disabled: true});
  $('#listActions').append(h('button', {class: 'btn', text: '닫기', onclick: () => $('#listDlg').close()}), go2);
  $('#listDlg').showModal();
  const found = [];
  for (const key of Object.keys(S.repos)) {
    try {
      const t = await S.repos[key].tree();
      const known = new Set(S.man[key].data.pages.map(p => p.path));
      for (const n of t.tree) if (n.type === 'blob' && /\.md$/i.test(n.path) && !known.has(n.path) && !/^\.github\//.test(n.path)) found.push({key, path: n.path});
    } catch (e) { found.push({key, error: errorText(e)}); }
  }
  body.innerHTML = '';
  if (!found.length) { body.append(h('div', {class: 'sb-empty', text: '새로 등록할 Markdown 파일이 없어요.'})); return; }
  for (const f of found) {
    if (f.error) { body.append(h('p', {text: CONFIG.repos[f.key] + ': ' + f.error})); continue; }
    body.append(h('label', {class: 'check', style: 'margin:4px 0'}, h('input', {type: 'checkbox', dataset: {key: f.key, path: f.path}}), h('span', {text: (f.key === 'public' ? '🌐 ' : '🔒 ') + f.path})));
  }
  body.onchange = () => { go2.disabled = !$$('input:checked', body).length; };
  go2.onclick = async () => {
    go2.disabled = true; go2.textContent = '등록하는 중…';
    const picked = $$('input:checked', body).map(x => ({key: x.dataset.key, path: x.dataset.path}));
    try {
      for (const key of ['private', 'public']) {
        const mine = picked.filter(p => p.key === key);
        if (!mine.length) continue;
        const entries = [];
        for (const p of mine) {
          const f = await S.repos[key].readText(p.path);
          const pg = MD.parsePage(f ? f.text : '');
          entries.push({id: uid(), title: MD.pageTitle(pg) || p.path.replace(/^.*\//, '').replace(/\.md$/i, ''), ...(pg.icon ? {icon: pg.icon} : {}), path: p.path, parent: null, order: nextOrder(null) + entries.length, created: nowIso()});
        }
        await mutateManifest(key, m => { for (const e of entries) if (!m.pages.some(x => x.path === e.path)) m.pages.push(e); }, 'docs: Markdown 파일 ' + entries.length + '개를 노트 목록에 등록');
      }
      $('#listDlg').close();
      renderSidebar();
      toast('등록했어요.');
    } catch (e) { go2.disabled = false; go2.textContent = '선택한 파일 등록'; toast('등록하지 못했어요: ' + errorText(e)); }
  };
}

/* ---------------------------------------------------------------- static bindings */
function syncSbButtons() { const off = $('#app').classList.contains('sb-off'); $('#sbShow').hidden = !off; }
function toggleSidebar(force) {
  const app = $('#app');
  const off = force != null ? force : !app.classList.contains('sb-off');
  app.classList.toggle('sb-off', off);
  ui.sbOff = off; saveUi(); syncSbButtons();
}
function bindStatic() {
  if (innerWidth < 900 && ui.sbOff == null) $('#app').classList.add('sb-off');
  $('#sbHide').onclick = () => toggleSidebar(true);
  $('#sbShow').onclick = () => toggleSidebar(false);
  $('#wsBtn').onclick = openConnect;
  $('#actSettings').onclick = openConnect;
  $('#actSearch').onclick = () => openSearch();
  $('#actNew').onclick = e => newPageMenu(e.currentTarget, 'private');
  $('#actTrash').onclick = openTrash;
  $('#actImport').onclick = openImport;
  $('#visBtn').onclick = () => S.cur && openMove(S.cur.id);
  $('#histBtn').onclick = openHistory;
  $('#shareBtn').onclick = openShare;
  $('#moreBtn').onclick = e => moreMenu(e.currentTarget);
  for (const b of $$('[data-close]')) b.onclick = () => b.closest('dialog').close();
  $('#connectForm').onsubmit = async ev => {
    ev.preventDefault();
    const token = $('#tokenIn').value.trim();
    if (!token) return;
    const btn = $('#connectBtn');
    btn.disabled = true; $('#connectErr').textContent = '연결을 확인하는 중…';
    try {
      await leaveCurrent();
      S.cur = null;
      await connect(token);
      storeToken(token, $('#rememberIn').checked);
      $('#connectDlg').close();
      toast('GitHub에 연결했어요.' + (S.writable.private ? '' : ' (이 토큰은 읽기 전용이에요)'));
    } catch (e) { $('#connectErr').textContent = errorText(e); }
    finally { btn.disabled = false; }
  };
  $('#disconnectBtn').onclick = async () => {
    await leaveCurrent();
    storeToken('', false);
    S.token = ''; S.cur = null;
    for (const u of S.blobUrls.values()) u.then(x => URL.revokeObjectURL(x)).catch(() => {});
    S.blobUrls.clear(); S.textCache.clear();
    clearInterval(S.syncTimer); S.syncTimer = null;
    $('#connectDlg').close();
    await bootVisitor();
    toast('연결을 해제하고 토큰을 지웠어요.');
  };
  // sidebar clicks
  $('#sb').addEventListener('click', ev => {
    const nb = ev.target.closest('[data-new]');
    if (nb) { ev.stopPropagation(); return newPageMenu(nb, nb.dataset.new); }
    const ti = ev.target.closest('.ti');
    if (!ti) return;
    const id = ti.dataset.id, act = ev.target.closest('[data-act]') && ev.target.closest('[data-act]').dataset.act;
    if (act === 'toggle') { if (ui.expanded[id]) delete ui.expanded[id]; else ui.expanded[id] = 1; saveUi(); renderSidebar(); return; }
    if (act === 'menu') return pageMenu(ev.target.closest('[data-act]'), id);
    if (act === 'add') { const e = S.pages.get(id); return createPage({repoKey: e.repo, parentId: id}); }
    if (innerWidth < 900) toggleSidebar(true);
    go(id);
  });
  // editor events (delegated on the view)
  const view = $('#view');
  view.addEventListener('input', onInput);
  view.addEventListener('beforeinput', onBeforeInput);
  view.addEventListener('keydown', onKeyDown);
  view.addEventListener('compositionend', ev => { const el = textTarget(ev.target); if (el && el.dataset.role === 'text') { syncText(el); } });
  view.addEventListener('paste', onPaste);
  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);
  view.addEventListener('focusout', ev => { const el = textTarget(ev.target); if (el && el.dataset.role === 'title' && S.cur && !S.cur.ro) { el.textContent = MD.pageTitle(S.cur.page); } });
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', ev => { $('#app').classList.remove('dropping'); onDrop(ev); });
  document.addEventListener('dragend', onDragEnd);
  document.addEventListener('dragleave', ev => { if (!ev.relatedTarget) $('#app').classList.remove('dropping'); });
  document.addEventListener('selectionchange', () => { clearTimeout(placeFmtBar.t); placeFmtBar.t = setTimeout(placeFmtBar, 60); });
  document.addEventListener('mousedown', ev => {
    if (pop && !pop.contains(ev.target)) { pop.remove(); pop = null; }
    if (slash.open && slash.box && !slash.box.contains(ev.target)) closeSlash();
    if (fmtBar && !fmtBar.hidden && !fmtBar.contains(ev.target)) { const sel = getSelection(); if (sel.isCollapsed) hideFmtBar(); }
  });
  document.addEventListener('keydown', ev => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === 'k' && !(textTarget(getSelection().anchorNode) && !selCollapsed())) { ev.preventDefault(); openSearch(); return; }
    if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); if (S.cur) saveNow(S.cur); return; }
    if (mod && ev.key === '\\') { ev.preventDefault(); toggleSidebar(); return; }
    if (ev.key === 'Escape') { if (pop) { pop.remove(); pop = null; } hideFmtBar(); }
  });
  $('#searchIn').addEventListener('input', () => { search.sel = 0; search.full = null; renderSearch(); });
  $('#searchIn').addEventListener('keydown', ev => {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); search.sel = Math.min(search.items.length - 1, search.sel + 1); renderSearch(); $('.sr.on')?.scrollIntoView({block: 'nearest'}); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); search.sel = Math.max(0, search.sel - 1); renderSearch(); $('.sr.on')?.scrollIntoView({block: 'nearest'}); }
    if (ev.key === 'Enter') { ev.preventDefault(); chooseSearch(search.sel); }
  });
  $('#searchRes').addEventListener('click', ev => { const r = ev.target.closest('.sr'); if (r) chooseSearch(+r.dataset.i); });
  $('#fullSearchBtn').onclick = fullSearch;
  window.addEventListener('hashchange', () => route());
  window.addEventListener('beforeunload', ev => { if (S.cur && (unsaved(S.cur) || S.cur.saving)) { saveDraft(S.cur); ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('online', () => { if (S.cur && unsaved(S.cur)) saveNow(S.cur); });
  window.addEventListener('offline', () => setStatus('offline'));
  window.addEventListener('resize', () => { if (pop) { pop.remove(); pop = null; } });
}
function onChange(ev) {
  const t = ev.target;
  if (t.dataset.act === 'todo') {
    const loc = findBlock(t.dataset.bid);
    if (!loc || S.cur.ro) return;
    pushHistory(true);
    loc.b.checked = t.checked; markDirty(loc.b);
    t.closest('.blk').classList.toggle('done', t.checked);
    changed();
  }
}
function onPaste(ev) {
  const el = textTarget(ev.target);
  if (!el || !S.cur || S.cur.ro) return;
  const role = el.dataset.role;
  if (['code', 'lang', 'raw'].includes(role)) return;
  const files = [...(ev.clipboardData.files || [])];
  if (files.length && role === 'text') { ev.preventDefault(); uploadAndInsert(files, el.dataset.bid, false); return; }
  const text = (ev.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  ev.preventDefault();
  if (!text) return;
  pushHistory(true);
  if (role !== 'text' || !text.includes('\n')) {
    const single = text.replace(/\n+/g, ' ');
    if (role === 'title' || role === 'caption') document.execCommand('insertText', false, single);
    else document.execCommand('insertHTML', false, MD.inlineToHtml(MD.parseInline(single)));
    return;
  }
  const loc = findBlock(el.dataset.bid);
  const blocks = MD.parseBlocks(text.replace(/\n+$/, '').split('\n'));
  if (!blocks.length || !loc) return;
  blocks[0].before = undefined;
  const replace = loc.b.type === 'p' && !loc.b.text && !(loc.b.children || []).length;
  loc.arr.splice(loc.idx + (replace ? 0 : 1), replace ? 1 : 0, ...blocks);
  touchContainer(loc.parent);
  const last = blocks[blocks.length - 1];
  rerender(TEXTUAL.has(last.type) ? {bid: last.id, off: 'end'} : null);
  changed();
}
function onClick(ev) {
  const t = ev.target;
  const cur = S.cur;
  const a = t.closest('a');
  if (a && cur && cur.entry && a.closest('#view')) {
    const inEdit = a.closest('[contenteditable="true"]');
    const href = a.getAttribute('data-href') ?? a.getAttribute('href');
    if (a.classList.contains('crumb')) return;
    if (!inEdit || ev.metaKey || ev.ctrlKey) { ev.preventDefault(); openLink(href, S.pages.get(cur.id) || cur.entry); return; }
    ev.preventDefault();
    const el = a.closest('[data-role]');
    popMenu(a, [
      {label: '열기', icon: '↗', sub: href, run: () => openLink(href, S.pages.get(cur.id) || cur.entry)},
      {label: '링크 수정', icon: '✎', run: () => { const r = document.createRange(); r.selectNodeContents(a); getSelection().removeAllRanges(); getSelection().addRange(r); showLinkInput(el, a); }},
      {label: '링크 없애기', icon: '⨯', run: () => { pushHistory(true); a.replaceWith(...a.childNodes); el.dispatchEvent(new Event('input', {bubbles: true})); }},
    ]);
    return;
  }
  const actEl = t.closest('[data-act]');
  const go2 = t.closest('[data-go]');
  if (go2) { go(go2.dataset.go); return; }
  if (!actEl || !cur) return;
  const act = actEl.dataset.act, bid = actEl.dataset.bid;
  const loc = bid ? findBlock(bid) : null;
  switch (act) {
    case 'tg': {
      const blk = actEl.closest('.blk');
      const open = !blk.classList.contains('open');
      blk.classList.toggle('open', open);
      S.openToggles ||= new Set();
      if (open) S.openToggles.add(bid); else S.openToggles.delete(bid);
      if (open) hydrateMedia(blk);
      return;
    }
    case 'g-add': {
      if (!loc || cur.ro) return;
      pushHistory(true);
      const p = MD.newBlock('p'); p.text = '';
      loc.arr.splice(loc.idx + 1, 0, p); touchContainer(loc.parent);
      rerender({bid: p.id, off: 0});
      const el = $('[data-bid="' + p.id + '"][data-role="text"]');
      if (el) { document.execCommand('insertText', false, '/'); }
      return;
    }
    case 'g-menu': return blockMenu(actEl, bid);
    case 'kid-add': {
      if (!loc || cur.ro) return;
      pushHistory(true);
      const p = MD.newBlock('p');
      loc.b.children = loc.b.children || []; loc.b.children.push(p); markDirty(loc.b);
      if (loc.b.type === 'toggle') { S.openToggles ||= new Set(); S.openToggles.add(loc.b.id); }
      rerender({bid: p.id, off: 0}); changed();
      return;
    }
    case 'first-block': {
      if (cur.ro) return;
      pushHistory(true);
      const p = MD.newBlock('p'); cur.page.blocks.push(p); rerender({bid: p.id, off: 0}); changed();
      return;
    }
    case 'co-kind': {
      if (!loc || cur.ro) return;
      popMenu(actEl, Object.entries(CALLOUT).map(([k, [ic, label]]) => ({label: label + ' (' + k + ')', icon: ic, run: () => { pushHistory(true); loc.b.kind = k; markDirty(loc.b); rerender(); changed(); }})));
      return;
    }
    case 'copy': if (loc) copyText(loc.b.code || ''); return;
    case 'row-add': if (loc) tableOp(loc.b, 'row-add', loc.b.rows.length); return;
    case 'col-add': if (loc) tableOp(loc.b, 'col-add', 0, loc.b.rows[0].length); return;
    case 'tbl-menu': {
      if (!loc) return;
      const cell = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.bid === bid ? document.activeElement : null;
      const ri = cell ? +cell.dataset.r : loc.b.rows.length - 1, ci = cell ? +cell.dataset.c : loc.b.rows[0].length - 1;
      popMenu(actEl, [
        {head: cell ? '선택한 칸 기준 (행 ' + (ri + 1) + ', 열 ' + (ci + 1) + ')' : '마지막 행·열 기준 — 칸을 먼저 누르면 그 칸 기준'},
        {label: '위에 행 추가', icon: '↥', run: () => tableOp(loc.b, 'row-add', Math.max(1, ri))},
        {label: '아래에 행 추가', icon: '↧', run: () => tableOp(loc.b, 'row-add', ri + 1)},
        {label: '행 삭제', icon: '✕', danger: true, run: () => tableOp(loc.b, 'row-del', ri)},
        '-',
        {label: '왼쪽에 열 추가', icon: '↤', run: () => tableOp(loc.b, 'col-add', 0, ci)},
        {label: '오른쪽에 열 추가', icon: '↦', run: () => tableOp(loc.b, 'col-add', 0, ci + 1)},
        {label: '열 삭제', icon: '✕', danger: true, run: () => tableOp(loc.b, 'col-del', 0, ci)},
        '-',
        {label: '왼쪽 정렬', icon: '⫷', run: () => tableOp(loc.b, 'align-left', 0, ci)},
        {label: '가운데 정렬', icon: '≡', run: () => tableOp(loc.b, 'align-center', 0, ci)},
        {label: '오른쪽 정렬', icon: '⫸', run: () => tableOp(loc.b, 'align-right', 0, ci)},
      ]);
      return;
    }
    case 'img-open': { const src = t.dataset.src; if (src) openLink(src, S.pages.get(cur.id) || cur.entry); return; }
    case 'icon': if (!cur.ro) emojiPicker(actEl); return;
    case 'prop-add': {
      if (cur.ro) return;
      pushHistory(true);
      const pg = cur.page;
      if (!pg.props) { pg.props = {id: MD.newId(), type: 'table', rows: [['속성', '내용'], ['', '']], align: [null, null], rowDirty: [true, true], shapeDirty: true, dirty: true}; }
      else { pg.props.rows.push(['', '']); pg.props.rowDirty.push(true); if (pg.props.rowRaw) pg.props.rowRaw.push(null); pg.props.dirty = true; }
      renderPage({keepScroll: true});
      const ks = $$('.prop-k'); if (ks.length) setCaret(ks[ks.length - 1], 0);
      changed();
      return;
    }
    case 'prop-del': {
      if (cur.ro) return;
      pushHistory(true);
      const pg = cur.page, r = +actEl.dataset.row;
      pg.props.rows.splice(r, 1); pg.props.rowDirty.splice(r, 1); if (pg.props.rowRaw) pg.props.rowRaw.splice(r, 1); pg.props.dirty = true;
      if (pg.props.rows.length <= 1) pg.props = null;
      renderPage({keepScroll: true}); changed();
      return;
    }
    case 'add-child-page': return createPage({repoKey: cur.repoKey, parentId: cur.id});
  }
}

/* test hook: lets automated tests drive internals; harmless in production */
window.NoteGrove = {S, MD, saveNow, syncNow, openPage, createPage, moveVisibility, trashPage, restoreFromTrash, deleteForever, findBlock, rerender, CONFIG, VERSION};
boot().catch(e => { console.error(e); failView('앱을 시작하지 못했어요', errorText(e), () => location.reload()); });
})();
