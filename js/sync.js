/* =========================================================
   云同步：让两部手机看到同一份「想对你说的话」
   ---------------------------------------------------------
   存哪儿：你自己 GitHub 账号下的一个私有仓库（一个房间一个文件）
   安全  ：内容在手机上用房间号里的密钥加密（AES-GCM）后才上传，
           仓库里只有密文；密钥只在这两台手机上。
   合并  ：同一条笔记谁改得晚用谁的；删除会留一个墓碑，不会被对方"救活"。
   断网、令牌过期、仓库没了，都不影响本地：记录一直在浏览器里。
   ========================================================= */
(function () {
  'use strict';

  var CFG = (window.SITE_CONFIG && window.SITE_CONFIG.sync) || {};
  var REPO = CFG.repo || '3530254305-Zzzovozz/j-0919-data';
  var BRANCH = CFG.branch || 'main';
  var GH = 'https://api.github.com/repos/' + REPO + '/contents/';
  var ROOM_KEY = 'ourworld.room.v1';
  var TOKEN_KEY = 'ourworld.gh.v1';
  var SALT = 'ourworld.sync.v1';
  var ITER = 120000;
  var PUSH_DELAY = 1500;

  var hooks = null;
  var room = null;     // { id, secret }
  var token = '';
  var key = null;
  var busy = false;
  var pushTimer = 0;
  var state = { on: false, code: '', msg: '', panel: false, at: 0 };
  var ui = {};

  /* ---------- 小工具 ---------- */
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

  function rnd(n) {
    var buf = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(buf) : 0;
    var out = '';
    for (var i = 0; i < n; i++) out += ALPHA[(buf[i] || Math.floor(Math.random() * 256)) % ALPHA.length];
    return out;
  }

  function b64(buf) {
    var s = '', b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }

  function unb64(str) {
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function timeText() {
    var d = new Date(state.at || Date.now());
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function supported() {
    return !!(window.crypto && window.crypto.subtle && window.fetch);
  }

  function saveRoom(r) {
    try { r ? localStorage.setItem(ROOM_KEY, JSON.stringify(r)) : localStorage.removeItem(ROOM_KEY); } catch (e) {}
  }

  function loadRoom() {
    try {
      var raw = localStorage.getItem(ROOM_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.id && o.secret ? o : null;
    } catch (e) { return null; }
  }

  function loadToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function saveToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function parseCode(code) {
    var m = /^([a-z0-9]{4,16})[-\s]?([a-z0-9]{6,24})$/i.exec(String(code || '').trim());
    return m ? { id: m[1].toLowerCase(), secret: m[2].toLowerCase() } : null;
  }

  /* ---------- 加密 ---------- */
  function deriveKey(secret, saltText) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(SALT + saltText), iterations: ITER, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
      });
  }

  function seal(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var data = new TextEncoder().encode(JSON.stringify(obj));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data).then(function (ct) {
      return { v: 1, iv: b64(iv), ct: b64(ct) };
    });
  }

  function unseal(obj) {
    if (!obj || obj.v !== 1 || !obj.iv || !obj.ct) return Promise.resolve(null);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.ct))
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); })
      .catch(function () { return null; });
  }

  /* ---------- GitHub 仓库 ---------- */
  function gh(method, pathname, body) {
    return fetch(GH + pathname + '?ref=' + encodeURIComponent(BRANCH), {
      method: method,
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (r.status === 404) return { missing: true };
        if (r.status === 401) throw new Error('令牌无效（401）');
        if (r.status === 403) throw new Error('没权限（403），检查令牌有没有 Contents 读写');
        if (!r.ok) throw new Error('GitHub ' + r.status + (j && j.message ? '：' + j.message : ''));
        return j || {};
      });
    });
  }

  function readRoom() {
    return gh('GET', 'rooms/' + room.id + '.json').then(function (res) {
      if (!res || res.missing) return { notes: [], sha: null };
      var text = '';
      try { text = new TextDecoder().decode(unb64(String(res.content || '').replace(/\s/g, ''))); } catch (e) {}
      var box = null;
      try { box = JSON.parse(text); } catch (e) {}
      return unseal(box).then(function (payload) {
        return { notes: (payload && payload.notes) || [], sha: res.sha || null };
      });
    });
  }

  function writeRoom(payload, sha) {
    var body = {
      message: 'sync ' + new Date().toISOString().slice(0, 16),
      content: '',
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    return seal(payload).then(function (box) {
      // 仓库里只有密文：{ v, iv, ct }
      body.content = btoa(JSON.stringify(box));
      return gh('PUT', 'rooms/' + room.id + '.json', body);
    }).then(function (res) {
      return (res && res.content && res.content.sha) || sha || null;
    });
  }

  var lastSha = null;

  /* ---------- 合并 ---------- */
  function stamp(n) { return (n && (n.updatedAt || n.ts)) || 0; }

  function merge(local, remote) {
    var map = {}, order = [];
    function put(n) {
      if (!n || !n.id) return;
      var cur = map[n.id];
      if (!cur) { map[n.id] = n; order.push(n.id); return; }
      if (stamp(n) > stamp(cur)) map[n.id] = n;
    }
    (local || []).forEach(put);
    (remote || []).forEach(put);
    return order.map(function (id) { return map[id]; }).filter(function (n) {
      if (!n.deleted) return true;
      return Date.now() - stamp(n) < 60 * 24 * 3600 * 1000;
    });
  }

  function snapshot() { return (hooks.getNotes() || []).slice(); }

  /* ---------- 动作 ---------- */
  function pull(quiet) {
    if (!room || !key || !token) return Promise.resolve(false);
    return readRoom().then(function (res) {
      lastSha = res.sha;
      var merged = merge(snapshot(), res.notes);
      hooks.setNotes(merged);
      state.at = Date.now();
      if (!quiet) setMsg('已拉取 ' + timeText());
      return true;
    }).catch(function (e) {
      setMsg('拉取失败：' + (e && e.message ? e.message : '网络不通') + '（本地照常能用）');
      return false;
    });
  }

  function push(quiet) {
    if (!room || !key || !token) return Promise.resolve(false);
    return writeRoom({ v: 1, notes: snapshot(), at: Date.now() }, lastSha).then(function (sha) {
      lastSha = sha;
      state.at = Date.now();
      if (!quiet) setMsg('已上传 ' + timeText());
      return true;
    }).catch(function (e) {
      setMsg('上传失败：' + (e && e.message ? e.message : '网络不通') + '（本地已经存好了）');
      return false;
    });
  }

  function syncNow(quiet) {
    if (!room || !token || busy) return Promise.resolve(false);
    busy = true; setBusy(true);
    return pull(true).then(function () { return push(quiet); }).then(function (ok) {
      busy = false; setBusy(false);
      if (ok && !quiet) setMsg('已同步 ' + timeText());
      return ok;
    }, function () { busy = false; setBusy(false); return false; });
  }

  function schedulePush() {
    if (!room || !token) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow(true); }, PUSH_DELAY);
  }

  /* ---------- 界面 ---------- */
  function setMsg(text) { state.msg = text; paint(); }

  function setBusy(on) {
    if (ui.sync) { ui.sync.disabled = on; ui.sync.textContent = on ? '同步中…' : '立即同步'; }
  }

  function paint() {
    if (!ui.bar) return;
    ui.bar.setAttribute('data-on', state.on ? 'on' : 'off');
    if (ui.label) {
      ui.label.textContent = state.on
        ? '已连接 · ' + room.id
        : (supported() ? '云同步：未开启' : '云同步：这台设备不支持（要 https 打开）');
    }
    if (ui.join) ui.join.textContent = state.on ? '房间设置' : '开启 / 加入';
    if (ui.sync) ui.sync.hidden = !state.on;
    if (ui.panel) ui.panel.hidden = !state.panel;
    if (ui.code) ui.code.textContent = state.code || '';
    if (ui.status) { ui.status.textContent = state.msg || ''; ui.status.hidden = !state.msg; }
    if (ui.codeWrap) ui.codeWrap.hidden = !state.on;
    if (ui.tokenInput) ui.tokenInput.value = token ? '••••••••••••' : '';
    if (ui.ready) ui.ready.hidden = !token;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function mount(container) {
    if (!container) return;

    var bar = el('div', 'sync-bar');
    var left = el('div', 'sync-left');
    left.appendChild(el('span', 'sync-dot'));
    var label = el('span', 'sync-label', '云同步：未开启');
    left.appendChild(label);

    var right = el('div', 'sync-right');
    var join = el('button', 'tool-btn', '开启 / 加入');
    join.type = 'button';
    var sync = el('button', 'tool-btn', '立即同步');
    sync.type = 'button';
    sync.hidden = true;
    right.appendChild(join); right.appendChild(sync);
    bar.appendChild(left); bar.appendChild(right);

    var status = el('p', 'sync-status');
    status.hidden = true;

    var panel = el('div', 'sync-panel');
    panel.hidden = true;
    panel.innerHTML =
      '<p class="sync-title">同一份记录，两部手机</p>' +
      '<p class="sync-help">记录先在这台手机上加密，再存进你 GitHub 的私有仓库，' +
      '服务器上只有乱码。两台手机用同一个「房间号 + 密钥」就能看到同一份。</p>' +

      '<div class="sync-step">' +
      '  <span class="sync-step-n">1</span>' +
      '  <div class="sync-step-body">' +
      '    <p class="sync-step-t">同步密钥（每台手机粘一次）</p>' +
      '    <p class="sync-step-h">在电脑上打开 ' +
      '      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>，' +
      '      名字随便写；<b>Repository access</b> 只勾 <code>j-0919-data</code>；' +
      '      <b>Permissions → Contents</b> 选 <b>Read and write</b>；生成后粘进来。</p>' +
      '    <div class="sync-row">' +
      '      <input class="sync-input sync-token" type="text" placeholder="github_pat_…" autocomplete="off" spellcheck="false">' +
      '      <button type="button" class="tool-btn" data-do="token">保存密钥</button>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      '<div class="sync-step sync-step-room">' +
      '  <span class="sync-step-n">2</span>' +
      '  <div class="sync-step-body">' +
      '    <p class="sync-step-t">房间</p>' +
      '    <p class="sync-step-h">一台手机先「新建房间」，把房间号发给另一台；另一台粘进来「加入」。</p>' +
      '    <div class="sync-row">' +
      '      <button type="button" class="btn" data-do="create">在这台手机上新建房间</button>' +
      '    </div>' +
      '    <div class="sync-or">或者加入已存在的</div>' +
      '    <div class="sync-row sync-join">' +
      '      <input class="sync-input sync-room" type="text" placeholder="房间号，例如 k7m3qp2x-r8s4t9n6" autocomplete="off" spellcheck="false">' +
      '      <button type="button" class="tool-btn" data-do="join">加入</button>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      '<div class="sync-code-wrap" hidden>' +
      '  <p class="sync-code-label">房间号（另一台手机要用它）</p>' +
      '  <code class="sync-code"></code>' +
      '  <div class="sync-row">' +
      '    <button type="button" class="tool-btn" data-do="copy">复制房间号</button>' +
      '    <button type="button" class="tool-btn is-del" data-do="leave">断开同步</button>' +
      '  </div>' +
      '</div>' +

      '<p class="sync-note">断网、关掉页面都不影响：记录一直在这台手机里，连上网后会自动同步。</p>';

    container.appendChild(bar);
    container.appendChild(status);
    container.appendChild(panel);

    ui = {
      bar: bar, label: label, join: join, sync: sync, status: status, panel: panel,
      code: panel.querySelector('.sync-code'),
      codeWrap: panel.querySelector('.sync-code-wrap'),
      tokenInput: panel.querySelector('.sync-token'),
      roomInput: panel.querySelector('.sync-room'),
      tokenLine: panel.querySelector('.sync-step'),
      ready: panel.querySelector('.sync-step-room')
    };

    join.addEventListener('click', function () {
      state.panel = !state.panel;
      paint();
      if (state.panel && !token && ui.tokenInput) ui.tokenInput.focus();
    });

    sync.addEventListener('click', function () { syncNow(false); });

    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-do]');
      if (!b) return;
      var act = b.getAttribute('data-do');
      if (act === 'token') doToken();
      else if (act === 'create') doCreate();
      else if (act === 'join') doJoin(ui.roomInput.value);
      else if (act === 'copy') doCopy();
      else if (act === 'leave') doLeave();
    });

    paint();
  }

  function doToken() {
    var v = (ui.tokenInput.value || '').trim();
    if (!v || /^•+$/.test(v)) { setMsg('还没填密钥'); return; }
    token = v;
    saveToken(token);
    paint();
    setMsg('密钥已保存');
    if (room && !key) startRoom();
  }

  function doCreate() {
    if (!supported()) { setMsg('这台设备不支持加密（要 https 打开）'); return; }
    if (!token) { setMsg('先填上面的同步密钥'); state.panel = true; paint(); return; }
    setMsg('正在建房间…');
    room = { id: rnd(8), secret: rnd(16) };
    deriveKey(room.secret, room.id).then(function (k) {
      key = k;
      lastSha = null;
      return syncNow(true);
    }).then(function () {
      saveRoom(room);
      state.on = true;
      state.code = room.id + '-' + room.secret;
      setMsg('房间建好了，把房间号发给另一台手机');
      paint();
    }).catch(function (e) {
      room = null; key = null; state.on = false;
      setMsg('建房间失败：' + (e && e.message ? e.message : '网络问题'));
      paint();
    });
  }

  function doJoin(code) {
    var r = parseCode(code);
    if (!r) { setMsg('房间号不对，应该像 k7m3qp2x-r8s4t9n6'); return; }
    if (!supported()) { setMsg('这台设备不支持加密（要 https 打开）'); return; }
    if (!token) { setMsg('先填上面的同步密钥'); return; }
    setMsg('正在连接…');
    room = r;
    deriveKey(r.secret, r.id).then(function (k) {
      key = k;
      return pull(true);
    }).then(function () {
      return push(true);
    }).then(function () {
      saveRoom(room);
      state.on = true;
      state.code = r.id + '-' + r.secret;
      setMsg('连上了，已经拉到 ' + countText());
      paint();
    }).catch(function (e) {
      room = null; key = null; state.on = false;
      setMsg('加入失败：' + (e && e.message ? e.message : '网络问题'));
      paint();
    });
  }

  function countText() {
    var n = (hooks.getNotes() || []).filter(function (x) { return !x.deleted; }).length;
    return n + ' 条';
  }

  function doCopy() {
    if (!state.code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.code).then(function () { setMsg('房间号已复制'); },
        function () { setMsg('复制失败，长按上面的房间号手动复制'); });
    } else setMsg('长按上面的房间号手动复制');
  }

  function doLeave() {
    room = null; key = null; lastSha = null;
    saveRoom(null);
    state.on = false; state.code = ''; state.msg = '已断开，记录还在本机';
    paint();
  }

  function startRoom() {
    if (!room || !token) return;
    deriveKey(room.secret, room.id).then(function (k) {
      key = k;
      state.on = true;
      state.code = room.id + '-' + room.secret;
      paint();
      syncNow(true);
    });
  }

  /* ---------- 启动 ---------- */
  function init(h) {
    hooks = h;
    mount(h.container);
    token = loadToken();
    room = loadRoom();
    if (!supported() || !room) { state.on = false; paint(); return; }
    state.on = true;
    state.code = room.id + '-' + room.secret;
    if (token) startRoom();
    paint();

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && room && key && token) syncNow(true);
    });
    window.addEventListener('online', function () {
      if (room && key && token) syncNow(true);
    });
  }

  window.Sync = {
    init: init,
    pull: pull,
    push: push,
    syncNow: syncNow,
    touch: schedulePush,
    isOn: function () { return !!room && !!token; },
    supported: supported
  };
})();
