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
