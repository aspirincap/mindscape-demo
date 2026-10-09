import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public/worlds');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).filter(m=>['abyss','forest'].includes(m.id));
const palette = { stone:[.83,.69,.50], white:[.80,.85,.97], violet:[.57,.35,1], teal:[.12,.64,.53], blue:[.24,.48,.87], gold:[1,.68,.20], green:[.19,.47,.35], rust:[.85,.39,.24] };
function generate(id, build) {
  let seed = [...id].reduce((s,c)=>s*31+c.charCodeAt(0),7)>>>0;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const points=[];
  const add=(x,y,z,color=palette.stone,size=.78,motion=0)=>{const shade=.7+random()*.3;points.push(x,y,z-5,...color.map(c=>c*shade),size,motion);};
  const surface=(n,fn,color,size=.78,motion=0)=>{for(let i=0;i<n;i++){const p=fn(random(),random());add(...p,typeof color==='function'?color(p):color,size,motion);}};
  const line=(a,b,color=palette.stone,density=85,thickness=.03)=>{const len=Math.hypot(...a.map((v,i)=>v-b[i]));surface(Math.ceil(len*density),(u,v)=>a.map((x,i)=>x+(b[i]-x)*u+(random()-.5)*thickness),color);};
  const box=(x,y,z,w,h,d,color=palette.stone,n=1800)=>surface(n,(u,v)=>{const face=Math.floor(random()*6);return face<2?[x+(face?1:-1)*w/2,y+v*h,z+(u-.5)*d]:face<4?[x+(u-.5)*w,y+(face===2?0:h),z+(v-.5)*d]:[x+(u-.5)*w,y+v*h,z+(face===4?-1:1)*d/2];},color);
  const dome=(x,y,z,r,h,color=palette.white,n=9000)=>surface(n,(u,v)=>{const a=u*Math.PI*2,b=v*Math.PI/2;return [x+r*Math.sin(b)*Math.cos(a),y+h*Math.cos(b),z+r*Math.sin(b)*Math.sin(a)];},color);
  const ground=(color=palette.teal,n=16000,fn=(x,z)=>-.1)=>surface(n,(u,v)=>{const x=(u-.5)*36,z=(v-.5)*28;return[x,fn(x,z),z];},color,.52);
  build({random,add,surface,line,box,dome,ground});
  const data=new Float32Array(points), count=data.length/8;
  fs.writeFileSync(path.join(root,`${id}.bin`),Buffer.from(data.buffer));
  const header=Buffer.from(`ply\nformat binary_little_endian 1.0\ncomment Original procedural landmark interpretation, not a survey\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
  const ply=Buffer.alloc(count*15);for(let i=0;i<count;i++){for(let j=0;j<3;j++)ply.writeFloatLE(data[i*8+j],i*15+j*4);for(let j=0;j<3;j++)ply[i*15+12+j]=Math.round(Math.min(1,data[i*8+3+j])*255);}
  fs.writeFileSync(path.join(root,`${id}.ply`),Buffer.concat([header,ply]));
  manifest.push({id,count,bytes:data.byteLength,format:'xyz-rgb-size-motion / float32',origin:'original procedural landmark interpretation, not a scan',file:`${id}.bin`});
  console.log(`${id}: ${count.toLocaleString()} points`);
}
generate('great-wall',({surface,box,line,ground})=>{
  const ridge=x=>2.5+1.4*Math.sin(x*.30)+.55*Math.cos(x*.68);
  const curve=x=>2*Math.sin(x*.21);
  ground(palette.green,42000,(x,z)=>ridge(x)*Math.exp(-Math.pow((z-curve(x))/5,2))-.8);
  surface(26000,(u,v)=>{const x=(u-.5)*30;return[x,ridge(x)+v*1.5,curve(x)+(Math.floor(u*80)%2?-.64:.64)];},palette.stone);
  surface(10000,(u,v)=>{const x=(u-.5)*30;return[x,ridge(x)+1.5,curve(x)+(v-.5)*1.3];},palette.gold,.6);
  for(let x=-14;x<=14;x+=.7)for(const z of [-.7,.7])box(x,ridge(x)+1.5,curve(x)+z,.38,.42,.2,palette.stone,80);
  for(const x of [-12,-5,2,9]){box(x,ridge(x),curve(x),2.2,3,2.2,palette.stone,3500);box(x,ridge(x)+3,curve(x),2.6,.18,2.6,palette.gold,1300);for(let i=-1;i<=1;i++)box(x+i*.8,ridge(x)+3.2,curve(x)-1.15,.4,.55,.25,palette.stone,160);}
});
generate('fuji',({surface,ground,line})=>{
  ground(palette.blue,23000,(x,z)=>z>2?-.4:.05*Math.sin(x));
  surface(65000,(u,v)=>{const a=u*Math.PI*2,r=Math.sqrt(v)*11;return[Math.cos(a)*r,Math.max(.05,10.8*(1-Math.pow(r/11,.84)))+.1*Math.sin(a*22)*r/11,Math.sin(a)*r-2];},p=>p[1]>7.1+.4*Math.sin(p[0]*2)?palette.white:palette.violet,.78);
  for(let i=0;i<35;i++){const z=3+i*.25;line([-12,-.32,z],[12,-.32,z],palette.blue,45,.06);}
  // A lakeside torii in the foreground gives scale to the mountain.
  for(const x of [-6.4,-4.2]){line([x,0,7],[x,2.5,7],palette.rust,150,.12);}line([-7,2.5,7],[-3.6,2.5,7],palette.rust,180,.15);line([-6.7,2.05,7],[-3.9,2.05,7],palette.rust,140,.12);
});
generate('eiffel',({surface,line,box,ground})=>{
  ground(palette.teal,18000);const width=y=>y<4?4-y*.48:y<8?2.08-(y-4)*.35:.68-(y-8)*.09;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    for(let level=0;level<30;level++){const y=level*.4,a=width(y),b=width(y+.4);line([sx*a,y,sz*a],[sx*b,y+.4,sz*b],palette.gold,230,.08);}
  }
  for(let y=0;y<12;y+=.6){const a=width(y),b=width(y+.6);for(const side of [-1,1]){line([-a,y,side*a],[b,y+.6,side*b],palette.gold,100,.03);line([a,y,side*a],[-b,y+.6,side*b],palette.gold,100,.03);line([side*a,y,-a],[side*b,y+.6,b],palette.gold,100,.03);line([side*a,y,a],[side*b,y+.6,-b],palette.gold,100,.03);}}
  for(const y of [3.3,6.9,11.3])box(0,y,0,width(y)*2+.6,.24,width(y)*2+.6,palette.white,4000);
  // Four curved arches under the first platform.
  for(const side of [-1,1])for(const axis of [0,1])surface(2800,(u,v)=>{const a=u*Math.PI,p=[2.8*Math.cos(a),.6+2.4*Math.sin(a),side*2.8];if(axis)[p[0],p[2]]=[p[2],p[0]];p[1]+=v*.14;return p;},palette.gold);
  line([0,12,0],[0,14,0],palette.white,400,.06);
  for(const x of [-8,8])for(let z=-12;z<11;z+=3)line([x,0,z],[x,1.2,z],palette.teal,130,.2);
});
generate('colosseum',({surface,ground,line})=>{
  ground(palette.stone,14000);const rx=9,rz=6;
  for(let tier=0;tier<3;tier++){
    // The void of each arch is left open; solid piers and curved lintels carry the shell.
    for(let arch=0;arch<40;arch++){
      const a=arch*Math.PI*2/40,w=Math.PI*2/40;
      surface(1100,(u,v)=>{let theta,y;if(u<.36){theta=a+(u/.36)*w*.22;y=tier*2+v*2;}else{const t=(u-.36)/.64;theta=a+w*(.22+t*.78);y=tier*2+1.15+.68*Math.sin(t*Math.PI)+v*.28;}return [Math.cos(theta)*rx,y,Math.sin(theta)*rz];},palette.stone);
    }
    surface(5500,(u,v)=>[Math.cos(u*Math.PI*2)*(rx+.15),tier*2+1.92+v*.16,Math.sin(u*Math.PI*2)*(rz+.15)],palette.gold,.7);
  }
  for(let ring=0;ring<8;ring++){const r=1-ring*.075;surface(2200,(u,v)=>[Math.cos(u*Math.PI*2)*(rx-1)*r,3.7-ring*.42,Math.sin(u*Math.PI*2)*(rz-1)*r],palette.white,.6);}
  surface(6500,(u,v)=>[Math.cos(u*Math.PI*2)*3.3*Math.sqrt(v),.08,Math.sin(u*Math.PI*2)*2*Math.sqrt(v)],palette.stone);
});
generate('giza',({surface,ground})=>{
  ground(palette.stone,32000,(x,z)=>.12*Math.sin(x*.4+z*.22)+.07*Math.sin(z));
  for(const [cx,cz,size,h] of [[-4,-1,11,8.4],[6,-5,8,6],[-9,6,4.2,3.2]]){
    surface(30000,(u,v)=>{const face=Math.floor(u*4),t=(u*4)%1,q=1-Math.sqrt(v),r=size/2*(1-q),edge=(t-.5)*2*r;const y=q*h;return face===0?[cx+edge,y,cz-r]:face===1?[cx+r,y,cz+edge]:face===2?[cx+edge,y,cz+r]:[cx-r,y,cz+edge];},p=>p[1]>h*.84?palette.gold:palette.stone,.75);
  }
});
generate('taj-mahal',({box,dome,line,surface,ground})=>{
  ground(palette.teal,16000);box(0,.05,0,15,.45,11,palette.white,7000);box(0,.5,0,8,3.8,5.7,palette.white,18000);
  dome(0,4.3,0,2.55,3.7,palette.white,14000);line([0,8,0],[0,9,0],palette.gold,500,.04);
  for(const x of [-3,3])for(const z of [-2,2])dome(x,4.3,z,.85,1.2,palette.white,2300);
  for(const x of [-6.4,6.4])for(const z of [-4.1,4.1]){surface(6200,(u,v)=>[x+(.27+.1*(1-v))*Math.cos(u*Math.PI*2),.5+v*6,z+(.27+.1*(1-v))*Math.sin(u*Math.PI*2)],palette.white);for(const y of [2.4,4.4,6.5])dome(x,y,z,.49,.15,palette.gold,600);dome(x,6.5,z,.5,.75,palette.white,1500);}
  // Dark entry arches are drawn in violet over the light marble facade.
  for(const x of [-2.6,0,2.6]){line([x-.65,.55,2.87],[x-.65,2.1,2.87],palette.violet,180,.12);line([x+.65,.55,2.87],[x+.65,2.1,2.87],palette.violet,180,.12);surface(1600,(u,v)=>[x+.65*Math.cos(u*Math.PI),2.1+.9*Math.sin(u*Math.PI),2.9+v*.04],palette.violet);}
  surface(7000,(u,v)=>[(u-.5)*2.4,.09,5.7+v*8],palette.blue,.65);
  for(const x of [-1.5,1.5])line([x,.1,5.7],[x,.1,14],palette.gold,180);
});
generate('machu-picchu',({surface,box,line,ground})=>{
  ground(palette.green,33000,(x,z)=>-1+5*Math.exp(-(x*x+(z+6)**2)/45)+2*Math.sin(x*.22)*Math.cos(z*.16));
  surface(29000,(u,v)=>{const a=u*Math.PI*2,r=Math.sqrt(v)*5;return [2+Math.cos(a)*r,2+9*(1-Math.pow(r/5,1.6)),Math.sin(a)*r-8];},palette.teal,.8);
  for(let row=0;row<9;row++){const z=8-row*1.15,y=row*.38;box(-2,y,z,12-row*.55,.35,.9,palette.green,2800);line([-8+row*.25,y+.4,z+.5],[4-row*.25,y+.4,z+.5],palette.stone,160);}
  for(const [x,z] of [[-4,0],[-1,0],[2,0],[-5,-3],[-2,-3],[1,-3],[4,-3]]){const y=2.8;box(x,y,z,1.8,1.4,1.5,palette.stone,2100);for(const side of [-1,1])line([x+side*.9,y+1.4,z-.75],[x,y+2.2,z-.75],palette.gold,160);}
});
generate('grand-canyon',({surface,ground,line})=>{
  const river=z=>Math.sin(z*.23)*2.2;
  surface(9000,(u,v)=>{const z=(v-.5)*32;return[river(z)+(u-.5)*1.5,-1,z];},palette.blue,.8,.06);
  for(const side of [-1,1]){
    surface(62000,(u,v)=>{const z=(u-.5)*32,y=-.9+v*9,x=river(z)+side*(2.4+v*7+.65*Math.sin(z*.9)+.23*Math.sin(y*4));return[x,y,z];},p=>{const band=Math.floor((p[1]+1)*2.8)%4;return [palette.rust,palette.stone,palette.gold,[.51,.25,.30]][band];},.9);
    ground(palette.rust,7500,(x,z)=>x*side>10?7+.2*Math.sin(x+z):-.9);
  }
});
generate('sydney-opera',({surface,box,line,ground})=>{
  ground(palette.blue,22000,(x,z)=>-.5+.03*Math.sin(z*2));box(0,-.1,0,16,.7,9,palette.stone,16000);
  // Sweeping, ribbed shell segments, with two overlapping groups.
  for(const side of [-1,1])for(let shell=0;shell<4;shell++){
    const cx=side*2.8,cz=-3.2+shell*2,h=6.8-shell*.85;
    const point=(u,v)=>{const t=u*Math.PI/2,w=Math.sin(t)*2.5;return[cx+(v-.5)*2*w,.6+h*Math.cos(t)*(1-.2*Math.pow((v-.5)*2,2)),cz+3.8*Math.sin(t)-1.5*Math.cos(t)];};
    surface(9500,point,palette.white,.77);
    for(let rib=0;rib<=10;rib++){let last=point(0,rib/10);for(let t=.025;t<=1;t+=.025){const next=point(t,rib/10);line(last,next,palette.gold,30,.015);last=next;}}
  }
  for(let i=0;i<9;i++)box(0,-.2+i*.08,5.6-i*.17,13,.09,.2,palette.stone,400);
});
generate('iguazu',({surface,ground,line})=>{
  const curve=a=>[Math.cos(a)*8,Math.sin(a)*6-2];
  surface(33000,(u,v)=>{const a=u*Math.PI*1.65+.1,[x,z]=curve(a);return[x,v*7,z];},palette.green,.8);
  surface(58000,(u,v)=>{const a=u*Math.PI*1.65+.1,[x,z]=curve(a),wave=.15*Math.sin(u*150+v*13);return[x*(.98+.025*v)+wave,7-v*7,z*.98+.12*Math.sin(v*20)];},p=>p[1]>2?palette.white:palette.blue,.76,.42);
  ground(palette.teal,16000,(x,z)=>Math.hypot(x,z+2)>9?7.1:-.2);
  surface(14000,(u,v)=>{const a=u*Math.PI*2,r=Math.sqrt(v)*7;return[Math.cos(a)*r,.1+v*.7,Math.sin(a)*r-2];},palette.blue,.8,.4);
});
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync('src/core/point-counts.mjs',`// Generated by scripts/generate-landmarks.mjs\nexport const POINT_COUNTS = ${JSON.stringify(Object.fromEntries(manifest.map(m=>[m.id,m.count])),null,2)};\n`);
