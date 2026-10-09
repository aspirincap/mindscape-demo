// Ordinary point sprites, not a Gaussian-splat asset renderer. All motion is
// reversible from the original position; no CPU position updates per frame.
export const pointVertex = `
attribute vec3 color;
attribute float size;
attribute float motion;
uniform float uTime, uCoherence, uAttention, uPulse, uPixelRatio;
uniform float uTransition, uPointScale, uDispersion, uFlow, uOriginal;
uniform float uBrightness, uSaturation, uPalette, uSoftness, uFocus, uAccent;
varying vec3 vColor;
varying float vAlpha;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
void main() {
  float seed = hash(position);
  float spread = max(uDispersion, uTransition);
  float t = uTime;
  vec3 q = position * .32;
  // Each flow component depends on the other axes: a continuous, divergence-
  // free trigonometric field. Neighboring points move together, not as jitter.
  vec3 flow = vec3(sin(q.y+t*.7)+cos(q.z-t*.42),
                   sin(q.z+t*.51)-cos(q.x+t*.38),
                   sin(q.x-t*.43)-cos(q.y+t*.57));
  vec3 radial = normalize(position-vec3(0.,4.,-5.)+vec3(.001));
  vec3 p = position + spread*uFlow*(flow*(1.8+motion*.5)+radial*seed*2.);
  p += uAccent*(1.-uOriginal)*vec3(sin(t*.65+seed*50.),cos(t*.5+seed*33.),sin(t*.4+seed*25.))*.18;
  p *= 1. + uPulse*.0013*uCoherence*(1.-uOriginal);
  vec4 viewPosition = modelViewMatrix*vec4(p,1.);
  gl_Position = projectionMatrix*viewPosition;
  float blur = 1. + min(abs(-viewPosition.z-uFocus)*uSoftness*.045,1.8)*(1.-uOriginal);
  float pointSize = size*uPointScale*uPixelRatio*(48./max(4.,-viewPosition.z));
  pointSize *= mix(1.,1.9,uAccent) * mix(1.,.8,spread);
  gl_PointSize = clamp(pointSize*blur,1.,18.*uPixelRatio);
  vec3 c = color;
  vec3 cold = mix(vec3(.045,.48,.9),vec3(.48,.12,.85),.5+.5*sin(position.y*.16+seed));
  if(uPalette>.5) c=mix(c,cold,uPalette>1.5?.72:.3);
  float luminance = dot(c,vec3(.2126,.7152,.0722));
  c = mix(vec3(luminance),c,uSaturation);
  float depth = exp(-pow(max(0.,-viewPosition.z-18.)*.019,1.35));
  float light = .9+uAttention*.2;
  vColor = max(vec3(0.),c)*uBrightness*light*depth;
  vColor *= mix(1.1,3.2,uAccent);
  vAlpha = (1.-uTransition*.7) * mix(.88,.58,uAccent) / (blur*blur);
}`;
export const pointFragment = `
precision highp float;
uniform float uAccent;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv=gl_PointCoord*2.-1.;
  float r=dot(uv,uv);
  if(r>1.) discard;
  float core=exp(-r*3.8);
  float alpha=core*vAlpha*(1.-smoothstep(.55,1.,r));
  if(alpha<.015) discard;
  gl_FragColor=vec4(vColor,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
