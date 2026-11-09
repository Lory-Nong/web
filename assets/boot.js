(() => {
  const root = document.currentScript.dataset.root || '';
  const view = document.body.dataset.view;
  const load = (src) => new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = resolve;
    document.body.appendChild(s);
  });
  try {
    const theme = localStorage.getItem('lul-theme');
    if (theme) document.documentElement.dataset.theme = theme;
  } catch {}
  const minute = Math.floor(Date.now() / 60000);
  load(root + 'data/site.js?t=' + Date.now())
    .then(() => load(root + 'assets/ui.js?v=' + minute))
    .then(() => load(root + 'assets/' + view + '.js?v=' + minute))
    .then(() => load(root + 'assets/dream.js?v=' + minute));
})();
