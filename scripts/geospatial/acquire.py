"""Acquire public, georeferenced sources. Run in the isolated geo-venv.
Raw files stay in ignored artifacts/geospatial; public outputs are built separately.
HTTPS_PROXY / HTTP_PROXY may be supplied by the caller. No credentials required.
"""
import os, json, math, time, argparse, concurrent.futures
from pathlib import Path
import requests
import numpy as np
import rasterio
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from pyproj import Transformer
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'artifacts/geospatial'
RAW=DATA/'raw'
RAW.mkdir(parents=True,exist_ok=True)
os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='60',GDAL_HTTP_MAX_RETRY='2')
SOURCES=Path(__file__).parent/'sources'
CONFIG={
 'fuji':{'bbox':[138.56,35.25,138.89,35.57],'epsg':32654,'name':'富士山'},
 'grand-canyon':{'bbox':[-112.24,35.99,-111.98,36.22],'epsg':32612,'name':'大峡谷'},
}
def fetch(url,path,params=None):
 path=Path(path)
 if path.exists():return path
 for attempt in range(4):
  try:
   with requests.get(url,params=params,timeout=(20,120),stream=True) as r:
    r.raise_for_status()
    tmp=path.with_suffix(path.suffix+'.partial')
    with tmp.open('wb') as out:
     for block in r.iter_content(1024*1024):out.write(block)
    tmp.replace(path)
    return path
  except requests.RequestException:
   if attempt==3:raise
   time.sleep(attempt+1)

def grid(place,n=2048):
 c=CONFIG[place]; w,s,e,north=c['bbox'];tx=Transformer.from_crs(4326,c['epsg'],always_xy=True)
 xs,ys=tx.transform([w,e,w,e],[s,s,north,north]);bounds=[min(xs),min(ys),max(xs),max(ys)]
 transform=from_bounds(*bounds,n,n)
 x=bounds[0]+(np.arange(n)+.5)*(bounds[2]-bounds[0])/n
 y=bounds[3]-(np.arange(n)+.5)*(bounds[3]-bounds[1])/n
 xx,yy=np.meshgrid(x,y)
 lng,lat=Transformer.from_crs(c['epsg'],4326,always_xy=True).transform(xx,yy)
 return bounds,transform,lng,lat

def satellite(place):
 target=DATA/f'{place}-rgb.npy'
 if target.exists():print('cached satellite',place,flush=True);return
 candidates=json.loads((SOURCES/f'{place}-satellite-candidates.json').read_text())['features']
 # A single full-coverage tile for Fuji; same-date adjacent tiles for the canyon.
 selected=[candidates[0]] if place=='fuji' else candidates
 bounds,transform,lng,lat=grid(place)
 rgb=np.zeros((3,2048,2048),dtype=np.uint8);mask=np.zeros((2048,2048),dtype=bool)
 provenance=[]
 for f in selected:
  print('reading satellite',f['id'],flush=True)
  url=f['assets']['visual']['href']
  with rasterio.open(url) as src:
   with WarpedVRT(src,crs=f'EPSG:{CONFIG[place]["epsg"]}',transform=transform,width=2048,height=2048,resampling=rasterio.enums.Resampling.bilinear) as vrt:
    part=vrt.read();valid=part.max(axis=0)>0
    rgb[:,valid]=part[:,valid];mask|=valid
  provenance.append({'id':f['id'],'date':f['properties']['datetime'],'url':url,'nativeResolutionM':10,'cloudCoverScenePercent':f['properties'].get('eo:cloud_cover')})
 if mask.mean()<.999:raise RuntimeError(f'Incomplete satellite coverage {place}: {mask.mean()}')
 np.save(target,rgb.transpose(1,2,0));Image.fromarray(rgb.transpose(1,2,0)).resize((1024,1024)).save(DATA/f'{place}-satellite.jpg',quality=92)
 (DATA/f'{place}-satellite-source.json').write_text(json.dumps(provenance,indent=2))
 print('satellite complete',place,flush=True)

