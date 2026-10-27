/* =========================================================
   接住我的爱 —— 小游戏
   拖动 / 方向键移动小篮子，接住爱心，躲开黑心。
   两个人轮流玩，分数记在右边的比分板上（每人各存最高分 + 最近几局）。
   ========================================================= */
(function () {
  'use strict';

  var SITE = window.SITE_CONFIG || {};
  var C = SITE.game || {};
  var DURATION = C.duration || 30;
  var LIVES = C.lives || 3;
  var MAX_HEARTS = C.maxHearts || 5;
  var BASE_SPEED = C.fallSpeed || 0.11;
  /* 越玩越快：一局结束时下落速度约为开局的 1 + ACCEL 倍 */
  var ACCEL = typeof C.accel === 'number' ? C.accel : 1.15;
  var NAMES = {
    me: (SITE.me && SITE.me.name) || '我',
    her: (SITE.her && SITE.her.name) || '她'
  };

  var canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('gameOverlay');
  var startBtn = document.getElementById('gameStart');
  var scoreEl = document.getElementById('gameScore');
  var comboEl = document.getElementById('gameCombo');
  var timeEl = document.getElementById('gameTime');
  var livesEl = document.getElementById('gameLives');
  var bestEl = document.getElementById('gameBest');   // 可能为空（页面上已由比分板显示）
  var overlayBest = document.getElementById('overlayBest');
  var kicker = document.getElementById('overlayKicker');
  var oTitle = document.getElementById('overlayTitle');
  var oText = document.getElementById('overlayText');
  var pickMe = document.getElementById('pickMe');
  var pickHer = document.getElementById('pickHer');
  var sideMe = document.getElementById('sideMe');
  var sideHer = document.getElementById('sideHer');
  var scoreMe = document.getElementById('scoreMe');
  var scoreHer = document.getElementById('scoreHer');
  var roundsMe = document.getElementById('roundsMe');
  var roundsHer = document.getElementById('roundsHer');
  var scoreLead = document.getElementById('scoreLead');
  var scoreRecent = document.getElementById('scoreRecent');
  var scoreReset = document.getElementById('scoreReset');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  var state = 'idle';            // idle | playing | paused | over
  var items = [], floats = [];
  var score = 0, combo = 0, bestCombo = 0, lives = LIVES, caught = 0, missed = 0;
  var timeLeft = DURATION, elapsed = 0;
  var startedAt = 0, pausedAt = 0;
  var lastSpawnMs = 0, nextSpawn = 0.55;
  var basketX = 0.5, targetX = 0.5, basketW = 0.26;
  var keys = { left: false, right: false };
  var shake = 0, lastTs = 0, rafId = 0, ended = false;
  var speedTick = 0, speedShown = '';
  var speedBadge = document.getElementById('speedBadge');

  var STATS_KEY = 'ourworld.game.v2';
  var OLD_BEST_KEY = 'ourworld.best';
  var stats = { best: { me: 0, her: 0 }, rounds: [], last: 'me' };
  var player = 'me';            // 这一局谁玩

  /* ---------- 比分存取 ---------- */
  function loadStats() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    var best = s.best || {};
    var out = {
      best: {
        me: Math.max(0, parseInt(best.me, 10) || 0),
        her: Math.max(0, parseInt(best.her, 10) || 0)
      },
      rounds: Array.isArray(s.rounds) ? s.rounds.filter(function (r) {
        return r && typeof r.score === 'number' && (r.by === 'me' || r.by === 'her');
      }).slice(-40) : [],
      last: s.last === 'her' ? 'her' : 'me'
    };
    // 老版本只存了一个「最高纪录」，迁移成你的分数
    if (!out.best.me && !out.best.her) {
      try {
        var old = parseInt(localStorage.getItem(OLD_BEST_KEY) || '0', 10) || 0;
        if (old > 0) out.best.me = old;
      } catch (e) {}
    }
    return out;
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  }

  function roundsOf(by) {
    var n = 0;
    for (var i = 0; i < stats.rounds.length; i++) if (stats.rounds[i].by === by) n++;
    return n;
  }

  function shortDate(ts) {
    var d = new Date(ts || Date.now());
    var m = d.getMonth() + 1, day = d.getDate();
    return (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
  }

  function renderScore() {
    if (scoreMe) scoreMe.textContent = stats.best.me;
    if (scoreHer) scoreHer.textContent = stats.best.her;
    if (roundsMe) roundsMe.textContent = '已玩 ' + roundsOf('me') + ' 局';
    if (roundsHer) roundsHer.textContent = '已玩 ' + roundsOf('her') + ' 局';
    if (sideMe) sideMe.classList.toggle('is-turn', player === 'me');
    if (sideHer) sideHer.classList.toggle('is-turn', player === 'her');

    var d = stats.best.me - stats.best.her;
    if (!stats.best.me && !stats.best.her) {
      scoreLead.textContent = '都还没开打，谁先来？';
      scoreLead.classList.add('is-even');
    } else if (d === 0) {
      scoreLead.textContent = '平手，' + NAMES[player] + ' 先来？';
      scoreLead.classList.add('is-even');
    } else {
      scoreLead.textContent = (d > 0 ? NAMES.me : NAMES.her) + ' 领先 ' + Math.abs(d) + ' 分';
      scoreLead.classList.remove('is-even');
    }

    if (scoreRecent) {
      scoreRecent.innerHTML = '';
      var last = stats.rounds.slice(-5).reverse();
      if (!last.length) {
        var li0 = document.createElement('li');
        li0.className = 'r-empty';
        li0.textContent = '还没有人打过';
        scoreRecent.appendChild(li0);
      } else {
        for (var i = 0; i < last.length; i++) {
          var r = last[i];
          var li = document.createElement('li');
          var who = document.createElement('span');
          who.className = 'r-who';
          who.textContent = NAMES[r.by];
          var sc = document.createElement('b');
          sc.className = 'r-score' + (r.score >= stats.best[r.by] && r.score > 0 ? ' is-win' : '');
          sc.textContent = r.score;
          var when = document.createElement('span');
          when.className = 'r-when';
          when.textContent = shortDate(r.ts);
          li.appendChild(who); li.appendChild(sc); li.appendChild(when);
          scoreRecent.appendChild(li);
        }
      }
    }
  }

  function paintPlayer() {
    if (pickMe) pickMe.textContent = NAMES.me;
    if (pickHer) pickHer.textContent = NAMES.her;
    if (pickMe) pickMe.classList.toggle('is-on', player === 'me');
    if (pickHer) pickHer.classList.toggle('is-on', player === 'her');
    if (bestEl) bestEl.textContent = stats.best[player];
    var tipName = document.getElementById('gameTipName');
    if (tipName) tipName.textContent = NAMES[player];
    var nm = document.getElementById('sideMeName');
    var nh = document.getElementById('sideHerName');
    if (nm) nm.textContent = NAMES.me;
    if (nh) nh.textContent = NAMES.her;
  }

  function setPlayer(by, save) {
    player = by === 'her' ? 'her' : 'me';
    if (save !== false) { stats.last = player; saveStats(); }
    paintPlayer();
    renderScore();
  }


  /* ---------- 画布尺寸 ---------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;   // 章节还没显示时不要量，避免把画布压成 0
    W = rect.width || 360;
    H = rect.height || 450;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    basketW = Math.min(0.32, Math.max(0.2, 92 / W));
    if (state === 'idle') draw(0);
  }

  /* ---------- 形状 ---------- */
  /* 当前的下落倍率：开局 1.0，越往后越大（25% / 50% / 75% 时会再快一截） */
  function speedNow() {
    var p = Math.min(1, Math.max(0, elapsed / DURATION));
    return 1 + ACCEL * Math.pow(p, 1.2);
  }
  function heartPath(c, x, y, size) {
    var k = size / 30;
    c.beginPath();
    for (var t = 0; t <= Math.PI * 2 + 0.001; t += 0.14) {
      var px = 16 * Math.pow(Math.sin(t), 3);
      var py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      px *= k; py *= k;
      if (t === 0) c.moveTo(x + px, y + py);
      else c.lineTo(x + px, y + py);
    }
    c.closePath();
  }

  function drawBasket(c, x, y, w) {
    var h = w * 0.52;
    c.save();
    c.shadowColor = 'rgba(255,95,143,.55)';
    c.shadowBlur = 18;
    var g = c.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
    g.addColorStop(0, '#ffd9c6');
    g.addColorStop(0.45, '#ff9dbb');
    g.addColorStop(1, '#c86b96');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x - w / 2 + w * 0.04, y + h, x, y + h);
    c.quadraticCurveTo(x + w / 2 - w * 0.04, y + h, x + w / 2, y);
    c.closePath();
    c.fill();

    c.shadowBlur = 0;
    // 篮口
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.lineTo(x + w / 2, y);
    c.stroke();
    // 编织纹
    c.strokeStyle = 'rgba(120,40,80,.22)';
    c.lineWidth = 1.2;
    for (var i = 1; i < 4; i++) {
      var p = i / 4;
      c.beginPath();
      c.moveTo(x - w / 2 + w * 0.02 * i, y + h * p);
      c.quadraticCurveTo(x, y + h * p + h * 0.10, x + w / 2 - w * 0.02 * i, y + h * p);
      c.stroke();
    }
    // 篮上的小心
    c.fillStyle = 'rgba(255,255,255,.85)';
    heartPath(c, x, y + h * 0.46, w * 0.20);
    c.fill();
    c.restore();
  }

  /* ---------- 生成 ---------- */
  function spawn() {
    // 黑心（闹别扭）随难度略微变多，但整体保持温柔：13% → 22%
    var bombChance = 0.13 + Math.min(0.09, elapsed / DURATION * 0.12);
    var goldChance = 0.13;                      // 金心：一颗顶 3 分，落得稍快
    var r = Math.random();
    var kind = r < bombChance ? 'bomb' : (r < bombChance + goldChance ? 'gold' : 'heart');
    var size = W * (kind === 'bomb' ? 0.085 : kind === 'gold' ? 0.090 : 0.082) * (0.85 + Math.random() * 0.35);
    items.push({
      x: W * (0.12 + Math.random() * 0.76),
      y: -size,
      vy: (H * BASE_SPEED) * (0.85 + Math.random() * 0.4) * (kind === 'gold' ? 1.12 : 1),
      size: size,
      kind: kind,
      bomb: kind === 'bomb',
      rot: (Math.random() - 0.5) * 0.35,
      vr: (Math.random() - 0.5) * 0.9,
      wob: Math.random() * Math.PI * 2
    });
  }

  function addFloat(x, y, text, color) {
    if (reduceMotion) return;
    floats.push({ x: x, y: y, text: text, color: color, life: 0.9 });
  }

  /* ---------- 绘制 ---------- */
  function draw(dt) {
    ctx.clearRect(0, 0, W, H);

    // 背景光晕
    var g = ctx.createRadialGradient(W * 0.5, H * 0.05, 0, W * 0.5, H * 0.05, H * 0.85);
    g.addColorStop(0, 'rgba(255,138,181,.10)');
    g.addColorStop(1, 'rgba(255,138,181,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 地面线
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, H - 18);
    ctx.lineTo(W * 0.94, H - 18);
    ctx.stroke();

    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 掉落物
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.y += it.vy * speedNow() * dt;
      it.wob += dt * 2.4;
      it.x += Math.sin(it.wob) * 12 * dt;
      it.rot += it.vr * dt;

      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      if (it.bomb) {
        ctx.shadowColor = 'rgba(255,80,110,.55)';
        ctx.shadowBlur = 14;
        var bg = ctx.createLinearGradient(0, -it.size, 0, it.size);
        bg.addColorStop(0, '#3a2b46');
        bg.addColorStop(1, '#171022');
        ctx.fillStyle = bg;
        heartPath(ctx, 0, 0, it.size * 2.05);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,95,143,.75)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // 裂痕
        ctx.beginPath();
        ctx.moveTo(-it.size * 0.28, -it.size * 0.18);
        ctx.lineTo(-it.size * 0.04, it.size * 0.04);
        ctx.lineTo(-it.size * 0.2, it.size * 0.3);
        ctx.strokeStyle = 'rgba(255,95,143,.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (it.kind === 'gold') {
        // 金心：+3 分
        ctx.shadowColor = 'rgba(255,208,120,.85)';
        ctx.shadowBlur = 22;
        var gg = ctx.createLinearGradient(0, -it.size, 0, it.size);
        gg.addColorStop(0, '#fff5cf');
        gg.addColorStop(0.5, '#ffd469');
        gg.addColorStop(1, '#e09a2e');
        ctx.fillStyle = gg;
        heartPath(ctx, 0, 0, it.size * 2.05);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 小星星
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.moveTo(-it.size * 0.42, -it.size * 0.5);
        ctx.lineTo(-it.size * 0.33, -it.size * 0.34);
        ctx.lineTo(-it.size * 0.17, -it.size * 0.25);
        ctx.lineTo(-it.size * 0.33, -it.size * 0.16);
        ctx.lineTo(-it.size * 0.42, 0);
        ctx.lineTo(-it.size * 0.51, -it.size * 0.16);
        ctx.lineTo(-it.size * 0.67, -it.size * 0.25);
        ctx.lineTo(-it.size * 0.51, -it.size * 0.34);
        ctx.closePath();
        ctx.fill();
      } else {
        var hg = ctx.createLinearGradient(0, -it.size, 0, it.size);
        hg.addColorStop(0, '#ffb6ce');
        hg.addColorStop(0.55, '#ff6f9d');
        hg.addColorStop(1, '#e04b7d');
        ctx.shadowColor = 'rgba(255,95,143,.65)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = hg;
        heartPath(ctx, 0, 0, it.size * 2.05);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.beginPath();
        ctx.ellipse(-it.size * 0.34, -it.size * 0.34, it.size * 0.16, it.size * 0.10, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 篮子
    drawBasket(ctx, basketX * W, H - 58, basketW * W);

    // 浮动分数
    for (var f = floats.length - 1; f >= 0; f--) {
      var fl = floats[f];
      fl.life -= dt;
      fl.y -= 46 * dt;
      if (fl.life <= 0) { floats.splice(f, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, fl.life * 1.6));
      ctx.fillStyle = fl.color;
      ctx.font = '600 ' + Math.round(W * 0.045) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ---------- 逻辑 ---------- */
  /* 计时用真实时间（performance.now），不累加帧间隔：
     这样手机掉帧 / 卡一下也不会让一局变成 40 秒。 */
  function update(dt, now) {
    if (!startedAt) startedAt = now;
    timeLeft = Math.max(0, DURATION - (now - startedAt) / 1000);
    elapsed = DURATION - timeLeft;
    timeEl.textContent = Math.ceil(timeLeft);

    // 键盘
    var kv = (W * 0.85) * dt;
    if (keys.left) targetX -= kv / W;
    if (keys.right) targetX += kv / W;
    targetX = Math.max(0.07, Math.min(0.93, targetX));
    basketX += (targetX - basketX) * Math.min(1, dt * 14);

    // 生成：间隔按真实时间收紧（0.62s → 约 0.28s），跟帧率无关
    nextSpawn = Math.max(0.28, 0.62 - (elapsed / DURATION) * 0.34);
    if (!lastSpawnMs) lastSpawnMs = now;
    if (now - lastSpawnMs >= nextSpawn * 1000 && items.length < MAX_HEARTS) {
      lastSpawnMs = now;
      spawn();
    }

    // 速度台阶：走到 25% / 50% / 75% 时提示一句
    var pct = elapsed / DURATION;
    if (speedTick < 3 && pct >= (speedTick + 1) * 0.25) {
      speedTick++;
      addFloat(W * 0.5, H * 0.14, '又快了一点 ↑', '#ffd08a');
    }
    paintSpeed();

    var basketTop = H - 58;
    var halfW = basketW * W * 0.5;

    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var hitBand = it.y >= basketTop - it.size * 0.55 && it.y <= basketTop + 16;
      var sameX = Math.abs(it.x - basketX * W) < halfW + it.size * 0.35;

      if (hitBand && sameX) {
        if (it.bomb) {
          lives--;
          combo = 0;
          shake = reduceMotion ? 0 : 10;
          addFloat(it.x, it.y - 10, '闹别扭了 -1', '#ff6b6b');
          if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
          if (lives <= 0) { items.splice(i, 1); paintLives(); end('life'); return; }
        } else if (it.kind === 'gold') {
          combo++;
          caught++;
          bestCombo = Math.max(bestCombo, combo);
          score += 3;
          addFloat(it.x, it.y - 10, '+3', '#ffd469');
          if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
        } else {
          combo++;
          caught++;
          bestCombo = Math.max(bestCombo, combo);
          var gain = 1 + (combo >= 10 ? 2 : combo >= 5 ? 1 : 0);
          score += gain;
          addFloat(it.x, it.y - 10, '+' + gain, '#ffd08a');
          if (combo === 5 || combo === 10 || combo === 15 || combo === 20) {
            addFloat(basketX * W, H - 100, '连击 x' + combo, '#c4b5fd');
          }
        }
        items.splice(i, 1);
        paintHud();
        continue;
      }

      if (it.y - it.size > H) {
        items.splice(i, 1);
        if (!it.bomb) {
          missed++;
          if (combo > 0) { combo = 0; paintHud(); }
        }
      }
    }

    // 抖动衰减
    if (shake > 0) shake = Math.max(0, shake - dt * 46);

    if (timeLeft <= 0) { end('time'); return; }
  }

  function loop(ts) {
    if (state !== 'playing') return;
    if (!lastTs) lastTs = ts;
    // 帧率低的时候（手机省电、后台回来）也让世界按真实时间走，
    // 不然会出现「倒计时在走、爱心却几乎不动」的不公平情况
    var dt = Math.min(0.2, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt, ts);
    if (state !== 'playing') { draw(dt); return; }
    draw(dt);
    rafId = requestAnimationFrame(loop);
  }

  function paintHud() {
    scoreEl.textContent = score;
    comboEl.textContent = combo;
    paintLives();
  }

  function paintLives() {
    var s = '';
    for (var i = 0; i < LIVES; i++) s += (i < lives ? '♥' : '♡');
    livesEl.textContent = s || '♡';
  }

  /* 画布左上角那个「速度 x1.4」小标 */
  function paintSpeed() {
    if (!speedBadge) return;
    var s = 'x' + speedNow().toFixed(1);
    if (s === speedShown) return;
    speedShown = s;
    speedBadge.textContent = '速度 ' + s;
    speedBadge.classList.toggle('is-fast', speedNow() >= 1.6);
  }

  /* ---------- 开始 / 结束 ---------- */
  function reset() {
    items = []; floats = [];
    score = 0; combo = 0; bestCombo = 0; lives = LIVES;
    caught = 0; missed = 0; elapsed = 0;
    timeLeft = DURATION; lastSpawnMs = 0; shake = 0; ended = false;
    speedTick = 0; speedShown = '';
    if (speedBadge) { speedBadge.textContent = '速度 x1.0'; speedBadge.classList.remove('is-fast'); }
    startedAt = 0; pausedAt = 0;
    basketX = targetX = 0.5;
    timeEl.textContent = DURATION;
    paintHud();
  }

  function start() {
    if (state === 'playing') return;
    resize();
    reset();
    state = 'playing';
    document.body.classList.add('game-playing');
    overlay.classList.add('is-hidden');
    lastTs = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  /* 切到别的窗口/App 时暂停，回来点「继续」接着玩，不用重头开始 */
  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    document.body.classList.remove('game-playing');
    pausedAt = performance.now();
    cancelAnimationFrame(rafId);
    kicker.textContent = 'PAUSED';
    oTitle.textContent = '先暂停一下';
    oText.textContent = '你切到别的地方了。剩余 ' + Math.ceil(timeLeft) + ' 秒，点「继续」接着来。';
    overlayBest.textContent = '当前得分：' + score;
    startBtn.textContent = '继续';
    overlay.classList.remove('is-hidden');
    draw(0);
  }

  function resume() {
    if (state !== 'paused') return;
    if (pausedAt) { startedAt += performance.now() - pausedAt; pausedAt = 0; }
    lastSpawnMs = performance.now();
    state = 'playing';
    document.body.classList.add('game-playing');
    overlay.classList.add('is-hidden');
    lastTs = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function end(reason) {
    if (state === 'over') return;
    state = 'over';
    document.body.classList.remove('game-playing');
    cancelAnimationFrame(rafId);

    // 记这一局：分是谁的、多少分、什么时候
    var who = player;
    var isNew = score > stats.best[who];
    stats.rounds.push({ by: who, score: score, ts: Date.now() });
    if (stats.rounds.length > 40) stats.rounds = stats.rounds.slice(-40);
    if (isNew) stats.best[who] = score;
    var next = who === 'me' ? 'her' : 'me';
    stats.last = next;                    // 下一局自动轮到另一个人
    saveStats();

    kicker.textContent = reason === 'life' ? 'OH NO' : 'TIME UP';
    if (score === 0) {
      oTitle.textContent = NAMES[who] + ' 一颗都没接住…';
      oText.textContent = '最高连击 ' + bestCombo + '。下一局从中间开始，慢慢来。';
    } else if (score < 10) {
      oTitle.textContent = NAMES[who] + ' 拿到 ' + score + ' 分';
      oText.textContent = '最高连击 ' + bestCombo + '。连击到 5 以上，一颗心算 2 分；金心一颗 3 分。';
    } else if (score < 25) {
      oTitle.textContent = NAMES[who] + ' 拿到 ' + score + ' 分，有点厉害';
      oText.textContent = '最高连击 ' + bestCombo + '，漏掉 ' + missed + ' 颗。';
    } else {
      oTitle.textContent = score + ' 分，全被你接住了';
      oText.textContent = '最高连击 ' + bestCombo + '。看来' + (who === 'me' ? '你' : '你') + '真的很会接住我。';
    }

    var leadTxt;
    if (stats.best.me === stats.best.her) leadTxt = '现在平手';
    else leadTxt = (stats.best.me > stats.best.her ? NAMES.me : NAMES.her) + ' 领先 ' + Math.abs(stats.best.me - stats.best.her) + ' 分';

    overlayBest.textContent =
      NAMES.me + ' ' + stats.best.me + ' : ' + stats.best.her + ' ' + NAMES.her + ' · ' + leadTxt +
      (isNew ? '\n★ 这是 ' + NAMES[who] + ' 的新纪录' : '') +
      '\n下一局轮到 ' + NAMES[next] + '（点名字可以换）';

    startBtn.textContent = '再来一局';
    setPlayer(next);
    overlay.classList.remove('is-hidden');
    draw(0);
  }

  /* ---------- 交互 ---------- */
  function pointerX(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return Math.max(0.07, Math.min(0.93, cx / rect.width));
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'playing') return;
    targetX = pointerX(e);
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (state !== 'playing') return;
    if (e.buttons === 0 && e.pointerType === 'mouse') return; // 鼠标需按住拖
    targetX = pointerX(e);
  });

  canvas.addEventListener('touchstart', function (e) {
    if (state !== 'playing') return;
    e.preventDefault();
    targetX = pointerX(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (state !== 'playing') return;
    e.preventDefault();
    targetX = pointerX(e);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (state !== 'playing') {
      if ((e.key === 'Enter' || e.key === ' ') && !overlay.classList.contains('is-hidden')
          && document.activeElement === startBtn) return; // 交给按钮
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  startBtn.addEventListener('click', function () {
    if (state === 'paused') resume();
    else start();
  });

  // 选人：这一局谁玩（下一局会自动轮到另一个人）
  if (pickMe) pickMe.addEventListener('click', function () { if (state !== 'playing') setPlayer('me'); });
  if (pickHer) pickHer.addEventListener('click', function () { if (state !== 'playing') setPlayer('her'); });

  // 清空比分：点两次才真清
  if (scoreReset) {
    var resetArmed = 0;
    scoreReset.addEventListener('click', function () {
      if (!resetArmed) {
        resetArmed = 1;
        scoreReset.classList.add('is-armed');
        scoreReset.textContent = '再点一次就清空';
        setTimeout(function () {
          resetArmed = 0;
          scoreReset.classList.remove('is-armed');
          scoreReset.textContent = '清空比分';
        }, 3000);
        return;
      }
      resetArmed = 0;
      stats = { best: { me: 0, her: 0 }, rounds: [], last: player };
      saveStats();
      scoreReset.classList.remove('is-armed');
      scoreReset.textContent = '清空比分';
      renderScore();
      paintPlayer();
    });
  }

  window.addEventListener('resize', function () { resize(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });

  /* ---------- 初始化 ---------- */
  stats = loadStats();
  setPlayer(stats.last, false);
  overlayBest.textContent = stats.best.me || stats.best.her
    ? NAMES.me + ' ' + stats.best.me + ' : ' + stats.best.her + ' ' + NAMES.her + '\n这一局 ' + NAMES[player] + ' 先来'
    : '两个人轮流来，谁的分高谁赢';
  resize();
  paintHud();
  draw(0);

  /* 给章节导航用：切页时重新量画布 / 暂停
     peek 只是给自检脚本看的（当前掉落物位置），页面上用不到 */
  window.__game = {
    resize: resize,
    pause: pause,
    peek: function () {
      return {
        state: state,
        basketX: basketX,
        timeLeft: timeLeft,
        speed: speedNow(),
        items: items.map(function (it) {
          return { x: it.x / (W || 1), y: it.y, kind: it.kind };
        })
      };
    }
  };
})();
