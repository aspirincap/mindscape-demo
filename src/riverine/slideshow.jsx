import { useCallback, useEffect, useRef, useState } from 'react';
import fuji from '../assets/hero/01-fuji-clouds.webp';
import fujiSmall from '../assets/hero/01-fuji-clouds-960.webp';
import particles from '../assets/hero/02-particle-landscape.webp';
import particlesSmall from '../assets/hero/02-particle-landscape-960.webp';
import ocean from '../assets/hero/03-ocean-sanctuary.webp';
import oceanSmall from '../assets/hero/03-ocean-sanctuary-960.webp';
import canyon from '../assets/hero/04-canyon-dawn.webp';
import canyonSmall from '../assets/hero/04-canyon-dawn-960.webp';

export const HERO_SLIDES = [
  { name: '云海富士', src: fuji, small: fujiSmall, focus: '72% 42%' },
  { name: '流光地貌', src: particles, small: particlesSmall, focus: '68% 45%' },
  { name: '深蓝海境', src: ocean, small: oceanSmall, focus: '76% 45%' },
  { name: '峡谷晨光', src: canyon, small: canyonSmall, focus: '68% 45%' },
];
const HOLD_MS = 8000;
const FADE_MS = 2400;

export function useHeroSlideshow() {
  const [frame, setFrame] = useState({ current: 0, previous: null });
  const [ready, setReady] = useState([]);
  const [failed, setFailed] = useState([]);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(reduced);
  const [hidden, setHidden] = useState(document.hidden);
  const [focused, setFocused] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { setReduced(media.matches); if (media.matches) setPaused(true); };
    const visibility = () => setHidden(document.hidden);
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const failedImage = useCallback(index => {
    if (!mounted.current) return;
    setFailed(items => items.includes(index) ? items : [...items, index]);
    setReady(items => items.filter(value => value !== index));
  }, []);
  const loaded = useCallback(async (image, index) => {
    // A slide must be decoded before it can replace the visible background.
    try {
      await image.decode();
      if (mounted.current) {
        setReady(items => items.includes(index) ? items : [...items, index]);
        setFailed(items => items.filter(value => value !== index));
      }
    } catch {
      failedImage(index);
    }
  }, [failedImage]);
  const select = useCallback((index, manual = false) => {
    if (transitioning || !ready.includes(index)) return;
    if (manual) setPaused(true);
    if (index === frame.current) return;
    setFrame({ current: index, previous: reduced ? null : frame.current });
    setTransitioning(!reduced);
  }, [frame.current, ready, reduced, transitioning]);
  useEffect(() => {
    if (!failed.includes(frame.current) || !ready.length) return;
    setFrame({ current: ready[0], previous: null });
  }, [failed, ready, frame.current]);
  useEffect(() => {
    if (!transitioning) return;
    const timer = setTimeout(() => { setTransitioning(false); setFrame(value => ({ ...value, previous: null })); }, FADE_MS);
    return () => clearTimeout(timer);
  }, [transitioning]);
  useEffect(() => {
    if (paused || hidden || focused || transitioning || !ready.includes(frame.current) || ready.length < 2) return;
    const timer = setTimeout(() => {
      for (let step = 1; step < HERO_SLIDES.length; step++) {
        const next = (frame.current + step) % HERO_SLIDES.length;
        if (ready.includes(next)) { select(next); break; }
      }
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [paused, hidden, focused, transitioning, ready, frame.current, select]);
  return { ...frame, ready, transitioning, paused, running: !paused && !hidden && !focused, setPaused, setFocused, select, loaded, failed: failedImage };
}
