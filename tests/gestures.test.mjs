import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureController, GESTURE_MAX_AGE_MS } from '../src/core/gestures.mjs';
import { integrateGestureZoom, ZOOM_LIMITS } from '../src/core/gesture-zoom.mjs';
import { WorldRenderer } from '../src/renderer.js';
import { gestureFrameSize } from '../src/core/video-frame.mjs';

function hand(x=.5,ratio=.18){
 const p=Array.from({length:21},()=>({x,y:.5,z:0}));p[5].x=x-.08;p[17].x=x+.08;
 p[4]={x:x-ratio*.08,y:.3,z:0};p[8]={x:x+ratio*.08,y:.3,z:0};return p;
}
const shift=(p,dx=0,dy=0)=>p.map(v=>({...v,x:v.x+dx,y:v.y+dy}));
const result=(hands,pose='None',score=.95)=>({landmarks:hands,gestures:hands.map(()=>[{categoryName:pose,score}])});
function engage(c,p,start=0,pose='None'){c.update(result([p],pose),start);return c.update(result([p],pose),start+160);}
function naturalHand(openIndex=false){
 const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));p[0]={x:.5,y:.8,z:0};
 for(const[j,x]of [[5,.38],[9,.46],[13,.54],[17,.62]]){p[j]={x,y:.6,z:0};p[j+1]={x,y:.46,z:0};p[j+2]={x,y:.54,z:-.02};p[j+3]={x,y:.63,z:-.03};}
 p[4]={x:.41,y:.59,z:0};if(openIndex){p[7]={x:.38,y:.33,z:0};p[8]={x:.38,y:.18,z:0};p[4]={x:.14,y:.58,z:0};}return p;
}

test('a held pinch produces a sustained signed zoom rate, never panning',()=>{
 const c=new GestureController(),p=hand();assert.equal(engage(c,p).zoomRate,0);
 for(let t=210;t<=10210;t+=50){const v=c.update(result([shift(p,0,-.12)]),t);assert.equal(v.mode,'zoom');assert.ok(v.zoomRate>0);assert.equal(v.dx,0);assert.equal(v.dy,0);}
 c.update(result([p]),10260);
 for(let t=10310;t<=11260;t+=50)c.update(result([shift(p,0,.12)]),t);
 const v=c.update(result([shift(p,0,.12)]),11310);assert.ok(v.zoomRate<0);
});
test('neutral band brakes immediately and ignores small hand tremor',()=>{
 const c=new GestureController(),p=hand();engage(c,p);c.update(result([shift(p,0,-.12)]),210);
 for(const[t,dy]of [[260,0],[310,.01],[360,-.012]])assert.equal(c.update(result([shift(p,0,dy)]),t).zoomRate,0);
});
test('pinch hysteresis holds through threshold noise, release stops in the same update',()=>{
 const c=new GestureController();engage(c,hand());
 assert.equal(c.update(result([shift(hand(.5,.4),0,-.12)],'Closed_Fist'),210).mode,'zoom');
 assert.ok(c.update(result([shift(hand(.5,.45),0,-.12)]),260).zoomRate>0);
 const released=c.update(result([shift(hand(.5,.55),0,-.12)]),310);assert.equal(released.zoomRate,0);assert.equal(released.mode,'ready');
});
test('repeated pinches establish a fresh neutral point without a reverse zoom jump',()=>{
 const c=new GestureController();let time=0;
 for(const y of [0,.12,-.08]){const p=shift(hand(),0,y);const start=engage(c,p,time);assert.equal(start.mode,'zoom');assert.equal(start.zoomRate,0);c.update(result([shift(p,0,-.06)]),time+210);assert.equal(c.update(result([shift(hand(.5,.8),0,y)]),time+260).zoomRate,0);time+=310;}
});
test('open thumb and index no longer activate zoom; a full curled fist exits zoom',()=>{
 const c=new GestureController();assert.equal(engage(c,naturalHand(true)).mode,'ready');
 engage(c,hand(),210);const exit=c.update(result([naturalHand()],'Closed_Fist'),420);assert.equal(exit.zoomRate,0);assert.equal(exit.mode,'ready');
});
test('palm and fist move the camera, including close thumb and index',()=>{
 for(const[pose,span]of [['Open_Palm',.9],['Closed_Fist',.1]]){const c=new GestureController();assert.equal(engage(c,hand(.5,span),0,pose).mode,'rotate');const out=c.update(result([hand(.54,span)],pose),210);assert.ok(out.dx<0);assert.equal(out.zoomRate,0);}
});
test('second hand is ignored',()=>{
 const c=new GestureController();engage(c,hand(.4,.9),0,'Open_Palm');const out=c.update(result([hand(.4,.9),hand(.9)],'Open_Palm'),210);assert.equal(out.hands,1);assert.equal(out.dx,0);assert.equal(out.zoomRate,0);
});
test('zoom to movement waits for a stable pose and reanchors before panning',()=>{
 const c=new GestureController();engage(c,hand());c.update(result([shift(hand(),0,-.1)]),210);
 assert.equal(c.update(result([hand(.56,.9)],'Open_Palm'),260).mode,'ready');
 const switched=c.update(result([hand(.58,.9)],'Open_Palm'),420);assert.equal(switched.mode,'rotate');assert.equal(switched.dx,0);assert.equal(switched.zoomRate,0);
});
test('lost, malformed, stale and discontinuous input cannot retain a running rate',()=>{
 for(const bad of [result([]),{landmarks:[[{x:NaN,y:0}]]}]){const c=new GestureController();engage(c,hand());c.update(result([shift(hand(),0,-.1)]),210);assert.equal(c.update(bad,260).zoomRate,0);assert.equal(engage(c,hand(.65),310).zoomRate,0);}
 const c=new GestureController();engage(c,hand());assert.equal(c.update(result([hand(.6)]),600).mode,'ready');assert.equal(c.update(result([hand(.2)]),650).zoomRate,0);
});
test('pointer takeover persists until the hand leaves',()=>{
 const c=new GestureController();engage(c,hand());c.releaseToPointer();assert.equal(c.update(result([hand()]),210).mode,'pointer');assert.equal(c.update(result([]),260).mode,'idle');assert.equal(engage(c,hand(),310).zoomRate,0);
});
test('four straight fingers recognize a back-facing palm without a category',()=>{
 const p=hand(.5,1);p[0]={x:.5,y:.8};for(const[j,x]of [[5,.38],[9,.46],[13,.54],[17,.62]]){p[j]={x,y:.6};p[j+1]={x,y:.45};p[j+2]={x,y:.3};p[j+3]={x,y:.16};}p[4]={x:.24,y:.4};assert.equal(engage(new GestureController(),p).mode,'rotate');
});
test('curled fist remains movable despite low category confidence',()=>{
 const c=new GestureController(),p=naturalHand();assert.equal(engage(c,p).mode,'rotate');for(const[i,score]of [.61,.52,.48,.62,.51].entries())assert.equal(c.update(result([shift(p,i*.01)],'Closed_Fist',score),210+i*60).mode,'rotate');
});

