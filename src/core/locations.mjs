import { POINT_COUNTS } from './point-counts.mjs';
// The legacy pointCount describes bundled procedural assets. Geographic worlds use streamed tiles.
const GEOGRAPHIC_EXTENTS = {fuji: '30.8 × 36.2 km · 实测点云与真实地形', 'grand-canyon': '23.7 × 25.8 km · 真实地形'};
const places = [
  ['palau-blue','abyss','帕劳','帕劳','PALAU','深蓝庇护所',7.515,134.582,['深海','放下','释放'],'沉入水下遗迹，给纷乱的思绪一点空间。','palau 海洋 海底 ocean water sea'],
  ['yakushima-forest','forest','屋久岛','日本','YAKUSHIMA','雾之森',30.35,130.5,['森林','安定','恢复'],'循着林间的微光，让呼吸慢慢扎根。','yakushima 森林 树 forest tree nature'],
  ['great-wall','great-wall','长城','中国','GREAT WALL','群山之间',40.4319,116.5704,['山脊','历史','坚韧'],'沿着山脊上的城墙，让目光走向更远处。','长城 great wall 北京 慕田峪'],
  ['fuji','fuji','富士山','日本','MOUNT FUJI','雪峰静境',35.3606,138.7274,['雪山','湖泊','安静'],'在雪峰与湖水之间，留一段安静的时间。','富士 fuji 雪山'],
  ['eiffel','eiffel','埃菲尔铁塔','法国','EIFFEL TOWER','星光铁塔',48.8584,2.2945,['城市','浪漫','星光'],'顺着铁塔的光点抬头，遇见巴黎的夜色。','埃菲尔 巴黎 paris eiffel 铁塔'],
  ['colosseum','colosseum','罗马斗兽场','意大利','COLOSSEUM','时间的回廊',41.8902,12.4922,['古迹','拱廊','时间'],'穿过一重重拱廊，感受时间留下的回声。','斗兽场 罗马 colosseum rome'],
  ['giza','giza','吉萨金字塔','埃及','PYRAMIDS OF GIZA','沙海之上',29.9792,31.1342,['沙漠','辽阔','日光'],'让几何与沙丘延伸到远处，放宽此刻的视野。','吉萨 金字塔 埃及 giza pyramid egypt 沙漠'],
  ['taj-mahal','taj-mahal','泰姬陵','印度','TAJ MAHAL','月白倒影',27.1751,78.0421,['建筑','对称','静水'],'沿着水中的倒影，慢慢找到内心的平衡。','泰姬 印度 taj mahal india'],
  ['machu-picchu','machu-picchu','马丘比丘','秘鲁','MACHU PICCHU','云上的城',-13.1631,-72.5450,['山城','探索','云雾'],'走过高山上的梯田与石屋，给思绪一次远行。','马丘比丘 秘鲁 machu picchu peru 梯田'],
  ['grand-canyon','grand-canyon','大峡谷','美国','GRAND CANYON','大地的褶皱',36.1069,-112.1129,['峡谷','开阔','大地'],'俯瞰岩层与蜿蜒的河流，感受大地的尺度。','大峡谷 科罗拉多 grand canyon colorado'],
  ['sydney-opera','sydney-opera','悉尼歌剧院','澳大利亚','SYDNEY OPERA HOUSE','风中的白帆',-33.8568,151.2153,['港湾','海风','舒展'],'让一片片白帆展开，听见海港的呼吸。','悉尼 歌剧院 sydney opera australia'],
  ['iguazu','iguazu','伊瓜苏瀑布','阿根廷 / 巴西','IGUAZÚ FALLS','奔流之境',-25.6953,-54.4367,['瀑布','雨林','释放'],'看水流汇入深谷，让积攒的思绪随之流动。','伊瓜苏 瀑布 iguazu iguaçu waterfall'],
];
export const LOCATIONS = Object.freeze(places.map(([id,worldId,name,country,english,title,lat,lng,theme,description,aliases]) => Object.freeze({id,worldId,name,country,english,title,subtitle:english,lat,lng,theme,description,aliases,pointCount:POINT_COUNTS[worldId],geographicExtent:GEOGRAPHIC_EXTENTS[worldId]})));
export const locationById = id => LOCATIONS.find(l => l.id === id);
export const locationForWorld = id => LOCATIONS.find(l => l.worldId === id);
export function latLngToXYZ(lat,lng,radius=1) { const p=lat*Math.PI/180,t=lng*Math.PI/180; return [radius*Math.cos(p)*Math.sin(t),radius*Math.sin(p),radius*Math.cos(p)*Math.cos(t)]; }
export function formatCoordinates(l) { return `${Math.abs(l.lat).toFixed(2)}° ${l.lat<0?'S':'N'} / ${Math.abs(l.lng).toFixed(2)}° ${l.lng<0?'W':'E'}`; }
