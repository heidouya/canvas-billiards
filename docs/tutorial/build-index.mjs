// 生成 docs/tutorial/index.html：把 22 章 md 内联成一个可双击打开的单页（离线可用）
// 用法：node docs/tutorial/build-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* ============================ Markdown → HTML ============================ */

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainText = html => html
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/(p|div|li|ul|ol|h[1-6]|td|th|tr|table|thead|tbody|pre|blockquote|hr)>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

function inline(s) {
  const stash = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => {
    stash.push(c);
    return '\u0000' + (stash.length - 1) + '\u0000';
  });
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]{1,60})\*/g, '$1<em>$2</em>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + esc(stash[+i]) + '</code>');
  return t;
}

const isListLine = l => /^\s*(?:[-*]|\d+\.)\s+/.test(l);
const listMatch = l => /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(l);

function buildList(nodes, start, indent) {
  const ordered = nodes[start].ordered;
  let html = ordered ? '<ol>' : '<ul>';
  let i = start;
  while (i < nodes.length) {
    const n = nodes[i];
    if (n.indent < indent) break;
    if (n.indent > indent) {
      const [sub, ni] = buildList(nodes, i, n.indent);
      html = html.replace(/<\/li>$/, sub + '</li>');
      i = ni;
      continue;
    }
    if (n.ordered !== ordered) break;
    let item = '<li>' + inline(n.text);
    i++;
    if (i < nodes.length && nodes[i].indent > indent) {
      const [sub, ni] = buildList(nodes, i, nodes[i].indent);
      item += sub;
      i = ni;
    }
    item += '</li>';
    html += item;
  }
  html += ordered ? '</ol>' : '</ul>';
  return [html, i];
}

