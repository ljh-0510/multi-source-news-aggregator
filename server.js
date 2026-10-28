#!/usr/bin/env node
/**
 * 多元信息台 · 聚合服务
 * 零依赖：只用 Node 内置模块。抓取多个独立信息源，
 * 做来源去重、话题聚类、立场分布统计。
 *
 * 用法： node server.js  [端口]
 */
'use strict';

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ============================================================
 * 1. 信息源清单
 *    lean = 立场标签（用于「视角光谱」统计）
 * ============================================================ */
const LEANS = {
  progressive:  { label: '自由派',   color: '#2f6fdb', desc: '偏自由 / 进步立场' },
  center:       { label: '中间派',   color: '#6b7280', desc: '相对中立' },
  conservative: { label: '保守派',   color: '#c0392b', desc: '偏保守立场' },
  state:        { label: '官方立场', color: '#8e44ad', desc: '由国家直接运营' },
  regional:     { label: '区域视角', color: '#7c3aed', desc: '特定地区本位视角' },
  science:      { label: '学术科学', color: '#16a085', desc: '期刊 / 科研机构' },
  industry:     { label: '行业媒体', color: '#d97706', desc: '产业与商业视角' },
  community:    { label: '社区声音', color: '#0891b2', desc: '用户自发聚合' },
};

const SOURCES = [
  /* ---------- 中文 ---------- */
  { id:'sspai',       name:'少数派',     url:'https://sspai.com/feed',                         lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'ithome',      name:'IT之家',     url:'https://www.ithome.com/rss/',                    lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'leiphone',    name:'雷锋网',     url:'https://www.leiphone.com/feed',                  lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'ifanr',       name:'爱范儿',     url:'https://www.ifanr.com/feed',                     lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'tmtpost',     name:'钛媒体',     url:'https://www.tmtpost.com/feed',                   lean:'industry',    lang:'zh', region:'中国',      channels:['business','tech','cn'] },
  { id:'geekpark',    name:'极客公园',   url:'https://www.geekpark.net/rss',                   lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'infoq',       name:'InfoQ 中文', url:'https://www.infoq.cn/feed',                      lean:'industry',    lang:'zh', region:'中国',      channels:['tech','cn'] },
  { id:'oschina',     name:'开源中国',   url:'https://www.oschina.net/news/rss',               lean:'community',   lang:'zh', region:'中国',      channels:['tech','cn'] },

  /* ---------- 美国：立场光谱 ---------- */
  { id:'npr',         name:'NPR',        url:'https://feeds.npr.org/1001/rss.xml',             lean:'progressive', lang:'en', region:'美国',      channels:['world','politics'] },
  { id:'foxnews',     name:'Fox News',   url:'https://moxie.foxnews.com/google-publisher/latest.xml', lean:'conservative', lang:'en', region:'美国', channels:['world','politics'] },
  { id:'cbsnews',     name:'CBS News',   url:'https://www.cbsnews.com/latest/rss/main',        lean:'center',      lang:'en', region:'美国',      channels:['world','politics'] },
  { id:'latimes',     name:'LA Times',   url:'https://www.latimes.com/world-nation/rss2.0.xml',lean:'progressive', lang:'en', region:'美国',      channels:['world','politics'] },
  { id:'thehill',     name:'The Hill',   url:'https://thehill.com/feed/',                      lean:'center',      lang:'en', region:'美国',      channels:['politics'] },

  /* ---------- 其他地区视角 ---------- */
  { id:'france24',    name:'France 24',  url:'https://www.france24.com/en/rss',                lean:'regional',    lang:'en', region:'法国',      channels:['world'] },
  { id:'tass',        name:'TASS',       url:'https://tass.com/rss/v2.xml',                    lean:'state',       lang:'en', region:'俄罗斯',    channels:['world'] },
  { id:'almonitor',   name:'Al-Monitor', url:'https://www.al-monitor.com/rss',                 lean:'regional',    lang:'en', region:'中东',      channels:['world'] },

  /* ---------- 科技 ---------- */
  { id:'techcrunch',  name:'TechCrunch', url:'https://techcrunch.com/feed/',                   lean:'industry',    lang:'en', region:'美国',      channels:['tech','business'] },
  { id:'arstechnica', name:'Ars Technica',url:'https://arstechnica.com/feed/',                 lean:'industry',    lang:'en', region:'美国',      channels:['tech','science'] },
  { id:'wired',       name:'WIRED',      url:'https://www.wired.com/feed/rss',                 lean:'industry',    lang:'en', region:'美国',      channels:['tech'] },
  { id:'hn',          name:'Hacker News',url:'https://hnrss.org/frontpage',                    lean:'community',   lang:'en', region:'全球',      channels:['tech'] },
  { id:'mittr',       name:'MIT Tech Review', url:'https://www.technologyreview.com/feed/',    lean:'industry',    lang:'en', region:'美国',      channels:['tech','science'] },

  /* ---------- 科学 ---------- */
  { id:'nature',      name:'Nature',     url:'https://www.nature.com/nature.rss',              lean:'science',     lang:'en', region:'英国',      channels:['science'] },
  { id:'quanta',      name:'Quanta',     url:'https://www.quantamagazine.org/feed/',           lean:'science',     lang:'en', region:'美国',      channels:['science'] },
  { id:'sciencedaily',name:'ScienceDaily',url:'https://www.sciencedaily.com/rss/all.xml',      lean:'science',     lang:'en', region:'美国',      channels:['science'] },
  { id:'physorg',     name:'Phys.org',   url:'https://phys.org/rss-feed/',                     lean:'science',     lang:'en', region:'全球',      channels:['science'] },

  /* ---------- 商业 ---------- */
  { id:'cnbc',        name:'CNBC',       url:'https://www.cnbc.com/id/100003114/device/rss/rss.html', lean:'industry', lang:'en', region:'美国', channels:['business'] },
  { id:'marketwatch', name:'MarketWatch',url:'https://www.marketwatch.com/rss/topstories',     lean:'industry',    lang:'en', region:'美国',      channels:['business'] },
];

