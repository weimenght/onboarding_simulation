(function () {
  // Keeps a page's text in Traditional Chinese while it is on: text nodes, a few attributes, the title and canvas text.
  // opts.hk === false: plain text replacement (used for English), no Hong Kong font or <html lang> change.
  window.DLHantDOM = function (convert, opts) {
    var HK = !(opts && opts.hk === false);
    var on = false, mo = null, busy = false, lastTitle = null;
    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
    var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    var CJK = /[㐀-鿿]/;
    function skip(el) {
      for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
        if (SKIP[e.tagName] || e.isContentEditable || (e.hasAttribute && e.hasAttribute('data-no-hant'))) return true;
      }
      return false;
    }
    // Remember what we wrote so our own change isn't converted a second time.
    var mine = window.WeakMap ? new WeakMap() : null;
    function text(node) {
      var v = node.nodeValue;
      if (!v || !CJK.test(v) || (mine && mine.get(node) === v) || skip(node.parentNode)) return;
      var c = convert(v);
      if (mine) mine.set(node, c);
      if (c !== v) node.nodeValue = c;
    }
    function attrs(el) {
      if (el.nodeType !== 1) return;
      for (var i = 0; i < ATTRS.length; i++) {
        var v = el.getAttribute(ATTRS[i]);
        if (v && CJK.test(v) && el.getAttribute('data-hant-' + ATTRS[i]) !== v) { var c = convert(v); el.setAttribute('data-hant-' + ATTRS[i], c); if (c !== v) el.setAttribute(ATTRS[i], c); }
      }
      if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && CJK.test(el.value)) el.value = convert(el.value);
    }
    function walk(root) {
      if (!root) return;
      if (root.nodeType === 3) { text(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 9) return;
      if (root.nodeType === 1) { if (SKIP[root.tagName]) return; attrs(root); }
      var w = document.createTreeWalker(root, 5 /* element | text */, null, false), n;
      while ((n = w.nextNode())) { if (n.nodeType === 3) text(n); else attrs(n); }
    }
    function fixLang() {
      var h = document.documentElement;
      if (HK && /^zh/i.test(h.lang) && h.lang !== 'zh-HK') h.lang = 'zh-HK';
      if (CJK.test(document.title) && document.title !== lastTitle) { lastTitle = convert(document.title); if (lastTitle !== document.title) document.title = lastTitle; }
    }
    var drawPatched = false;
    function patchCanvas() {
      if (drawPatched || !window.CanvasRenderingContext2D) return; drawPatched = true;
      var P = CanvasRenderingContext2D.prototype;
      ['fillText', 'strokeText', 'measureText'].forEach(function (m) {
        var orig = P[m]; if (!orig) return;
        P[m] = function (s) { if (on && typeof s === 'string' && CJK.test(s)) { var a = Array.prototype.slice.call(arguments); a[0] = convert(s); return orig.apply(this, a); } return orig.apply(this, arguments); };
      });
    }
    // Hong Kong character shapes: load Noto Sans HK under the name the pages already use ('Noto Sans SC').
    // Faces defined later win, so the pages need no other change; system fonts stay as fallbacks.
    var HK_FONT = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-hk@5.2.9/';
    function hkFont() {
      if (window.__dlHkFont || !window.fetch) return; window.__dlHkFont = 1;
      [400, 500, 700, 900].forEach(function (w) {
        fetch(HK_FONT + w + '.css').then(function (r) { return r.ok ? r.text() : ''; }).then(function (css) {
          if (!css) return;
          var st = document.createElement('style'); st.setAttribute('data-dl', 'hk-font');
          st.textContent = css.replace(/'Noto Sans HK'/g, "'Noto Sans SC'").replace(/url\(\.\/files\//g, 'url(' + HK_FONT + 'files/');
          (document.head || document.documentElement).appendChild(st);
        }, function () {});
      });
    }
    function start() {
      if (on) return; on = true; if (HK) { patchCanvas(); hkFont(); }
      busy = true; walk(document.body || document.documentElement); fixLang(); busy = false;
      if (!window.MutationObserver) return;
      mo = new MutationObserver(function (muts) {
        if (busy) return; busy = true;
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'characterData') text(m.target);
          else if (m.type === 'attributes') { if (m.attributeName === 'lang') fixLang(); else attrs(m.target); }
          else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
        fixLang(); busy = false;
      });
      mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['lang']) });
      var head = document.querySelector('title'); if (head) mo.observe(head, { childList: true, characterData: true, subtree: true });
    }
    function stop() { on = false; if (mo) { mo.disconnect(); mo = null; } }
    return { start: start, stop: stop, isOn: function () { return on; } };
  };
})();

