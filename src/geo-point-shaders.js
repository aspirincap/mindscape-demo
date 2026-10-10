// Metre-scale, reversible point styling. Survey positions and RGB stay untouched.
export const geoPointVertex = `
attribute vec3 color;
uniform float spacing,viewportHeight,uPixelRatio,pointScale,time,dispersion,flow;
uniform float brightness,saturation,palette,softness,focus,original,accent,motionScale;
uniform float geoLocked,accentFlow,accentGain,edgeFade;
uniform vec2 heightRange,extent;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 float seed=hash(position*.013);
 vec3 q=position*.0011;
 float t=time;
 float localFlow=flow*mix(1.,accentFlow,accent);
 // Neighbouring samples follow a continuous field, even at zero dispersion.
 vec3 field=vec3(sin(q.y+t*.7)+cos(q.z-t*.42),
                 sin(q.z+t*.51)-cos(q.x+t*.38),
                 sin(q.x-t*.43)-cos(q.y+t*.57));
 float lift=mix(.16,2.8,accent);
 vec3 p=position+(1.-original)*localFlow*field*(motionScale*lift+dispersion*350.);
 p+=(1.-original)*accent*vec3(sin(t*.55+seed*30.),1.5+sin(t*.43+seed*22.),cos(t*.48+seed*25.))*motionScale*1.7*localFlow;
 // Break the DEM sampling lattice only in the processed view.
 vec3 grain=vec3(seed,hash(position*.019+7.),hash(position*.023+13.))-.5;
 p+=(1.-original)*grain*min(spacing,160.)*.48;
 if(geoLocked>.5 && accent<.5)p=position;
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
 float projected=spacing*viewportHeight*uPixelRatio*projectionMatrix[1][1]/max(1.,-mv.z);
 float blur=1.+min(abs(-mv.z-focus)/max(focus,1000.)*softness,1.2)*(1.-original);
 float rawSize=clamp(projected*.75,1.2,18.);
 float styledSize=clamp(projected*.56,1.1*uPixelRatio,5.5*uPixelRatio);
 styledSize=mix(styledSize,clamp(styledSize*1.9,2.8*uPixelRatio,10.*uPixelRatio),accent)*blur*pointScale;
 gl_PointSize=mix(styledSize,rawSize,original);
 vec3 native=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
 float h=clamp((position.y-heightRange.x)/max(1.,heightRange.y-heightRange.x),0.,1.);
 float luminance=dot(native,vec3(.2126,.7152,.0722));
 vec3 c=native;
 if(original<.5){
  // Broad elevation colours keep ridges readable, smoothing the seasonal seam.
  vec3 ice=mix(vec3(.035,.15,.24),vec3(.34,.68,.73),h);
  vec3 violet=mix(vec3(.035,.07,.22),vec3(.39,.23,.62),h);
  float ribbon=pow(.5+.5*sin(q.x*.7+q.z*.55-t*.35),6.);
  vec3 natural=max(mix(native,ice,.17),ice*.22);
  vec3 aurora=mix(ice,vec3(.78,.38,.14),ribbon*.18)*(.75+min(luminance,.6)*.6);
  vec3 ocean=mix(violet,vec3(.10,.43,.68),ribbon*.45)*(.75+min(luminance,.6)*.6);
  c=mix(mix(natural,aurora,clamp(palette,0.,1.)),ocean,clamp(palette-1.,0.,1.));
  float l=dot(c,vec3(.2126,.7152,.0722));c=max(vec3(0.),mix(vec3(l),c,saturation));
  float sparkle=.7+.3*sin(t*.8+seed*30.);
  c=mix(c,c*3.5+mix(vec3(.12,.42,.5),vec3(.65,.3,.12),step(.82,seed)),accent);
  c*=mix(1.,sparkle*accentGain,accent);
 }
 float depth=exp(-max(0.,-mv.z-focus)*softness/max(focus,3000.)*.6);
 vColor=c*brightness*mix(depth,1.,original);
 // A wide rounded boundary, anchored in world coordinates so adjacent LOD tiles agree.
 // Attenuate energy as well as alpha: overlapping points cannot rebuild an opaque rectangle.
 vec2 border=abs((modelMatrix*vec4(position,1.)).xz)/(extent*.5);
 vec2 fourth=border*border;fourth*=fourth;
 float radius=pow(fourth.x+fourth.y,.25);
 vEdge=mix(1.,1.-smoothstep(.70,.99,radius),edgeFade);
 vColor*=vEdge;
 vAlpha=mix(.9,.6,accent)/(blur*blur);
}`;
export const geoPointFragment = `
uniform float original;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
void main(){
 vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;
 float a=(original>.5?1.:exp(-r*3.3)*vAlpha*(1.-smoothstep(.55,1.,r)))*vEdge;
 if(a<.015)discard;
 gl_FragColor=vec4(vColor,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