const CHANNELS = [
  { id:'all',      name:'全部' },
  { id:'world',    name:'国际' },
  { id:'politics', name:'政治' },
  { id:'tech',     name:'科技' },
  { id:'science',  name:'科学' },
  { id:'business', name:'商业' },
  { id:'cn',       name:'中文' },
];

/* ============================================================
 * 2. 抓取
 * ============================================================ */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchUrl(url, timeout, redirects) {
  timeout = timeout || 12000;
  redirects = redirects === undefined ? 4 : redirects;

  return new Promise(function (resolve, reject) {
    let lib;
    try { lib = new URL(url).protocol === 'https:' ? https : http; }
    catch (e) { return reject(new Error('bad url')); }

    const req = lib.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    }, function (res) {
      const code = res.statusCode;

      if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).href; } catch (e) { next = res.headers.location; }
        return resolve(fetchUrl(next, timeout, redirects - 1));
      }
      if (code !== 200) { res.resume(); return reject(new Error('HTTP ' + code)); }

      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch (e) { stream = res; }

      const chunks = [];
      stream.on('data', function (c) { chunks.push(c); });
      stream.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeout, function () { req.destroy(new Error('timeout')); });
  });
}

/** 带一次重试的抓取：跨国抓取偶发 ECONNRESET / 超时，重试能救回大部分 */
async function fetchWithRetry(url) {
  let last;
  for (let i = 0; i < 2; i++) {
    try { return await fetchUrl(url, 15000); }
    catch (e) {
      last = e;
      if (i === 0) await new Promise(function (r) { setTimeout(r, 700); });
    }
  }
  throw last;
}

/* ============================================================
 * 3. RSS / Atom / RDF 解析（手写，够用且可控）
 * ============================================================ */