def fuji_dem():
 path=DATA/'fuji-dem.npy'
 if path.exists():return
 bounds,transform,lng,lat=grid('fuji');z=14;n=2**z
 px=(lng+180)/360*n*256;py=(1-np.arcsinh(np.tan(np.radians(lat)))/math.pi)/2*n*256
 x0,x1=int(px.min()//256),int(px.max()//256);y0,y1=int(py.min()//256),int(py.max()//256)
 mosaic=np.full(((y1-y0+1)*256,(x1-x0+1)*256),np.nan,dtype=np.float32)
 def tile(xy):
  x,y=xy;url=f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';p=fetch(url,RAW/f'gsi-{z}-{x}-{y}.png');a=np.array(Image.open(p).convert('RGBA')).astype(np.int32)
  v=a[:,:,0]*65536+a[:,:,1]*256+a[:,:,2];bad=(v==8388608)|(a[:,:,3]==0);h=np.where(v>=8388608,v-16777216,v).astype(np.float32)*.01;h[bad]=np.nan
  return x,y,h
 pairs=[(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)]
 print('GSI DEM tiles',len(pairs),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for i,(x,y,h) in enumerate(pool.map(tile,pairs)):
   mosaic[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=h
   if i%50==0:print('GSI',i,'/',len(pairs),flush=True)
 from scipy.ndimage import map_coordinates
 dem=map_coordinates(mosaic,[py-y0*256-.5,px-x0*256-.5],order=1,mode='nearest')
 if np.isfinite(dem).mean()<.999:raise RuntimeError('Unresolved GSI elevation gaps')
 np.save(path,dem.astype(np.float32))
 (DATA/'fuji-dem-source.json').write_text(json.dumps({'provider':'国土地理院 GSI','nativeResolutionM':10,'verticalDatum':'GSI elevation (metres, Japanese national height datum)','url':'https://maps.gsi.go.jp/development/ichiran.html','tileTemplate':'https://cyberjapandata.gsi.go.jp/xyz/dem_png/14/{x}/{y}.png','tiles':len(pairs)}))
 print('fuji DEM',float(dem.min()),float(dem.max()),flush=True)

def canyon_dem():
 path=DATA/'grand-canyon-dem.npy'
 if path.exists():return
 bounds,transform,lng,lat=grid('grand-canyon')
 index=json.loads((SOURCES/'canyon-elevation-index.json').read_text())
 records=[f['attributes'] for f in index['features'] if f['attributes']['Name']=='AZ_GrandCanyonNP_2019_B19' and str(f['attributes']['URL']).endswith('.tif')]
 dem=np.full((2048,2048),-9999,dtype=np.float32)
 available=[f['attributes'] for f in index['features'] if '/1m/' in str(f['attributes']['URL']) and str(f['attributes']['URL']).endswith('.tif')]
 records=records+[r for r in available if r not in records]+[f['attributes'] for f in index['features'] if '/13/' in str(f['attributes']['URL'])]
 highres=0.0
 used=[]
 checkpoint=DATA/'canyon-dem-checkpoint.npz'
 if checkpoint.exists():
  cached=np.load(checkpoint);dem=cached['dem'];used=json.loads(str(cached['used']));highres=float(cached['highres'])
 for r in records:
  if any(old['URL']==r['URL'] for old in used):continue
  print('reading DEM',r['URL'].split('/')[-1],flush=True)
  with rasterio.open(r['URL']) as src:
   with WarpedVRT(src,crs='EPSG:32612',transform=transform,width=2048,height=2048,resampling=rasterio.enums.Resampling.bilinear,nodata=-9999) as vrt:part=vrt.read(1)
  valid=np.isfinite(part)&(part>-500)&(part<5000)&(dem==-9999)
  if valid.any():dem[valid]=part[valid]
  used.append(r)
  print('DEM coverage',float((dem!=-9999).mean()),flush=True)
  if '/1m/' in r['URL']:highres=float((dem!=-9999).mean())
  np.savez_compressed(checkpoint,dem=dem,used=np.array(json.dumps(used)),highres=np.array(highres))
  if (dem!=-9999).all():break
 valid=np.isfinite(dem)&(dem>-500)&(dem<5000)
 if valid.mean()<.999:raise RuntimeError(f'Incomplete 1m-source elevation: {valid.mean()}')
 np.save(path,dem.astype(np.float32));(DATA/'grand-canyon-dem-source.json').write_text(json.dumps({'provider':'USGS 3DEP · Grand Canyon NP and regional DEM','nativeResolutionM':1,'fallbackResolutionM':10,'oneMeterSourceCoverage':highres,'verticalDatum':'NAVD88','url':'https://www.usgs.gov/3d-elevation-program','sourceRasters':used},indent=2))
 print('canyon DEM',float(dem.min()),float(dem.max()),flush=True)

def lidar():
 tiles=json.loads((SOURCES/'summit-tiles.json').read_text())
 import zipfile,laspy,shutil
 files=[]
 for f in tiles:
  u=f['properties']['URL'];p=fetch(u,RAW/Path(u).name)
  with zipfile.ZipFile(p) as z:
   for name in z.namelist():
    if not name.lower().endswith(('.las','.laz')):continue
    dst=RAW/Path(name).name
    if not dst.exists():
     with z.open(name) as src,dst.open('wb') as out:shutil.copyfileobj(src,out)
    files.append(str(dst.relative_to(ROOT)))
    with laspy.open(dst) as src:print('LiDAR',dst.name,src.header.point_count,src.header.mins,src.header.maxs,flush=True)
 (DATA/'fuji-lidar-source.json').write_text(json.dumps({'provider':'VIRTUAL SHIZUOKA','license':'CC BY 4.0','archives':[f['properties']['URL'] for f in tiles],'meshes':[f['properties']['MESH_NO'] for f in tiles],'files':files,'horizontalCRS':'EPSG:6676','catalog':'https://www.geospatial.jp/ckan/dataset/shizuoka-2021-pointcloud'},indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('task',choices=['fuji-satellite','canyon-satellite','fuji-dem','canyon-dem','lidar']);args=parser.parse_args()
 {'fuji-satellite':lambda:satellite('fuji'),'canyon-satellite':lambda:satellite('grand-canyon'),'fuji-dem':fuji_dem,'canyon-dem':canyon_dem,'lidar':lidar}[args.task]()
