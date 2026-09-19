/* ============================================================
   t.js — 密钥文件传输页专属逻辑
   模块:路由选路 / Turnstile / 发送(分片上传) / 密钥盒 /
        接收(列表·领取) / 并行下载 / 初始化
   依赖:core.js(提供 Lnbo.copyText / esc / fmtSize / fmtCd)
   ============================================================ */
(function(){
'use strict';

/* ────────── 0. 常量与全局状态 ────────── */
var API   = '/t/api/';                    /* 直连后端 */
var RELAY = 'https://lnboself.cn/t/api/'; /* 中继(可用且更快时用于下载) */
var DL    = API;                          /* 当前下载路由,探测后可能指向 RELAY */
var CHUNK = 4 * 1024 * 1024;              /* 分片 4MB */

var mode = 'once';          /* once=单人领取 many=多人领取 */
var files = [];             /* 待上传文件 [{f,st,prog}] */
var uploading = false;
var currentKey = null;      /* 本次上传生成的密钥 */
var expireAt = 0;

var recvFiles = [];         /* 接收页文件清单 */
var recvKey = '';
var recvClaim = '';         /* 单人模式领取令牌 */

var tsOn = false, tsWidget = null;   /* Turnstile 状态 */
var esc = Lnbo.esc, fmtSize = Lnbo.fmtSize, fmtCd = Lnbo.fmtCd;

/* ────────── 1. UI 基础 ────────── */
function $(id){ return document.getElementById(id); }
function msg(id, text, cls){
  var el = $(id);
  el.textContent = text;
  el.className = 'msg show ' + (cls || 'err');
}
function clearMsg(id){ $(id).className = 'msg'; }
function api(path, opts){
  return fetch(API + path, opts).then(function(r){
    return r.json().catch(function(){ return { error: 'HTTP ' + r.status }; })
      .then(function(j){
        if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
  });
}

/* ────────── 2. 路由选路:中继 vs 直连(下载用) ────────── */
function probeRoute(base){
  return new Promise(function(res){
    var t0 = Date.now();
    fetch(base + 'config', { cache: 'no-store' })
      .then(function(r){ res(r.ok ? Date.now() - t0 : -1); }, function(){ res(-1); });
  });
}
(function initRoute(){
  Promise.all([probeRoute(RELAY), probeRoute(API)]).then(function(r){
    /* 中继可达 且 (直连失败 或 中继更快) → 下载走中继 */
    if(r[0] >= 0 && (r[1] < 0 || r[0] < r[1])) DL = RELAY;
  });
})();

/* ────────── 3. Turnstile 人机验证(后端未配置时隐藏) ────────── */
(function initTurnstile(){
  fetch(API + 'config').then(function(r){ return r.json(); }).then(function(c){
    if(!c.ts_on || !c.ts_sitekey) return;
    tsOn = true;
    window.tsLoad = function(){
      var box = $('tsBox');
      box.style.display = '';
      tsWidget = turnstile.render(box, { sitekey: c.ts_sitekey, theme: 'dark' });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=tsLoad&render=explicit';
    document.head.appendChild(s);
  }).catch(function(){});
})();

/* ────────── 4. 页签与模式 ────────── */
window.switchTab = function(t){
  $('tabSend').classList.toggle('on', t === 'send');
  $('tabRecv').classList.toggle('on', t === 'recv');
  $('paneSend').style.display = t === 'send' ? '' : 'none';
  $('paneRecv').style.display = t === 'recv' ? '' : 'none';
};
window.setMode = function(m){
  mode = m;
  $('mOnce').classList.toggle('on', m === 'once');
  $('mMany').classList.toggle('on', m === 'many');
};

/* ────────── 5. 文件选择与列表 ────────── */
(function initPicker(){
  var drop = $('drop'), fpick = $('fpick');
  drop.onclick = function(){ fpick.click(); };
  fpick.onchange = function(){ addFiles(fpick.files); fpick.value = ''; };
  ['dragover', 'dragenter'].forEach(function(e){
    drop.addEventListener(e, function(ev){ ev.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function(e){
    drop.addEventListener(e, function(ev){ ev.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function(ev){ addFiles(ev.dataTransfer.files); });
})();

function addFiles(list){
  Array.prototype.forEach.call(list, function(f){
    if(files.length >= 20){ msg('sMsg', '最多 20 个文件'); return; }
    if(f.size > 500 * 1024 * 1024){ msg('sMsg', '「' + esc(f.name) + '」超过 500MB 上限'); return; }
    files.push({ f: f, st: 'wait', prog: 0 });
  });
  renderList();
  clearMsg('sMsg');
}
function renderList(){
  var h = '';
  files.forEach(function(it, i){
    var pct = it.st === 'done' ? '100%'
            : (it.f.size ? Math.floor(it.prog / it.f.size * 100) : 100) + '%';
    var stTxt = it.st === 'up' ? '上传中 ' + pct
              : it.st === 'done' ? '✓ 完成'
              : it.st === 'err' ? '✕ 失败' : '待上传';
    h += '<div class="fitem"><span class="f-n">' + esc(it.f.name) + '</span>'
      + '<span class="f-s">' + fmtSize(it.f.size) + '</span>'
      + '<span class="f-st ' + (it.st === 'done' ? 'ok' : it.st === 'err' ? 'err' : '') + '">' + stTxt + '</span>'
      + (uploading ? '' : '<button class="f-x" onclick="rmFile(' + i + ')">×</button>')
      + '<div class="bar" style="flex-basis:100%"><i style="width:' + pct + '"></i></div></div>';
  });
  $('flist').innerHTML = h;
  $('upBtn').disabled = uploading || !files.length;
}
window.rmFile = function(i){ files.splice(i, 1); renderList(); };
window.resetSend = function(){
  if(uploading) return;
  files = [];
  $('keybox').style.display = 'none';
  renderList();
  clearMsg('sMsg');
};

/* ────────── 6. 发送:分片上传(带重试) ────────── */
function putChunk(key, id, off, blob){
  return new Promise(function(res, rej){
    var x = new XMLHttpRequest();
    x.open('POST', API + 'upload-chunk?key=' + key + '&id=' + id + '&offset=' + off);
    x.onload = function(){ x.status === 200 ? res() : rej(new Error(x.responseText || x.status)); };
    x.onerror = function(){ rej(new Error('网络中断')); };
    x.send(blob);
  });
}
function putChunkRetry(key, id, off, blob){
  return new Promise(function(res, rej){
    var n = 0;
    (function go(){
      putChunk(key, id, off, blob).then(res).catch(function(e){
        if(++n < 3) setTimeout(go, 800 * n); else rej(e);
      });
    })();
  });
}
window.startUpload = async function(){
  if(uploading || !files.length) return;
  var cf = '';
  if(tsOn){
    try{ cf = turnstile.getResponse(tsWidget) || ''; }catch(e){ cf = ''; }
    if(!cf){ msg('sMsg', '请先完成上方人机验证'); return; }
  }
  uploading = true;
  clearMsg('sMsg');
  renderList();
  try{
    var nw = await api('new', { method: 'POST', body: JSON.stringify({ mode: mode, cf: cf }) });
    currentKey = nw.key;
    expireAt = Date.now() + nw.expires_in * 1000;
    for(var i = 0; i < files.length; i++){
      var it = files[i];
      it.st = 'up'; it.prog = 0; renderList();
      var f = it.f;
      var ini = await api('upload-init?key=' + currentKey, { method: 'POST',
        body: JSON.stringify({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream' }) });
      for(var off = 0; off < f.size || (f.size === 0 && off === 0); off += CHUNK){
        var blob = f.slice(off, Math.min(off + CHUNK, f.size));
        await putChunkRetry(currentKey, ini.id, off, blob);
        it.prog = off + blob.size;
        renderList();
        if(f.size === 0) break;
      }
      await api('upload-done?key=' + currentKey + '&id=' + ini.id, { method: 'POST' });
      it.st = 'done';
      renderList();
    }
    $('keyText').textContent = currentKey;
    $('keybox').style.display = '';
    msg('sMsg', '上传完成 ✓ 密钥已生成,有效期 8 小时', 'ok');
  }catch(e){
    msg('sMsg', '上传失败:' + e.message);
    files.forEach(function(it){ if(it.st === 'up') it.st = 'err'; });
    if(tsOn && e.message.indexOf('人机验证') >= 0){
      try{ turnstile.reset(tsWidget); }catch(x){}
    }
    if(e.message.indexOf('已过期') >= 0 && currentKey){
      msg('sMsg', '密钥异常已重建,请重新点上传', 'err');
      currentKey = null;
    }
  }
  uploading = false;
  renderList();
};

/* ────────── 7. 密钥盒:倒计时 / 复制 / 销毁 ────────── */
setInterval(function(){
  if(!currentKey) return;
  var s = Math.floor((expireAt - Date.now()) / 1000);
  $('keyCd').textContent = s > 0 ? ('剩余 ' + fmtCd(s) + ' 后自动销毁') : '已过期销毁';
}, 1000);
window.copyKey = function(){
  if(!currentKey) return;
  Lnbo.copyText(currentKey,
    function(){ msg('sMsg', '密钥已复制到剪贴板', 'ok'); },
    function(){ msg('sMsg', '复制失败,请长按/手动复制'); });
};
window.copyLink = function(){
  if(!currentKey) return;
  Lnbo.copyText(location.origin + '/t/?k=' + currentKey,
    function(){ msg('sMsg', '取件链接已复制(含密钥,注意保密)', 'ok'); },
    function(){ msg('sMsg', '复制失败,请手动复制'); });
};
window.destroyKey = async function(){
  if(!currentKey) return;
  if(!confirm('确认立即销毁密钥 ' + currentKey + ' 及其全部文件?')) return;
  try{
    await api('destroy?key=' + currentKey, { method: 'POST' });
    msg('sMsg', '已销毁 ✓', 'ok');
    $('keybox').style.display = 'none';
    currentKey = null;
  }catch(e){ msg('sMsg', e.message); }
};

/* ────────── 8. 接收:列表与领取 ────────── */
function normK(v){
  v = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z2-9]{8}$/.test(v) ? v.slice(0, 4) + '-' + v.slice(4) : null;
}
window.fetchList = async function(){
  clearMsg('rMsg');
  var k = normK($('kInput').value);
  if(!k){ msg('rMsg', '密钥格式应为 XXXX-XXXX'); return; }
  var claim = localStorage.getItem('tclaim_' + k) || '';
  var j;
  try{
    j = await api('list?key=' + k + (claim ? '&claim=' + claim : ''));
  }catch(e){
    if(e.message.indexOf('已由其他接收者') >= 0){ msg('rMsg', '该密钥已由其他接收者领取'); return; }
    msg('rMsg', e.message);
    return;
  }
  recvFiles = j.files; recvKey = k; recvClaim = claim;
  $('claimBox').style.display = (j.mode === 'once' && !j.claimed_by_me) ? '' : 'none';

  var h = '<div class="lbl">— 文件清单(' + j.files.length + ')'
    + '<span style="margin-left:auto;letter-spacing:0;color:var(--dim)">并行 '
    + '<select id="workers" class="sel"><option>1</option><option selected>2</option>'
    + '<option>4</option><option>8</option></select> 线程</span></div><div class="flist">';
  j.files.forEach(function(f, idx){
    var url = DL + 'file?key=' + k + '&id=' + f.id + (claim ? '&claim=' + claim : '');
    h += '<div class="dl-row" id="frow' + idx + '"><span class="f-n">' + esc(f.name) + '</span>'
      + '<span class="f-s">' + fmtSize(f.size) + '</span>'
      + '<a class="btn ghost" style="padding:6px 14px;font-size:12px" href="' + url + '" title="单线程直链">直链</a>'
      + '<button class="btn" style="padding:6px 14px;font-size:12px" onclick="dlFile(' + idx + ')">⇩ 并行下载</button></div>';
  });
  h += '</div>';
  $('rFiles').innerHTML = h;

  var mt = $('rMeta');
  mt.style.display = 'flex';
  mt.innerHTML = '<span>模式:' + (j.mode === 'once' ? '👤 单人' : '👥 多人') + '</span>'
    + '<span id="rCd">剩余 ' + fmtCd(j.expires_in) + '</span>';
  mt.dataset.exp = Date.now() + j.expires_in * 1000;
};
window.claimKey = async function(){
  var k = normK($('kInput').value);
  if(!k) return;
  try{
    var j = await api('claim?key=' + k, { method: 'POST' });
    localStorage.setItem('tclaim_' + k, j.token);
    $('claimBox').style.display = 'none';
    msg('rMsg', '领取成功 ✓ 密钥已绑定给你', 'ok');
    window.fetchList();
  }catch(e){ msg('rMsg', e.message); }
};

/* 接收页剩余时间倒计时 */
setInterval(function(){
  var mt = $('rMeta');
  if(mt.style.display === 'none' || !mt.dataset.exp) return;
  var s = Math.floor((+mt.dataset.exp - Date.now()) / 1000);
  var cd = $('rCd');
  if(cd) cd.textContent = s > 0 ? ('剩余 ' + fmtCd(s) + ' 后自动销毁') : '已过期销毁';
}, 1000);

/* ────────── 9. 并行分片下载 ────────── */
function inAppBrowser(){
  var ua = (navigator.userAgent || '').toLowerCase();
  return /micromessenger|qq\/|qqbrowser|weibo|dingtalk|snssdk|bytedance|baiduboxapp/.test(ua);
}
function getBuf(url){
  return new Promise(function(res, rej){
    var n = 0;
    (function go(){
      fetch(url).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(res).catch(function(e){
        if(++n < 3) setTimeout(go, 600 * n); else rej(e);
      });
    })();
  });
}
window.dlFile = async function(idx){
  var f = recvFiles[idx], row = $('frow' + idx), btn = row && row.querySelector('button');
  if(!f || !btn || btn.disabled) return;
  btn.disabled = true;
  var q = 'key=' + recvKey + '&id=' + f.id + (recvClaim ? '&claim=' + recvClaim : '');

  /* 大文件或内嵌浏览器:单线程直链 */
  if(f.size > 400 * 1024 * 1024){
    location.href = DL + 'file?' + q;
    btn.disabled = false;
    msg('rMsg', '超过 400MB 走单线程直链下载', 'ok');
    return;
  }
  if(inAppBrowser()){
    location.href = DL + 'file?' + q;
    btn.disabled = false;
    msg('rMsg', '当前是 App 内嵌浏览器,已切单线程直链;右上角…→用系统浏览器打开本页可解锁并行加速', 'ok');
    return;
  }

  /* 并行分片拉取 */
  var bar = document.createElement('div');
  bar.className = 'bar';
  bar.style.flexBasis = '100%';
  bar.innerHTML = '<i></i>';
  row.appendChild(bar);
  var fill = bar.firstChild;
  var W = Math.max(1, +($('workers').value || 2));
  var offs = [];
  for(var o = 0; o < f.size; o += CHUNK) offs.push([o, Math.min(CHUNK, f.size - o)]);
  if(!offs.length) offs = [[0, 0]];          /* 空文件 */
  var parts = new Array(offs.length), cur = 0, got = 0;

  async function worker(){
    while(true){
      var my = cur++;
      if(my >= offs.length) break;
      var seg = offs[my];
      parts[my] = seg[1]
        ? await getBuf(DL + 'file-chunk?' + q + '&offset=' + seg[0] + '&len=' + seg[1])
        : new ArrayBuffer(0);
      got += seg[1];
      var pct = f.size ? Math.floor(got / f.size * 100) : 100;
      btn.textContent = '↓ ' + pct + '%';
      fill.style.width = pct + '%';
    }
  }
  try{
    await Promise.all(Array.from({ length: W }, function(){ return worker(); }));
    var url = URL.createObjectURL(new Blob(parts));
    var a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
    btn.textContent = '✓ 完成';
    fill.style.width = '100%';
    msg('rMsg', '已下载 ✓「' + f.name + '」已进入浏览器下载列表(手机看通知栏/系统下载管理)', 'ok');
  }catch(e){
    if(DL !== API){                          /* 中继故障 → 秒切直连重试 */
      DL = API;
      bar.remove();
      btn.disabled = false;
      return window.dlFile(idx);
    }
    btn.textContent = '⇩ 重试';
    btn.disabled = false;
    bar.remove();
    msg('rMsg', '下载失败:' + e.message);
  }
};

/* ────────── 10. 初始化 ────────── */
$('kInput').addEventListener('keydown', function(e){
  if(e.key === 'Enter') window.fetchList();
});
(function prefill(){
  var qk = new URLSearchParams(location.search).get('k');
  if(qk){
    switchTab('recv');
    $('kInput').value = qk;
    window.fetchList();
  }
})();
})();
