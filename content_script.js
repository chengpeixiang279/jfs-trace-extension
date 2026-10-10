// JFS 请求抓包器 - Chrome 扩展版（MAIN world 直接注入）
(function () {
  'use strict';

  if (window.__jfsTraceInstalled) return;
  window.__jfsTraceInstalled = true;

  const MAX = 2000;
  const EXCLUDE_URLS = [
    '/jfs-report-leader/userAccessLog',
    '/basicdata/checkToken',
    '/notice/web/getUserReadStatus',
  ];

  const store = [];
  window.__jfsTrace = store;

  function shouldSkip(url) {
    if (!url) return true;
    return EXCLUDE_URLS.some(k => url.includes(k));
  }

  function push(entry) {
    if (shouldSkip(entry.url)) return;
    entry.ts = new Date().toLocaleString();
    store.unshift(entry);
    if (store.length > MAX) store.pop();
    renderBadge();
  }

  // ============ 拦截 XHR ============
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__req = { method, url };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const req = this.__req || {};
    const entry = {
      type: 'xhr',
      method: req.method,
      url: req.url,
      requestBody: body,
      status: null,
      responseBody: null,
    };
    this.addEventListener('load', function () {
      entry.status = this.status;
      try { entry.responseBody = this.responseText; } catch (e) {}
      push(entry);
    });
    this.addEventListener('error', function () {
      entry.status = 0;
      entry.responseBody = '[network error]';
      push(entry);
    });
    return origSend.apply(this, arguments);
  };

  // ============ 拦截 fetch ============
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || (input && input.method) || 'GET';
    const body = init && init.body;
    const entry = { type: 'fetch', method, url, requestBody: body, status: null, responseBody: null };
    try {
      const resp = await origFetch.apply(this, arguments);
      entry.status = resp.status;
      try { entry.responseBody = await resp.clone().text(); } catch (e) {}
      push(entry);
      return resp;
    } catch (e) {
      entry.status = 0;
      entry.responseBody = '[fetch error: ' + e.message + ']';
      push(entry);
      throw e;
    }
  };

  // ============ 可拖动逻辑 ============
  function makeDraggable(el, handle, storageKey) {
    let startX, startY, origX, origY, dragging = false, moved = false;

    // Restore saved position
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved) {
        el.style.left = saved.left + 'px';
        el.style.top = saved.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    } catch (e) {}

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      let nx = origX + dx;
      let ny = origY + dy;
      // Keep within viewport
      nx = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, nx));
      ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, ny));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (dragging && moved) {
        // Save position
        const rect = el.getBoundingClientRect();
        try {
          localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (e) {}
      }
      dragging = false;
    });

    return () => moved;  // return whether last action was a drag
  }

  // ============ 悬浮 UI ============
  function initUI() {
    if (document.getElementById('__jfs_float')) return;

    // Default position: bottom-right
    const floatBtn = document.createElement('div');
    floatBtn.id = '__jfs_float';
    floatBtn.style.cssText = `
      position:fixed;right:16px;bottom:16px;z-index:2147483647;
      width:56px;height:56px;border-radius:50%;
      background:#1677ff;color:#fff;font-size:12px;
      display:flex;align-items:center;justify-content:center;
      cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,.3);
      font-family:Arial,sans-serif;text-align:center;line-height:1.2;
      user-select:none;
    `;
    floatBtn.textContent = '0';
    document.body.appendChild(floatBtn);

    const panel = document.createElement('div');
    panel.id = '__jfs_panel';
    panel.style.cssText = `
      position:fixed;right:16px;bottom:84px;z-index:2147483646;
      width:680px;max-width:90vw;max-height:70vh;background:#fff;color:#333;
      border:1px solid #ddd;border-radius:6px;display:none;
      flex-direction:column;font-family:Menlo,Consolas,monospace;font-size:12px;
      box-shadow:0 4px 16px rgba(0,0,0,.2);
    `;
    panel.innerHTML = `
      <div id="__jfs_panel_header" style="padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;cursor:grab;">
        <strong style="flex:1;cursor:grab;">JFS 请求抓包 ✥</strong>
        <input id="jfs-search" placeholder="URL 过滤" style="padding:4px 8px;width:160px;font-size:12px;cursor:text;"/>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="jfs-failonly"/> 只看失败</label>
        <button id="jfs-export" style="padding:4px 12px;background:#52c41a;color:#fff;border:none;cursor:pointer;">导出 JSON</button>
        <button id="jfs-clear" style="padding:4px 12px;background:#ff4d4f;color:#fff;border:none;cursor:pointer;">清空</button>
      </div>
      <div id="jfs-list" style="flex:1;overflow-y:auto;padding:4px;"></div>
    `;
    document.body.appendChild(panel);

    // Make float button draggable; distinguish drag vs click
    const wasFloatDrag = makeDraggable(floatBtn, floatBtn, 'jfs_float_pos');
    floatBtn.onclick = (e) => {
      if (wasFloatDrag()) return;  // was a drag, don't toggle
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      if (panel.style.display === 'flex') renderList();
    };

    // Make panel draggable via header
    const header = document.getElementById('__jfs_panel_header');
    makeDraggable(panel, header, 'jfs_panel_pos');

    document.getElementById('jfs-search').oninput = renderList;
    document.getElementById('jfs-failonly').onchange = renderList;
    document.getElementById('jfs-clear').onclick = () => { store.length = 0; renderList(); renderBadge(); };
    document.getElementById('jfs-export').onclick = () => {
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jfs-trace-${Date.now()}.json`;
      a.click();
    };
  }

  function isFail(e) {
    if (e.status >= 400) return true;
    if (e.responseBody && /"code"\s*:\s*(-?[0-9]+)/.test(e.responseBody)) {
      const m = e.responseBody.match(/"code"\s*:\s*(-?[0-9]+)/);
      if (m && parseInt(m[1]) !== 1 && parseInt(m[1]) !== 0) return true;
    }
    return false;
  }

  function summarize(s) {
    if (s == null) return '(empty)';
    s = String(s);
    return s.length > 8000 ? s.slice(0, 8000) + '\n...[TRUNC]' : s;
  }
  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderList() {
    const list = document.getElementById('jfs-list');
    if (!list) return;
    const q = (document.getElementById('jfs-search').value || '').toLowerCase();
    const failOnly = document.getElementById('jfs-failonly').checked;
    list.innerHTML = '';
    store
      .filter(e => !q || (e.url || '').toLowerCase().includes(q))
      .filter(e => !failOnly || isFail(e))
      .slice(0, 200)
      .forEach((e) => {
        const row = document.createElement('div');
        row.style.cssText = `padding:6px;border-bottom:1px solid #eee;cursor:pointer;
          background:${isFail(e) ? '#fff1f0' : 'transparent'};`;
        const url = (e.url || '').replace(location.origin, '').replace('https://gw.jtcargo.com.br', '');
        row.innerHTML = `<div><b>${e.method}</b> [${e.status}] ${escapeHtml(url)}</div><div style="color:#999;font-size:11px;">${e.ts}</div>`;
        row.onclick = () => {
          let detail = row.querySelector('.__jfs_detail');
          if (detail) { detail.remove(); return; }
          detail = document.createElement('div');
          detail.className = '__jfs_detail';
          detail.style.cssText = 'padding:8px;background:#fafafa;margin-top:4px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow:auto;';
          detail.innerHTML = `<div style="color:#999;">--- REQUEST ---</div>${escapeHtml(summarize(e.requestBody))}
<div style="color:#999;margin-top:6px;">--- RESPONSE ---</div>${escapeHtml(summarize(e.responseBody))}`;
          row.appendChild(detail);
        };
        list.appendChild(row);
      });
  }

  function renderBadge() {
    const btn = document.getElementById('__jfs_float');
    if (!btn) return;
    btn.textContent = store.length + '';
    const hasFail = store.some(isFail);
    btn.style.background = hasFail ? '#ff4d4f' : '#1677ff';
  }

  // Wait for DOM ready then init UI
  if (document.body) initUI();
  else document.addEventListener('DOMContentLoaded', initUI);
})();
