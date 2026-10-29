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
  load(root + 'data/site.js?t=' + Date.now())
    .then(() => load(root + 'assets/' + view + '.js'))
    .then(() => load(root + 'assets/dream.js'));
})();
