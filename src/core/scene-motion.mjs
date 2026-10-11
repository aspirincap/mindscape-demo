// Material hints for the supplied single-view reconstructions, not semantic
// ground truth or a fluid solver. Uncertain points stay attached to the image.
export const MOTION = Object.freeze({ STILL:0, FALL:1, STREAM:2, WATER:3, LEAVES:4, KELP:5, DRIFT:6, SHOAL:7, AURORA:8, GLOW:9, CAUSTIC:10 });
const descriptions = [
  ['鱼群随流','鱼群随水流轻轻游动，背景保持稳定。'],
  ['林间微风','叶片轻摇，树干与地面保持稳定。'],
  ['洞中微光','萤光轻微明暗变化，洞壁保持稳定。'],
  ['瀑布与涟漪','瀑布向下流动，水面泛起涟漪，岩石保持稳定。'],
  ['静谧雪林','积雪与树木保持稳定。'],
  ['秋叶微风','树冠随风轻摇，树干与地面保持稳定。'],
  ['洞水涟漪','洞中水面轻轻起伏，岩壁保持稳定。'],
  ['溪水顺流','溪水顺坡流向前景，苔石保持稳定。'],
  ['沿岸微浪','水面轻轻起伏，蓝色微光随波变化。'],
  ['静谧冰洞','冰壁保持稳定，保留原有轮廓。'],
  ['水下光影','水中光影缓慢变化，洞穴轮廓保持稳定。'],
  ['海藻随流','海藻随海流轻摆，靠近根部的幅度更小。'],
  ['水母漂浮','水母随缓慢海流轻轻漂浮。'],
  ['浅海波光','波光缓慢掠过珊瑚，珊瑚骨架保持稳定。'],
  ['珊瑚波光','海面投下轻微波光，珊瑚保持稳定。'],
  ['峡谷波光','水中光影缓慢变化，峡谷岩壁保持稳定。'],
  ['静谧冰川','冰川保持稳定，保留冰壁与倒影的轮廓。'],
  ['静谧岩谷','岩壁保持稳定，保留砂岩的层次。'],
  ['极光光幕','极光缓慢舒展，山地与地平线保持稳定。'],
  ['静夜星光','星光轻微闪烁，山体与帐篷保持稳定。'],
];
export function sceneMotionProfile(id) {
  const index=Number(id?.slice(-2))-1, entry=id?.startsWith('scene-')&&descriptions[index];
  return entry ? {name:entry[0],description:entry[1]} : {name:'静态场景',description:'保持场景原有形态。'};
}
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function region(u,v,x0,y0,x1,y1,feather=.035) {
  return smooth(x0,x0+feather,u)*(1-smooth(x1-feather,x1,u))*smooth(y0,y0+feather,v)*(1-smooth(y1-feather,y1,v));
}