function stripCdata(s) {
  if (!s) return '';
  let t = String(s).trim();
  const m = t.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (m) t = m[1];
  return t;
}
function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
    .replace(/&#(\d+);/g, function (_, d) { try { return String.fromCodePoint(+d); } catch (e) { return ''; } })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&');
}
function clean(s) {
  return decodeEntities(stripCdata(s).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function pick(block, names) {
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const re = new RegExp('<' + n + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + n + '>', 'i');
    const m = block.match(re);
    if (m && m[1] && clean(m[1])) return m[1];
  }
  return '';
}
function pickLink(block) {
  const plain = clean(pick(block, ['link']));
  if (/^https?:\/\//i.test(plain)) return plain;
  const m = block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (m) {
    const v = decodeEntities(m[1]);
    if (/^https?:\/\//i.test(v)) return v;
  }
  const g = clean(pick(block, ['guid', 'id']));
  if (/^https?:\/\//i.test(g)) return g;
  return '';
}

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    const drop = [];
    x.searchParams.forEach(function (v, k) {
      if (/^(utm_|spm$|from$|ref$|share|fbclid|gclid|amp$)/i.test(k)) drop.push(k);
    });
    drop.forEach(function (k) { x.searchParams.delete(k); });
    return x.href.replace(/\/+$/, '');
  } catch (e) { return String(u || ''); }
}

function parseFeed(xml, source) {
  const out = [];
  if (!xml || xml.length < 60) return out;

  const blocks = xml
    .split(/<(?:\w+:)?(?:item|entry)\b[^>]*>/i)
    .slice(1)
    .map(function (s) { return s.split(/<\/(?:\w+:)?(?:item|entry)>/i)[0]; });

  blocks.forEach(function (b) {
    if (!b) return;
    const title = clean(pick(b, ['title']));
    if (!title || title.length < 4) return;

    let link = pickLink(b);
    if (!link) return;

    const rawDesc = pick(b, ['description', 'summary', 'content:encoded', 'content', 'media:description']);
    let summary = clean(rawDesc);
    if (summary.length > 260) summary = summary.slice(0, 258) + '…';
    if (summary.length < 20) summary = '';

    const rawDate = clean(pick(b, ['pubDate', 'published', 'updated', 'dc:date', 'date', 'lastBuildDate']));
    let time = Date.parse(rawDate);
    if (!time || isNaN(time)) time = Date.now();
    if (time > Date.now() + 864e5) time = Date.now();

    out.push({
      id: crypto.createHash('md5').update(normUrl(link) + '|' + title).digest('hex').slice(0, 12),
      source: source.id,
      title: title,
      summary: summary,
      url: link,
      time: time,
    });
  });

  return out;
}

/* ============================================================
 * 4. 关键词指纹 + 跨源话题聚类
 * ============================================================ */
/* 停用词分三层：虚词、媒体套话、高频动词。高频动词是「Apple Watch 新闻」和
   「Watch live 直播」被误判成同一话题的主因，必须清掉。 */
const STOP = new Set(('a an the and or but if then than that this these those is are was were be been being ' +
  'to of in on for with at by from as it its into about over after before under above during more most ' +
  'other some such only own same so too very can will just dont should now not no nor what which who whom ' +
  'when where why how all any both each few s t he she they them their there here you your we our us i ' +
  'new news says say said may could would get gets got make makes made ' +
  'one two three first last next best top day days week year years time times way ways thing things ' +
  'watch live show shows take takes give gives want wants need needs find finds look looks call calls ' +
  'set sets put puts run runs lead leads keep keeps hold holds turn turns play plays plan plans use uses ' +
  'work works start starts end ends open opens close closes add adds cut cuts drop drops rise rises ' +
  'fall falls hit hits miss kill kills killed dead dies die face faces lose loses lost win wins won ' +
  'report reports update updates video videos photo photos breaking exclusive opinion analysis review ' +
  'told tells tell amid ahead behind back still even ever never again once just only more less').split(/\s+/));

function tokenize(title) {
  const out = [];
  const en = title.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
  for (let i = 0; i < en.length; i++) if (!STOP.has(en[i])) out.push(en[i]);

  const zhRuns = title.match(/[\u4e00-\u9fa5]+/g) || [];
  for (let i = 0; i < zhRuns.length; i++) {
    const r = zhRuns[i];
    for (let j = 0; j < r.length - 1; j++) out.push(r.substr(j, 2));
    for (let j = 0; j < r.length - 2; j++) out.push(r.substr(j, 3));
  }
  return out;
}

/** 全局文档频率：用来判断一个词是不是「泛词」 */
let DF = new Map();

/** 给每条打上「指纹词」：只保留有区分度的词（出现 >=2 次，且出现率不高于 7%） */
function buildFingerprints(items) {
  DF = new Map();
  items.forEach(function (it) {
    const seen = new Set(tokenize(it.title));
    it._tok = Array.from(seen);
    seen.forEach(function (w) { DF.set(w, (DF.get(w) || 0) + 1); });
  });

  const cap = Math.max(3, Math.floor(items.length * 0.07));
  items.forEach(function (it) {
    const words = it._tok
      .filter(function (w) { const d = DF.get(w) || 0; return d >= 2 && d <= cap && w.length >= 2; })
      .sort(function (a, b) { return (DF.get(a) || 0) - (DF.get(b) || 0) || b.length - a.length; })
      .slice(0, 10);
    it.words = words;
    delete it._tok;
  });
}

/**
 * 跨源话题聚类。
 * 三个防「过度合并」的约束：
 *   1. 只在跨来源的条目对之间累计共享词 —— 同一家媒体的系列报道不会自己抱团
 *   2. 相似度门槛：共享词数 / 较短指纹长度 >= 0.34
 *   3. 簇大小上限 —— 弱连接不会把两个大簇粘成一个雪球
 */
function clusterItems(items) {
  const n = items.length;
  const parent = new Array(n);
  const sz = new Array(n);
  for (let i = 0; i < n; i++) { parent[i] = i; sz[i] = 1; }
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }

  const now = Date.now();
  const byWord = new Map();
  items.forEach(function (it, i) {
    if (now - it.time > CLUSTER_WINDOW) return;        // 老内容不参与聚类
    (it.words || []).forEach(function (w) {
      if (!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(i);
    });
  });

  const pairScore = new Map();
  byWord.forEach(function (list) {
    if (list.length < 2 || list.length > 16) return;   // 太泛的词不参与
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (items[list[a]].source === items[list[b]].source) continue;   // 必须跨源
        const key = list[a] + ':' + list[b];
        pairScore.set(key, (pairScore.get(key) || 0) + 1);
      }
    }
  });

  const pairs = [];
  pairScore.forEach(function (shared, key) {
    if (shared < 2) return;
    const p = key.split(':');
    const a = +p[0], b = +p[1];
    const shorter = Math.min(items[a].words.length, items[b].words.length) || 1;
    const sim = shared / shorter;
    if (sim < 0.34) return;
    pairs.push({ a: a, b: b, shared: shared, sim: sim });
  });
  // 越像的先合并，弱连接后合并
  pairs.sort(function (x, y) { return y.shared - x.shared || y.sim - x.sim; });

  pairs.forEach(function (p) {
    const ra = find(p.a), rb = find(p.b);
    if (ra === rb) return;
    if (sz[ra] + sz[rb] > CLUSTER_MAX) return;         // 禁止雪球
    if (sz[ra] < sz[rb]) { parent[ra] = rb; sz[rb] += sz[ra]; }
    else { parent[rb] = ra; sz[ra] += sz[rb]; }
  });

  const groups = new Map();
  items.forEach(function (it, i) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });

  const clusters = [];
  groups.forEach(function (list) {
    const srcs = new Set(list.map(function (x) { return x.source; }));
    if (list.length < 2 || srcs.size < 2) return;          // 至少要跨 2 个来源
    const leanSet = new Set(list.map(function (x) { return x.lean; }));

    // 话题词：簇内出现多、全局又少见的词最能代表这个话题
    const wordCount = new Map();
    list.forEach(function (x) {
      (x.words || []).forEach(function (w) { wordCount.set(w, (wordCount.get(w) || 0) + 1); });
    });
    const topic = Array.from(wordCount.entries())
      .filter(function (e) { return e[1] >= 2; })
      .sort(function (a, b) {
        // 簇内出现多、全局少见 的词最能代表话题；同分时长词优先（避免「能体」这种 2-gram 碎片）
        const wa = (a[1] / Math.max(1, DF.get(a[0]) || 1)) * (1 + 0.18 * (a[0].length - 2));
        const wb = (b[1] / Math.max(1, DF.get(b[0]) || 1)) * (1 + 0.18 * (b[0].length - 2));
        return wb - wa || b[1] - a[1];
      })
      .slice(0, 5)
      .map(function (e) { return e[0]; });

    const sorted = list.slice().sort(function (a, b) { return b.time - a.time; });

    clusters.push({
      id: 'c' + clusters.length,
      topic: topic,
      itemIds: sorted.map(function (x) { return x.id; }),   // 只给 id，正文由前端从 items 里取，避免重复传输
      sources: Array.from(srcs),
      leancount: Array.from(leanSet),
      heat: Math.round((list.length * 3 + srcs.size * 5 + leanSet.size * 4) * 10) / 10,
      time: sorted[0].time,
    });
  });

  clusters.sort(function (a, b) { return b.heat - a.heat || b.time - a.time; });
  return clusters.slice(0, 40);
}

