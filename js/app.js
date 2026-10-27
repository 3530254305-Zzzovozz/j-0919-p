/* =========================================================
   我们的小世界 — 主逻辑
   纯原生 JS，无依赖，file:// 直接打开也能跑
   ========================================================= */
(function () {
  'use strict';

  var C = window.SITE_CONFIG || {};
  var PHOTOS = window.PHOTOS || [];
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 小工具 ---------------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function parseStart(str) {
    // '2023-05-20T20:13:00' —— 按本地时间解析，避免时区偏移
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str || '');
    if (!m) return new Date(2023, 4, 20, 20, 13, 0);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function fmtDate(d) {
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /* ---------------- 名字 / 文案 ---------------- */
  function initText() {
    var her = (C.her && C.her.name) || '她';
    var me = (C.me && C.me.name) || '我';

    $('herName').textContent = her;
    $('meName').textContent = me;
    $('brandName').textContent = C.brand || '我们的小世界';

    // 头像已从封面去掉；配置里若还留着 avatar，会在这里被忽略

    // 结尾那页（04）已经去掉，这里都做了空值保护，以后想加回来也不炸
    if ($('signature')) $('signature').textContent = (C.closing && C.closing.signature) || ('—— ' + me);
    if (C.closing && $('closingTitle')) {
      $('closingTitle').textContent = C.closing.title || '';
      $('closingText').textContent = C.closing.text || '';
    }

    var foot = document.querySelector('.footer p');
    if (foot && C.footer) foot.textContent = C.footer;
    if ($('footerYear')) $('footerYear').textContent = '© ' + new Date().getFullYear() + ' · 只给你一个人看';

    var start = parseStart(C.startDate);
    var tag = C.tagline || '从 {date} 那天起';
    $('tagline').textContent = tag.replace('{date}', fmtDate(start));

    var cap = $('clockCap');
    if (cap) cap.textContent = C.clockLabel || ('已经' + (C.startLabel || '在一起'));
    var clockBox = document.querySelector('.clock');
    if (clockBox) clockBox.setAttribute('aria-label', (C.startLabel || '在一起') + '的时间');

    var notice = $('demoNotice');
    if (notice && C.demoNotice === false) notice.classList.add('is-hidden');

    document.title = (C.brand || '我们的小世界');
  }

  /* ---------------- 计时 ---------------- */
  function initClock() {
    var start = parseStart(C.startDate);
    var daysEl = $('days'), hh = $('hh'), mm = $('mm'), ss = $('ss');
    var annivLabel = $('annivLabel'), annivDays = $('annivDays'), annivFill = $('annivFill'), annivNote = $('annivNote');
    var lastDays = -1;

    function countUp(el, target) {
      if (reduceMotion) { el.textContent = target; return; }
      var t0 = null;
      var from = 0;
      var dur = 1200;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function anniversary(now) {
      var s = start;
      var m = s.getMonth(), d = s.getDate();
      var h = s.getHours(), mi = s.getMinutes(), se = s.getSeconds();
      // 上一个已过的周年
      var prev = new Date(now.getFullYear(), m, d, h, mi, se);
      if (prev.getTime() > now.getTime()) prev = new Date(now.getFullYear() - 1, m, d, h, mi, se);
      var next = new Date(prev.getFullYear() + 1, m, d, h, mi, se);
      return {
        years: prev.getFullYear() - s.getFullYear(),
        prev: prev,
        next: next
      };
    }

    /* 每 N 天一个小里程碑（认识第 100 天、第 200 天…） */
    function dayMilestone(days) {
      var step = C.milestoneStep || 0;
      if (step <= 0) return null;
      var n = (Math.floor(days / step) + 1) * step;
      var ms = 86400000;
      return {
        n: n,
        at: new Date(start.getTime() + n * ms),
        prev: new Date(start.getTime() + (n - step) * ms)
      };
    }

    function tick() {
      var now = new Date();
      var elapsed = now.getTime() - start.getTime();
      if (elapsed < 0) elapsed = 0;

      var dayMs = 86400000;
      var days = Math.floor(elapsed / dayMs);
      var rest = elapsed - days * dayMs;

      if (days !== lastDays) {
        if (lastDays === -1) countUp(daysEl, days);
        else daysEl.textContent = days;
        lastDays = days;
      }
      hh.textContent = pad2(Math.floor(rest / 3600000));
      mm.textContent = pad2(Math.floor(rest % 3600000 / 60000));
      ss.textContent = pad2(Math.floor(rest % 60000 / 1000));

      var L = C.startLabel || '在一起';
      var a = anniversary(now);
      var dm = dayMilestone(days);

      // 卡片显示「更近的那个里程碑」：天数里程碑 or 周年
      var useDay = dm && dm.at.getTime() <= a.next.getTime();
      var at = useDay ? dm.at : a.next;
      var prev = useDay ? dm.prev : a.prev;
      var label = useDay
        ? '距离' + L + '第 ' + dm.n + ' 天'
        : '距离' + L + ' ' + (a.years + 1) + ' 周年';
      var other = useDay
        ? (L + ' ' + (a.years + 1) + ' 周年')
        : (dm ? (L + '第 ' + dm.n + ' 天') : '');

      annivLabel.textContent = label;
      annivDays.textContent = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / dayMs));

      var span = at.getTime() - prev.getTime();
      var pct = span > 0 ? (now.getTime() - prev.getTime()) / span : 0;
      annivFill.style.width = Math.max(2, Math.min(100, pct * 100)) + '%';

      if (annivNote) {
        if (other) {
          var otherAt = useDay ? a.next : dm.at;
          var otherLeft = Math.max(0, Math.ceil((otherAt.getTime() - now.getTime()) / dayMs));
          annivNote.textContent = '另一个里程碑：' + other + '，还有 ' + otherLeft + ' 天';
        } else {
          var nextN = days + 1;
          annivNote.textContent = '今天是' + L + '的第 ' + nextN + ' 天';
        }
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- 照片墙 ---------------- */
  var wallItems = [];

  function initWall() {
    if (!$('wall')) return;
    renderWall();
    initPhotoTools();
  }

  function renderWall() {
    var wall = $('wall');
    if (!wall) return;
    buildPhotoList();
    wall.innerHTML = '';
    wallItems.length = 0;
    paintPhotoCount();
    if (!PHOTOS.length) {
      wall.innerHTML = '<p style="column-span:all;color:rgba(247,239,251,.5);font-size:13px">' +
        '还没有照片。把图片放进 photos/ 文件夹，然后在 js/photos.js 里加上一行即可。</p>';
      return;
    }

    var frag = document.createDocumentFragment();
    PHOTOS.forEach(function (p, i) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'photo' + (p.mine ? ' is-mine' : '');
      card.setAttribute('aria-label', '查看照片：' + (p.caption || ('第 ' + (i + 1) + ' 张')));

      var img = document.createElement('img');
      img.src = p.src;
      img.alt = p.caption || ('照片 ' + (i + 1));
      img.loading = i < 6 ? 'eager' : 'lazy';
      img.decoding = 'async';
      // 图片比例出来后，避免抖动：加载失败也保留卡片
      img.addEventListener('error', function () {
        img.style.minHeight = '150px';
        img.alt = '（图片没找到：' + p.src + '）';
      });

      var cap = document.createElement('span');
      cap.className = 'cap';
      var b = document.createElement('b');
      b.textContent = p.caption || '';
      var small = document.createElement('small');
      small.textContent = p.date || '';
      cap.appendChild(b);
      if (p.caption) cap.appendChild(small);

      card.appendChild(img);
      card.appendChild(cap);
      card.addEventListener('click', function () { openLightbox(i); });

      wallItems.push({ el: card, img: img, data: p });
      frag.appendChild(card);
    });
    wall.appendChild(frag);
  }

  /* ---------------- 灯箱 ---------------- */
  var lb, lbImg, lbCap, lbMeta, lbIndex = 0, lastFocus = null;

  function openLightbox(i) {
    if (!PHOTOS.length) return;
    lbIndex = (i + PHOTOS.length) % PHOTOS.length;
    var p = PHOTOS[lbIndex];
    lbImg.src = p.src;
    lbImg.alt = p.caption || '';
    lbCap.textContent = p.caption || '';
    lbMeta.textContent = (p.date ? p.date : '') + (PHOTOS.length > 1 ? '   ·   ' + (lbIndex + 1) + ' / ' + PHOTOS.length : '');
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.classList.add('lb-open');
    $('lbClose').focus({ preventScroll: true });
    // 自己加的才能删；说明每张都能写
    if ($('lbDel')) { $('lbDel').hidden = !p.mine; resetDel(); }
    if ($('lbEditCap')) { endCapEdit(); }
    // 预加载相邻
    [lbIndex + 1, lbIndex - 1].forEach(function (k) {
      var q = PHOTOS[(k + PHOTOS.length) % PHOTOS.length];
      if (q) { var im = new Image(); im.src = q.src; }
    });
  }

  function closeLightbox() {
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function stepLightbox(dir) { openLightbox(lbIndex + dir); }

  function initLightbox() {
    lb = $('lightbox'); lbImg = $('lbImg'); lbCap = $('lbCaption'); lbMeta = $('lbMeta');
    if (!lb) return;

    $('lbClose').addEventListener('click', closeLightbox);
    $('lbPrev').addEventListener('click', function () { stepLightbox(-1); });
    $('lbNext').addEventListener('click', function () { stepLightbox(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });

    var sx = 0, sy = 0, tracking = false;
    lb.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) stepLightbox(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLightbox();
    }, { passive: true });
  }

  /* ---------------- 照片：本机导入 / 写说明 / 删除 ---------------- */
  var MINE_KEY = 'ourworld.photos.v1';
  var CAPS_KEY = 'ourworld.photocaps.v1';
  var LIB_PHOTOS = (window.PHOTOS || []).slice();
  var MINE_MAX = 1200;      // 导入的照片长边压到多少像素
  var MINE_Q = 0.82;        // 压完的 jpeg 质量

  function loadMine() {
    try {
      var a = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
      return Array.isArray(a) ? a.filter(function (p) { return p && p.src; }) : [];
    } catch (e) { return []; }
  }

  function saveMine(list) {
    try { localStorage.setItem(MINE_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  function loadCaps() {
    try {
      var o = JSON.parse(localStorage.getItem(CAPS_KEY) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }

  function saveCaps(o) {
    try { localStorage.setItem(CAPS_KEY, JSON.stringify(o)); return true; }
    catch (e) { return false; }
  }

  /* 内置清单 + 本机导入 → PHOTOS（原地替换，灯箱那边不用改） */
  function buildPhotoList() {
    var caps = loadCaps();
    var mine = loadMine().map(function (p) {
      return { key: 'imp:' + p.id, id: p.id, src: p.src, caption: p.caption || '', date: p.date || '', mine: true };
    });
    var lib = LIB_PHOTOS.map(function (p) {
      return { key: 'lib:' + p.src, src: p.src, caption: p.caption || '', date: p.date || '', mine: false };
    });
    var all = mine.concat(lib);
    all.forEach(function (p) {
      var o = caps[p.key];
      if (o) {
        if (typeof o.caption === 'string') p.caption = o.caption;
        if (typeof o.date === 'string') p.date = o.date;
      }
    });
    PHOTOS.length = 0;
    Array.prototype.push.apply(PHOTOS, all);
  }

  function paintPhotoCount() {
    var el = $('photoCount');
    if (!el) return;
    var n = PHOTOS.length, m = 0;
    PHOTOS.forEach(function (p) { if (p.mine) m++; });
    el.textContent = m ? ('共 ' + n + ' 张 · 你加了 ' + m + ' 张') : ('共 ' + n + ' 张');
    var clear = $('photoClear');
    if (clear) clear.hidden = !m;
  }

  /* 图片文件 → 缩小后的 jpeg dataURL */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) throw new Error('empty');
          var s = Math.min(1, MINE_MAX / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#0b0714';
          cx.fillRect(0, 0, cw, ch);
          cx.imageSmoothingEnabled = true;
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/jpeg', MINE_Q));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  /* 逐张处理，存储满了就停下来说一声 */
  function addPhotoFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      var type = (f && f.type) || '';
      var name = (f && f.name) || '';
      return /^image\//.test(type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name);
    });
    if (!list.length) { toast('选的是图片才行（jpg / png / webp）'); return Promise.resolve(0); }

    var added = 0, full = false;
    return list.reduce(function (chain, f) {
      return chain.then(function () {
        if (full) return;
        return shrinkImage(f).then(function (src) {
          var next = [{ id: uid(), src: src, caption: '', date: '', ts: Date.now() }].concat(loadMine());
          if (!saveMine(next)) { full = true; return; }
          added++;
        }).catch(function () { /* 单张读不出来就跳过 */ });
      });
    }, Promise.resolve()).then(function () {
      renderWall();
      if (full) toast('浏览器存满了，先删几张再加');
      else if (!added) toast('这几张没读出来，换一张试试');
      else toast('加了 ' + added + ' 张');
      return added;
    });
  }

  function deleteMinePhoto(id) {
    var list = loadMine().filter(function (p) { return p.id !== id; });
    if (!saveMine(list)) { toast('删不掉，存储出错了'); return; }
    var caps = loadCaps();
    delete caps['imp:' + id];
    saveCaps(caps);
    renderWall();
    closeLightbox();
    toast('删掉了一张');
  }

  /* 灯箱里写说明 */
  function startCapEdit() {
    var p = PHOTOS[lbIndex];
    if (!p || !$('lbCapForm')) return;
    $('lbCapForm').hidden = false;
    $('lbEditCap').hidden = true;
    $('lbCaption').style.visibility = 'hidden';
    $('lbCapInput').value = p.caption || '';
    $('lbCapDate').value = p.date || '';
    $('lbCapInput').focus({ preventScroll: true });
    try { $('lbCapInput').select(); } catch (e) {}
  }

  function endCapEdit() {
    if ($('lbCapForm')) $('lbCapForm').hidden = true;
    if ($('lbEditCap')) $('lbEditCap').hidden = false;
    if ($('lbCaption')) $('lbCaption').style.visibility = '';
  }

  function submitCapEdit() {
    var p = PHOTOS[lbIndex];
    if (!p) { endCapEdit(); return; }
    var caps = loadCaps();
    var cap = { caption: $('lbCapInput').value.trim(), date: $('lbCapDate').value.trim() };
    if (cap.caption || cap.date) caps[p.key] = cap; else delete caps[p.key];
    if (!saveCaps(caps)) { toast('没存下，浏览器存储满了'); return; }
    p.caption = cap.caption;
    p.date = cap.date;
    endCapEdit();
    renderWall();
    openLightbox(lbIndex);
    toast('说明已保存');
  }

  /* 删除按钮的两下确认 */
  var delTimer = null;

  function resetDel() {
    var b = $('lbDel');
    if (!b) return;
    clearTimeout(delTimer);
    b.dataset.armed = '';
    b.classList.remove('is-armed');
    b.textContent = '删除这张';
  }

  function initPhotoTools() {
    var add = $('photoAdd'), file = $('photoFile'), clear = $('photoClear');

    if (add && file) {
      add.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var files = file.files;
        if (!files || !files.length) return;
        add.disabled = true;
        add.textContent = '正在加…';
        addPhotoFiles(files).then(function () {
          add.disabled = false;
          add.innerHTML = '<span>＋</span>加照片';
          try { file.value = ''; } catch (e) {}
        });
      });
    }

    if (clear) {
      clear.addEventListener('click', function () {
        if (clear.dataset.armed !== '1') {
          clear.dataset.armed = '1';
          clear.classList.add('is-armed');
          clear.textContent = '确定清空？';
          clearTimeout(clear._t);
          clear._t = setTimeout(function () {
            clear.dataset.armed = '';
            clear.classList.remove('is-armed');
            clear.textContent = '清掉我加的';
          }, 3200);
          return;
        }
        clearTimeout(clear._t);
        clear.dataset.armed = '';
        clear.classList.remove('is-armed');
        clear.textContent = '清掉我加的';
        saveMine([]);
        renderWall();
        toast('你加的照片都清掉了');
      });
    }

    var edit = $('lbEditCap');
    if (edit) edit.addEventListener('click', startCapEdit);

    var form = $('lbCapForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitCapEdit(); });

    var cancel = $('lbCapCancel');
    if (cancel) cancel.addEventListener('click', endCapEdit);

    var del = $('lbDel');
    if (del) {
      del.addEventListener('click', function () {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.classList.add('is-armed');
          del.textContent = '确定删除？';
          clearTimeout(delTimer);
          delTimer = setTimeout(resetDel, 3200);
          return;
        }
        resetDel();
        var p = PHOTOS[lbIndex];
        if (p && p.id) deleteMinePhoto(p.id);
      });
    }
  }

  /* ---------------- 待记录（两个人一起写，存在本机浏览器） ---------------- */
  var NOTES_KEY = 'ourworld.notes.v1';
  var notes = [];
  var noteBy = 'me';
  var noteEditing = null;
  var noteArmed = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function noteAuthor(by) {
    if (by === 'her') return (C.her && C.her.name) || '她';
    return (C.me && C.me.name) || '我';
  }

  function dstr(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '.' + (m < 10 ? '0' + m : m) + '.' + (day < 10 ? '0' + day : day);
  }

  /* 精确到分钟：2026.10.28 · 21:34 */
  function noteWhen(n) {
    var raw = n.date || '';
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
    if (m) {
      var day = m[1] + '.' + m[2] + '.' + m[3];
      if (m[4]) return day + ' · ' + m[4] + ':' + m[5];
      // 只有日期（老记录 / 导入时没写时间）：补上当时的时刻
      var t0 = new Date(n.ts || Date.now());
      return day + ' · ' + pad2(t0.getHours()) + ':' + pad2(t0.getMinutes());
    }
    var t = new Date(n.ts || Date.now());
    return dstr(t) + ' · ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }

  /* 现在的时间，给 <input type="datetime-local"> 用 */
  function nowLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* 把一条记录的时间转成 datetime-local 能吃的值 */
  function toLocalInput(n) {
    var m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec((n && n.date) || '');
    var t = new Date((n && n.ts) || Date.now());
    var hm = pad2(t.getHours()) + ':' + pad2(t.getMinutes());
    if (m && m[2]) return m[1] + 'T' + m[2];
    if (m) return m[1] + 'T' + hm;
    return nowLocal();
  }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-on'); }, 1900);
  }

  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      notes = raw ? JSON.parse(raw) : [];
    } catch (e) { notes = []; }
    if (!Array.isArray(notes)) notes = [];
    notes = notes.filter(function (n) {
      if (!n || typeof n !== 'object') return false;
      if (n.deleted) return true;                       // 墓碑：删过的记号，同步要用
      return typeof n.text === 'string' && n.text.trim();
    });
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      toast('存不下了，先点「导出」备份一份');
      return false;
    }
  }

  function sortNotes() {
    notes.sort(function (a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }

  function renderNotes() {
    var list = $('notes'), empty = $('noteEmpty'), count = $('noteCount');
    if (!list) return;
    sortNotes();
    var live = notes.filter(function (n) { return !n.deleted; });
    list.innerHTML = '';

    live.forEach(function (n) {
      var art = document.createElement('article');
      art.className = 'note';
      art.setAttribute('data-id', n.id);

      var head = document.createElement('div');
      head.className = 'note-head';
      var when = document.createElement('span');
      when.className = 'note-when';
      when.textContent = noteWhen(n);
      var by = document.createElement('span');
      by.className = 'note-by';
      by.setAttribute('data-by', n.by === 'her' ? 'her' : 'me');
      by.textContent = noteAuthor(n.by);
      head.appendChild(when);
      head.appendChild(by);
      art.appendChild(head);

      if (noteEditing === n.id) {
        var wrap = document.createElement('div');
        wrap.className = 'note-edit';
        var ta = document.createElement('textarea');
        ta.value = n.text;
        ta.setAttribute('aria-label', '修改这条记录');
        ta.addEventListener('input', function () { autoGrow(ta); });
        ta.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { noteEditing = null; renderNotes(); }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(n.id);
        });
        wrap.appendChild(ta);
        var timeIn = document.createElement('input');
        timeIn.type = 'datetime-local';
        timeIn.step = '60';
        timeIn.className = 'note-edit-time';
        timeIn.setAttribute('aria-label', '修改这条的时间');
        timeIn.value = toLocalInput(n);
        wrap.appendChild(timeIn);
        art.appendChild(wrap);

        var actsE = document.createElement('div');
        actsE.className = 'note-acts';
        actsE.appendChild(actBtn('保存', 'is-save', function () { saveEdit(n.id); }));
        actsE.appendChild(actBtn('取消', '', function () { noteEditing = null; renderNotes(); }));
        art.appendChild(actsE);
        list.appendChild(art);
        setTimeout(function () { autoGrow(ta); ta.focus(); }, 0);
        return;
      }

      var p = document.createElement('p');
      p.className = 'note-text';
      p.textContent = n.text;
      art.appendChild(p);

      var acts = document.createElement('div');
      acts.className = 'note-acts';
      acts.appendChild(actBtn('编辑', '', function () {
        noteEditing = n.id; renderNotes();
      }));
      var del = actBtn(noteArmed === n.id ? '确定删除？' : '删除', 'is-del' + (noteArmed === n.id ? ' is-armed' : ''), function () {
        if (noteArmed === n.id) {
          notes.forEach(function (x) {
            if (x.id !== n.id) return;
            x.deleted = true; x.text = ''; x.updatedAt = Date.now();
          });
          saveNotes(); renderNotes(); toast('已删除');
          if (window.Sync) window.Sync.touch();
        } else {
          noteArmed = n.id; renderNotes();
          setTimeout(function () {
            if (noteArmed === n.id) { noteArmed = null; renderNotes(); }
          }, 3000);
        }
      });
      acts.appendChild(del);
      art.appendChild(acts);
      list.appendChild(art);
    });

    if (empty) empty.hidden = live.length > 0;
    if (count) count.textContent = '共 ' + live.length + ' 条';
  }

  function actBtn(label, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-act' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function saveEdit(id) {
    var art = document.querySelector('.note[data-id="' + id + '"]');
    var ta = art && art.querySelector('textarea');
    if (!ta) return;
    var v = ta.value.trim();
    if (!v) { toast('内容不能是空的'); ta.focus(); return; }
    var timeIn = art.querySelector('.note-edit-time');
    var when = timeIn && timeIn.value ? timeIn.value : '';
    notes.forEach(function (n) {
      if (n.id === id) {
        n.text = v;
        if (when) n.date = when;
        n.ts = n.ts || Date.now();
        n.updatedAt = Date.now();
      }
    });
    noteEditing = null;
    if (saveNotes()) {
      renderNotes(); toast('已保存');
      if (window.Sync) window.Sync.touch();
    }
  }

  function openSync(mode) {
    var box = $('noteSync'), title = $('noteSyncTitle'), ta = $('noteSyncText');
    var ok = $('noteSyncOk'), hint = $('noteSyncHint');
    if (!box) return;
    box.hidden = false;
    box.setAttribute('data-mode', mode);
    if (mode === 'export') {
      if (!notes.length) { toast('还没有记录可以导出'); box.hidden = true; return; }
      title.textContent = '导出 · 复制下面这段发给对方';
      ta.value = JSON.stringify({ v: 1, notes: notes }, null, 0);
      ta.readOnly = true;
      ok.textContent = '复制';
      hint.textContent = '对方在自己的手机上点「导入」，把这段粘进去，再点确认，两边的记录就合到一起了。';
      ta.focus(); ta.select();
    } else {
      title.textContent = '导入 · 把对方发来的内容粘进来';
      ta.value = '';
      ta.readOnly = false;
      ok.textContent = '确认导入';
      hint.textContent = '导入是合并：只加新的，重复的自动跳过，不会覆盖你已经写的内容。';
      ta.focus();
    }
  }

  function doImport() {
    var ta = $('noteSyncText');
    if (!ta) return;
    var data;
    try {
      data = JSON.parse(ta.value.trim());
    } catch (e) {
      toast('这段内容读不出来，确认复制完整了吗');
      return;
    }
    var incoming = Array.isArray(data) ? data : (data && data.notes);
    if (!Array.isArray(incoming) || !incoming.length) { toast('里面没有记录'); return; }

    var added = 0;
    incoming.forEach(function (it) {
      if (!it || typeof it.text !== 'string' || !it.text.trim()) return;
      var text = it.text.trim();
      var date = typeof it.date === 'string' ? it.date : '';
      var dup = notes.some(function (n) { return n.text === text && (n.date || '') === date; });
      if (dup) return;
      notes.push({
        id: it.id && !notes.some(function (n) { return n.id === it.id; }) ? it.id : uid(),
        text: text,
        date: date,
        by: it.by === 'her' ? 'her' : 'me',
        ts: typeof it.ts === 'number' ? it.ts : Date.now()
      });
      added++;
    });
    if (!added) { toast('没有新的记录，都已经有了'); return; }
    saveNotes(); renderNotes();
    if (window.Sync) window.Sync.touch();
    $('noteSync').hidden = true;
    toast('导入 ' + added + ' 条');
  }

  function copySync() {
    var ta = $('noteSyncText');
    if (!ta) return;
    var done = function () { toast('已复制，发给她吧'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, function () {
        ta.select(); document.execCommand('copy'); done();
      });
    } else {
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('选中了，按 Ctrl+C 复制'); }
    }
  }

  function initNotes() {
    var form = $('noteForm');
    if (!form) return;
    loadNotes();

    var ta = $('noteText'), date = $('noteDate');
    if (date) date.value = nowLocal();

    renderNotes();

    if (ta) ta.addEventListener('input', function () { autoGrow(ta); });

    var whoBtns = document.querySelectorAll('.who-btn');
    Array.prototype.forEach.call(whoBtns, function (b) {
      b.addEventListener('click', function () {
        noteBy = b.getAttribute('data-by');
        Array.prototype.forEach.call(whoBtns, function (x) { x.classList.toggle('is-on', x === b); });
      });
    });
    // 按钮上写真实名字，谁写的点谁（比「我 / 她」清楚）
    if (whoBtns.length === 2) {
      whoBtns[0].textContent = (C.me && C.me.name) || '我';
      whoBtns[1].textContent = (C.her && C.her.name) || '她';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) { toast('先写点什么'); ta.focus(); return; }
      notes.push({
        id: uid(),
        text: text,
        date: date ? date.value : '',
        by: noteBy,
        ts: Date.now(),
        updatedAt: Date.now()
      });
      if (!saveNotes()) return;
      if (window.Sync) window.Sync.touch();
      ta.value = '';
      if (date) date.value = nowLocal();
      autoGrow(ta);
      noteEditing = null;
      renderNotes();
      toast(noteBy === 'her' ? '记下了' : '记下了');
    });

    // Ctrl/Cmd + Enter 快速提交
    if (ta) ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    var exp = $('noteExport'), imp = $('noteImport');
    if (exp) exp.addEventListener('click', function () { openSync('export'); });
    if (imp) imp.addEventListener('click', function () { openSync('import'); });

    // 云同步：两部手机看同一份记录
    var syncBox = $('syncBox');
    if (syncBox && window.Sync) {
      window.Sync.init({
        container: syncBox,
        getNotes: function () { return notes; },
        setNotes: function (arr) {
          notes = Array.isArray(arr) ? arr : notes;
          saveNotes();
          renderNotes();
        },
        // 小游戏比分也跟着同步：谁最后改的听谁的
        getGame: function () {
          return (window.__game && window.__game.getStats) ? window.__game.getStats() : null;
        },
        setGame: function (obj) {
          if (window.__game && window.__game.applyStats) window.__game.applyStats(obj);
        }
      });
    }

    var ok = $('noteSyncOk'), close = $('noteSyncClose');
    if (ok) ok.addEventListener('click', function () {
      var box = $('noteSync');
      if (box && box.getAttribute('data-mode') === 'import') doImport();
      else copySync();
    });
    if (close) close.addEventListener('click', function () { $('noteSync').hidden = true; });
  }

  /* ---------------- 章节导航（封面 → 01..04） ---------------- */
  var chapters = [];
  var chapterIndex = -1;

  function pad2n(n) { return n < 10 ? '0' + n : '' + n; }

  function buildDots() {
    var dots = $('dots');
    if (!dots) return;
    dots.innerHTML = '';
    chapters.forEach(function (ch, i) {
      var title = ch.getAttribute('data-title') || ('第 ' + (i + 1) + ' 页');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 页：' + title);
      var s = document.createElement('span');
      s.textContent = pad2n(i + 1) + ' ' + title;
      var d = document.createElement('i');
      b.appendChild(s);
      b.appendChild(d);
      b.addEventListener('click', function () { go(i); });
      dots.appendChild(b);
    });
  }

  function go(i, force) {
    if (!chapters.length) return;
    i = Math.max(0, Math.min(chapters.length - 1, i));
    if (i === chapterIndex && !force) return;

    if (chapterIndex >= 0) chapters[chapterIndex].classList.remove('is-active');
    chapterIndex = i;
    var cur = chapters[i];

    // 重新触发入场动画
    cur.classList.remove('is-active');
    void cur.offsetWidth;
    cur.classList.add('is-active');

    var nowEl = $('pageNow');
    if (nowEl) nowEl.textContent = pad2n(i + 1);
    var prev = $('prevBtn'), next = $('nextBtn');
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === chapters.length - 1;

    var dots = document.querySelectorAll('.dot');
    Array.prototype.forEach.call(dots, function (d, k) {
      d.classList.toggle('is-on', k === i);
      d.setAttribute('aria-current', k === i ? 'true' : 'false');
    });

    window.scrollTo(0, 0);
    document.documentElement.setAttribute('data-chapter', String(i));

    // 进游戏页时重新量一次画布；离开就暂停
    if (window.__game) {
      if (i === 2) window.__game.resize();
      else window.__game.pause();
    }
  }

  function enterChapters() {
    var gate = $('gate'), box = $('chapters');
    if (!box) return;
    document.body.classList.remove('is-gate');
    if (gate) {
      gate.classList.add('is-leaving');
      setTimeout(function () { gate.hidden = true; }, 520);
    }
    box.hidden = false;
    go(0, true);
    // 手机上按返回键 / 侧滑返回，回到封面而不是直接退出页面
    try { history.pushState({ ow: 1 }, ''); } catch (e) {}
  }

  function backByHistory() {
    try {
      if (history.state && history.state.ow) { history.back(); return; }
    } catch (e) {}
    backToGate();
  }

  function backToGate() {
    var gate = $('gate'), box = $('chapters');
    if (!gate || !box) return;
    if (window.__game) window.__game.pause();
    box.hidden = true;
    gate.hidden = false;
    gate.classList.remove('is-leaving');
    gate.style.display = '';
    document.body.classList.add('is-gate');
    chapters.forEach(function (c) { c.classList.remove('is-active'); });
    chapterIndex = -1;
    window.scrollTo(0, 0);
  }

  function initChapters() {
    chapters = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
    if (!chapters.length) return;

    // 章节名：优先用 config.chapters，没有就用 HTML 里的
    if (C.chapters && C.chapters.length) {
      chapters.forEach(function (ch, i) {
        var name = C.chapters[i];
        if (!name) return;
        var h = ch.querySelector('.ch-head h2');
        if (h) h.textContent = name;
        ch.setAttribute('data-title', name);
      });
    }
    chapters.forEach(function (ch) {
      var h = ch.querySelector('.ch-head h2');
      ch.setAttribute('data-title', h ? h.textContent : '');
    });

    var total = document.querySelector('.pager-now span');
    if (total) total.textContent = pad2n(chapters.length);
    var hint = $('gateHint');
    if (hint) hint.textContent = '里面还有 ' + chapters.length + ' 页，慢慢看';

    buildDots();

    var enterBtn = $('enterBtn');
    if (enterBtn) enterBtn.addEventListener('click', enterChapters);

    var prev = $('prevBtn'), next = $('nextBtn');
    if (prev) prev.addEventListener('click', function () { go(chapterIndex - 1); });
    if (next) next.addEventListener('click', function () { go(chapterIndex + 1); });

    var brand = $('brandLink');
    if (brand) brand.addEventListener('click', function (e) {
      e.preventDefault();
      if (!document.body.classList.contains('is-gate')) backByHistory();
    });

    window.addEventListener('popstate', function () {
      if (!document.body.classList.contains('is-gate')) backToGate();
    });

    // 往下翻时让翻页条淡出，停下来再出现，避免挡住照片
    var pager = $('pager');
    var lastY = window.scrollY, dimTimer = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (pager) {
        if (y > lastY + 4 && y > 40) pager.classList.add('is-dim');
        clearTimeout(dimTimer);
        dimTimer = setTimeout(function () { pager.classList.remove('is-dim'); }, 650);
      }
      lastY = y;
    }, { passive: true });

    // 键盘左右翻页（游戏进行中不抢方向键）
    document.addEventListener('keydown', function (e) {
      if (document.body.classList.contains('game-playing')) return;
      if (!document.getElementById('lightbox').hidden) return;
      if (document.body.classList.contains('is-gate')) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterChapters(); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault(); go(chapterIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); go(chapterIndex - 1);
      }
    });

    // 手机左右滑动翻页
    var tx = 0, ty = 0, tracking = false;
    document.addEventListener('touchstart', function (e) {
      if (document.body.classList.contains('is-gate')) return;
      if (!document.getElementById('lightbox').hidden) return;
      if (e.target.closest && e.target.closest('#gameCanvas')) return;
      if (e.touches.length !== 1) return;
      tx = e.touches[0].clientX; ty = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        go(chapterIndex + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
  }

  /* ---------------- 星空 ---------------- */
  function initStars() {
    var cv = $('stars');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var stars = [], w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    function build() {
      w = cv.clientWidth || window.innerWidth;
      h = cv.clientHeight || window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(170, Math.max(60, w * h / 11000)));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.15 + 0.25,
          a: Math.random() * 0.5 + 0.18,
          ph: Math.random() * Math.PI * 2,
          sp: Math.random() * 0.0016 + 0.00035,
          tint: Math.random() < 0.22 ? '255,208,138' : (Math.random() < 0.4 ? '255,170,200' : '255,255,255')
        });
      }
    }

    function draw(ts) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var tw = reduceMotion ? 1 : (0.62 + 0.38 * Math.sin(ts * s.sp + s.ph));
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + s.tint + ',' + (s.a * tw).toFixed(3) + ')';
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.05) {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(' + s.tint + ',' + (0.05 * tw).toFixed(3) + ')';
          ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }

    build();
    requestAnimationFrame(draw);

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { build(); if (reduceMotion) draw(0); }, 180);
    });
  }

  /* ---------------- 背景音乐 ---------------- */
  function initMusic() {
    var audio = $('bgm'), btn = $('musicBtn');
    if (!audio || !btn) return;
    var src = (C.music && C.music.src) || audio.getAttribute('src');
    if (src) audio.src = src;
    audio.volume = (C.music && C.music.volume != null) ? C.music.volume : 0.35;
    audio.loop = true;

    var playing = false;

    function paint() {
      btn.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      btn.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
    }

    function play() {
      var p = audio.play();
      if (p && p.then) {
        p.then(function () { playing = true; paint(); })
         .catch(function () { playing = false; paint(); });
      } else { playing = true; paint(); }
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (playing) { audio.pause(); playing = false; paint(); }
      else play();
    });

    if (!C.music || C.music.autoplayOnFirstTouch !== false) {
      var once = function () {
        document.removeEventListener('pointerdown', once);
        document.removeEventListener('touchstart', once);
        if (!playing) play();
      };
      document.addEventListener('pointerdown', once, { once: true, passive: true });
      document.addEventListener('touchstart', once, { once: true, passive: true });
    }
    paint();
  }

  /* ---------------- 点击飘心 ---------------- */
  function initHearts() {
    if (reduceMotion) return;
    var glyphs = ['♥', '♡', '❤'];
    var last = 0;
    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, a, #gameCanvas')) return;
      var now = Date.now();
      if (now - last < 90) return;
      last = now;
      var s = document.createElement('span');
      s.className = 'pop-heart';
      s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      s.style.left = e.clientX + 'px';
      s.style.top = e.clientY + 'px';
      s.style.color = Math.random() < 0.5 ? '#ff8ab5' : '#ffd08a';
      s.style.fontSize = (13 + Math.random() * 9) + 'px';
      document.body.appendChild(s);
      setTimeout(function () { s.remove(); }, 1250);
    }, { passive: true });
  }

  /* ---------------- 顶栏 ---------------- */
  function initTopbar() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    function update() {
      var inGate = document.body.classList.contains('is-gate');
      bar.classList.toggle('is-stuck', !inGate || window.scrollY > 24);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    // 进入 / 退出封面时也切一次
    var gate = $('gate');
    if (gate && window.MutationObserver) {
      new MutationObserver(update).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    }
    var box = $('chapters');
    if (box && window.MutationObserver) {
      new MutationObserver(update).observe(box, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initText();
    initClock();
    initWall();
    initLightbox();
    initNotes();
    initChapters();
    initStars();
    initMusic();
    initHearts();
    initTopbar();
  }

  // 照片是加密的，等解密完再画
  function start() {
    Promise.resolve(window.__photosReady).then(boot, boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
