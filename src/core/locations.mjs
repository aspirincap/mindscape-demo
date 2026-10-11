import { POINT_COUNTS } from './point-counts.mjs';
import { SCENE_PLACES } from './scene-places.mjs';
const GEOGRAPHIC_EXTENTS = {fuji: '30.8 × 36.2 km · 实测点云与真实地形', 'grand-canyon': '23.7 × 25.8 km · 真实地形'};
const places = [
  ['fuji','fuji','富士山','日本','MOUNT FUJI','雪峰静境',35.3606,138.7274,['雪山','湖泊','安静'],'在雪峰与湖水之间，留一段安静的时间。','富士 fuji 雪山'],
  ['grand-canyon','grand-canyon','大峡谷','美国','GRAND CANYON','大地的褶皱',36.1069,-112.1129,['峡谷','开阔','大地'],'俯瞰岩层与蜿蜒的河流，感受大地的尺度。','大峡谷 科罗拉多 grand canyon colorado'],
];
const geography = places.map(([id,worldId,name,country,english,title,lat,lng,theme,description,aliases]) => ({id,worldId,name,country,english,title,subtitle:english,lat,lng,theme,description,aliases,pointCount:POINT_COUNTS[worldId],geographicExtent:GEOGRAPHIC_EXTENTS[worldId],inspired:false}));
const scenes = SCENE_PLACES.map(([name,country,english,title,lat,lng,theme,description,aliases,duration],index) => {
  const id = `scene-${String(index+1).padStart(2,'0')}`;
  return {id,worldId:id,name,country,english,title,subtitle:english,lat,lng,theme,description,aliases,duration,inspired:true,pointCount:POINT_COUNTS[id]};
});
export const LOCATIONS = Object.freeze([...geography,...scenes].map(Object.freeze));
export const locationById = id => LOCATIONS.find(l => l.id === id);
export const locationForWorld = id => LOCATIONS.find(l => l.worldId === id);
export function latLngToXYZ(lat,lng,radius=1) { const p=lat*Math.PI/180,t=lng*Math.PI/180; return [radius*Math.cos(p)*Math.sin(t),radius*Math.sin(p),radius*Math.cos(p)*Math.cos(t)]; }
export function formatCoordinates(l) { return `${Math.abs(l.lat).toFixed(2)}° ${l.lat<0?'S':'N'} / ${Math.abs(l.lng).toFixed(2)}° ${l.lng<0?'W':'E'}`; }
