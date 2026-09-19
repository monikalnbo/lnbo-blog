// enhance.js —— 博客渐进增强 v2（2026-09）
// 全部功能无侵入：页面不加载它也完整可读。
// 包含：亮暗主题 / 个性化阅读（背景·字号·衬线，本机保存+登录同步）/
//       阅读进度条 / 阅读时长 / 上下篇 / 回到顶部 / 文内目录 / 代码高亮 / 图片灯箱 / 首页搜索筛选
(function () {
  'use strict';
  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };

  /* ── 文章登记表（上下篇导航用；新文章记得登记）── */
  var POSTS = [
    { f: 'sun-ge-zhi-huxijin.html', t: '孙哥的小作文：致胡锡进老师' },
    { f: 'ai-liangtian-dagua.html', t: 'AI 圈两天两个大瓜' },
    { f: 'sun-ge-xiaozuowen.html', t: '孙哥的小作文：我的女友景甜' },
    { f: 'codex-shiyong-daquan.html', t: 'Codex 使用大全（万字长文）' },
    { f: 'codex-from-zero-to-master.html', t: '万字长文｜Codex 从入门到精通' },
    { f: 'hermes.html', t: 'Hermes Agent 研究系列（全九章）' },
    { f: 'codex-guonei-install.html', t: '2026 年国内 Codex 安装教程' },
    { f: 'codex-tutorial.html', t: 'OpenAI Codex 不完全の伪新手指南' }
  ];

  var article = $('article');
  var isArticle = !!article;

  /* ════ 1. 亮暗主题（跟随系统，可手动切换并记忆）════ */
  (function theme() {
    var saved = null;
    try { saved = localStorage.getItem('x2md_theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') applyTheme(saved);
    else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');

    var btn = document.createElement('button');
    btn.className = 'theme-btn';
    btn.title = '切换亮/暗主题';
    btn.setAttribute('aria-label', '切换亮暗主题');
    var nav = $('nav');
    if (nav) nav.appendChild(btn);
    btn.onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var to = cur === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('x2md_theme', to); } catch (e) {}
      applyTheme(to);
    };
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
    }
  })();

  /* ════ 2. 个性化阅读：背景 / 字号 / 衬线 —— 只属于自己 ════
     本机 localStorage 即时生效；登录用户另存服务器，跨设备跟随。
     任何人改的都只进自己的浏览器/自己的账号，不影响别的访客。 */
  var Reader = (function () {
    var KEY = 'x2md_reader';
    var MAX = 20.5, MIN = 13.5, STEP = 1.5;
    var PRESETS = [
      { id: 'paper', name: '纸白', bg: '' },
      { id: 'cream', name: '暖米', bg: '#f7f1e3' },
      { id: 'green', name: '豆沙绿', bg: '#e4ecdb' },
      { id: 'azure', name: '天青', bg: '#dfe9ef' },
      { id: 'night', name: '夜墨', bg: '#232019' },
      { id: 'amoled', name: '纯黑', bg: '#000000' }
    ];
    var pref = load();

    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function save() {
      pref.ts = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {}
      sync();
    }
    function sync() {
      fetch('/api/me').then(function (r) { return r.json(); }).then(function (m) {
        if (!m.logged_in) return;
        fetch('/api/pref', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pref: pref })
        }).catch(function () {});
      }).catch(function () {});
    }
    function lum(hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return 1;
      var n = parseInt(m[1], 16);
      var f = function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.2); };
      return .2126 * f(n >> 16) + .7152 * f((n >> 8) & 255) + .0722 * f(n & 255);
    }
    function apply() {
      var root = document.documentElement;
      var art = article;
      if (!art) return;
      if (pref.bg) {
        var darkText = lum(pref.bg) < 0.35;
        root.setAttribute('data-reader', 'on');
        root.style.setProperty('--reader-bg', pref.bg);
        root.style.setProperty('--reader-text', darkText ? '#e9e3d8' : '#241f18');
        root.style.setProperty('--reader-muted', darkText ? '#a89f92' : '#7d746a');
      } else {
        root.removeAttribute('data-reader');
        root.style.removeProperty('--reader-bg');
        root.style.removeProperty('--reader-text');
        root.style.removeProperty('--reader-muted');
      }
      art.style.fontSize = pref.size ? pref.size + 'px' : '';
      art.classList.toggle('reader-serif', !!pref.serif);
    }
    function ui() {
      var box = document.createElement('div');
      box.className = 'reader-pop';
      var swatches = PRESETS.map(function (p) {
        var st = p.bg ? 'background:' + p.bg : 'background:#fff;border:1px solid #ddd';
        return '<button class="rp-bg" data-id="' + p.id + '" title="' + p.name + '" style="' + st + '"></button>';
      }).join('');
      box.innerHTML =
        '<div class="rp-h">🎨 我的阅读背景 <button class="rp-close" title="收起">✕</button></div>' +
        '<div class="rp-row">' + swatches +
        '<label class="rp-custom" title="自定义颜色"><input type="color" id="rp-color">' +
        (pref.custom ? '<i style="background:' + pref.custom + '"></i>' : '<i style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"></i>') + '</label></div>' +
        '<div class="rp-note">改的只有你自己看得到；登录后跨设备同步</div>' +
        '<div class="rp-h" style="margin-top:12px">🔤 字号</div>' +
        '<div class="rp-row rp-size"><button id="rp-smaller" class="rp-btn2">A－</button>' +
        '<span id="rp-sizev">' + (pref.size || 15.5) + '</span>' +
        '<button id="rp-bigger" class="rp-btn2">A＋</button>' +
        '<button id="rp-serif" class="rp-btn2' + (pref.serif ? ' on' : '') + '">' + (pref.serif ? '衬线' : '黑体') + '文</button>' +
        '<button id="rp-reset" class="rp-btn2">重置</button></div>' +
        '<div class="rp-sync" id="rp-sync"></div>';
      return box;
    }
    function wire(box) {
      $$('.rp-bg', box).forEach(function (b) {
        b.onclick = function () {
          var p = PRESETS.filter(function (x) { return x.id === b.dataset.id; })[0];
          pref.bg = p.bg; pref.preset = p.id; pref.custom = '';
          save(); apply(); open();
        };
      });
      var color = $('#rp-color', box);
      color.oninput = function () {
        pref.bg = color.value; pref.custom = color.value; pref.preset = 'custom';
        save(); apply();
      };
      $('#rp-smaller', box).onclick = function () { pref.size = Math.max(MIN, (pref.size || 15.5) - STEP); save(); apply(); open(); };
      $('#rp-bigger', box).onclick = function () { pref.size = Math.min(MAX, (pref.size || 15.5) + STEP); save(); apply(); open(); };
      $('#rp-serif', box).onclick = function () { pref.serif = !pref.serif; save(); apply(); open(); };
      $('#rp-reset', box).onclick = function () { pref = {}; save(); apply(); open(); };
      $('.rp-close', box).onclick = close;
      fetch('/api/me').then(function (r) { return r.json(); }).then(function (m) {
        var el = $('#rp-sync', box); if (!el) return;
        el.textContent = m.logged_in ? '☁️ 已同步到账号 ' + m.username : '💾 只保存在本机（登录可跨设备同步）';
      }).catch(function () {});
    }
    var panel = null;
    function open() {
      close();
      panel = ui();
      wire(panel);
      document.body.appendChild(panel);
    }
    function close() { if (panel) { panel.remove(); panel = null; } }

    // 入口按钮（文章页右下角）
    if (isArticle) {
      var fab = document.createElement('button');
      fab.className = 'reader-fab';
      fab.title = '个性化阅读（背景/字号/字体）';
      fab.textContent = 'Aa';
      document.body.appendChild(fab);
      fab.onclick = function () { panel ? close() : open(); };
    }
    // 启动：本机偏好先应用；登录用户再拉服务器（新者胜）
    apply();
    fetch('/api/me').then(function (r) { return r.json(); }).then(function (m) {
      if (!m.logged_in) return;
      return fetch('/api/pref').then(function (r) { return r.json(); }).then(function (s) {
        var remote = s.pref || {};
        if ((remote.ts || 0) > (pref.ts || 0)) {
          pref = remote;
          try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {}
          apply();
        }
      });
    }).catch(function () {});
    return {};
  })();

  if (!isArticle) {
    /* ════ 3a. 首页：搜索 + 标签筛选 ════ */
    (function indexTools() {
      var input = $('#search-input');
      var cards = $$('.post-card');
      if (!input || !cards.length) return;
      var chips = $$('.fchip');
      var tag = '全部';
      function filter() {
        var q = input.value.trim().toLowerCase();
        var shown = 0;
        cards.forEach(function (c) {
          var okQ = !q || (c.textContent || '').toLowerCase().indexOf(q) >= 0;
          var okT = tag === '全部' || (c.dataset.tags || '').indexOf(tag) >= 0;
          var ok = okQ && okT;
          c.style.display = ok ? '' : 'none';
          if (ok) shown++;
        });
        var empty = $('.search-empty');
        if (empty) empty.style.display = shown ? 'none' : 'block';
      }
      input.addEventListener('input', filter);
      chips.forEach(function (ch) {
        ch.onclick = function () {
          chips.forEach(function (x) { x.classList.remove('on'); });
          ch.classList.add('on');
          tag = ch.dataset.tag;
          filter();
        };
      });
    })();
  } else {
    /* ════ 3b. 文章页：进度条 / 阅读时长 / 上下篇 / 目录 ════ */
    // 进度条
    var bar = document.createElement('div');
    bar.className = 'progress-bar';
    document.body.appendChild(bar);
    var onScroll = function () {
      var h = document.documentElement;
      var total = h.scrollHeight - h.clientHeight;
      bar.style.width = (total > 0 ? Math.min(100, h.scrollTop / total * 100) : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 阅读时长（中文 ~400 字/分钟）
    var meta = $('.meta-published');
    if (meta) {
      var textLen = (article.innerText || '').replace(/\s/g, '').length;
      var mins = Math.max(1, Math.round(textLen / 400));
      var rt = document.createElement('span');
      rt.className = 'read-time';
      rt.textContent = '⏱️ 约 ' + mins + ' 分钟 · ' + textLen + ' 字';
      meta.appendChild(rt);
    }

    // 上下篇
    var mFile = location.pathname.match(/posts\/([^/]+\.html)$/);
    if (mFile) {
      var idx = -1;
      POSTS.forEach(function (p, i) { if (p.f === mFile[1]) idx = i; });
      if (idx >= 0) {
        var prev = POSTS[idx - 1], next = POSTS[idx + 1];
        var nav = document.createElement('div');
        nav.className = 'pn-nav';
        nav.innerHTML =
          (prev ? '<a class="prev" href="/blog/posts/' + prev.f + '"><small>← 上一篇（更新）</small><b>' + esc(prev.t) + '</b></a>' : '<span></span>') +
          (next ? '<a class="next" href="/blog/posts/' + next.f + '"><small>下一篇（更早）→</small><b>' + esc(next.t) + '</b></a>' : '<span></span>');
        article.parentNode.insertBefore(nav, article.nextSibling);
      }
    }

    // 自动目录（≥3 个 h2 且无现成目录时）
    var h2s = $$('article h2');
    if (h2s.length >= 3 && !$('.page-toc')) {
      var toc = document.createElement('div');
      toc.className = 'toc-side';
      var html = '<div class="toc-h">目 录</div>';
      h2s.forEach(function (h, i) {
        if (!h.id) h.id = 'sec-' + i;
        html += '<a href="#' + h.id + '">' + esc(h.textContent) + '</a>';
      });
      toc.innerHTML = html;
      document.body.appendChild(toc);
      var links = $$('a', toc);
      var spy = function () {
        var cur = 0;
        h2s.forEach(function (h, i) {
          if (h.getBoundingClientRect().top < 140) cur = i;
        });
        links.forEach(function (a, i) { a.classList.toggle('now', i === cur); });
      };
      window.addEventListener('scroll', spy, { passive: true });
      spy();
    }

    /* ════ 4. 代码高亮（轻量 tokenizer，无依赖）════ */
    $$('article pre code').forEach(function (code) {
      var src = code.textContent;
      if (!src || src.length > 60000) return;
      var KW = /^(function|const|let|var|if|else|for|while|return|import|from|export|class|def|print|echo|package|func|type|struct|interface|map|range|go|defer|new|delete|try|catch|except|raise|throw|with|as|async|await|yield|true|false|null|nil|None|True|False|undefined|sudo|cd|mkdir|npm|npx|pip|git|curl|wget|brew|apt|chmod|export|source|docker|kubectl)$/;

      function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

      var out = '', re = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
      var last = 0, mm;
      while ((mm = re.exec(src))) {
        out += esc(src.slice(last, mm.index));
        if (mm[1]) out += '<span class="tok-com">' + esc(mm[1]) + '</span>';
        else if (mm[2]) out += '<span class="tok-str">' + esc(mm[2]) + '</span>';
        else if (mm[3]) out += '<span class="tok-num">' + esc(mm[3]) + '</span>';
        else if (mm[4]) {
          if (KW.test(mm[4])) out += '<span class="tok-kw">' + esc(mm[4]) + '</span>';
          else if (src[re.lastIndex] === '(') out += '<span class="tok-fn">' + esc(mm[4]) + '</span>';
          else out += esc(mm[4]);
        }
        last = re.lastIndex;
      }
      out += esc(src.slice(last));
      code.innerHTML = out;
    });

    /* ════ 5. 图片灯箱 ════ */
    $$('article img').forEach(function (img) {
      img.onclick = function (e) {
        e.preventDefault();
        var lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.innerHTML = '<img src="' + img.src + '" alt="">';
        lb.onclick = function () { lb.remove(); };
        document.body.appendChild(lb);
      };
    });
  }

  /* ════ 6. 回到顶部（所有页面）════ */
  (function toTop() {
    var b = document.createElement('button');
    b.className = 'to-top';
    b.textContent = '↑';
    b.title = '回到顶部';
    document.body.appendChild(b);
    var toggle = function () {
      b.classList.toggle('show', window.scrollY > 500);
    };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
    b.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };
  })();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
})();
