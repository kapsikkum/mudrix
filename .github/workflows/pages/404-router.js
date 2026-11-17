// GitHub Pages has one 404.html per site, but the site holds two apps: the stable client at the
// root and the next build under next/. A deep link (/r/!room, /next/r/!room) has no file, so this
// loads the index.html of the app the path belongs to and lets its router take over. It is an
// external file because the client's policy does not allow inline scripts.
(function () {
  var root = '__BASE__';
  var next = root + 'next/';
  var target = location.pathname.indexOf(next) === 0 ? next : root;
  fetch(target + 'index.html', { credentials: 'same-origin' })
    .then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    })
    .then(function (html) {
      document.open();
      document.write(html);
      document.close();
    })
    .catch(function () {
      // No such app to load (say next/ was never deployed): go to the site's front page.
      location.replace(root);
    });
})();
