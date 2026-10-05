// Dota's hero shader (hero.vfx, pixel shader of the forward mode, read from the game's compiled
// shader) on three's Phong, which only gives the colour texture, the normal map, skinning and the
// alpha test here. Textures: masks R detail, G self-illumination, B rim; specular R specular,
// G metalness, B tint by base colour; the normal's blue carries the specular exponent mask (its z
// is rebuilt); the fresnel warp gives rim (R) and specular (B) strength by the angle to the eye.
//   albedo      = colour + detail × detail mask × blend (the scrolling fire of F_DETAIL 2)
//   diffuse     = half-Lambert key light × shadow + directional ambient + shadow colour in shadow
//   specular    = N·L × (L·R)^(exponent mask × exponent) × light × scale × specular mask
//                 × mix(colour, specular colour, tint mask) × max(fresnel B, metalness)
//   lit         = mix(albedo × diffuse + specular, specular, metalness)
//                 + rim mask × rim colour × ambient colour × rim scale × max(N·up, 0) × fresnel R
//   out         = mix(lit, albedo, self-illumination + detail alpha × detail mask × blend)
import * as THREE from 'three';

const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK.needsUpdate = true;
const GREY = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); GREY.needsUpdate = true;
const srgb = (c) => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);

// m: a material of hero.json; texture(file, srgb) loads one of its textures; time and light are
// uniforms shared by every material of the scene.
export function heroMaterial(m, texture, time, light) {
  const material = new THREE.MeshPhongMaterial({
    map: m.color ? texture(m.color, true) : null, normalMap: m.normal ? texture(m.normal) : null,
    alphaTest: m.alphaTest || 0, transparent: !!(m.translucent || m.additive), depthWrite: !(m.translucent || m.additive), side: THREE.DoubleSide,
  });
  // F_ADDITIVE_BLEND: glow layers (weapons, wings, Visage's spectral body) add to what lies behind.
  if (m.additive) material.blending = THREE.AdditiveBlending;
  const uniforms = {
    ...light, tMasks: { value: m.masks ? texture(m.masks) : BLACK }, tSpec: { value: m.specular ? texture(m.specular) : BLACK },
    tDetail: { value: m.detail ? texture(m.detail, true) : BLACK }, tFresnel: { value: m.fresnel ? texture(m.fresnel) : GREY }, uTime: time,
    uDetailScale: { value: new THREE.Vector2(...(m.detailScale?.length === 2 ? m.detailScale : [1, 1])) }, uDetailScroll: { value: new THREE.Vector2(...(m.detailScroll || [0, 0])) },
    uDetailBlend: { value: m.detailMode ? m.detailBlend ?? 1 : 0 },
    uRimColor: { value: srgb(m.rimColor?.length === 3 ? m.rimColor : [1, 1, 1]).multiplyScalar(m.rimScale ?? 0) }, uSpecColor: { value: srgb(m.specColor?.length === 3 ? m.specColor : [1, 1, 1]) },
    uSpecExponent: { value: m.specExponent ?? 16 }, uSpecScale: { value: m.specScale ?? 1 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define USE_PACKED_NORMALMAP
uniform sampler2D tMasks, tSpec, tDetail, tFresnel; uniform float uTime, uDetailBlend, uSpecExponent, uSpecScale; uniform vec2 uDetailScale, uDetailScroll;
uniform vec3 uRimColor, uSpecColor, uLightDir, uLightColor, uAmbientDir, uAmbientColor, uAmbientTint, uShadowColor, uUp;`)
      .replace('#include <opaque_fragment>', `${m.color ? '' : 'vec2 vMapUv = vec2(0.0);'}
vec4 heroMasks = texture2D(tMasks, vMapUv), heroSpec = texture2D(tSpec, vMapUv), heroDetailTex = texture2D(tDetail, vMapUv * uDetailScale + fract(uDetailScroll * uTime));
vec3 heroBase = diffuseColor.rgb, heroV = normalize(vViewPosition), heroR = reflect(-heroV, normal);
vec4 heroWarp = texture2D(tFresnel, vec2(clamp(dot(normal, heroV), 0.0, 1.0), 0.5));
float heroDetail = heroMasks.r * uDetailBlend, heroNL = dot(normal, uLightDir), heroExponent = uSpecExponent * ${m.normal ? 'texture2D(normalMap, vNormalMapUv).b' : '1.0'};
vec3 heroAlbedo = heroBase + heroDetailTex.rgb * heroDetail;
float heroShadow = 1.0;
#if NUM_DIR_LIGHT_SHADOWS > 0
heroShadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
#endif
vec3 heroDiffuse = (heroNL * 0.5 + 0.5) * heroShadow * uLightColor + clamp(dot(uAmbientDir, normal), 0.0, 1.0) * uAmbientColor + (1.0 - heroShadow) * uShadowColor;
vec3 heroSpecular = clamp(heroNL, 0.0, 1.0) * pow(max(dot(uLightDir, heroR), 0.001), heroExponent) * uLightColor * uSpecScale * heroSpec.r * mix(heroBase, uSpecColor, heroSpec.b) * max(heroWarp.b, heroSpec.g);
vec3 heroLit = mix(heroAlbedo * heroDiffuse + heroSpecular, heroSpecular, heroSpec.g) + heroMasks.b * uRimColor * uAmbientTint * max(dot(normal, uUp), 0.0) * heroWarp.r;
outgoingLight = mix(heroLit, heroAlbedo, clamp(heroDetailTex.a * heroDetail + heroMasks.g, 0.0, 1.0));
#include <opaque_fragment>`);
  };
  return material;
}
