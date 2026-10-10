"""Build standard 3D Tiles 1.0 PNTS from measured geometry and Sentinel-2 RGB.
The pack is an R2 storage optimization: each URL returns one complete PNTS file.
No raw survey files are copied into public/ or committed to git.
"""
import json,struct,hashlib,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from acquire import ROOT,DATA,CONFIG,grid

PUBLIC=ROOT/'public/terrain'
POIS={
 'fuji':[('summit','富士山顶',138.7274,35.3606,2200),('kawaguchi','河口湖',138.755,35.518,6500),('forest','青木原森林',138.631,35.466,6500),('yamanaka','山中湖',138.864,35.416,6500)],
 'grand-canyon':[('mather','南缘 · Mather Point',-112.1074,36.0617,5500),('phantom','峡谷腹地 · Phantom Ranch',-112.0947,36.105,3200),('bright','Bright Angel 周边',-112.1438,36.0573,5000),('river','科罗拉多河谷',-112.1129,36.1069,4500)]
}
def pnts(points,colors):
 p=np.ascontiguousarray(points,dtype='<f4').tobytes();c=np.ascontiguousarray(colors,dtype=np.uint8).tobytes()
 header=json.dumps({'POINTS_LENGTH':len(points),'POSITION':{'byteOffset':0},'RGB':{'byteOffset':len(p)}},separators=(',',':')).encode()
 header+=b' '*((-28-len(header))%8);binary=p+c;binary+=b'\0'*(-len(binary)%8)
 return struct.pack('<4s6I',b'pnts',1,28+len(header)+len(binary),len(header),len(binary),0,0)+header+binary

def box(lo,hi):
 mid=(lo+hi)/2;half=np.maximum((hi-lo)/2,1)+40
 return [float(mid[0]),float(mid[1]),float(mid[2]),float(half[0]),0,0,0,float(half[1]),0,0,0,float(half[2])]

def summit(bounds,rgb):
 source=json.loads((DATA/'fuji-lidar-source.json').read_text())
 cache=DATA/('fuji-lidar-native-'+hashlib.sha256(json.dumps(source['meshes']).encode()).hexdigest()[:8]+'.npz')
 if cache.exists():return dict(np.load(cache))
 import laspy
 source=json.loads((DATA/'fuji-lidar-source.json').read_text())
 positions=[];colors=[]
 tx=Transformer.from_crs(6676,32654,always_xy=True)
 extents=[];raw_count=0
 for file in source['files']:
  with laspy.open(ROOT/file) as src:
   raw_count+=src.header.point_count;mins=src.header.mins;maxs=src.header.maxs
   extents.append([float(mins[0]),float(mins[1]),float(maxs[0]),float(maxs[1])])
   for chunk in src.chunk_iterator(1_000_000):
    xyz=np.column_stack([chunk.x,chunk.y,chunk.z]);valid=np.isfinite(xyz).all(axis=1)&(xyz[:,2]>2500)&(xyz[:,2]<3900)
    native=np.column_stack([chunk.red,chunk.green,chunk.blue])[valid];native=(native/256 if native.max()>255 else native).astype(np.uint8)
    xyz=xyz[valid];voxel=np.floor(xyz/1.5).astype(np.int32)
    _,idx=np.unique(voxel,axis=0,return_index=True);positions.append(xyz[idx]);colors.append(native[idx])
  print('sampled',Path(file).name,flush=True)
 xyz=np.concatenate(positions);_,idx=np.unique(np.floor(xyz/1.5).astype(np.int32),axis=0,return_index=True);xyz=xyz[idx];c=np.concatenate(colors)[idx]
 # Preserve the original survey's positions and RGB; no satellite recoloring.
 e,n=tx.transform(xyz[:,0],xyz[:,1]);h=xyz[:,2]
 origin=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]
 p=np.column_stack([e-origin[0],h,origin[1]-n]).astype(np.float32)
 result={'positions':p,'colors':c,'surveyExtents':np.array(extents),'rawCount':np.array(raw_count)};np.savez_compressed(cache,**result)
 print('LiDAR measured',raw_count,'display samples',len(p),flush=True);return result