function tableToHtml(rows) {
  const cells = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
  const head = cells(rows[0]);
  const align = cells(rows[1] || '').map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
  const body = rows.slice(2).map(cells);
  let html = '<div class="tw"><table><thead><tr>';
  head.forEach((h, i) => { html += '<th' + (align[i] ? ` style="text-align:${align[i]}"` : '') + '>' + inline(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  body.forEach(r => {
    html += '<tr>';
    head.forEach((_, i) => { html += '<td' + (align[i] ? ` style="text-align:${align[i]}"` : '') + '>' + inline(r[i] || '') + '</td>'; });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}

function renderBlocks(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let out = '';
  const startsBlock = l => /^\s*$/.test(l) || /^```/.test(l) || /^#{1,6}\s/.test(l) ||
    /^\s*\|/.test(l) || /^>/.test(l) || /^\s*(?:---+|\*\*\*+)\s*$/.test(l) || isListLine(l);

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    // 代码块
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // 收尾 ```
      out += '<pre class="code' + (lang ? ' lang-' + lang : '') + '"><code>' + esc(buf.join('\n')) + '</code></pre>';
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lv = h[1].length;
      out += `<h${lv}>${inline(h[2])}</h${lv}>`;
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { out += '<hr>'; i++; continue; }

    // 表格
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out += tableToHtml(rows);
      continue;
    }

    // 引用块
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out += '<blockquote>' + renderBlocks(buf.join('\n')) + '</blockquote>';
      continue;
    }

    // 列表
    if (isListLine(line)) {
      const nodes = [];
      while (i < lines.length && (isListLine(lines[i]) || /^\s{2,}\S/.test(lines[i]) || /^\s*$/.test(lines[i])) ) {
        if (/^\s*$/.test(lines[i])) {
          // 空行后如果还是列表项，继续；否则结束整段列表
          let k = i + 1;
          while (k < lines.length && /^\s*$/.test(lines[k])) k++;
          if (k < lines.length && isListLine(lines[k])) { i = k; continue; }
          break;
        }
        if (!isListLine(lines[i])) { i++; continue; }   // 续行暂时忽略（本教程未使用）
        const m = listMatch(lines[i]);
        const indent = m[1].replace(/\t/g, '  ').length;
        let text = m[3].trim();
        const cb = /^\[( |x)\]\s+(.*)$/.exec(text);
        if (cb) text = '<span class="cb">' + (cb[1] === 'x' ? '☑' : '☐') + '</span> ' + cb[2];
        nodes.push({ indent, ordered: /\d+\./.test(m[2]), text });
        i++;
      }
      const [html] = buildList(nodes, 0, nodes[0].indent);
      out += html;
      continue;
    }

    // 段落：吃到下一段新块开始
    const buf = [line];
    i++;
    while (i < lines.length && !startsBlock(lines[i])) buf.push(lines[i++]);
    out += '<p>' + inline(buf.join('\n')) + '</p>';
  }
  return out;
}

/* ============================ 读取章节 ============================ */

const files = fs.readdirSync(DIR)
  .filter(f => /^\d{2}-.+\.md$/.test(f))
  .sort();

const PART = num => {
  if (num === 0) return '开始之前';
  if (num <= 4) return '第一部分 · 打地基';
  if (num <= 7) return '第二部分 · 把台球桌画出来';
  if (num <= 10) return '第三部分 · 让球动起来';
  if (num <= 15) return '第四部分 · 能操作、有规则';
  return '第五部分 · 对手、界面与打磨';
};

const chapters = files.map((f, idx) => {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const num = Number(f.slice(0, 2));
  const titleLine = (/^#\s+(.*)$/m.exec(raw) || [, f])[1].trim();
  const title = titleLine.replace(/^第\s*\d+\s*章\s*·\s*/, '');
  const chars = raw.replace(/\s/g, '').length;
  const minutes = Math.max(5, Math.round(chars / 350));
  // 章内的「01-先跑起来.md」这类链接，改成页内跳转；开头的一级标题由页面自己渲染，正文里去掉避免重复
  const bodyHtml = renderBlocks(raw.replace(/^#\s+.*(\r?\n)+/, ''))
    .replace(/href="(?:\.\/)?(\d{2})-[^"]*\.md"/g, 'href="#$1"');
  return {
    id: String(num).padStart(2, '0'),
    file: f,
    title,
    full: titleLine,
    part: PART(num),
    minutes,
    no: num,
    intro: num === 0,
    html: bodyHtml,
    // 搜索用的纯文本（去掉标签、合并空白；不含章标题，标题单独参与匹配）
    text: plainText(bodyHtml)
  };
});

const totalChapters = chapters.filter(c => !c.intro).length;

// 内联到 <script> 里：把 < 转成 \u003c，否则正文里出现 </script> 字样会提前截断脚本
const chaptersJson = JSON.stringify(chapters.map(c => ({
  id: c.id, title: c.title, part: c.part, minutes: c.minutes,
  no: c.no, intro: c.intro, html: c.html, text: c.text
}))).replace(/</g, '\\u003c');

const toc = [];
let lastPart = '';
for (const c of chapters) {
  if (c.part !== lastPart) {
    toc.push({ part: c.part });
    lastPart = c.part;
  }
  toc.push({ id: c.id, title: c.title, minutes: c.minutes });
}

/* ============================ 生成 HTML ============================ */

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>八球台球 · 从零教程</title>
<style>
:root{
  --bg:#080d13; --bg2:#0d151e; --line:#1e2c3c; --txt:#dbe7f2; --dim:#8ba0b5; --dim2:#5f7488;
  --acc:#37d08b; --acc2:#58a6ff; --gold:#f0a85e;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--txt);
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
a{color:var(--acc2);text-decoration:none}
a:hover{text-decoration:underline}
.app{display:flex;min-height:100dvh}

/* 侧栏 */
.nav{width:276px;flex:0 0 276px;border-right:1px solid var(--line);background:linear-gradient(180deg,#0b131c,#080d13);
  position:sticky;top:0;height:100dvh;overflow:auto;padding:0 12px 26px}
.nav::-webkit-scrollbar{width:8px}
.nav::-webkit-scrollbar-thumb{background:#22303f;border-radius:4px}
.sidehead{position:sticky;top:0;z-index:6;background:#0b131c;padding:18px 0 10px;margin-bottom:10px}
.brand{padding:0 8px 12px;border-bottom:1px solid var(--line);margin-bottom:10px}
.brand .t{font-size:15px;font-weight:700;letter-spacing:.5px}
.brand .s{font-size:11.5px;color:var(--dim2);margin-top:4px;letter-spacing:.4px}
.qwrap{padding:0 8px}
.q{width:100%;padding:7px 10px;font-size:12.5px;border-radius:9px;border:1px solid #22303f;background:#0e1720;
  color:var(--txt);outline:none;font-family:inherit}
.q:focus{border-color:#2f6a52;background:#101a25}
.q::placeholder{color:#4d6478}
.res{padding:2px 0}
.res .cnt{font-size:11.5px;color:var(--dim2);padding:2px 8px 8px;letter-spacing:.3px}
.res-i{display:block;padding:8px 9px;border-radius:9px;border:1px solid transparent;cursor:pointer}
.res-i:hover{background:#101a25;border-color:#1c2b3b;text-decoration:none}
.res-i .h{font-size:12.5px;color:#d3e3f0;line-height:1.5}
.res-i .sn{font-size:11.5px;color:var(--dim2);line-height:1.65;margin-top:3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.res .empty{font-size:12px;color:var(--dim2);padding:4px 8px 10px;line-height:1.7}
mark{background:rgba(240,168,94,.18);color:#ffd9a8;border-radius:3px;padding:0 1px}
.part{font-size:11px;color:var(--dim2);letter-spacing:.8px;margin:14px 8px 6px}
.item{display:flex;gap:8px;align-items:baseline;padding:7px 9px;border-radius:9px;cursor:pointer;
  font-size:13px;color:var(--dim);line-height:1.45;border:1px solid transparent}
.item:hover{background:#101a25;color:var(--txt);text-decoration:none}
.item.on{background:#0f1d18;border-color:#21493a;color:#dff5ea}
.item .no{flex:0 0 20px;font-size:11px;color:var(--dim2);font-variant-numeric:tabular-nums}
.item.on .no{color:var(--acc)}
.item .tt{flex:1 1 auto;min-width:0}

/* 正文 */
.main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.topbar{position:sticky;top:0;z-index:20;display:none;align-items:center;gap:10px;
  padding:9px 12px;background:rgba(8,13,19,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.topbar button{flex:0 0 auto;padding:6px 10px;border-radius:8px;border:1px solid #2a3f54;background:#131e29;
  color:#d7e6f2;font-size:12.5px;cursor:pointer}
.topbar .now{flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--dim);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc{width:100%;max-width:860px;margin:0 auto;padding:34px 26px 90px}

.doc h1{font-size:26px;letter-spacing:.5px;margin:0 0 6px;line-height:1.35}
.doc code{overflow-wrap:anywhere}
.doc .meta{font-size:12px;color:var(--dim2);margin-bottom:22px;letter-spacing:.3px}
.doc h2{font-size:19px;margin:34px 0 10px;padding-top:16px;border-top:1px solid #16222f}
.doc h3{font-size:15.5px;margin:24px 0 8px}
.doc p{font-size:15px;line-height:1.9;margin:12px 0;white-space:pre-line;color:#d6e3ef}
.doc code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;
  background:#152130;border:1px solid #1f3145;border-radius:5px;padding:1px 5px;color:#9fe3c4}
.doc pre{background:#0b141d;border:1px solid #1c2b3b;border-radius:10px;padding:14px 15px;overflow:auto;
  margin:14px 0;line-height:1.65}
.doc pre code{background:none;border:0;padding:0;font-size:13px;color:#d8e6f2;white-space:pre}
.doc ul,.doc ol{margin:10px 0;padding-left:22px;font-size:15px;line-height:1.85}
.doc li{margin:5px 0}
.doc li>ul,.doc li>ol{margin:6px 0}
.doc blockquote{margin:14px 0;padding:10px 14px;border-left:3px solid #2f6a52;background:#0d1a15;
  border-radius:0 10px 10px 0;color:#bcd2c8}
.doc blockquote p{margin:6px 0;color:#bcd2c8}
.doc hr{border:0;border-top:1px solid #1a2735;margin:26px 0}
.tw{overflow-x:auto;margin:16px 0;border:1px solid #1c2b3b;border-radius:10px}
.doc table{border-collapse:collapse;width:100%;font-size:13.5px}
.doc th{background:#111d28;color:#cfe1f0;text-align:left;padding:9px 12px;border-bottom:1px solid #1c2b3b;white-space:nowrap}
.doc td{padding:9px 12px;border-bottom:1px solid #152130;color:#c3d3e2;vertical-align:top}
.doc tbody tr:last-child td{border-bottom:0}
.doc tbody tr:nth-child(even){background:#0b141d}
.cb{color:var(--acc)}

/* 章节底部翻页 */
.pager{display:flex;gap:12px;margin-top:40px;padding-top:18px;border-top:1px solid #16222f}
.pager a,.pager span{flex:1 1 0;padding:11px 14px;border-radius:10px;border:1px solid #1e2c3c;background:#0d151e;
  font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:3px}
.pager a:hover{border-color:#2f6a52;color:var(--txt);text-decoration:none}
.pager .k{font-size:11px;color:var(--dim2)}
.pager .next{text-align:right;align-items:flex-end}
.pager span{opacity:.4}

/* 手机 */
@media (max-width:900px){
  .nav{position:fixed;left:0;top:0;bottom:0;z-index:40;transform:translateX(-100%);
    transition:transform .22s ease;box-shadow:0 0 40px rgba(0,0,0,.5)}
  .nav.open{transform:none}
  .scrim{display:none}
  .nav.open~.scrim{display:block;position:fixed;inset:0;z-index:30;background:rgba(3,7,12,.6)}
  .topbar{display:flex}
  .doc{padding:22px 16px 70px}
  .doc h1{font-size:22px}
  .doc table{font-size:12.5px}
}
</style>
</head>
<body>
<div class="app">
  <nav class="nav" id="nav">
    <div class="sidehead">
      <div class="brand">
        <div class="t">八球台球 · 从零教程</div>
        <div class="s">${totalChapters} 章 + 导读 · 从第一个网页到能玩的游戏</div>
      </div>
      <div class="qwrap"><input id="q" class="q" type="search" placeholder="搜一下，如 碰撞 / 手中球" autocomplete="off"></div>
    </div>
    <div class="toc" id="toc">
    ${toc.map(it => it.part
      ? `<div class="part">${esc(it.part)}</div>`
      : `<a class="item" data-id="${it.id}" href="#${it.id}"><span class="no">${it.id}</span><span class="tt">${esc(it.title)}</span></a>`
    ).join('\n    ')}
    </div>
    <div class="res" id="results" hidden></div>
  </nav>
  <div class="scrim" id="scrim"></div>

  <div class="main">
    <div class="topbar">
      <button id="btnNav">章节</button>
      <div class="now" id="nowTitle"></div>
    </div>
    <article class="doc" id="doc"></article>
  </div>
</div>

<script>
const CHAPTERS = ${chaptersJson};
const TOTAL = ${totalChapters};
const KEY = 'pool.tutorial.last';

const doc = document.getElementById('doc');
const nav = document.getElementById('nav');
const nowTitle = document.getElementById('nowTitle');

function renderChapter(id, push) {
  const i = CHAPTERS.findIndex(c => c.id === id);
  const c = CHAPTERS[Math.max(0, i)];
  if (!c) return;

  const idx = CHAPTERS.indexOf(c);
  const prev = CHAPTERS[idx - 1];
  const next = CHAPTERS[idx + 1];

  doc.innerHTML = '<h1>' + c.title + '</h1>'
    + '<div class="meta">' + (c.intro ? '导读' : c.part + ' ｜ 第 ' + c.no + ' 章') + ' ｜ 共 ' + TOTAL + ' 章 ｜ 约 ' + c.minutes + ' 分钟</div>'
    + c.html
    + '<div class="pager">'
      + (prev ? '<a href="#' + prev.id + '" data-nav="' + prev.id + '"><span class="k">上一章</span>' + prev.title + '</a>' : '<span><span class="k">上一章</span>已经是第一章</span>')
      + (next ? '<a class="next" href="#' + next.id + '" data-nav="' + next.id + '"><span class="k">下一章</span>' + next.title + '</a>' : '<span class="next"><span class="k">下一章</span>教程已完结</span>')
    + '</div>';

  document.querySelectorAll('.item').forEach(a => a.classList.toggle('on', a.dataset.id === c.id));
  nowTitle.textContent = (c.intro ? '导读' : '第 ' + c.no + ' 章') + ' · ' + c.title;
  document.title = c.title + ' · 八球台球教程';
  localStorage.setItem(KEY, c.id);
  window.scrollTo(0, 0);
  if (push !== false && location.hash !== '#' + c.id) history.replaceState(null, '', '#' + c.id);
}

function route() {
  const id = (location.hash || '').replace('#', '');
  const ok = CHAPTERS.some(c => c.id === id);
  renderChapter(ok ? id : (localStorage.getItem(KEY) || '00'), false);
  if (pendingQuery) { const p = pendingQuery; pendingQuery = ''; applyHighlight(p); }
}

/* ---------------------------- 搜索 ---------------------------- */
const qEl = document.getElementById('q');
const resEl = document.getElementById('results');
const tocEl = document.getElementById('toc');
let pendingQuery = '';

const INDEX = CHAPTERS.map(c => ({ c: c, lowAll: (c.title + ' ' + c.part + ' ' + c.text).toLowerCase(), lowBody: c.text.toLowerCase() }));

function markInto(el, text, low) {
  let i = 0;
  while (i < text.length) {
    const at = text.toLowerCase().indexOf(low, i);
    if (at < 0) { el.appendChild(document.createTextNode(text.slice(i))); break; }
    if (at > i) el.appendChild(document.createTextNode(text.slice(i, at)));
    const m = document.createElement('mark');
    m.textContent = text.slice(at, at + low.length);
    el.appendChild(m);
    i = at + low.length;
  }
}

function go(id, qq) {
  if (location.hash === '#' + id) {
    renderChapter(id, false);
    applyHighlight(qq);
  } else {
    pendingQuery = qq;
    location.hash = '#' + id;
  }
  nav.classList.remove('open');
}

function runSearch(raw) {
  const qq = String(raw || '').trim();
  if (!qq) {
    resEl.hidden = true; resEl.innerHTML = ''; tocEl.hidden = false;
    return;
  }
  const low = qq.toLowerCase();
  const hits = [];
  INDEX.forEach(rec => {
    const at = rec.lowAll.indexOf(low);
    if (at < 0) return;
    const inTitle = rec.c.title.toLowerCase().indexOf(low) >= 0;
    let count = 0, p = 0;
    while ((p = rec.lowBody.indexOf(low, p)) >= 0) { count++; p += low.length; }
    const src = rec.c.text;
    const bodyAt = rec.lowBody.indexOf(low);
    let snip;
    if (bodyAt < 0) snip = src.slice(0, 70) + '…';
    else snip = (bodyAt > 24 ? '…' : '') + src.slice(Math.max(0, bodyAt - 24), bodyAt + low.length + 36) + '…';
    hits.push({ c: rec.c, count: count, inTitle: inTitle, snip: snip });
  });
  hits.sort((a, b) => (b.inTitle - a.inTitle) || (b.count - a.count));

  resEl.innerHTML = '';
  resEl.hidden = false;
  tocEl.hidden = true;

  const head = document.createElement('div');
  head.className = 'cnt';
  head.textContent = hits.length ? '找到 ' + hits.length + ' 章 · 点一条跳过去' : '';
  if (hits.length) resEl.appendChild(head);

  if (!hits.length) {
    const em = document.createElement('div');
    em.className = 'empty';
    em.textContent = '没找到「' + qq + '」。换个词试试：碰撞、手中球、音效、回放、响应式…';
    resEl.appendChild(em);
    return;
  }

  hits.forEach(h => {
    const a = document.createElement('a');
    a.className = 'res-i';
    a.href = '#' + h.c.id;
    const t = document.createElement('div');
    t.className = 'h';
    markInto(t, (h.c.intro ? '导读 · ' : '第 ' + h.c.no + ' 章 · ') + h.c.title, low);
    const s = document.createElement('div');
    s.className = 'sn';
    markInto(s, h.snip, low);
    a.appendChild(t); a.appendChild(s);
    a.addEventListener('click', e => {
      e.preventDefault();
      go(h.c.id, qq);
    });
    resEl.appendChild(a);
  });
}

function applyHighlight(qq) {
  const low = qq.toLowerCase();
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const p = n.parentNode;
    if (!p || p.nodeName === 'MARK' || !n.nodeValue || n.nodeValue.toLowerCase().indexOf(low) < 0) continue;
    // 标题和 meta 不刷高亮：标题已经写着这章讲什么，滚动应该落到正文第一处
    if (p.closest && p.closest('h1,.meta')) continue;
    nodes.push(n);
  }
  let left = 120;
  nodes.forEach(n => {
    if (left <= 0) return;
    const frag = document.createDocumentFragment();
    const holder = document.createElement('span');
    markInto(holder, n.nodeValue, low);
    left -= holder.querySelectorAll('mark').length;
    while (holder.firstChild) frag.appendChild(holder.firstChild);
    n.parentNode.replaceChild(frag, n);
  });
  const first = doc.querySelector('mark');
  if (first) first.scrollIntoView({ block: 'center' });
}

if (qEl) qEl.addEventListener('input', () => runSearch(qEl.value));
if (qEl) qEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = resEl.querySelector('.res-i');
    if (first) { e.preventDefault(); first.click(); }
  }
});

document.querySelectorAll('.item').forEach(a => {
  a.addEventListener('click', () => { nav.classList.remove('open'); });
});

document.getElementById('btnNav').addEventListener('click', () => nav.classList.toggle('open'));
document.getElementById('scrim').addEventListener('click', () => nav.classList.remove('open'));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (qEl && document.activeElement === qEl && qEl.value) { qEl.value = ''; runSearch(''); }
    else nav.classList.remove('open');
  }
  if (e.key === '/' && qEl && document.activeElement !== qEl
      && !/^(INPUT|TEXTAREA)$/.test((document.activeElement.tagName || ''))) {
    e.preventDefault(); nav.classList.add('open'); qEl.focus();
  }
});
window.addEventListener('hashchange', route);
route();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'index.html'), PAGE, 'utf8');
console.log('已生成 index.html：' + chapters.length + ' 章，' + Math.round(PAGE.length / 1024) + ' KB');
