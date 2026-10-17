(function () {
  'use strict';
  var API = '/api/v1';
  var $ = function (s) { return document.querySelector(s); };
  var tbody = $('#channels tbody');
  var csrfToken = '';

  function msg(t) { $('#msg').textContent = t || ''; }

  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    if (opts.method && opts.method !== 'GET') {
      opts.headers = opts.headers || {};
      if (csrfToken) {
        opts.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    var res = await fetch(API + path, opts);
    var body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      if (res.status === 401 && path !== '/auth/login') {
        csrfToken = '';
        $('#logout-btn').hidden = true;
        $('#login-modal').showModal();
      }
      throw new Error((body && body.error) || ('HTTP ' + res.status));
    }
    return body;
  }

  function m3uURL() { return location.origin + '/iptv/channels.m3u'; }
  function streamURL(c) { return location.origin + '/channels/' + c.id + '/live.m3u8'; }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); msg(''); alert('Copied: ' + text); }
    catch (e) { window.prompt('Copy URL:', text); }
  }

  function cell(tr, text) { var td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }
  function button(label, cls, fn) {
    var b = document.createElement('button');
    b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); return b;
  }

  function render(chs) {
    tbody.textContent = '';
    $('#empty').hidden = chs.length > 0;
    chs.forEach(function (c) {
      var tr = document.createElement('tr');
      cell(tr, c.number); cell(tr, c.name);
      var live = c.live === true || c.status === 'live';
      var st = cell(tr, '');
      var badge = document.createElement('span');
      badge.className = 'badge' + (live ? ' live' : '');
      badge.textContent = live ? 'Live' : 'Idle';
      st.appendChild(badge);
      var act = document.createElement('td'); act.className = 'row-actions';
      var watch = document.createElement('a');
      watch.className = 'btn'; watch.textContent = 'Watch'; watch.href = '/static/player.html?id=' + c.id; watch.target = '_blank'; watch.rel = 'noopener';
      act.appendChild(watch);
      act.appendChild(button('Copy URL', '', function () { copy(streamURL(c)); }));
      act.appendChild(button('Delete', 'danger', function () { del(c); }));
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
  }

  async function load() {
    try { render(await api('/channels') || []); msg(''); } catch (e) { msg('Failed to load channels: ' + e.message); }
  }

  async function del(c) {
    if (!confirm('Delete channel ' + c.number + ' "' + c.name + '"?')) return;
    try { await api('/channels/' + c.id, { method: 'DELETE' }); load(); } catch (e) { msg(e.message); }
  }

  async function loadMedia() {
    var sel = $('#media'); sel.textContent = '';
    try {
      var items = await api('/media') || [];
      items.forEach(function (m) {
        var o = document.createElement('option');
        o.value = m.id; o.textContent = m.path || m.name || ('media ' + m.id); sel.appendChild(o);
      });
      $('#media-hint').textContent = items.length ? 'Select media to map into the channel playlist.' : 'No media indexed yet.';
    } catch (e) { $('#media-hint').textContent = 'Media list unavailable: ' + e.message; }
  }

  $('#add-btn').addEventListener('click', function () { $('#form').reset(); loadMedia(); $('#modal').showModal(); });
  $('#cancel').addEventListener('click', function () { $('#modal').close(); });
  $('#copy-m3u').addEventListener('click', function () { copy(m3uURL()); });

  $('#form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var f = ev.target;
    try {
      var ch = await api('/channels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: parseInt(f.number.value, 10), name: f.name.value.trim() })
      });
      var ids = Array.prototype.map.call(f.media.selectedOptions, function (o) { return parseInt(o.value, 10); });
      if (ids.length) {
        await api('/channels/' + ch.id + '/playlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ media_ids: ids })
        });
      }
      $('#modal').close(); msg(''); load();
    } catch (e) { msg(e.message); $('#modal').close(); }
  });

  var loginModal = $('#login-modal');
  var loginForm = $('#login-form');
  var logoutBtn = $('#logout-btn');

  loginForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var pwd = $('#login-password').value;
    try {
      var res = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      csrfToken = (res && res.csrf) || '';
      $('#login-msg').textContent = '';
      $('#login-password').value = '';
      loginModal.close();
      logoutBtn.hidden = false;
      msg('');
      load();
    } catch (e) {
      $('#login-msg').textContent = e.message;
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    csrfToken = '';
    logoutBtn.hidden = true;
    loginModal.showModal();
  });

  async function checkAuth() {
    try {
      var me = await api('/auth/me');
      if (me && me.authenticated) {
        csrfToken = me.csrf || '';
        logoutBtn.hidden = false;
      } else {
        csrfToken = '';
        logoutBtn.hidden = true;
        loginModal.showModal();
      }
    } catch (e) {
      loginModal.showModal();
    }
  }

  checkAuth();
  load();
  setInterval(load, 15000);
})();
