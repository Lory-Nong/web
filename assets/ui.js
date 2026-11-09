window.UI = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const rich = (text) => esc(text)
    .replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" role="button" tabindex="0" aria-label="스포일러, 눌러서 보기">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

  const store = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
  };

  const favs = {
    all: () => store.get('lul-favs', []),
    has: (slug) => favs.all().includes(slug),
    toggle(slug) {
      const list = favs.all();
      const on = !list.includes(slug);
      store.set('lul-favs', on ? [...list, slug] : list.filter((s) => s !== slug));
      return on;
    }
  };

  const recent = {
    all: () => store.get('lul-recent', []),
    add(slug) {
      store.set('lul-recent', [slug, ...recent.all().filter((s) => s !== slug)].slice(0, 30));
    }
  };

  const root = document.documentElement;
  const theme = {
    current: () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    toggle() {
      const next = theme.current() === 'dark' ? 'light' : 'dark';
      root.classList.add('theming');
      root.dataset.theme = next;
      try {
        localStorage.setItem('lul-theme', next);
      } catch {}
      setTimeout(() => root.classList.remove('theming'), 450);
      return next;
    }
  };

  const icon = (body, fill = 'none') => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icons = {
    heart: icon('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 22l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    share: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 0 0 5.7 5.7l1.5-1.5"/>'),
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    up: icon('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
    search: icon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    dice: icon('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    close: icon('<path d="M6 6l12 12M18 6L6 18"/>')
  };

  let bar = null;
  let timer = null;
  const toast = (message) => {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ui-toast';
      bar.setAttribute('role', 'status');
      document.body.appendChild(bar);
    }
    bar.textContent = message;
    bar.offsetWidth;
    bar.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => bar.classList.remove('on'), 2600);
  };

  const share = async (title) => {
    const url = location.href;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('링크를 복사했어요.');
    } catch {
      toast('링크를 복사하지 못했어요.');
    }
  };

  return { esc, rich, store, favs, recent, theme, icons, toast, share };
})();
