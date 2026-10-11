import { SCENE_ASSETS } from './scene-assets.mjs';
export const POINT_COUNTS = Object.freeze({ ...{"fuji": 5115778, "grand-canyon": 4194304}, ...Object.fromEntries(SCENE_ASSETS.map(s => [s.id, s.count])) });
