/* =========================================================
   照片加密解锁
   ---------------------------------------------------------
   公网托管时，photos/ 里放的是 photos/enc/*.bin（密文）和 photos/locked.json。
   打开页面先要口令，口令对了在浏览器里解密，再交给照片墙显示。
   仓库里、CDN 上只有乱码。

   本地双击 index.html（file://）不受影响：直接读 photos/*.jpg。
   ========================================================= */
(function () {
  'use strict';

  var MANIFEST = './photos/locked.json';
  var PASS_KEY = 'ourworld.lock.v1';
  var root = window.__photosReady = Promise.resolve();

  // 本地文件直接打开：不加密，照常显示
  if (location.protocol === 'file:' || !window.crypto || !window.crypto.subtle) return;

  function b64ToBytes(s) {
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function deriveKey(pass, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
      });
  }

  function openFile(key, url) {
    return fetch(url, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('取不到照片');
      return r.arrayBuffer();
    }).then(function (buf) {
      var all = new Uint8Array(buf);
      var iv = all.slice(0, 12);
      var tag = all.slice(12, 28);
      var ct = all.slice(28);
      var sealed = new Uint8Array(ct.length + tag.length);
      sealed.set(ct, 0);
      sealed.set(tag, ct.length);   // WebCrypto 要的是「密文+tag」连在一起
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, sealed);
    }).then(function (plain) {
      return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
    });
  }

  function applyToPhotos(map) {
    var list = window.PHOTOS || [];
    list.forEach(function (p) {
      var name = String(p.src || '').split('/').pop().replace(/\.[^.]+$/, '');
      if (map[name]) p.src = map[name];
    });
  }

  function styleOnce() {
    if (document.getElementById('unlockStyle')) return;
    var st = document.createElement('style');
    st.id = 'unlockStyle';
    st.textContent = [
      '.unlock{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;',
      'background:radial-gradient(120% 90% at 50% 0%,#1c1230,#0a0612 60%,#07040d);',
      'color:#f7effb;font-family:inherit;padding:24px}',
      '.unlock form{width:min(88vw,320px);text-align:center}',
      '.unlock h2{font-size:17px;font-weight:500;letter-spacing:.16em;color:#ffd7e4;margin:0 0 6px}',
      '.unlock p{font-size:12px;line-height:1.9;color:rgba(247,239,251,.5);margin:0 0 22px;letter-spacing:.06em}',
      '.unlock input{width:100%;box-sizing:border-box;padding:13px 16px;border-radius:12px;text-align:center;',
      'letter-spacing:.4em;font-size:16px;color:#fff;background:rgba(255,255,255,.05);',
      'border:1px solid rgba(255,255,255,.14);outline:none;font-family:inherit}',
      '.unlock input:focus{border-color:rgba(255,138,181,.6);background:rgba(255,138,181,.08)}',
      '.unlock button{margin-top:14px;width:100%;padding:13px;border-radius:12px;border:0;cursor:pointer;',
      'font-size:14px;letter-spacing:.2em;color:#2a1220;background:linear-gradient(180deg,#ffd0dd,#ff9dbb);font-family:inherit}',
      '.unlock .err{margin-top:14px;font-size:12px;color:#ff9dbb;letter-spacing:.08em}',
      '.unlock .tip{margin-top:18px;font-size:11px;color:rgba(247,239,251,.32)}'
    ].join('');
    document.head.appendChild(st);
  }

  function ask(manifest) {
    return new Promise(function (resolve) {
      styleOnce();
      var box = document.createElement('div');
      box.className = 'unlock';
      box.innerHTML =
        '<form>' +
        '  <h2>只给你一个人看</h2>' +
        '  <p>口令</p>' +
        '  <input type="password" inputmode="numeric" autocomplete="off" placeholder="····">' +
        '  <button type="submit">进去</button>' +
        '  <p class="err" hidden>口令不对，再想想</p>' +
        '  <p class="tip">照片在仓库里是加密的，口令只存在这台手机上</p>' +
        '</form>';
      document.body.appendChild(box);
      var input = box.querySelector('input');
      var err = box.querySelector('.err');
      var btn = box.querySelector('button');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 120);

      box.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var pass = input.value;
        if (!pass) return;
        btn.disabled = true;
        btn.textContent = '解开中…';
        err.hidden = true;
        var salt = b64ToBytes(manifest.salt);
        deriveKey(pass, salt, manifest.iter || 300000).then(function (key) {
          var first = manifest.files[0];
          return openFile(key, './photos/enc/' + first.b).then(function (url) {
            URL.revokeObjectURL(url);
            return key;
          });
        }).then(function (key) {
          try { localStorage.setItem(PASS_KEY, pass); } catch (e2) {}
          resolve({ key: key, pass: pass });
        }).catch(function () {
          btn.disabled = false;
          btn.textContent = '进去';
          err.hidden = false;
          input.select();
        });
      });
    });
  }

  function progress(text) {
    var p = document.querySelector('.unlock p');
    if (p) p.textContent = text;
  }

  function decryptAll(manifest, key) {
    var map = {};
    var done = 0;
    var list = manifest.files;
    return Promise.all(list.map(function (f) {
      return openFile(key, './photos/enc/' + f.b).then(function (url) {
        map[f.n] = url;
        done++;
        if (done < list.length) progress('正在解开 ' + done + '/' + list.length);
        return url;
      });
    })).then(function () {
      applyToPhotos(map);
      var box = document.querySelector('.unlock');
      if (box) box.remove();
      return true;
    });
  }

  root = window.__photosReady = fetch(MANIFEST, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (manifest) {
      if (!manifest || !manifest.files || !manifest.files.length) return false;   // 没加密：照常

      var saved = '';
      try { saved = localStorage.getItem(PASS_KEY) || ''; } catch (e) {}

      var start;
      if (saved) {
        start = deriveKey(saved, b64ToBytes(manifest.salt), manifest.iter || 300000)
          .then(function (key) {
            return openFile(key, './photos/enc/' + manifest.files[0].b)
              .then(function (u) { URL.revokeObjectURL(u); return key; });
          })
          .catch(function () {
            try { localStorage.removeItem(PASS_KEY); } catch (e) {}
            return ask(manifest).then(function (r) { return r.key; });
          });
      } else {
        start = ask(manifest).then(function (r) { return r.key; });
      }

      return start.then(function (key) { return decryptAll(manifest, key); });
    })
    .catch(function () { return false; });
})();
