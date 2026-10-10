// Only known worlds and immutable data revisions may be addressed by this route.
export function parseTerrainTile(path) {
  const m=/^\/terrain-data\/(fuji|grand-canyon)\/([a-f0-9]{12})\/(\d+)-(\d+)\.pnts$/.exec(path);
  if(!m)return null;
  const offset=Number(m[3]),length=Number(m[4]);
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(offset+length)||length<28||length>8*1024*1024)return null;
  return {world:m[1],revision:m[2],offset,length,key:`${m[1]}/${m[2]}.pack`};
}
