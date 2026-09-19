// ai-ask.js —— 右侧「问 AI」抽屉：只聊本页文章。
// 规则前端先挡一层（体验），服务端 api.py 硬执行（安全）。
(function () {
  'use strict';
  if (location.pathname.indexOf('/blog/') !== 0) return; // 只在博客页出现
  var m = location.pathname.match(/posts\/([a-z0-9-]+)\.html$/);
  var slug = m ? m[1] : 'site'; // 文章页问本文，其余页问全站

  var SRV = ['服务器','nginx','ssh','root','密码','端口','数据库','部署','后台','管理员','admin','配置文件','内网','宝塔','防火墙','运维'];
  var MAXQ = 100;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── 右缘竖排标签 ──
  var tab = document.createElement('button');
  tab.className = 'ai-tab';
  tab.innerHTML = '问<em></em>AI';
  tab.title = m ? '向 AI 提问关于本文的问题' : '向 AI 提问关于本站的问题';

  // ── 抽屉 ──
  var drawer = document.createElement('div');
  drawer.className = 'ai-drawer';
  drawer.innerHTML =
    '<div class="ai-head"><div><b>问 AI</b><span class="kicker">About this page</span></div>' +
    '<button class="ai-close" title="收起">✕</button></div>' +
    '<div class="ai-rules">🌐 可联网查证 · 与本页有一点关联就答 · 一句话提问（≤' + MAXQ + '字）</div>' +
    '<div class="ai-msgs" id="ai-msgs">' +
    '<div class="ai-msg bot">你好，我是这篇文章的解读员 📖<br>内容、话题延伸、相关背景都能问，我能联网查证；完全无关的问题不答。</div></div>' +
    '<div class="ai-input"><input id="ai-q" type="text" maxlength="' + (MAXQ + 20) +
    '" placeholder="这篇文章讲了什么？…"><button id="ai-send">发送</button></div>';

  document.body.appendChild(tab);
  document.body.appendChild(drawer);

  var msgs = drawer.querySelector('#ai-msgs');
  var input = drawer.querySelector('#ai-q');
  var sendBtn = drawer.querySelector('#ai-send');
  var open = false, busy = false;

  function toggle(v) {
    open = v !== undefined ? v : !open;
    drawer.classList.toggle('on', open);
    tab.classList.toggle('on', open);
    if (open) setTimeout(function () { input.focus(); }, 260);
  }
  tab.onclick = function () { toggle(); };
  drawer.querySelector('.ai-close').onclick = function () { toggle(false); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) toggle(false);
  });

  function add(html, who) {
    var d = document.createElement('div');
    d.className = 'ai-msg ' + who;
    d.innerHTML = html;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function ask() {
    var q = input.value.trim();
    if (!q || busy) return;
    if (q.length > MAXQ) {
      add(esc(q), 'me');
      add('问题太长了——精简成一句话（' + MAXQ + ' 字以内）我再答。', 'bot refuse');
      input.value = '';
      return;
    }
    var low = q.toLowerCase();
    if (SRV.some(function (w) { return q.indexOf(w) >= 0 || low.indexOf(w) >= 0; })) {
      add(esc(q), 'me');
      add('这类问题与本页文章无关，我不聊服务器的事。', 'bot refuse');
      input.value = '';
      return;
    }
    add(esc(q), 'me');
    input.value = '';
    busy = true;
    sendBtn.disabled = true;
    var think = add('<span class="ai-dots"><i></i><i></i><i></i></span>', 'bot');
    fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, q: q })
    }).then(function (r) { return r.json(); }).then(function (d) {
      think.remove();
      add(esc(d.reply || d.error || '出错了'), 'bot' + (d.refuse ? ' refuse' : ''));
    }).catch(function () {
      think.remove();
      add('网络开小差了，稍后再试。', 'bot refuse');
    }).finally(function () {
      busy = false;
      sendBtn.disabled = false;
    });
  }

  sendBtn.onclick = ask;
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') ask();
  });
  input.addEventListener('input', function () {
    drawer.querySelector('.ai-rules').classList.toggle('warn', input.value.length > MAXQ);
  });
})();