/* ============================================================
 * 5. 缓存与刷新
 * ============================================================ */
/* 刷新节奏：分级而非一刀切。
   HOT_MS  —— 活跃源（科技/商业/中文源）更新频繁，短周期
   COLD_MS —— 其余源（时政/区域/科学）发布节奏慢，长周期
   FAIL_BACKOFF —— 抓取失败的源按指数退避，避免每轮都去碰钉子墙
   原来的 TTL 常量定义了却从未被引用，导致服务只在启动时抓一次、
   之后永不更新 —— 这里用真正的定时器把它落地。 */
const HOT_MS   = 3  * 60 * 1000;    // 3 分钟
const COLD_MS  = 15 * 60 * 1000;    // 15 分钟
const FAIL_BACKOFF_MAX = 30 * 60 * 1000;
const PER_SOURCE_CAP = 40;   // 单源条目上限：高产源（The Hill / TASS）否则会淹没其他源
const CLUSTER_WINDOW = 72 * 3600 * 1000;   // 只对 72 小时内的内容做话题聚类
const CLUSTER_MAX = 14;      // 单个话题最多容纳多少条

/** 活跃源：科技/商业/中文类，更新快，用短周期 */
const HOT_CHANNELS = new Set(['tech', 'business', 'cn']);
const HOT_IDS = new Set(SOURCES.filter(function (s) {
  return s.channels.some(function (c) { return HOT_CHANNELS.has(c); });
}).map(function (s) { return s.id; }));

