export const TREE_PATHS = [
  'M24.2 37V24',
  'M19.8 39.3c1.2-1.9 2.8-2.7 4.4-2.7s3.2.8 4.4 2.7',
  'M23.8 30.2c-2.8-.6-5.5-2.6-7.2-5-2-1.8-5.2-2-7-4.2-1.4-1.8-1.4-4.2 0-6 2-3 5.8-5.2 8.8-6.2 1.4-.5 2.8-1 4.2-1.3',
  'M14.8 23V13.2c0-1.4.8-2.6 2.4-3.4',
  'M24 24.2c-1.8-1.8-3.2-3.8-3.7-6.4-.5-2.6-.6-5.2-.3-7.2',
  'M24.3 23.2c1.5-3 3.5-6.4 4.3-10.2.4-2.6 1.2-4.1 2.8-4.3H35',
  'M24.6 25.7c3-.7 5.8-2.1 7.4-4.5 1.2-1.8 1.4-3.8 2.8-5.2 1.4-1.4 3.2-2.1 5.2-2.4',
];
export const MOTH_PATH = 'M19.5 12.4C17.5 9.5 14 5 10.8 3 9.6 2.4 8 2.2 6 2.3 4.2 2.4 3.1 3 3 4.8L3.1 9.8C3.2 12.4 5 15 8.3 17.3 6.6 19.5 5.6 21.8 5.4 24.2 5.2 26.2 5.8 27.6 7.3 28 8.8 28.3 10.2 27.3 11.4 25.8 14.2 22.6 17.2 19.8 19.5 17.1Z';

// One entrance per mounted hero. Data readiness is bounded; missing media/fonts
// must never leave navigation hidden. Animations never write inline styles.
export function enterRiverine(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [];
  let disposed = false, started = false, frame;
  const show = () => root.classList.remove('rv-waiting');
  const cancel = () => { show(); animations.forEach(a => a.cancel()); };
  const motionChange = () => { if (reduced.matches) cancel(); };
  reduced.addEventListener('change', motionChange);
  if (reduced.matches) show();
  else root.classList.add('rv-waiting');
  const timer = setTimeout(() => { started = true; show(); }, 3500);
  const animate = (selector, keyframes, delay, duration, easing) => {
    root.querySelectorAll(selector).forEach(el => animations.push(el.animate(keyframes, { delay, duration, easing, fill: 'backwards' })));
  };
  const start = () => {
    if (disposed || started) return;
    started = true; clearTimeout(timer);
    if (reduced.matches) { show(); return; }
    const expo = 'cubic-bezier(0.16, 1, 0.3, 1)', quart = 'cubic-bezier(0.25, 1, 0.5, 1)';
    const scale = (root.querySelector('.rv-cta')?.getBoundingClientRect().height || 46) / 46 * (innerWidth < 650 ? .8 : 1);
    const lift = y => [{ opacity: 0, transform: `translateY(${Math.round(y * scale)}px)` }, { opacity: 1, transform: 'translateY(0)' }];
    animate('.rv-logo', [{ opacity: 0 }, { opacity: 1 }], 0, 500, quart);
    root.querySelectorAll('.rv-tree path').forEach((path, i) => {
      const length = path.getTotalLength();
      animations.push(path.animate([{ strokeDasharray: `${length}`, strokeDashoffset: length }, { strokeDasharray: `${length}`, strokeDashoffset: 0 }], { delay: 80 + i * 45, duration: 820, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'backwards' }));
    });
    animate('.rv-moth', [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], 420, 650, expo);
    animate('.rv-nav, .rv-menu', lift(8), 120, 700, expo);
    root.querySelectorAll('.rv-nav > a').forEach((el, i) => animations.push(el.animate(lift(4), { delay: 260 + i * 45, duration: 700, easing: expo, fill: 'backwards' })));
    animate('.rv-playback', lift(8), 200, 700, expo);
    animate('.rv-brand', lift(10), 300, 650, expo);
    root.querySelectorAll('.rv-title-line > span').forEach((el, i) => animations.push(el.animate([{ transform: 'translateY(115%)' }, { transform: 'translateY(0)' }], { delay: 380 + i * 90, duration: 1050, easing: expo, fill: 'backwards' })));
    root.querySelectorAll('.rv-lede > span').forEach((el, i) => animations.push(el.animate(lift(14), { delay: 800 + i * 60, duration: 800, easing: expo, fill: 'backwards' })));
    animate('.rv-cta', lift(12), 1000, 800, expo);
    animate('.rv-discover', lift(8), 1100, 600, quart);
    animate('.rv-cue', lift(-6), 1250, 700, expo);
    animate('.rv-carousel-controls', lift(6), 1250, 700, expo);
    show();
    Promise.allSettled(animations.map(a => a.finished)).then(() => {
      if (disposed) return;
      animations.forEach(a => a.cancel());
      root.classList.add('rv-redraw');
      frame = requestAnimationFrame(() => root.classList.remove('rv-redraw'));
    });
  };
  let release;
  const firstImage = root.querySelector('.rv-slide.is-current img');
  const readyImage = new Promise(resolve => {
    release = resolve;
    if (!firstImage || firstImage.complete) resolve();
    else { firstImage.addEventListener('load', resolve, { once: true }); firstImage.addEventListener('error', resolve, { once: true }); }
  });
  Promise.all([document.fonts.ready, readyImage]).then(start);
  return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); firstImage?.removeEventListener('load', release); firstImage?.removeEventListener('error', release); reduced.removeEventListener('change', motionChange); cancel(); };
}
