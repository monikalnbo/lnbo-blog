/* ============================================================
   core.js — Lnbo 站点公共交互核心(全站共用,勿放页面专属逻辑)
   提供:子页导航注入 / 滚动显现 / 阅读进度条 / 剪贴板 / 工具函数
   页面专属逻辑放 nav.js(导航页)与 t.js(传输页)
   ============================================================ */
(function(){
'use strict';

/* ---------- 子页导航(tmux 风)自动注入 ---------- */
var PAGES=[
  ['',       '总览', '/me/'],
  ['about',  '关于', '/me/about.html'],
  ['skills', '技能', '/me/skills.html'],
  ['projects','项目','/me/projects.html'],
  ['links',  '链接', '/me/links.html'],
  ['logs',   '日志', '/me/logs.html'],
  ['kaf',    '花譜', '/me/kaf.html']
];
function renderSubnav(){
  var nav=document.getElementById('subnav');if(!nav)return;
  var cur=nav.dataset.page||'';
  var h='<span class="crumb">lnbo@server:<b>~/me/</b></span>';
  PAGES.forEach(function(p){h+='<a'+(cur===p[0]?' class="on"':'')+' href="'+p[2]+'">'+p[1]+'</a>'});
  h+='<span class="ext"><a href="/">导航</a><a href="/blog/">博客</a></span>';
  nav.innerHTML=h;
}

/* ---------- 滚动显现(.rv / .rv-row → .on) ---------- */
function initReveal(){
  var els=document.querySelectorAll('.rv,.rv-row');
  if(!('IntersectionObserver' in window)){
    for(var i=0;i<els.length;i++)els[i].classList.add('on');
    return;
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}
  })},{threshold:.1});
  for(var j=0;j<els.length;j++)io.observe(els[j]);
}

/* ---------- 阅读进度条(#prog) ---------- */
function initProg(){
  var prog=document.getElementById('prog');if(!prog)return;
  var upd=function(){var h=document.documentElement;
    var max=h.scrollHeight-h.clientHeight;
    prog.style.width=(max>0?(h.scrollTop/max*100):0)+'%'};
  addEventListener('scroll',upd,{passive:true});upd();
}

/* ---------- 剪贴板(HTTPS 原生 / HTTP execCommand 兜底) ---------- */
function copyText(text,ok,fail){
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=text;ta.style.cssText='position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(ta);ta.focus();ta.select();
    var done=false;
    try{done=document.execCommand('copy')}catch(e){}
    document.body.removeChild(ta);
    done?(ok&&ok()):(fail&&fail());
  }
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(ok,fallback);
  else fallback();
}

/* ---------- 工具函数 ---------- */
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmtSize(n){if(n<1024)return n+' B';var u=['KB','MB','GB'],i=-1;
  do{n/=1024;i++}while(n>=1024&&i<2);return n.toFixed(n<10?1:0)+' '+u[i]}
function fmtCd(s){s=Math.max(0,s);var h=Math.floor(s/3600),m=Math.floor(s%3600/60);
  return h+':'+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

/* ---------- 启动 ---------- */
function boot(){renderSubnav();initReveal();initProg()}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
else boot();

/* ---------- 对外暴露 ---------- */
window.Lnbo={copyText:copyText,esc:esc,fmtSize:fmtSize,fmtCd:fmtCd,
             initReveal:initReveal,renderSubnav:renderSubnav};
})();
