// X2MD 博客访客统计 —— 轻量埋点
(function () {
  function getId() {
    var k = 'x2md_vid', v = '';
    try { v = localStorage.getItem(k) || ''; } catch (e) {}
    if (!v) {
      document.cookie.split(';').forEach(function (c) {
        var p = c.trim().split('=');
        if (p[0] === k && p[1]) v = p[1];
      });
    }
    if (!v) {
      v = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    try { localStorage.setItem(k, v); } catch (e) {}
    document.cookie = k + '=' + v + ';path=/;max-age=31536000;SameSite=Lax';
    return v;
  }

  function send(first) {
    var params = new URLSearchParams();
    params.set('id', getId());
    params.set('path', location.pathname);
    params.set('ref', document.referrer || 'direct');
    params.set('first', first ? '1' : '0');
    params.set('lang', navigator.language || '');
    params.set('screen', window.innerWidth + 'x' + window.innerHeight);
    // 页面停留时长在 leave 时补发由 visibilitychange 处理（简化版不追踪）
    fetch('/collect?' + params.toString(), { keepalive: true }).catch(function () {});
  }

  send(!performance.getEntriesByType('navigation').length ||
       performance.getEntriesByType('navigation')[0].redirectCount === 0 &&
       !(sessionStorage.getItem('x2md_sess')));
  try { sessionStorage.setItem('x2md_sess', '1'); } catch (e) {}
})();