/* 抓取失败的源：failCount 记录连续失败次数，退避时间按 2^n 增长，
   上限 FAIL_BACKOFF_MAX。这样一个挂掉的源不会每轮都拖慢整体刷新。 */
const failCount = new Map();

const state = {
  items: [],                 // 已解析的全部条目
  sources: new Map(),        // id -> { status, count, ms, at, error }
  updatedAt: 0,
  lastChangeAt: 0,           // 最近一次「内容真的变了」的时间
  refreshing: false,
  pending: new Set(SOURCES.map(function (s) { return s.id; })),
  lastError: '',
  clients: new Set(),        // SSE 订阅者
  generation: 0,             // 每次内容变化自增，前端据此判断要不要重渲染
};

function setSourceState(id, patch) {
  const cur = state.sources.get(id) || { status: 'wait', count: 0, ms: 0, at: 0, error: '' };
  state.sources.set(id, Object.assign(cur, patch));
}

/**
 * 抓取一批源。
 * @param {Array|null} only  只抓这些源；传 null 表示全量
 * @returns {Promise<{added:number, changed:boolean}>}
 */
async function refresh(only) {
  if (state.refreshing) return { added: 0, changed: false };
  state.refreshing = true;

  // only 为空数组时说明没到期任何源，直接跳过
  const targets = (only === null || only === undefined)
    ? SOURCES.slice()
    : SOURCES.filter(function (s) { return only.indexOf(s.id) >= 0; });

  if (!targets.length) {
    state.refreshing = false;
    return { added: 0, changed: false };
  }

  const queue = targets.slice();
  const startedAt = Date.now();
  const beforeIds = new Set(state.items.map(function (x) { return x.id; }));
  let added = 0;

  async function worker() {
    while (queue.length) {
      const src = queue.shift();
      const t0 = Date.now();
      setSourceState(src.id, { status: 'loading', error: '' });
      try {
        const xml = await fetchWithRetry(src.url);
        var parsed = parseFeed(xml, src)
          .sort(function (a, b) { return b.time - a.time; })
          .slice(0, PER_SOURCE_CAP)          // 每个源最多留 N 条，防止高产源淹没其他源
          .map(function (r) {
            r.sourceName = src.name;
            r.lean = src.lean;
            r.region = src.region;
            r.lang = src.lang;
            r.channels = src.channels;
            return r;
          });
        const rows = parsed;
        if (!rows.length) throw new Error('未解析到条目');
        setSourceState(src.id, { status: 'ok', count: rows.length, ms: Date.now() - t0, at: Date.now() });
        failCount.delete(src.id);              // 抓成功了，退避计数清零

        rows.forEach(function (r) { if (!beforeIds.has(r.id)) added++; });

        state.items = state.items
          .filter(function (x) { return x.source !== src.id; })
          .concat(rows);
      } catch (e) {
        const n = (failCount.get(src.id) || 0) + 1;
        failCount.set(src.id, n);
        setSourceState(src.id, {
          status: 'fail', count: 0, ms: Date.now() - t0,
          error: String(e.message || e),
          failCount: n,
          nextTryAt: Date.now() + backoffMs(n),
        });
      } finally {
        state.pending.delete(src.id);
      }
    }
  }

  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

  // 全量去重（同一链接只留最早入库的那条）
  const seen = new Map();
  state.items.forEach(function (it) {
    const k = normUrl(it.url);
    if (!seen.has(k)) seen.set(k, it);
  });
  state.items = Array.from(seen.values());

  buildFingerprints(state.items);

  state.updatedAt = Date.now();

  // 只有「确实多了新条目」才算内容变化 —— 否则 updatedAt 每次都跳，
  // 前端会误以为一直在更新，掩盖真正的问题
  const changed = added > 0;
  if (changed) {
    state.lastChangeAt = Date.now();
    state.generation++;
    broadcast('update', {
      generation: state.generation,
      added: added,
      total: state.items.length,
      at: state.lastChangeAt,
    });
  }

  state.refreshing = false;
  console.log('[refresh] ' + state.items.length + ' 条 / ' + targets.length + ' 源 · ' +
              ((Date.now() - startedAt) / 1000).toFixed(1) + 's · 新增 ' + added + ' · 失败 ' +
              Array.from(state.sources.values()).filter(function (s) { return s.status === 'fail'; }).length);
  return { added: added, changed: changed };
}

