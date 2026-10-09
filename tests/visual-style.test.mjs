import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVisual,DEFAULT_VISUAL,dispersionTarget,smoothVisual,feedbackDecay} from '../src/core/visual-style.mjs';
test('invalid visual input cannot introduce unbounded GPU uniforms',()=>{
 const v=normalizeVisual({pointSize:NaN,bloom:Infinity,trail:1000,dispersion:-10,palette:'bad',mode:'bad'});
 assert.equal(v.pointSize,DEFAULT_VISUAL.pointSize);assert.equal(v.bloom,DEFAULT_VISUAL.bloom);assert.equal(v.trail,1.5);assert.equal(v.dispersion,0);assert.equal(v.mode,'cinematic');assert.equal(v.palette,'aurora');
});
test('raw comparison ignores dispersion while manual and sensor input remain independent',()=>{
 assert.equal(dispersionTarget(.1,{mode:'original',dispersion:1}),0);
 assert.equal(dispersionTarget(1,{mode:'particles',dispersion:.4}),.4);
 assert.ok(dispersionTarget(.1,{mode:'particles',dispersion:0})>.7);
 assert.equal(dispersionTarget(1,{mode:'cinematic',dispersion:0}),0);
});
test('recovery returns to the original geometry with frame-rate independent smoothing',()=>{
 const values=[10,30,60,120].map(hz=>{let d=1;for(let i=0;i<hz*10;i++)d=smoothVisual(d,0,1/hz,1.1);return d;});
 assert.ok(Math.max(...values)<.0002);assert.ok(Math.max(...values)-Math.min(...values)<1e-10);
});
test('feedback half-life and energy budget do not depend on frame rate',()=>{
 for(const hz of [10,30,60,120]){
  let history=1,energy=0;const decay=feedbackDecay(1/hz,.5);
  for(let i=0;i<hz;i++){history*=decay;energy=energy*decay+2*(1-decay);}
  assert.ok(Math.abs(history-.25)<1e-10);assert.ok(Math.abs(energy-1.5)<1e-10);assert.ok(energy<=2);
 }
 assert.equal(feedbackDecay(.1,0),0);
});