// u/v refer to the original 16:9 capture, never the current viewport. Small
// camera moves and portrait layouts therefore cannot reclassify the material.
export function classifyScenePoint(id,u,v,r,g,b) {
  const light=(r+g+b)/3;
  const green=smooth(.025,.15,g-Math.max(r,b));
  const gold=smooth(.06,.25,r-b)*smooth(.015,.12,g-b);
  const pale=smooth(.27,.65,light)*(1-smooth(.05,.19,g-b))*(1-smooth(.08,.24,r-b));
  const blue=smooth(.035,.22,b-r)*smooth(.02,.15,b-g+.06);
  let kind=MOTION.STILL,weight=0;
  const set=(k,w)=>{kind=k;weight=clamp(w);};
  switch(id) {
    case 'scene-01': set(MOTION.SHOAL,pale*region(u,v,.03,.03,.97,.97)); break;
    case 'scene-02': set(MOTION.LEAVES,green*region(u,v,.02,.02,.98,.74)); break;
    case 'scene-03': set(MOTION.GLOW,blue*smooth(.15,.4,light)); break;
    case 'scene-04': {
      // Three curtains, calibrated against the supplied preview. Bright sky,
      // yellow-green moss and the foreground stones are outside these masks.
      const falls=Math.max(region(u,v,.23,.235,.70,.715),region(u,v,.695,.345,.865,.64),region(u,v,.605,.575,.865,.815));
      const falling=falls*pale;
      if(falling>.08)set(MOTION.FALL,falling);
      else set(MOTION.WATER,region(u,v,.075,.685,.79,.93)*pale*.7);
      break;
    }
    case 'scene-06': set(MOTION.LEAVES,Math.max(gold,green)*region(u,v,.015,.015,.99,.61)); break;
    case 'scene-07': set(MOTION.WATER,region(u,v,.04,.50,.95,.96)*Math.max(blue,pale*.8)); break;
    case 'scene-08': {
      // The stream runs from the upper-left reach toward the lower-right pool.
      const center=.25+(v-.48)*.72,width=.095+(v-.48)*.34;
      const channel=(1-smooth(width*.65,width,Math.abs(u-center)))*region(u,v,.06,.48,.91,.99);
      set(MOTION.STREAM,channel*pale);break;
    }
    case 'scene-09': set(MOTION.WATER,region(u,v,.02,.57,.98,.98)*Math.max(blue,pale)); break;
    case 'scene-11': set(MOTION.CAUSTIC,region(u,v,.18,.01,.85,.93)*Math.max(blue,pale)); break;
    case 'scene-12': set(MOTION.KELP,Math.max(green,gold)*region(u,v,.01,.01,.99,.99)); break;
    case 'scene-13': set(MOTION.DRIFT,gold*region(u,v,.01,.015,.99,.98)); break;
    case 'scene-14': case 'scene-15': set(MOTION.CAUSTIC,smooth(.15,.5,light)); break;
    case 'scene-16': set(MOTION.CAUSTIC,blue*region(u,v,.15,.01,.88,.94)); break;
    case 'scene-19': set(MOTION.AURORA,green*region(u,v,.01,.015,.99,.68)); break;
    case 'scene-20': set(MOTION.GLOW,pale*region(u,v,.02,.01,.98,.56)); break;
    // Snow resting on the ground, solid ice and stone do not float or breathe.
    default: break;
  }
  return [weight>.015?kind:MOTION.STILL,weight>.015?weight:0];
}

export function captureProjector(camera) {
  const eye=camera.position,forward=camera.target.map((x,i)=>x-eye[i]);
  const n=Math.hypot(...forward);for(let i=0;i<3;i++)forward[i]/=n;
  const side=[-forward[2],0,forward[0]],s=Math.hypot(...side);for(let i=0;i<3;i++)side[i]/=s;
  const up=[side[1]*forward[2]-side[2]*forward[1],side[2]*forward[0]-side[0]*forward[2],side[0]*forward[1]-side[1]*forward[0]];
  const tangent=Math.tan(camera.fov*Math.PI/360);
  return (x,y,z)=>{
    const d=[x-eye[0],y-eye[1],z-eye[2]],dot=a=>a[0]*d[0]+a[1]*d[1]+a[2]*d[2],depth=dot(forward);
    return [.5+dot(side)/(2*depth*tangent*16/9),.5-dot(up)/(2*depth*tangent),clamp(depth/29,.18,2.8)];
  };
}

export function buildNaturalAttributes(data,asset,indices) {
  const count=data.length/8, natural=new Float32Array(count*4),capture=new Float32Array(count*2),project=captureProjector(asset.camera);
  for(let i=0;i<count;i++) {
    const from=(indices?.[i]??i)*8;
    const [u,v,scale]=project(data[from],data[from+1],data[from+2]);
    const [kind,weight]=classifyScenePoint(asset.id,u,v,data[from+3],data[from+4],data[from+5]);
    // Stable phase belongs to the source point, not shuffled draw order.
    let seed=(from/8+1)>>>0;
    seed=Math.imul(seed^(seed>>>16),0x7feb352d);
    seed=Math.imul(seed^(seed>>>15),0x846ca68b);
    const phase=((seed^(seed>>>16))>>>0)/4294967296;
    natural.set([kind,weight,scale,phase],i*4);capture.set([u,v],i*2);
  }
  return {natural,capture};
}

