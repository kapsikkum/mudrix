(function () {
  var params = new URLSearchParams(location.search);
  function label(id, key) {
    var value = params.get(key);
    if (value) document.getElementById(id).textContent = value;
  }
  label('title', 'title');
  label('back', 'back');
  label('stop', 'stop');
  var title = document.getElementById('title');
  title.title = title.textContent;

  // The Tauri IPC global is injected into every webview of the shell.
  function call(cmd) {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return;
    Promise.resolve(internals.invoke(cmd)).catch(function (err) {
      console.warn('[screenshare-bar] ' + cmd + ' failed', err);
    });
  }
  document.getElementById('back').addEventListener('click', function () {
    call('screen_share_bar_return');
  });
  document.getElementById('stop').addEventListener('click', function () {
    call('screen_share_bar_stop');
  });
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });
})();