(function () {
  var H = null, w = window, i;
  for (i = 0; i < 8; i++) {
    try { if (w.DL && w.DL.__dl) { H = w.DL; break; } } catch (e) {}
    try { if (w === w.parent) break; w = w.parent; } catch (e) { break; }
  }
  window.DLH = H;
  if (!window.tailwind) window.tailwind = {};
  window.DLR = function (r) { return H ? H.url(r) : 'about:blank'; };
  window.DLA = function (p) { return H ? H.asset(p) : p; };
  window.DLLINK = function (r) { return H ? H.link(r) : ''; };
  // Staff gate: accounts outside the super admin / station host lists are signed out.
  window.DLGuard = function (client, showErr) {
    if (!H || !H.roleOf) return true;
    var email = null;
    try {
      for (var k in localStorage) {
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k));
          var u = v && (v.user || (v.currentSession && v.currentSession.user));
          if (u && u.email) email = u.email;
        }
      }
    } catch (e) {}
    if (email === null || H.roleOf(email)) return true;
    try { client && client.auth && client.auth.signOut(); } catch (e) {}
    try { showErr && showErr(H.deniedText()); } catch (e) {}
    return false;
  };
  if (!H) return;

  // ---------- language: one site-wide setting (EN / 简 / 繁) ----------
  // Pages start in it (DLTwo gives older pages their 'en' / 'zh'), and a page's own EN/中 toggle updates it.
  // 中 means the visitor's last Chinese: Simplified or Traditional (Hong Kong). Traditional is drawn live from Simplified.
  window.DLTwo = function (fallback) { try { if (H.lang) return H.lang() === 'en' ? 'en' : 'zh'; } catch (e) {} return fallback; };
  if (H.lang) {
    var navLang = function () { var l = H.lang(); return l === 'en' ? 'en-US' : l === 'zh-Hant' ? 'zh-HK' : 'zh-CN'; };
    try {
      Object.defineProperty(navigator, 'language', { get: navLang, configurable: true });
      Object.defineProperty(navigator, 'languages', { get: function () { return [navLang()]; }, configurable: true });
    } catch (e) {}
    var wantFrom = function (two) { return two === 'en' ? 'en' : (H.lastZh ? H.lastZh() : 'zh-Hans'); };
    var tell = function (two) { try { if (two && wantFrom(two) !== H.lang()) H.setLang(wantFrom(two), window); } catch (e) {} };
    window.DLLangSet = tell;
    // Pages that remember their toggle in storage...
    var LANG_KEYS = { participant_lang: 1, admin_lang: 1, kc_live_lang: 1, deloitte_journey_lang: 1 };
    try {
      var protoSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        protoSet.call(this, k, v);
        try {
          if (this !== window.localStorage) return;
          if (LANG_KEYS[k] && (v === 'zh' || v === 'en')) tell(v);
          else if (k === 'PROJECT_SUNRISE_STATE_V3' || k === 'drush_settings') { var o = JSON.parse(v); if (o && (o.lang === 'zh' || o.lang === 'en')) tell(o.lang); }
        } catch (e) {}
      };
    } catch (e) {}
    // ...and pages that mark the switch on <html lang>.
    var htmlLang = document.documentElement.getAttribute('lang') || '';
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var v = document.documentElement.getAttribute('lang') || '';
        if (v === htmlLang) return; htmlLang = v;
        if (/^en/i.test(v)) tell('en'); else if (/^zh/i.test(v)) tell('zh');
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    // Traditional Chinese, live. A page may add its own Hong Kong wording (DLCanto: exact lines and patterns),
    // checked before the standard conversion. DLHantText converts a string the same way, for page code.
    var hantConv = function (s) {
      var C = window.DLCanto;
      if (C && s) {
        var k = String(s).trim();
        if (C.text && Object.prototype.hasOwnProperty.call(C.text, k)) return String(s).replace(k, C.text[k]);
        for (var i = 0; C.patterns && i < C.patterns.length; i++) if (C.patterns[i][0].test(k)) return String(s).replace(k, k.replace(C.patterns[i][0], C.patterns[i][1]));
      }
      return H.toHant(s);
    };
    window.DLHantText = function (s) { try { return H.lang() === 'zh-Hant' ? hantConv(s) : s; } catch (e) { return s; } };
    var hantDom = null;
    var syncHant = function (l, prev, src) {
      if (l === 'zh-Hant') {
        if (!hantDom && window.DLHantDOM && H.toHant) hantDom = DLHantDOM(hantConv);
        if (hantDom) { if (document.body) hantDom.start(); else document.addEventListener('DOMContentLoaded', function () { hantDom.start(); }); }
      } else if (hantDom && hantDom.isOn()) {
        hantDom.stop();
        // Converted text can't be turned back; a page that switched itself re-renders, others are reloaded by the shell.
        if (src === window && l !== 'en') location.reload();
      }
    };
    syncHant(H.lang());
    if (H.onLang) H.onLang(syncHant, window);
    // English: pages with Chinese-only lines can list English for them (DLEnglish), applied live.
    var startEnglish = function () {
      if (!window.DLEnglish || H.lang() !== 'en' || !window.DLHantDOM) return;
      var EN = window.DLEnglish;
      var enConv = function (s) { var k = String(s).trim(); return Object.prototype.hasOwnProperty.call(EN, k) ? String(s).replace(k, EN[k]) : s; };
      DLHantDOM(enConv, { hk: false }).start();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEnglish); else startEnglish();
  }

  var nativeFetch = window.fetch;
  // Two different info.txt files exist: the game file (Sunrise data, [GAME] section) next to the suite,
  // and the hub's text file (A1/info.txt). Each page gets the right one, from the server when present,
  // otherwise from the copy built into the HTML.
  function infoTxt(input, init) {
    var hub = window.DL_MODULE === 'hub';
    var q = (String(input).match(/\?.*$/) || [''])[0];
    var names = hub ? ['info.txt', 'A1/info.txt'] : ['../info.txt', 'info.txt'];
    function fits(txt) {
      var game = /^\s*\[(GAME|SUPABASE)\]\s*$/im.test(txt);
      return hub ? (!game && /=/.test(txt)) : game;
    }
    function reply(txt) { return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    function next(i) {
      if (i >= names.length) return Promise.resolve(reply(hub ? (H.hubInfo ? H.hubInfo() : '') : H.info()));
      var abs = H.resolve(names[i]);
      if (!abs) return next(i + 1);
      return nativeFetch.call(window, abs + q, init).then(function (r) {
        var ct = (r.headers && r.headers.get('content-type')) || '';
        return r.ok && !/html/i.test(ct) ? r.text() : null;
      }).then(function (txt) { return txt && fits(txt) ? reply(txt) : next(i + 1); }, function () { return next(i + 1); });
    }
    return next(0);
  }
  if (nativeFetch) {
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string' && !/^(?:[a-z][a-z0-9+.\-]*:|\/\/)/i.test(input)) {
          var isInfo = /(^|\/)info\.txt([?#]|$)/i.test(input);
          if (isInfo) return infoTxt(input, init);
          var abs = H.resolve(input);
          return abs ? nativeFetch.call(window, abs, init) : Promise.reject(new Error('no-base'));
        }
      } catch (e) {}
      return nativeFetch.apply(window, arguments);
    };
  }

  // Hide in-page links to suite pages this viewer can't open (e.g. a station host's console links to Sunrise).
  function hideBlocked() {
    if (!H.allowed) return;
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      if (as[i].hasAttribute('data-dl-external')) continue;
      var r = H.map(as[i].getAttribute('href'));
      if (!r) continue;
      var off = !H.allowed(r);
      if (off !== (as[i].getAttribute('data-dl-blocked') === '1')) {
        as[i].setAttribute('data-dl-blocked', off ? '1' : '0');
        as[i].style.display = off ? 'none' : '';
      }
    }
  }
  function startHiding() {
    hideBlocked();
    if (window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () { if (queued) return; queued = true; setTimeout(function () { queued = false; hideBlocked(); }, 50); })
        .observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startHiding); else startHiding();
  window.DLRefreshLinks = hideBlocked;

  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || (ev.button && ev.button !== 0)) return;
    var t = ev.target;
    while (t && t.nodeType === 1 && t.tagName !== 'A') t = t.parentNode;
    if (!t || t.tagName !== 'A' || t.hasAttribute('data-dl-external')) return;
    var r = H.map(t.getAttribute('href'));
    if (!r) return;
    ev.preventDefault();
    if (H.allowed && !H.allowed(r)) return;
    H.go(r, { newTab: !!(ev.metaKey || ev.ctrlKey || ev.shiftKey) });
  }, false);
})();
