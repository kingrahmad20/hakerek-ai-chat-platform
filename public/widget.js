/* Hakerek Chat Widget — paste before </body> on any website */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var BASE_URL = new URL(script.src).origin;
  var WIDGET_ID = 'hakerek-widget';

  // Prevent double-init
  if (document.getElementById(WIDGET_ID + '-btn')) return;

  /* ── Styles ── */
  var style = document.createElement('style');
  style.textContent = [
    '#' + WIDGET_ID + '-btn{',
    '  position:fixed;bottom:24px;right:24px;',
    '  width:56px;height:56px;border-radius:50%;',
    '  background:#3B82F6;border:none;cursor:pointer;',
    '  box-shadow:0 4px 16px rgba(0,0,0,.3);',
    '  z-index:2147483646;display:flex;align-items:center;',
    '  justify-content:center;transition:transform .2s,box-shadow .2s;',
    '  padding:0;',
    '}',
    '#' + WIDGET_ID + '-btn:hover{transform:scale(1.06);box-shadow:0 6px 20px rgba(0,0,0,.35);}',
    '#' + WIDGET_ID + '-btn.left{right:auto;left:24px;}',
    '#' + WIDGET_ID + '-frame{',
    '  position:fixed;bottom:90px;right:24px;',
    '  width:380px;height:600px;',
    '  max-height:calc(100vh - 110px);',
    '  border-radius:16px;border:none;',
    '  box-shadow:0 8px 40px rgba(0,0,0,.25);',
    '  z-index:2147483645;display:none;overflow:hidden;',
    '  transition:opacity .2s,transform .2s;',
    '  opacity:0;transform:translateY(8px) scale(.97);',
    '}',
    '#' + WIDGET_ID + '-frame.open{',
    '  display:block;opacity:1;transform:translateY(0) scale(1);',
    '}',
    '#' + WIDGET_ID + '-frame.left{right:auto;left:24px;}',
    '@media(max-width:480px){',
    '  #' + WIDGET_ID + '-frame{',
    '    width:calc(100vw - 16px);right:8px;left:8px;',
    '    bottom:90px;height:calc(100vh - 110px);border-radius:12px;',
    '  }',
    '  #' + WIDGET_ID + '-frame.left{right:8px;left:8px;}',
    '}',
  ].join('');
  document.head.appendChild(style);

  var ICON_CHAT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  var ICON_CLOSE = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  /* ── Fetch config & build widget ── */
  fetch(BASE_URL + '/api/widget/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (!cfg || !cfg.enabled) return;

      var isLeft = cfg.position === 'bottom-left';
      var color = cfg.color || '#3B82F6';
      var title = cfg.title || 'Chat';

      /* Button */
      var btn = document.createElement('button');
      btn.id = WIDGET_ID + '-btn';
      btn.setAttribute('aria-label', title);
      btn.setAttribute('title', title);
      btn.setAttribute('aria-expanded', 'false');
      btn.style.background = color;
      btn.innerHTML = ICON_CHAT;
      if (isLeft) btn.classList.add('left');

      /* Frame */
      var frame = document.createElement('iframe');
      frame.id = WIDGET_ID + '-frame';
      frame.src = BASE_URL + '/widget';
      frame.title = title;
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('allow', 'same-origin');
      if (isLeft) frame.classList.add('left');

      var open = false;

      function openWidget() {
        open = true;
        frame.classList.add('open');
        btn.innerHTML = ICON_CLOSE;
        btn.setAttribute('aria-expanded', 'true');
      }

      function closeWidget() {
        open = false;
        frame.classList.remove('open');
        btn.innerHTML = ICON_CHAT;
        btn.setAttribute('aria-expanded', 'false');
      }

      btn.addEventListener('click', function () {
        if (open) closeWidget(); else openWidget();
      });

      /* Close on Escape key */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && open) closeWidget();
      });

      document.body.appendChild(frame);
      document.body.appendChild(btn);
    })
    .catch(function () { /* silently skip if widget not available */ });
})();
