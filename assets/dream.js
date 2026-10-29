if (location.protocol === 'file:') {
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!/^[a-z]+:/i.test(href) && href.endsWith('/')) a.setAttribute('href', href + 'index.html');
  });
}

const io = new IntersectionObserver((entries) => {
  entries.filter((e) => e.isIntersecting).forEach((e, i) => {
    e.target.style.transitionDelay = i * 0.15 + 's';
    e.target.classList.add('show');
    io.unobserve(e.target);
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

const custom = window.SITE && Array.isArray(window.SITE.whispers) ? window.SITE.whispers.filter(Boolean) : [];
const whispers = custom.length ? custom : ['깨어나', '여기는 꿈이 아니야', '누가 보고 있어', '돌아갈 수 없어', '아직 거기 있니', '문을 열지 마', '너를 기억하고 있어', '눈을 감아'];
const marks = Array.from({ length: 112 }, (_, i) => String.fromCharCode(0x300 + i));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const dwell = new Map();
let busy = false;
let last = 0;

const creep = (text) => {
  const phrase = pick(whispers);
  let out = phrase;
  while (out.length < text.length) out += ' ' + phrase;
  return [...out.slice(0, Math.max(text.length, phrase.length))]
    .map((c) => c === ' ' ? c : c + Array.from({ length: Math.floor(Math.random() * 3) }, () => pick(marks)).join(''))
    .join('');
};

const glitch = (el) => {
  busy = true;
  const html = el.innerHTML;
  el.style.height = el.offsetHeight + 'px';
  el.textContent = creep(el.textContent.trim());
  el.classList.add('glitch');
  setTimeout(() => {
    el.innerHTML = html;
    el.classList.remove('glitch');
    el.style.height = '';
    busy = false;
  }, 100);
};

const zone = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) dwell.set(e.target, performance.now());
    else dwell.delete(e.target);
  });
}, { threshold: 0.5, rootMargin: '-15% 0px -15% 0px' });

document.querySelectorAll('h1, h2, h3, p, dd').forEach((el) => zone.observe(el));

setInterval(() => {
  const now = performance.now();
  if (busy || calm.matches || document.hidden || now - last < 6000) return;
  for (const [el, since] of dwell) {
    if (now - since < 5000) continue;
    dwell.set(el, now);
    if (Math.random() < 0.35) {
      glitch(el);
      last = now;
      break;
    }
  }
}, 500);
