const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));
export const GESTURE_MAX_AGE_MS = 250;
export const PINCH_ENTER = .32, PINCH_EXIT = .48;
export const ZOOM_DEADZONE = .2, ZOOM_FULL_SPEED = 1.25;
const neutral = (hands=0,mode='idle') => ({mode,hands,dx:0,dy:0,zoomRate:0,zoomOffset:0});

// Pinch is a held switch. Vertical displacement from a fixed, per-pinch
// origin sets a velocity; it is never accumulated here at inference cadence.
export class GestureController {
  constructor() { this.reset(); }
  resetTracking() { this.track=null;this.anchor=null;this.zoomOrigin=null;this.mode='ready';this.candidate=null;this.since=0; }
  reset() { this.resetTracking();this.lastTime=null;this.blocked=false; }
  releaseToPointer() { this.resetTracking();this.blocked=true; }
  update(result,now,aspect=4/3) {
    const dt=this.lastTime===null?50:now-this.lastTime;this.lastTime=now;
    if(dt>GESTURE_MAX_AGE_MS||dt<0) this.resetTracking();
    const p=result?.landmarks?.[0];
    if(!p||p.length!==21||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y))) {
      this.resetTracking();this.blocked=false;return neutral();
    }
    if(this.blocked)return neutral(1,'pointer');
    // Normalized z uses x's scale. Depth keeps a turned palm from appearing
    // narrower and erroneously releasing a pinch.
    const metric=(a,b)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y,((a.z||0)-(b.z||0))*aspect);
    const width=metric(p[5],p[17]);
    if(width<.025){this.resetTracking();return neutral();}
    const center=[0,5,9,13,17].reduce((s,j)=>({x:s.x+(1-p[j].x)/5,y:s.y+p[j].y/5}),{x:0,y:0});
    const span=metric(p[4],p[8])/width;
    if(this.track&&Math.hypot(center.x-this.track.raw.x,center.y-this.track.raw.y)>.22)this.resetTracking();
    const alpha=1-Math.exp(-clamp(dt,1,150)/65),old=this.track;
    this.track={raw:center,x:old?old.x+(center.x-old.x)*alpha:center.x,y:old?old.y+(center.y-old.y)*alpha:center.y};
    const pose=result.gestures?.[0]?.[0],fingers=[5,9,13,17];
    const extended=fingers.map(j=>{
      const vector=(a,b)=>[(p[b].x-p[a].x)*aspect,p[b].y-p[a].y,((p[b].z||0)-(p[a].z||0))*aspect];
      const a=vector(j,j+1),b=vector(j+1,j+3),length=Math.hypot(...a)*Math.hypot(...b);
      return length>1e-6&&a.reduce((s,v,i)=>s+v*b[i],0)/length>.65&&metric(p[j+3],p[0])>metric(p[j+1],p[0])*1.15;
    });
    const curled=fingers.every(j=>metric(p[j+1],p[0])>width*.45&&metric(p[j+3],p[0])<metric(p[j+1],p[0])*1.02);
    const fist=curled||(pose?.categoryName==='Closed_Fist'&&pose.score>=.6&&!extended[0]);
    const palm=((pose?.categoryName==='Open_Palm'&&pose.score>=.6)||extended.every(Boolean))&&span>.55;
    // A noisy category cannot steal an engaged pinch. A genuine four-finger
    // curl still releases it so a full fist can move the camera.
    const pinching=span<=(this.mode==='zoom'?PINCH_EXIT:PINCH_ENTER)&&!curled&&(this.mode==='zoom'||!fist);
    if(this.mode==='zoom'&&!pinching)this.resetMode();
    const desired=pinching?'zoom':fist||palm?'rotate':'ready';
    if(desired!==this.candidate){this.candidate=desired;this.since=now;}
    if(desired!==this.mode&&now-this.since>=150){
      this.mode=desired;this.anchor=null;
      this.zoomOrigin=desired==='zoom'?{y:center.y,width}:null;
      if(desired==='zoom')this.track.y=center.y;
    }
    if(desired!==this.mode){this.anchor=null;return neutral(1,'ready');}
    const out=neutral(1,this.mode),current=this.track;
    if(this.mode==='rotate'&&this.anchor){out.dx=clamp(current.x-this.anchor.x,-.045,.045);out.dy=clamp(current.y-this.anchor.y,-.045,.045);}
    if(this.mode==='zoom'){
      const offset=(this.zoomOrigin.y-current.y)/this.zoomOrigin.width;
      const rawOffset=(this.zoomOrigin.y-center.y)/this.zoomOrigin.width;
      const amount=clamp((Math.abs(offset)-ZOOM_DEADZONE)/(ZOOM_FULL_SPEED-ZOOM_DEADZONE),0,1);
      // Brake in the neutral band immediately, without a smoothing tail.
      out.zoomRate=Math.abs(rawOffset)<=ZOOM_DEADZONE||Math.sign(rawOffset)!==Math.sign(offset)?0:Math.sign(offset)*amount**1.5;
      out.zoomOffset=clamp(offset/ZOOM_FULL_SPEED,-1,1);
      out.neutralY=this.zoomOrigin.y;out.controlY=center.y;out.deadzoneY=ZOOM_DEADZONE*this.zoomOrigin.width;
    }
    this.anchor=this.mode==='rotate'?{...current}:null;
    return out;
  }
  resetMode() { this.mode='ready';this.anchor=null;this.zoomOrigin=null;this.candidate=null; }
}
