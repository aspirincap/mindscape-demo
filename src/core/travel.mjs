import journeys from './journeys.json' with { type: 'json' };
import images from './journey-images.json' with { type: 'json' };
import { locationForWorld } from './locations.mjs';

export const JOURNEYS = Object.freeze(journeys.map(Object.freeze));
const byWorld = new Map(JOURNEYS.map(journey => [journey.scene_id, journey]));
export const journeyForWorld = world => byWorld.get(world);
export const journeyArtwork = world => `/journey-art/${encodeURIComponent(world)}.svg`;
export const journeyImage = world => Object.hasOwn(images, world) ? images[world] : undefined;
export const journeyHref = world => journeyForWorld(world) ? `/activities/${encodeURIComponent(world)}.html` : null;
export const resonanceHref = world => locationForWorld(world) ? `/?scene=${encodeURIComponent(world)}` : '/';
export const journeyCover = world => !journeyForWorld(world) ? null : journeyImage(world)?.src || (locationForWorld(world)?.inspired ? `/shop/destinations/${world}.webp` : journeyArtwork(world));
// Keep transport guidance grounded in the verified daily plan; no schedules or fares.
export const transportActivities = journey => journey.days.flatMap(day => day.activities).filter(activity => /交通|机场|车站|巴士|接驳|船班|船期|航班|接送|船运|陆路|转船|衔接|停航/.test(activity));
