import { parseTerrainTile } from '../src/core/terrain-format.mjs';
export async function terrainResponse(request,bucket){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const part=parseTerrainTile(new URL(request.url).pathname);
 if(!part)return new Response('Not found',{status:404});
 if(!bucket)return new Response('Terrain storage unavailable',{status:503});
 let object;
 try{object=await bucket.get(part.key,{range:{offset:part.offset,length:part.length}});}
 catch(error){
  // R2 rejects offsets beyond the object before it returns metadata.
  if(/range|416/i.test(String(error?.message)))return new Response('Invalid tile range',{status:416});
  throw error;
 }
 if(!object)return new Response('Not found',{status:404});
 if(part.offset+part.length>object.size){await object.body?.cancel();return new Response('Invalid tile range',{status:416});}
 const headers={'Content-Type':'application/octet-stream','Content-Length':String(part.length),'Cache-Control':'public, max-age=31536000, immutable','ETag':`"${part.revision}-${part.offset}-${part.length}"`,'X-Content-Type-Options':'nosniff'};
 if(request.method==='HEAD'){await object.body?.cancel();return new Response(null,{headers});}
 return new Response(object.body,{headers});
}
