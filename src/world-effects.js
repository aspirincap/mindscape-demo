import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { feedbackDecay } from './core/visual-style.mjs';

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// Only the sparse accent scene enters history. The architectural body never
// feeds back, so moving the camera cannot leave a second model on screen.
class AccentTrailPass extends Pass {
  constructor(accentScene, camera, type) {
    super(); this.scene=accentScene;this.camera=camera;this.halfLife=.5;this.dt=0;this.valid=false;this.resetCount=0;
    const target=()=>new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.current=target();this.historyA=target();this.historyB=target();
    this.historyMaterial=new THREE.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{current:{value:null},history:{value:null},decay:{value:0},stepTime:{value:0},aspect:{value:1}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D current,history;uniform float decay,stepTime,aspect;
      void main(){
        vec2 p=(vUv-.5)*vec2(aspect,1.);float angle=.025*stepTime;
        p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p*exp(-.025*stepTime);
        vec2 oldUv=p/vec2(aspect,1.)+.5;
        vec3 old=texture2D(history,oldUv).rgb;
        float inside=step(0.,oldUv.x)*step(oldUv.x,1.)*step(0.,oldUv.y)*step(oldUv.y,1.);
        vec3 fresh=texture2D(current,vUv).rgb;
        gl_FragColor=vec4(min(old*inside*decay+fresh*(1.-decay),vec3(4.)),1.);
      }`});
    this.combineMaterial=new THREE.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{body:{value:null},trail:{value:null}},fragmentShader:`
      varying vec2 vUv;uniform sampler2D body,trail;
      void main(){gl_FragColor=vec4(texture2D(body,vUv).rgb+texture2D(trail,vUv).rgb*.7,1.);}`});
    this.quad=new FullScreenQuad(this.historyMaterial);
  }
  reset(){this.valid=false;this.resetCount++;}
  setSize(w,h){const width=Math.max(1,Math.round(w*.5)),height=Math.max(1,Math.round(h*.5));for(const target of [this.current,this.historyA,this.historyB])target.setSize(width,height);this.historyMaterial.uniforms.aspect.value=width/height;this.reset();}
  render(renderer,writeBuffer,readBuffer){
    const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),auto=renderer.autoClear;
    renderer.autoClear=true;renderer.setClearColor(0,0);
    if(!this.valid){for(const target of [this.historyA,this.historyB]){renderer.setRenderTarget(target);renderer.clear();}}
    // Correct screen-space point size for the half-resolution accent buffer.
    const ratios=new Map();
    this.scene.traverseVisible(object=>{const ratio=object.material?.uniforms?.uPixelRatio;if(ratio&&!ratios.has(ratio)){ratios.set(ratio,ratio.value);ratio.value*=.5;}});
    try{renderer.setRenderTarget(this.current);renderer.clear();renderer.render(this.scene,this.camera);}
    finally{for(const [ratio,value]of ratios)ratio.value=value;}
    const uniforms=this.historyMaterial.uniforms;
    uniforms.current.value=this.current.texture;uniforms.history.value=this.historyA.texture;
    uniforms.decay.value=this.valid?feedbackDecay(this.dt,this.halfLife):0;uniforms.stepTime.value=this.dt;
    this.quad.material=this.historyMaterial;renderer.setRenderTarget(this.historyB);this.quad.render(renderer);
    [this.historyA,this.historyB]=[this.historyB,this.historyA];this.valid=true;
    this.combineMaterial.uniforms.body.value=readBuffer.texture;this.combineMaterial.uniforms.trail.value=this.historyA.texture;
    this.quad.material=this.combineMaterial;renderer.setRenderTarget(writeBuffer);this.quad.render(renderer);
    renderer.setClearColor(clear,alpha);renderer.autoClear=auto;
  }
  dispose(){for(const target of [this.current,this.historyA,this.historyB])target.dispose();this.historyMaterial.dispose();this.combineMaterial.dispose();this.quad.dispose();}
}
export class WorldEffects {
  constructor(renderer,scene,accentScene,camera){
    this.renderer=renderer;
    const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    const target=new THREE.WebGLRenderTarget(1,1,{type});
    this.composer=new EffectComposer(renderer,target);this.renderPass=new RenderPass(scene,camera);
    this.trail=new AccentTrailPass(accentScene,camera,type);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.65,.45,.62);
    // UnrealBloomPass creates half-float targets internally; match the LDR
    // fallback as well so devices without float attachments still render.
    for(const buffer of [this.bloom.renderTargetBright,...this.bloom.renderTargetsHorizontal,...this.bloom.renderTargetsVertical])buffer.texture.type=type;
    this.output=new OutputPass();
    for(const pass of [this.renderPass,this.trail,this.bloom,this.output])this.composer.addPass(pass);
  }
  resize(width,height){this.composer.setSize(width,height);this.reset();}
  reset(){this.trail.reset();}
  render(dt,visual,{moving=false,reduced=false,active=true,coarse=false}={}){
    const finished=visual.mode==='cinematic';
    const trail=finished&&visual.trail>.01&&!moving&&!reduced&&active;
    if(this.trail.enabled!==trail)this.trail.reset();
    this.trail.enabled=trail;this.trail.dt=Math.min(Math.max(dt,0),.25);this.trail.halfLife=visual.trail;
    this.bloom.enabled=finished&&visual.bloom>.001;this.bloom.strength=visual.bloom*(coarse?.75:1);
    this.composer.render(dt);
  }
  dispose(){this.renderPass.dispose();this.trail.dispose();this.bloom.dispose();this.output.dispose();this.composer.dispose();}
}
