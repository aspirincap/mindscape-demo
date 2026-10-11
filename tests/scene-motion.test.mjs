import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION, classifyScenePoint, captureProjector, buildNaturalAttributes, advanceNaturalTime, sceneMotionProfile } from '../src/core/scene-motion.mjs';
import { SCENE_ASSETS } from '../src/core/scene-assets.mjs';

test('waterfall material excludes bright sky, green moss and foreground stone',()=>{
  const classify=(u,v,color)=>classifyScenePoint('scene-04',u,v,...color);
  assert.equal(classify(.45,.44,[.8,.83,.85])[0],MOTION.FALL);
  assert.equal(classify(.78,.45,[.7,.74,.76])[0],MOTION.FALL);
  assert.equal(classify(.43,.81,[.7,.73,.77])[0],MOTION.WATER);
  for(const [u,v,color] of [[.45,.10,[1,1,1]],[.45,.44,[.4,.65,.1]],[.85,.91,[.8,.8,.8]],[.07,.40,[.65,.55,.34]]])assert.equal(classify(u,v,color)[0],MOTION.STILL);
});

test('stream direction region excludes sunlit upper canopy and moss-covered banks',()=>{
  assert.equal(classifyScenePoint('scene-08',.38,.70,.8,.85,.88)[0],MOTION.STREAM);
  assert.equal(classifyScenePoint('scene-08',.38,.25,.8,.85,.88)[0],MOTION.STILL);
  assert.equal(classifyScenePoint('scene-08',.38,.70,.3,.6,.1)[0],MOTION.STILL);
});

test('solid snow, glacier, ice cave and sandstone do not acquire motion; coral uses light only',()=>{
  for(const id of ['scene-05','scene-10','scene-17','scene-18','unknown']){
    for(const color of [[1,1,1],[.1,.8,.2],[.1,.5,.9]])assert.equal(classifyScenePoint(id,.5,.4,...color)[0],MOTION.STILL);
  }
  for(const id of ['scene-14','scene-15'])assert.equal(classifyScenePoint(id,.5,.6,.8,.6,.3)[0],MOTION.CAUSTIC);
  assert.equal(classifyScenePoint('scene-19',.5,.84,.1,.9,.4)[0],MOTION.STILL,'aurora must not move the reflected horizon');
  for(const asset of SCENE_ASSETS)assert.notEqual(sceneMotionProfile(asset.id).name,'静态场景');
});

test('capture projection is anchored to the source camera and shuffled points keep their material',()=>{
  const asset=SCENE_ASSETS[3],project=captureProjector(asset.camera);
  const [u,v]=project(...asset.camera.target);assert.ok(Math.abs(u-.5)<1e-7&&Math.abs(v-.5)<1e-7);
  const data=new Float32Array([0,3.6,-5,.8,.85,.9,1,.05, 20,20,-20,.4,.7,.1,1,.05]);
  const copy=data.slice(),a=buildNaturalAttributes(data,asset),b=buildNaturalAttributes(data,asset,[1,0]);
  assert.deepEqual(data,copy);
  assert.deepEqual(a.natural.slice(0,4),b.natural.slice(4,8));
  assert.deepEqual(a.capture.slice(0,2),b.capture.slice(2,4));
  assert.ok(a.natural.every(Number.isFinite)&&a.capture.every(Number.isFinite));
});

test('natural time obeys explicit pauses, reduced motion, raw mode, speed zero and background gaps',()=>{
  for(const options of [{active:false},{hidden:true},{reduced:true},{enabled:false},{original:true},{paused:true},{speed:0}])assert.equal(advanceNaturalTime(3,.1,options),3);
  for(const dt of [1,-1,NaN,Infinity])assert.equal(advanceNaturalTime(3,dt),3);
  assert.equal(advanceNaturalTime(3,.1),3.1);
  assert.ok(Math.abs(advanceNaturalTime(3,.1,{speed:.7})-3.2)<1e-8);
});