/** 失败源的指数退避：2^failCount 分钟，上限 FAIL_BACKOFF_MAX */
function backoffMs(n) {
  return Math.min(FAIL_BACKOFF_MAX, Math.pow(2, Math.min(n, 5)) * 60 * 1000);
}

/* ============================================================
 * 5.1 定时调度：分级刷新 + 常驻 SSE 推送
 * ============================================================ */
/**
 * 决定这一轮该刷哪些源。
 * 规则：
 *   - 距上次抓取超过自身周期（热源 3 分钟 / 冷源 15 分钟）→ 到期
 *   - 抓失败的源 → 按指数退避决定是否重试
 *   - 一个源都不到期 → 返回空数组，本次不发起任何请求
 */
function dueSources() {
  const now = Date.now();
  const due = [];
  SOURCES.forEach(function (s) {
    const st = state.sources.get(s.id) || {};
    // 失败源：退避未到点就不碰
    if (st.status === 'fail' && st.nextTryAt && now < st.nextTryAt) return;
    const period = HOT_IDS.has(s.id) ? HOT_MS : COLD_MS;
    if (!st.at || now - st.at >= period) due.push(s.id);
  });
  return due;
}

/* 调度循环：每 30 秒看一次有没有到期的源。
   用单次定时器递归而不是 setInterval —— 避免上一轮没跑完就叠下一轮。 */
