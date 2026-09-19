/* ============================================================
   nav.js — 导航页专属逻辑
   模块:星尘氛围 / 雷光动效 / 卡片柔光 / 在线检测 / 运行时长
   依赖:无(core.js 可选;本页不依赖)
   ============================================================ */
(function(){
'use strict';
var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 模块:星尘(缓慢上漂的紫色光点,reduce 时只画一帧) ── */
function initStars(animated){
  var cv = document.getElementById('stars');
  if(!cv) return;
  var ctx = cv.getContext('2d'), dots = [], W, H;
  if(!ctx) return;

  function resize(){
    W = cv.width  = innerWidth  * devicePixelRatio;
    H = cv.height = innerHeight * devicePixelRatio;
    cv.style.width  = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    dots = [];
    var n = Math.min(150, Math.floor(innerWidth * innerHeight / 11000));
    for(var i = 0; i < n; i++) dots.push({
      x: Math.random() * W, y: Math.random() * H,
      r: (Math.random() * 1.4 + .3) * devicePixelRatio,
      s: Math.random() * .22 + .04,
      tw: Math.random() * Math.PI * 2, ts: Math.random() * .015 + .004,
      hue: Math.random() < .7 ? 255 : 270
    });
  }
  function frame(){
    ctx.clearRect(0, 0, W, H);
    for(var i = 0; i < dots.length; i++){
      var d = dots[i];
      d.y -= d.s * devicePixelRatio; if(d.y < -4) d.y = H + 4;
      d.tw += d.ts;
      var a = .28 + Math.abs(Math.sin(d.tw)) * .5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 7);
      ctx.fillStyle = 'hsla(' + d.hue + ',70%,82%,' + a + ')';
      ctx.shadowColor = 'hsla(' + d.hue + ',80%,75%,.8)';
      ctx.shadowBlur = 6 * devicePixelRatio;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if(animated) requestAnimationFrame(frame);
  }
  resize();
  addEventListener('resize', resize);
  frame();
}

/* ── 模块:雷光(随机时刻一道折线 + 闪幕) ── */
function initLightning(){
  var cv = document.getElementById('lightning');
  if(!cv || REDUCED) return;
  var ctx = cv.getContext('2d'), DPR = devicePixelRatio, bolts = [];
  if(!ctx) return;

  function resize(){
    cv.width  = innerWidth  * DPR;
    cv.height = innerHeight * DPR;
    cv.style.width  = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  function stroke(pts){
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.stroke();
  }
  function makeBolt(){
    var W = cv.width, H = cv.height;
    var x = W * (.12 + Math.random() * .76), y = -10;
    var endY = H * (.24 + Math.random() * .3);
    var pts = [[x, y]];
    while(y < endY){
      y += H * (.03 + Math.random() * .05);
      x += (Math.random() - .5) * W * .055;
      pts.push([x, y]);
    }
    var branches = [];
    for(var b = 0, nb = 2 + Math.floor(Math.random() * 2); b < nb; b++){
      var i = Math.floor(Math.random() * (pts.length - 2)) + 1;
      var bp = [pts[i]], bx = pts[i][0], by = pts[i][1];
      var dir = Math.random() < .5 ? -1 : 1;
      for(var k = 0, len = 3 + Math.floor(Math.random() * 4); k < len; k++){
        by += H * .03 + Math.random() * H * .04;
        bx += dir * (W * .02 + Math.random() * W * .04);
        bp.push([bx, by]);
      }
      branches.push({ pts: bp });
    }
    bolts.push({ pts: pts, branches: branches, life: 1 });
    var f = document.getElementById('flash');
    if(f){
      f.style.setProperty('--fx', (x / W * 100) + '%');
      f.style.setProperty('--fy', '8%');
      f.classList.add('hit');
      setTimeout(function(){ f.classList.remove('hit'); }, 60);
    }
  }
  (function frame(){
    ctx.clearRect(0, 0, cv.width, cv.height);
    for(var i = bolts.length - 1; i >= 0; i--){
      var b = bolts[i];
      b.life -= .055;
      if(b.life <= 0){ bolts.splice(i, 1); continue; }
      var a = Math.max(0, b.life);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(167,139,250,.95)'; ctx.shadowBlur = 22 * DPR;
      ctx.strokeStyle = 'rgba(196,181,253,' + (a * .9) + ')'; ctx.lineWidth = 2.2 * DPR;
      stroke(b.pts);
      ctx.shadowBlur = 8 * DPR;
      ctx.strokeStyle = 'rgba(245,240,255,' + a + ')'; ctx.lineWidth = .9 * DPR;
      stroke(b.pts);
      ctx.shadowBlur = 12 * DPR;
      ctx.strokeStyle = 'rgba(167,139,250,' + (a * .55) + ')'; ctx.lineWidth = 1.1 * DPR;
      for(var k = 0; k < b.branches.length; k++) stroke(b.branches[k].pts);
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(frame);
  })();
  (function loop(){
    setTimeout(function(){ makeBolt(); loop(); }, 3800 + Math.random() * 5200);
  })();
  setTimeout(makeBolt, 1400); /* 首击 */
}

/* ── 模块:卡片指针柔光(--mx/--my 跟随) ── */
function initGlow(){
  var cards = document.querySelectorAll('a.card');
  for(var i = 0; i < cards.length; i++)(function(c){
    c.addEventListener('pointermove', function(e){
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  })(cards[i]);
}

/* ── 模块:同域页面在线检测 ── */
function initHealth(){
  var els = document.querySelectorAll('.st[data-check]');
  for(var i = 0; i < els.length; i++)(function(el){
    var tag = el.querySelector('span');
    fetch(el.dataset.check, { method: 'HEAD', cache: 'no-store' })
      .then(function(r){
        el.classList.add(r.ok ? 'on' : 'err');
        tag.textContent = r.ok ? '在线' : '异常 ' + r.status;
      })
      .catch(function(){
        el.classList.add('err');
        tag.textContent = '离线';
      });
  })(els[i]);
}

/* ── 模块:本页运行时长 ── */
function initUptime(){
  var el = document.getElementById('uptime');
  if(!el) return;
  var t0 = Date.now();
  setInterval(function(){
    var s = Math.floor((Date.now() - t0) / 1000);
    el.textContent = '本页已运行 '
      + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

/* ── 启动 ── */
initStars(!REDUCED);
initLightning();
initGlow();
initHealth();
initUptime();
})();
