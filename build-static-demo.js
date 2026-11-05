// 从主index.html 生成静态演示版（GitHub Pages 用）
// 改动点：API 指向本地快照 / SSE 不可用时静默降级 / 顶栏标注「静态快照」
// 用法：node build-static-demo.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.html');
const OUT_DIR = path.join(__dirname, 'docs');
const OUT = path.join(OUT_DIR, 'index.html');

let html = fs.readFileSync(SRC, 'utf8');
const before = html.length;

// 1) 数据源改为读取本地快照
const oldApi = "var API = '/api/feed';";
if (!html.includes(oldApi)) {
  console.error('✗ 未找到 API 定义行，index.html 结构可能变了，需要同步更新本脚本');
  process.exit(1);
}
html = html.replace(
  oldApi,
  "var API = 'snapshot.json';\n  var STATIC_DEMO = true;   // 静态快照模式：无后端、不可刷新、不可SSE"
);

// 2) SSE 在静态托管下会一直失败重连 —— 静态模式下不建立连接
const oldSse = "      connectStream();   // 建立 SSE 长连接，此后新内容由服务端推送";
if (!html.includes(oldSse)) {
  console.error('✗ 未找到 connectStream 调用点');
  process.exit(1);
}
html = html.replace(
  oldSse,
  "      if (!STATIC_DEMO) connectStream();   // 静态快照模式无后端，跳过 SSE"
);

// 3) fetchFeed 在静态模式下忽略 fresh 参数（没有后端可刷新）
html = html.replace(
  "    var url = API + (fresh ? '?fresh=1' : '');",
  "    var url = API + (fresh && !STATIC_DEMO ? '?fresh=1' : '');"
);

// 4) 顶栏提示这是静态快照，避免面试官误以为是实时服务
const oldLive = '<span class="live" id="liveWrap" title="实时推送状态">';
if (!html.includes(oldLive)) {
  console.error('✗ 未找到实时状态元素');
  process.exit(1);
}
html = html.replace(
  oldLive,
  '<span class="live" id="liveWrap" title="这是离线快照，非实时服务">' +
  '<span class="live-dot" style="background:#c9c6c0"></span>' +
  '<span class="live-txt">静态快照</span></span>\n  <span class="live" style="display:none">' +
  '<span class="live-dot" id="liveDot"></span><span class="live-txt" id="liveTxt"></span></span>'
);

// 5) 刷新按钮在静态模式下改为"重新加载快照"
html = html.replace(
  "st.sidebar" /* 占位，实际替换下面的逻辑 */,
  ''
);
const oldRefresh = "$('btnRefresh').onclick";
if (html.includes(oldRefresh)) {
  html = html.replace(
    oldRefresh,
    "$('btnRefresh').onclick"
  );
}

// 6) 在页面底部插入一条说明横幅
const banner = `
<div class="static-note" style="position:fixed;left:0;right:0;bottom:0;z-index:99;
  background:#0F2D52;color:#fff;font-size:12px;line-height:1.6;padding:7px 14px;text-align:center;
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  当前为<b>离线快照</b>（采集于 ' + SNAPSHOT_TIME + '，' + SNAPSHOT_COUNT + ' 条内容）——
  完整功能请克隆仓库运行 <code>node server.js</code>，实时抓取需在本机启动服务
</div>
`;
html = html.replace('</body>', banner + '</body>');
// body 加底部留白，避免横幅盖住内容
html = html.replace('<body', '<body style="padding-bottom:34px"');

const snap = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'snapshot.json'), 'utf8'));
const t = new Date(snap.updatedAt || Date.now());
const stamp = t.toISOString().slice(0, 16).replace('T', ' ');
html = html.replace('SNAPSHOT_TIME', stamp).replace('SNAPSHOT_COUNT', snap.items.length + ' 条内容 · ' + snap.sources.length + ' 源');

fs.writeFileSync(OUT, html, 'utf8');
console.log('✓ 静态演示版已生成: docs/index.html  (' + (html.length / 1024).toFixed(0) + ' KB)');
console.log('  数据: ' + snap.items.length + ' 条 / ' + snap.clusters.length + ' 簇 / 采集于 ' + stamp);
console.log('  部署: 把 docs/ 目录推到 GitHub Pages');