function scheduleTick() {
  const due = dueSources();
  if (due.length && !state.refreshing) {
    refresh(due).catch(function (e) {
      console.error('[schedule] ' + (e && e.stack || e));
    });
  }
  setTimeout(scheduleTick, 30000);
}

/* ============================================================
 * 6. HTTP 服务
 * ============================================================ */
function apiPayload(light) {
  const sources = SOURCES.map(function (s) {
    const st = state.sources.get(s.id) || {};
    return {
      id: s.id, name: s.name, lean: s.lean, lang: s.lang, region: s.region,
      channels: s.channels, status: st.status || 'wait',
      count: st.count || 0, ms: st.ms || 0, error: st.error || '',
    };
  });

  // 轮询只需要知道「抓完了没有」，不必每次重传几百 KB 的正文
  if (light) {
    return {
      updatedAt: state.updatedAt,
      lastChangeAt: state.lastChangeAt,
      generation: state.generation,
      refreshing: state.refreshing,
      pending: Array.from(state.pending),
      leans: LEANS,
      channels: CHANNELS,
      sources: sources,
      total: state.items.length,
      clients: state.clients.size,
    };
  }

  const items = state.items.map(function (it) {
    return {
      id: it.id, source: it.source, sourceName: it.sourceName, lean: it.lean,
      region: it.region, lang: it.lang, channels: it.channels,
      title: it.title, summary: it.summary, url: it.url, time: it.time,
      words: it.words || [],
    };
  });
  return {
    updatedAt: state.updatedAt,
    lastChangeAt: state.lastChangeAt,
    generation: state.generation,
    refreshing: state.refreshing,
    pending: Array.from(state.pending),
    leans: LEANS,
    channels: CHANNELS,
    sources: sources,
    items: items,
    clusters: clusterItems(state.items),
  };
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/* ============================================================
 * 6.1 SSE 推送：把「有新内容了」这件事实时推给浏览器
 *     解决两个问题：前端不用再全量轮询几百 KB；
 *     新条目一落地就能出现在页面上。
 * ============================================================ */

/** 向所有订阅者广播一个事件 */
function broadcast(event, data) {
  const payload = 'event: ' + event + '\n' +
                  'data: ' + JSON.stringify(data) + '\n\n';
  state.clients.forEach(function (c) {
    try { c.write(payload); } catch (e) {
      state.clients.delete(c);          // 写失败就移除这个订阅者
    }
  });
}

/** 心跳：每 25 秒发一次注释行，防止中间代理把闲置连接掐掉 */
function heartbeat() {
  const ping = ': ping ' + Date.now() + '\n\n';
  state.clients.forEach(function (c) {
    try { c.write(ping); } catch (e) { state.clients.delete(c); }
  });
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',        // 关掉 nginx 缓冲，否则事件会被攒住
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 3000\n\n');      // 客户端断线后 3 秒自动重连

  // 首包把当前状态告诉客户端，前端不用额外请求一次
  res.write('event: hello\n');
  res.write('data: ' + JSON.stringify({
    generation: state.generation,
    total: state.items.length,
    lastChangeAt: state.lastChangeAt,
    updatedAt: state.updatedAt,
  }) + '\n\n');

  state.clients.add(res);
  console.log('[sse] 订阅者 +1，当前 ' + state.clients.size + ' 个');

  req.on('close', function () {
    state.clients.delete(res);
    console.log('[sse] 订阅者 -1，当前 ' + state.clients.size + ' 个');
  });
}

const handler = function (req, res) {
  try {
    route(req, res);
  } catch (e) {
    console.error('[handler] ' + (e && e.stack || e));
    try { send(res, 500, JSON.stringify({ error: String(e && e.message || e) })); } catch (e2) {}
  }
};

function route(req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;

  if (p === '/' || p === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), function (e, buf) {
      if (e) return send(res, 500, 'index.html 缺失', 'text/plain; charset=utf-8');
      send(res, 200, buf, 'text/html; charset=utf-8');
    });
    return;
  }

  if (p === '/api/stream') {
    handleSSE(req, res);
    return;
  }

  if (p === '/api/feed') {
    if (u.searchParams.get('fresh') === '1' && !state.refreshing) {
      state.pending = new Set(SOURCES.map(function (s) { return s.id; }));
      refresh(null);           // 手动刷新 = 全量
    }
    const light = u.searchParams.get('light') === '1';
    const now = Date.now();
    const slot = light ? lightCache : payloadCache;
    // 缓存 3 秒，避免前端轮询时反复做聚类
    if (!slot.body || now - slot.at > 3000) {
      slot.at = now;
      slot.body = JSON.stringify(apiPayload(light));
    }
    send(res, 200, slot.body);
    return;
  }

  send(res, 404, JSON.stringify({ error: 'not found' }));
}