def build(place):
 dem=np.load(DATA/f'{place}-dem.npy');rgb=np.load(DATA/f'{place}-rgb.npy');bounds,transform,lng,lat=grid(place)
 assert dem.shape==(2048,2048) and rgb.shape==(2048,2048,3)
 assert np.isfinite(dem).all() and dem.min()>0
 width=bounds[2]-bounds[0];depth=bounds[3]-bounds[1];origin=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]
 lidar=summit(bounds,rgb) if place=='fuji' else None
 digest=hashlib.sha256((b'PNTS-v3-native-leaves' if lidar else b'PNTS-v2-128')+dem.tobytes()+rgb.tobytes()+(lidar['positions'].tobytes()+lidar['colors'].tobytes() if lidar else b'')).hexdigest()[:12]
 dest=PUBLIC/place;dest.mkdir(parents=True,exist_ok=True);packed=DATA/'published'/place;packed.mkdir(parents=True,exist_ok=True)
 pack=(packed/f'{digest}.pack').open('wb');index=[]
 x=-width/2+(np.arange(2048)+.5)*width/2048;z=-depth/2+(np.arange(2048)+.5)*depth/2048
 # Avoid two competing surfaces inside the actual survey footprint.
 keep=np.ones(dem.shape,dtype=bool)
 if lidar:
  ee,nn=np.meshgrid(x+origin[0],origin[1]-z);jx,jy=Transformer.from_crs(32654,6676,always_xy=True).transform(ee,nn)
  for x0,y0,x1,y1 in lidar['surveyExtents']:keep&=~((jx>=x0)&(jx<=x1)&(jy>=y0)&(jy<=y1))
 def content(p,c,spacing,name):
  data=pnts(p,c);offset=pack.tell();pack.write(data);length=len(data)
  uri=f'/terrain-data/{place}/{digest}/{offset}-{length}.pnts';index.append({'offset':offset,'length':length,'points':len(p),'name':name})
  return {'uri':uri}
 def terrain(level,ix,iz):
  span=2048//(2**level);a=ix*span;b=iz*span
  step=span//128;cols=np.arange(a+step//2,a+span,step);rows=np.arange(b+step//2,b+span,step)
  xx,zz=np.meshgrid(x[cols],z[rows]);hh=dem[np.ix_(rows,cols)];cc=rgb[np.ix_(rows,cols)];mask=keep[np.ix_(rows,cols)]
  pp=np.stack([xx,hh,zz],axis=2)[mask];cc=cc[mask];spacing=max(width,depth)/(128*2**level)
  region=dem[b:b+span,a:a+span];lo=np.array([x[a]-width/4096,region.min(),z[b]-depth/4096]);hi=np.array([x[a+span-1]+width/4096,region.max(),z[b+span-1]+depth/4096])
  tile={'boundingVolume':{'box':box(lo,hi)},'geometricError':spacing if level<4 else 0,'refine':'REPLACE','extras':{'spacing':spacing},'content':content(pp,cc,spacing,f'terrain-{level}-{ix}-{iz}')}
  if level<4:tile['children']=[terrain(level+1,ix*2+dx,iz*2+dz) for dz in range(2) for dx in range(2)]
  return tile
 root=terrain(0,0,0)
 if lidar:
  p,c=lidar['positions'],lidar['colors']
  def measured(p,c,level=0):
   lo=p.min(axis=0);hi=p.max(axis=0);n=len(p);stride=max(1,int(np.ceil(n/16000))) if n>24000 else 1
   node={'boundingVolume':{'box':box(lo,hi)},'geometricError':float(max(hi[0]-lo[0],hi[2]-lo[2])/100) if n>24000 else 0,'refine':'REPLACE','extras':{'spacing':max(1.5,1.5*np.sqrt(stride)),'survey':True},'content':content(p[::stride],c[::stride],1.5,f'survey-{level}')}
   if n>24000:
    mid=(lo+hi)/2;children=[]
    for dx,dz in [(0,0),(1,0),(0,1),(1,1)]:
     mask=((p[:,0]>=mid[0])==bool(dx))&((p[:,2]>=mid[2])==bool(dz))
     if mask.any():children.append(measured(p[mask],c[mask],level+1))
    node['children']=children
   return node
  root['boundingVolume']['box'][7]+=50
  root={'boundingVolume':root['boundingVolume'],'geometricError':max(width,depth),'refine':'ADD','children':[root,measured(p,c)]}
 pack.close()
 tileset={'asset':{'version':'1.0','generator':'Mindscape · measured geospatial pipeline'},'geometricError':max(width,depth),'root':root}
 (dest/'tileset.json').write_text(json.dumps(tileset,separators=(',',':')))
 nav=dem[np.ix_(np.linspace(0,2047,513).astype(int),np.linspace(0,2047,513).astype(int))].astype('<f4');(dest/'height.f32').write_bytes(nav.tobytes())
 Image.fromarray(rgb).resize((1024,1024)).save(dest/'satellite.jpg',quality=92)
 # Cartographic AOI overview: scientific geospatial plot, not generated imagery.
 im=Image.fromarray(rgb).resize((1200,1200));draw=ImageDraw.Draw(im);draw.rectangle([8,8,1191,1191],outline='#65e4ff',width=5);draw.rectangle([20,1090,690,1178],fill='#071a28');draw.text((35,1105),f'{place.upper()} | {width/1000:.1f} x {depth/1000:.1f} km',fill='white',font=ImageFont.load_default(size=26));draw.line([40,1150,40+5000/width*1200,1150],fill='white',width=5);draw.text((45,1155),'5 km',fill='white');draw.text((1150,25),'N',fill='#65e4ff');draw.line([1155,80,1155,45],fill='#65e4ff',width=3)
 im.save(dest/'selection.jpg',quality=94)
 tx=Transformer.from_crs(4326,CONFIG[place]['epsg'],always_xy=True);pois=[]
 for id,name,lon,lat,distance in POIS[place]:
  pe,pn=tx.transform(lon,lat);pois.append({'id':id,'name':name,'lng':lon,'lat':lat,'x':pe-origin[0],'z':origin[1]-pn,'distance':distance})
 satellite=json.loads((DATA/f'{place}-satellite-source.json').read_text());elevation=json.loads((DATA/f'{place}-dem-source.json').read_text())
 meta={'id':place,'name':CONFIG[place]['name'],'version':digest,'bbox':CONFIG[place]['bbox'],'crs':f'EPSG:{CONFIG[place]["epsg"]}','projectedBounds':bounds,'origin':origin,'width':width,'depth':depth,'heightRange':[float(dem.min()),float(dem.max())],'heightGrid':{'url':f'/terrain/{place}/height.f32','size':513},'tileset':f'/terrain/{place}/tileset.json','satellite':f'/terrain/{place}/satellite.jpg','selection':f'/terrain/{place}/selection.jpg','satelliteDate':satellite[0]['date'][:10],'nativeElevationM':elevation['nativeResolutionM'],'terrainPointSpacingM':[width/2048,depth/2048],'pointCount':int(keep.sum())+(len(lidar['positions']) if lidar else 0),'tileCount':len(index),'downloadBytes':sum(t['length'] for t in index),'pois':pois,'sources':{'satellite':satellite,'elevation':elevation},'limitations':'高程地形为高度场，不包含倒悬或洞穴。点云按视距分层抽稀；卫星颜色为 10 米像元。','attribution':['Contains modified Copernicus Sentinel data. Processed by Element 84 / Mindscape.', '出典：国土地理院；加工：Mindscape。' if place=='fuji' else 'USGS 3DEP · public domain. Processed by Mindscape.']}
 if lidar:
  source=json.loads((DATA/'fuji-lidar-source.json').read_text());source.pop('files',None);meta['sources']['lidar']=source;meta['survey']={'rawPoints':int(lidar['rawCount']),'displayPoints':len(lidar['positions']),'spacingM':1.5,'bounds':[lidar['positions'].min(axis=0).tolist(),lidar['positions'].max(axis=0).tolist()]};meta['attribution'].append('VIRTUAL SHIZUOKA / 静岡県 · CC BY 4.0；点云保留实测位置与原生 RGB，经体素抽稀。')
 (dest/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));(packed/f'{digest}.index.json').write_text(json.dumps(index));print('BUILT',place,digest,meta['pointCount'],meta['tileCount'],meta['downloadBytes'],flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('place',choices=list(CONFIG));build(p.parse_args().place)
