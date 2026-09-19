// 文章互动组件：红心 / 收藏 / 评论（需登录）
(function () {
  var box = document.getElementById('interact');
  if (!box) return;
  var slug = box.dataset.slug;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, body, cb) {
    fetch('/api/' + path, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    } : {}).then(function (r) { return r.json(); }).then(cb).catch(function () {});
  }

  var state = { hearts: 0, favs: 0, liked: false, faved: false, comments: [], logged_in: false };
  var showComments = false;

  function render() {
    var loginTip = '';
    if (!state.logged_in) {
      loginTip = '<a class="ix-login-tip" href="/login.html?back=' +
        encodeURIComponent(location.pathname) + '">登录</a> 后可 ❤️ / 收藏 / 评论';
    }
    var commentsHtml = '';
    if (showComments) {
      commentsHtml = '<div class="ix-comments">';
      if (!state.comments.length) {
        commentsHtml += '<p class="ix-empty">还没有评论，来抢沙发～</p>';
      }
      state.comments.forEach(function (c) {
        var d = new Date(c.created_at * 1000);
        commentsHtml += '<div class="ix-comment"><b>' + esc(c.username) + '</b>' +
          '<span class="ix-time">' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5) + '</span>' +
          '<p>' + esc(c.content) + '</p></div>';
      });
      if (state.logged_in) {
        commentsHtml += '<div class="ix-cform"><textarea id="ix-input" maxlength="500" ' +
          'placeholder="说点什么…（500 字以内）"></textarea>' +
          '<button id="ix-send">发表评论</button></div>';
      } else {
        commentsHtml += loginTip;
      }
      commentsHtml += '</div>';
    }

    box.innerHTML =
      '<div class="ix-bar">' +
      '<button class="ix-btn ix-heart' + (state.liked ? ' active' : '') + '" id="ix-heart">❤️ <span>' + state.hearts + '</span></button>' +
      '<button class="ix-btn ix-fav' + (state.faved ? ' active' : '') + '" id="ix-fav">' + (state.faved ? '⭐ 已收藏' : '☆ 收藏') + ' <span>' + state.favs + '</span></button>' +
      '<button class="ix-btn" id="ix-ctoggle">💬 评论 <span>' + state.comments.length + '</span></button>' +
      (state.logged_in ? '<span class="ix-user">👤 ' + esc(state.username) + ' <a href="#" id="ix-logout">退出</a></span>' : loginTip) +
      '</div>' + commentsHtml;

    document.getElementById('ix-heart').onclick = function () {
      if (!state.logged_in) return location.href = '/blog/login.html?back=' + encodeURIComponent(location.pathname);
      api('heart', { slug: slug }, load);
    };
    document.getElementById('ix-fav').onclick = function () {
      if (!state.logged_in) return location.href = '/blog/login.html?back=' + encodeURIComponent(location.pathname);
      api('fav', { slug: slug }, load);
    };
    document.getElementById('ix-ctoggle').onclick = function () {
      showComments = !showComments; render();
    };
    var sendBtn = document.getElementById('ix-send');
    if (sendBtn) {
      sendBtn.onclick = function () {
        var v = document.getElementById('ix-input').value.trim();
        if (!v) return;
        api('comment', { slug: slug, content: v }, function () { load(true); });
      };
    }
    var lo = document.getElementById('ix-logout');
    if (lo) lo.onclick = function (e) { e.preventDefault(); api('logout', {}, function () { load(); }); };
  }

  function load(keepOpen) {
    api('state?slug=' + encodeURIComponent(slug), null, function (s) {
      Object.assign(state, s);
      showComments = keepOpen || showComments;
      render();
    });
  }
  load();
})();