// Never catch up after background tabs or a stalled frame. Camera manual mode
// keeps nature alive; an explicit tour pause or global pause freezes it.
export function advanceNaturalTime(time,dt,{active=true,hidden=false,reduced=false,enabled=true,original=false,paused=false,speed=.35}={}) {
  if(!active||hidden||reduced||!enabled||original||paused||!Number.isFinite(dt)||dt<0||dt>.25)return time;
  return time+dt*clamp(speed/.35,0,3);
}

// Short falling parcels accelerate downward and respawn while invisible.
// The motion lab runs this exact GLSL on the GPU, including the loop boundary.
export const naturalMotionGLSL = `
vec4 naturalMotion(vec3 base, vec4 material, vec2 uv, float time) {
  float kind=material.x,weight=material.y,scale=material.z,phase=material.w;
  vec3 move=vec3(0.); float light=1.;
  float wave=sin(uv.x*19.+uv.y*13.-time*1.4);
  if(kind>.5&&kind<1.5){
    float age=fract(time*.82+phase);
    move.y=-(.18*age+.62*age*age);
    move.x=sin(time*2.+uv.x*80.)*.014*age;
    light=1.+.10*sin(uv.y*100.-time*10.);
  }else if(kind<2.5&&kind>1.5){
    float age=fract(time*.65+phase);
    move=vec3(.22,-.12,.44)*age;
    light=1.+.08*wave;
  }else if(kind<3.5&&kind>2.5){
    move=vec3(.016*cos(uv.x*22.-time*1.3),.045*wave+.018*sin(uv.x*31.-uv.y*21.-time*1.9),.018*sin(uv.y*16.-time));
    light=1.+.12*wave;
  }else if(kind<4.5&&kind>3.5){
    float tether=pow(clamp(1.-uv.y,0.,1.),1.6);
    move=vec3(sin(time*.8+uv.x*8.)*.075,0.,cos(time*.65+uv.x*8.)*.025)*tether;
  }else if(kind<5.5&&kind>4.5){
    float tether=pow(clamp(1.-uv.y,0.,1.),1.7);
    move=vec3(sin(time*.65+uv.y*3.)*.25,0.,cos(time*.52+uv.y*3.)*.09)*tether;
  }else if(kind<6.5&&kind>5.5){
    move=vec3(sin(time*.38+uv.x*2.)*.10,sin(time*.52+uv.x*3.)*.14,cos(time*.38+uv.x*2.)*.04);
  }else if(kind<7.5&&kind>6.5){
    move=vec3(sin(time*.45+uv.y*3.)*.19,sin(time*.55+uv.x*2.)*.055,cos(time*.45+uv.y*3.)*.05);
  }else if(kind<8.5&&kind>7.5){
    move=vec3(sin(uv.y*6.+time*.32)*.16,sin(uv.x*9.-time*.45)*.065,0.);
    light=1.+.13*sin(uv.x*8.-time*.45);
  }else if(kind<9.5&&kind>8.5){
    light=1.+.065*sin(time*.7+phase*6.283185);
  }else if(kind>9.5){
    // Caustics modulate existing light without lifting coral or rock points.
    light=1.+.10*wave*sin(uv.x*27.-uv.y*16.+time*.9);
  }
  return vec4(move*weight*scale, mix(1.,light,weight));
}
float naturalOpacity(vec4 material,float time) {
  if(material.x>.5&&material.x<2.5){
    float age=fract(time*(material.x<1.5?.82:.65)+material.w);
    return smoothstep(0.,.10,age)*(1.-smoothstep(.82,1.,age));
  }
  return 1.;
}
`;