let payloadCache = { at: 0, body: '' };
let lightCache = { at: 0, body: '' };

/* ============================================================
 * 7. 启动
 * ============================================================ */
function start(port, attempt) {
  attempt = attempt || 0;
  const srv = http.createServer(handler);
  srv.once('error', function (e) {
    if (e.code === 'EADDRINUSE' && attempt < 12) {
      start(port + 1, attempt + 1);
    } else {
      console.error('启动失败：' + e.message);
      process.exit(1);
    }
  });
  srv.listen(port, '127.0.0.1', function () {
    console.log('');
    console.log('  多元信息台已启动');
    console.log('  →  http://127.0.0.1:' + port);
    console.log('  ' + SOURCES.length + ' 个信息源正在后台抓取，首次约需几秒…');
    console.log('  实时刷新：活跃源 3 分钟 / 其余源 15 分钟，失败源自动退避');
    console.log('  按 Ctrl+C 停止');
    console.log('');
    refresh(null);           // 启动时全量抓一次
    scheduleTick();          // 之后进入分级调度循环
  });
}

/* 兜底：任何未捕获异常都不应该让聚合服务整体挂掉 */
process.on('uncaughtException', function (e) {
  console.error('[uncaught] ' + (e && e.stack || e));
});
process.on('unhandledRejection', function (e) {
  console.error('[unhandled] ' + (e && e.stack || e));
});

/* SSE 心跳定时器：防止闲置连接被代理掐断 */
setInterval(heartbeat, 25000);

/* 退出时优雅关闭所有 SSE 连接 */
process.on('SIGINT', function () {
  console.log('\n正在关闭…');
  state.clients.forEach(function (c) { try { c.end(); } catch (e) {} });
  process.exit(0);
});

start(parseInt(process.argv[2], 10) || 5178);
