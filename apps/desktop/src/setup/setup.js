// Lógica de la ventana de configuración (sin frameworks). Usa window.rhSetup del preload.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var api = window.rhSetup;

  function setStatus(el, text, kind) {
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  api.getConfig().then(function (cfg) {
    $('serverUrl').value = cfg.serverUrl || '';
    $('apiUrl').value = cfg.apiUrl || '';
    $('agentToken').value = cfg.agentToken || '';
    $('autoStart').checked = cfg.autoStart !== false;
    $('kiosk').checked = !!cfg.kiosk;
    $('ver').textContent = 'Versión ' + cfg.version;
    if (cfg.apiUrl) document.querySelector('details').open = true;
    $('cancelBtn').textContent = cfg.serverUrl ? 'Cancelar' : 'Salir';
    $('serverUrl').focus();
  });

  function testUrl() {
    var url = ($('apiUrl').value || $('serverUrl').value).trim();
    var el = $('testStatus');
    if (!url) { setStatus(el, 'Escribe la dirección del sistema', 'err'); return Promise.resolve(false); }
    setStatus(el, 'Probando conexión…');
    $('testBtn').disabled = true;
    return api.test(url).then(function (r) {
      setStatus(el, (r.ok ? '✓ ' : '✗ ') + r.message, r.ok ? 'ok' : 'err');
      return r.ok;
    }).catch(function (e) {
      setStatus(el, '✗ ' + e.message, 'err');
      return false;
    }).finally(function () { $('testBtn').disabled = false; });
  }

  $('testBtn').addEventListener('click', testUrl);
  $('cancelBtn').addEventListener('click', function () { api.cancel(); });

  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var saveStatus = $('saveStatus');
    $('saveBtn').disabled = true;
    testUrl().then(function (ok) {
      if (!ok && !window.confirm('No se pudo verificar el servidor. ¿Guardar de todos modos?')) return;
      setStatus(saveStatus, 'Guardando…');
      return api.save({
        serverUrl: $('serverUrl').value,
        apiUrl: $('apiUrl').value,
        agentToken: $('agentToken').value,
        autoStart: $('autoStart').checked,
        kiosk: $('kiosk').checked,
      }).catch(function (e) { setStatus(saveStatus, '✗ ' + e.message, 'err'); });
    }).finally(function () { $('saveBtn').disabled = false; });
  });
})();