test('ten-second zoom holds agree across 10, 15 and 30 Hz inference',()=>{
 for(const dy of [-.12,.12]){
  const positions=[10,15,30].map(hz=>{const c=new GestureController(),p=hand();engage(c,p,-1160);let command,zoom=0,next=-950;
   for(let t=-950;t<10000;t+=1000/120){if(t>=next-1e-6){command={...c.update(result([shift(p,0,dy)]),t),time:t};next+=1000/hz;}if(t>=0)zoom=integrateGestureZoom(zoom,command,t,1/120);}
   return zoom;});
  assert.ok(Math.max(...positions)-Math.min(...positions)<.015,JSON.stringify(positions));assert.ok(dy<0?positions.every(x=>x<-10):positions.every(x=>x>15));
 }
});
test('zoom integration stops on release, stale data and long frame gaps, and respects bounds',()=>{
 const now=1000,g={mode:'zoom',zoomRate:1,time:now};let z=0;for(let i=0;i<1000;i++)z=integrateGestureZoom(z,g,now,1/60);assert.equal(z,ZOOM_LIMITS.min);
 for(const frame of [{...g,mode:'idle'},{...g,time:now-GESTURE_MAX_AGE_MS-1},{...g,zoomRate:NaN}])assert.equal(integrateGestureZoom(3,frame,now,1/60),3);
 assert.equal(integrateGestureZoom(3,g,now,2),3);assert.equal(integrateGestureZoom(3,g,now,-1),3);
 for(let i=0;i<1000;i++)z=integrateGestureZoom(z,{...g,zoomRate:-1},now,1/60);assert.equal(z,ZOOM_LIMITS.max);
});
test('renderer stores rates without applying per-result zoom and rejects blocked inputs',()=>{
 const renderer=Object.assign(Object.create(WorldRenderer.prototype),{ready:true,active:true,orbit:{x:0,y:0,zoom:0},inputRevision:0});
 renderer.applyGesture({mode:'zoom',zoomRate:.4});assert.equal(renderer.orbit.zoom,0);assert.equal(renderer.gesture.zoomRate,.4);
 renderer.applyGesture({mode:'rotate',dx:10,dy:-10});assert.equal(renderer.orbit.x,.85);assert.equal(renderer.orbit.y,-3);
 renderer.active=false;renderer.applyGesture({mode:'zoom',zoomRate:1});assert.equal(renderer.gesture.mode,'idle');
 renderer.active=true;renderer.drag={};renderer.applyGesture({mode:'zoom',zoomRate:1});assert.equal(renderer.gesture.mode,'idle');
 renderer.drag=null;renderer.applyGesture({mode:'zoom',zoomRate:1},performance.now()-500);assert.equal(renderer.gesture.mode,'idle');
 renderer.takePointerControl();assert.equal(renderer.inputRevision,1);assert.equal(renderer.gesture.mode,'idle');
});
test('inference preserves widescreen and portrait geometry within its budget',()=>{
 assert.deepEqual(gestureFrameSize(1280,720),{width:640,height:360});assert.deepEqual(gestureFrameSize(720,1280),{width:270,height:480});assert.deepEqual(gestureFrameSize(640,480),{width:640,height:480});
});
