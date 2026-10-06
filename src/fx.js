// Source 2 particle systems (.vpcf) for three.js, ported from Source 2 Viewer's simulation
// (ValveResourceFormat/Particles, MIT) and extended with the model-bound functions it lacks
// (snapshots skinned to bones, creation on the model, locking to bones). Simulation runs in the
// game's own space (inches, Z up); the group that holds the meshes converts to glTF like Source 2
// Viewer's exporter does (scale 0.0254, Z-up to Y-up).
import * as THREE from 'three';

// ParticleField
const F = { Position: 0, LifeDuration: 1, PositionPrevious: 2, Radius: 3, Roll: 4, RollSpeed: 5, Color: 6, Alpha: 7, CreationTime: 8,
  SequenceNumber: 9, TrailLength: 10, ParticleId: 11, Yaw: 12, SecondSequenceNumber: 13, HitboxIndex: 14, HitboxOffsetPosition: 15,
  AlphaAlternate: 16, ScratchVector: 17, ScratchFloat: 18, NoneDisabled: 19, Pitch: 20, Normal: 21, GlowRgb: 22, GlowAlpha: 23,
  ScratchFloat1: 26, ScratchFloat2: 27, ScratchVector2: 30, ForceScale: 34, ManualAnimationFrame: 38 };
const ANGLE = new Set([F.Roll, F.RollSpeed, F.Yaw, F.Pitch]);
const field = (v, d) => (v === undefined ? d : typeof v === 'number' ? v : F[String(v).replace(/^PARTICLE_ATTRIBUTE_/, '')] ?? d);

export const SOURCE_TO_GLTF = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'YXZ')), new THREE.Vector3(0.0254, 0.0254, 0.0254));

// ---------------------------------------------------------------- random, noise, maths
const hash = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const rnd = Math.random;
const lerp = (a, b, t) => a + (b - a) * t;
const saturate = (x) => Math.min(1, Math.max(0, x));
const remap = (x, a, b) => (b === a ? (x >= b ? 1 : 0) : (x - a) / (b - a));
const remapClamped = (x, a, b, c, d) => lerp(c, d, saturate(remap(x, a, b)));
const bias = (x, b) => x / ((1 / b - 2) * (1 - x) + 1);
const withExponent = (exp, a, b) => lerp(a, b, exp === 1 ? rnd() : Math.pow(rnd(), exp));
const vec = (a, d = [0, 0, 0]) => new THREE.Vector3(...(Array.isArray(a) ? a : d));
function inUnitBall() { for (;;) { const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); const l = v.lengthSq(); if (l <= 1 && l > 1e-8) return { v: v.clone().normalize(), fraction: Math.cbrt(l) }; } }
// Improved Perlin noise, roughly [-1, 1].
const P = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(hash(i, 7) * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y, z) => { const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z), A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
const noiseV = (p) => noise3(p.x, p.y, p.z);

// ---------------------------------------------------------------- particles
class Particle {
  constructor(c) {
    this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.force = new THREE.Vector3();
    this.age = 0; this.life = c.life; this.alpha = c.alpha; this.alpha2 = 1; this.color = c.color.clone(); this.radius = c.radius; this.trail = 0.1;
    this.rot = new THREE.Vector3(0, 0, c.roll); this.rotSpeed = new THREE.Vector3(0, 0, c.rollSpeed); this.normal = new THREE.Vector3(0, 0, 1);
    this.seq = c.seq; this.seq2 = 0; this.created = 0; this.forceScale = 1; this.s = [0, 0, 0]; this.sv = new THREE.Vector3(); this.sv2 = new THREE.Vector3();
    this.id = 0; this.uid = 0; this.index = 0; this.dead = false; this.initial = null; this.bone = null; this.snap = -1; this.orient = null;
  }
  get nage() { return this.age / Math.max(1e-4, this.life); }
  getS(f) {
    switch (f) {
      case F.LifeDuration: return this.life; case F.Radius: return this.radius; case F.Roll: return this.rot.z; case F.RollSpeed: return this.rotSpeed.z;
      case F.Alpha: return this.alpha; case F.CreationTime: return this.created; case F.SequenceNumber: return this.seq; case F.TrailLength: return this.trail;
      case F.ParticleId: return this.id; case F.Yaw: return this.rot.x; case F.SecondSequenceNumber: return this.seq2; case F.AlphaAlternate: return this.alpha2;
      case F.ScratchFloat: return this.s[0]; case F.ScratchFloat1: return this.s[1]; case F.ScratchFloat2: return this.s[2]; case F.Pitch: return this.rot.y;
      case F.ForceScale: return this.forceScale; default: return 0;
    }
  }
  setS(f, v) {
    switch (f) {
      case F.LifeDuration: this.life = v; break; case F.Radius: this.radius = v; break; case F.Roll: this.rot.z = v; break; case F.RollSpeed: this.rotSpeed.z = v; break;
      case F.Alpha: this.alpha = v; break; case F.CreationTime: this.created = v; break; case F.SequenceNumber: this.seq = Math.round(v); break; case F.TrailLength: this.trail = v; break;
      case F.Yaw: this.rot.x = v; break; case F.SecondSequenceNumber: this.seq2 = Math.round(v); break; case F.AlphaAlternate: this.alpha2 = v; break;
      case F.ScratchFloat: this.s[0] = v; break; case F.ScratchFloat1: this.s[1] = v; break; case F.ScratchFloat2: this.s[2] = v; break; case F.Pitch: this.rot.y = v; break;
      case F.ForceScale: this.forceScale = v; break;
    }
  }
  getV(f) { switch (f) { case F.Position: return this.pos; case F.PositionPrevious: return this.prev; case F.Color: return this.color; case F.Normal: return this.normal; case F.ScratchVector: return this.sv; case F.ScratchVector2: return this.sv2; default: return new THREE.Vector3(); } }
  setV(f, v) { const t = this.getV(f); if (f === F.Normal && v.lengthSq() === 0) return; t.copy(v); }
  initS(f) { return this.initial ? this.initial.getS(f) : this.getS(f); }
  initV(f) { return this.initial ? this.initial.getV(f) : this.getV(f); }
  snapshot() { const c = Object.assign(Object.create(Particle.prototype), this); c.pos = this.pos.clone(); c.prev = this.prev.clone(); c.color = this.color.clone(); c.normal = this.normal.clone(); c.rot = this.rot.clone(); c.rotSpeed = this.rotSpeed.clone(); c.initial = null; return c; }
}
function setMethod(p, f, value, method, current = false) {
  const base = current ? p.getS(f) : p.initS(f);
  switch (method) {
    case 'PARTICLE_SET_SCALE_INITIAL_VALUE': return p.initS(f) * value;
    case 'PARTICLE_SET_ADD_TO_INITIAL_VALUE': return p.initS(f) + value;
    case 'PARTICLE_SET_SCALE_CURRENT_VALUE': return p.getS(f) * value;
    case 'PARTICLE_SET_ADD_TO_CURRENT_VALUE': return p.getS(f) + value;
    default: return value;
  }
}

// ---------------------------------------------------------------- providers
function number(d, def = 0) {
  if (d === undefined || d === null) return () => def;
  if (typeof d === 'number') return () => d;
  if (typeof d !== 'object') return () => def;
  const map = mapping(d);
  switch (d.m_nType) {
    case 'PF_TYPE_LITERAL': { const v = d.m_flLiteralValue ?? 0; return () => v; }
    case 'PF_TYPE_RANDOM_UNIFORM': case 'PF_TYPE_RANDOM_BIASED': {
      const a = d.m_flRandomMin ?? 0, b = d.m_flRandomMax ?? 0, varying = d.m_nRandomMode === 'PF_RANDOM_MODE_VARYING', salt = (number.salt = (number.salt || 0) + 1);
      const biased = d.m_nType === 'PF_TYPE_RANDOM_BIASED', bp = d.m_flBiasParameter ?? 0, exp = d.m_nBiasType === 'PF_BIAS_TYPE_EXPONENTIAL';
      const flip = d.m_bHasRandomSignFlip;
      return (p) => { let r = varying || !p ? rnd() : hash(p.uid + p.sys.seed, salt); if (biased) r = exp ? Math.pow(r, bp === 0 ? 1 : bp) : bias(r, bp || 0.5);
        const v = lerp(a, b, r); if (!flip) return v; const f = varying || !p ? rnd() : hash(p.uid + p.sys.seed, salt + 37); return f < 0.5 ? -v : v; };
    }
    case 'PF_TYPE_PARTICLE_FLOAT': case 'PF_TYPE_PARTICLE_INITIAL_FLOAT': { const f = field(d.m_nScalarAttribute, F.Radius); return (p) => map(p ? p.getS(f) : 0); }
    case 'PF_TYPE_PARTICLE_AGE': return (p) => map(p ? p.age : 0);
    case 'PF_TYPE_PARTICLE_AGE_NORMALIZED': return (p) => map(p ? p.nage : 0);
    case 'PF_TYPE_COLLECTION_AGE': return (p, s) => map(s.age);
    case 'PF_TYPE_CONTROL_POINT_COMPONENT': { const cp = d.m_nControlPoint ?? 0, c = d.m_nVectorComponent ?? 0; return (p, s) => map(s.cp(cp).pos.getComponent(Math.min(2, c))); }
    case 'PF_TYPE_PARTICLE_NUMBER': return (p) => map(p ? p.uid : 0);
    default: return () => d.m_flLiteralValue ?? def;
  }
}
function mapping(d) {
  switch (d.m_nMapType) {
    case 'PF_MAP_TYPE_MULT': { const m = d.m_flMultFactor ?? 0; return (x) => x * m; }
    case 'PF_MAP_TYPE_REMAP': { let [i0, i1, o0, o1] = [d.m_flInput0 ?? 0, d.m_flInput1 ?? 0, d.m_flOutput0 ?? 0, d.m_flOutput1 ?? 0]; if (i0 > i1) [i0, i1, o0, o1] = [i1, i0, o1, o0];
      return (x) => (i0 === i1 ? (x >= i1 ? o1 : o0) : remapClamped(x, i0, i1, o0, o1)); }
    case 'PF_MAP_TYPE_CURVE': return curve(d.m_Curve, d.m_nInputMode === 'PF_INPUT_MODE_LOOPED');
    default: return (x) => x;
  }
}
// A piecewise curve: Hermite between its keys with their slopes, the end keys' values beyond them
// (Marci's taunt basket grows to size 1 in 0.1 s and stays so); a looped input wraps in the domain.
function curve(c, looped) {
  const keys = c?.m_spline || []; if (!keys.length) return (x) => x;
  const d0 = c.m_vDomainMins?.[0] ?? 0, d1 = c.m_vDomainMaxs?.[0] ?? 0, span = d1 - d0;
  return (x) => {
    if (looped && span > 0) x = d0 + ((((x - d0) % span) + span) % span);
    if (x <= keys[0].x) return keys[0].y;
    const last = keys[keys.length - 1]; if (x >= last.x) return last.y;
    let i = 0; while (keys[i + 1].x < x) i++;
    const a = keys[i], b = keys[i + 1], h = b.x - a.x; if (h <= 0) return b.y;
    const t = (x - a.x) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * (a.m_flSlopeOutgoing ?? 0) + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * (b.m_flSlopeIncoming ?? 0);
  };
}
function vector(d, def = [0, 0, 0]) {
  if (d === undefined || d === null) { const v = vec(def); return () => v; }
  if (Array.isArray(d)) { const v = vec(d); return () => v; }
  switch (d.m_nType) {
    case 'PVEC_TYPE_LITERAL': { const v = vec(d.m_vLiteralValue); return () => v; }
    case 'PVEC_TYPE_PARTICLE_VECTOR': { const f = field(d.m_nVectorAttribute, F.Position); return (p) => (p ? p.getV(f).clone() : new THREE.Vector3()); }
    case 'PVEC_TYPE_CP_VALUE': { const cp = d.m_nControlPoint ?? 0; return (p, s) => s.cp(cp).pos.clone(); }
    case 'PVEC_TYPE_LITERAL_COLOR': { const c = d.m_LiteralColor || [255, 255, 255]; const v = new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255); return () => v; }
    default: { const v = vec(d.m_vLiteralValue, def); return () => v; }
  }
}
// A control point's transform (Source space), for m_TransformInput or a plain control point number.
function transform(d, cpDefault = 0) {
  const cp = d && typeof d === 'object' ? (d.m_nControlPoint ?? cpDefault) : cpDefault;
  return (s) => s.cp(cp).matrix();
}

// ---------------------------------------------------------------- functions
const endcapSkip = (d) => d.m_nOpEndCapState === 'PARTICLE_ENDCAP_ENDCAP_ON';
// When an operator runs: always, only in the end cap (after the effect is stopped), or only before it.
const endcapState = (d) => ({ PARTICLE_ENDCAP_ENDCAP_ON: true, PARTICLE_ENDCAP_ENDCAP_OFF: false })[d.m_nOpEndCapState] ?? null;
// ParticleFunction.GetOperatorRunStrength: m_flOpStrength times the operator's fade-in/out window.
function strength(d) {
  const inS = d.m_flOpStartFadeInTime ?? 0, inE0 = d.m_flOpEndFadeInTime ?? 0, outS0 = d.m_flOpStartFadeOutTime ?? 0, outE0 = d.m_flOpEndFadeOutTime ?? 0, period = d.m_flOpFadeOscillatePeriod ?? 0;
  const op = number(d.m_flOpStrength, 1), unity = !inS && !inE0 && !outS0 && !outE0;
  const inE = Math.max(inE0, inS), outS = Math.max(outS0, inE), outE = Math.max(outE0, outS);
  return (s) => {
    const k = op(null, s); if (unity || k <= 0) return k;
    let t = s.age; if (period > 0) t = (t / period) % 1;
    if (inS > t) return 0; if (outE0 > 0 && outE0 < t) return 0;
    let v = 1; if (inE > t && inE > inS) v = Math.min(v, (t - inS) / (inE - inS)); if (t > outS && outE > outS) v = Math.min(v, (outE - t) / (outE - outS));
    return Math.max(0, k) * v;
  };
}

// The fields each initializer writes (ParticleFunctionInitializer.WrittenFields).
function writes(d) {
  const POS = [F.Position, F.PositionPrevious];
  switch (d._class) {
    case 'C_INIT_InitFloat': return [field(d.m_nOutputField, F.Radius)];
    case 'C_INIT_InitVec': return [field(d.m_nOutputField, F.Color)];
    case 'C_INIT_RandomColor': return [field(d.m_nFieldOutput, F.Color)];
    case 'C_INIT_RandomSequence': return [F.SequenceNumber];
    case 'C_INIT_RandomYawFlip': return [F.Yaw];
    case 'C_INIT_InitialVelocityNoise': return [F.PositionPrevious];
    case 'C_INIT_NormalAlignToCP': return [F.Normal];
    case 'C_INIT_RemapParticleCountToScalar': case 'C_INIT_DistanceToCPInit': return [field(d.m_nFieldOutput, F.Radius)];
    case 'C_INIT_CreationNoise': case 'C_INIT_InheritFromParentParticles': case 'C_INIT_RemapInitialCPDirectionToRotation': return [field(d.m_nFieldOutput, d._class === 'C_INIT_CreationNoise' ? F.Radius : F.Roll)];
    case 'C_INIT_RemapCPOrientationToRotations': return [F.Roll, F.Yaw, F.Pitch];
    case 'C_INIT_InitFromCPSnapshot': { const a = field(d.m_nAttributeToWrite ?? d.m_nAttributeToRead, F.Position); return a === F.Position ? POS : [a]; }
    default: return POS;
  }
}
const INIT = {
  C_INIT_InitFloat(d) {
    const out = field(d.m_nOutputField, F.Radius), value = number(d.m_InputValue), method = d.m_nSetMethod, str = number(d.m_InputStrength, 1);
    return (p, s) => { let v = value(p, s); if (ANGLE.has(out) && !/SCALE/.test(method || '')) v *= Math.PI / 180; const t = setMethod(p, out, v, method); p.setS(out, lerp(p.getS(out), t, str(p, s))); };
  },
  C_INIT_InitVec(d) { const out = field(d.m_nOutputField, F.Color), value = vector(d.m_InputValue); return (p, s) => p.setV(out, value(p, s)); },
  C_INIT_RandomColor(d) {
    const a = d.m_ColorMin || [255, 255, 255], b = d.m_ColorMax || [255, 255, 255], out = field(d.m_nFieldOutput, F.Color);
    return (p) => { const t = rnd(); p.setV(out, new THREE.Vector3(lerp(a[0], b[0], t) / 255, lerp(a[1], b[1], t) / 255, lerp(a[2], b[2], t) / 255)); };
  },
  C_INIT_CreateWithinSphere: (d) => sphere(d, transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0)),
  C_INIT_CreateWithinSphereTransform: (d) => sphere(d, transform(d.m_TransformInput, 0)),
  C_INIT_InitialVelocityNoise(d) {
    if (d.m_bDisableOperator) return null;
    const mn = vector(d.m_vecOutputMin, [0, 0, 0]), mx = vector(d.m_vecOutputMax, [1, 1, 1]), ns = number(d.m_flNoiseScale, 0.1), nl = number(d.m_flNoiseScaleLoc, 0.01);
    const off = number(d.m_flOffset, 0), local = d.m_bLocalSpace, tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0);
    return (p, s) => {
      const k = nl(p, s), t = (p.created + off(p, s)) * ns(p, s), q = p.pos.clone().multiplyScalar(k).addScalar(t);
      const n = [noiseV(q), noiseV(q.clone().add(new THREE.Vector3(100000.5, 300000.25, 9000001))), noiseV(q.clone().add(new THREE.Vector3(110000.25, 310000.75, 9100000)))];
      const lo = mn(p, s), hi = mx(p, s), v = new THREE.Vector3(...[0, 1, 2].map((i) => n[i] * (hi.getComponent(i) - lo.getComponent(i)) * 0.5 + lo.getComponent(i) + (hi.getComponent(i) - lo.getComponent(i)) * 0.5));
      if (local) v.applyMatrix3(new THREE.Matrix3().setFromMatrix4(tr(s)));
      p.vel.add(v);
    };
  },
  C_INIT_RandomSequence(d) { const a = d.m_nSequenceMin ?? 0, b = d.m_nSequenceMax ?? 0; return (p) => { p.seq = b > a ? Math.min(a + Math.floor(rnd() * (b - a + 1)), b) : a; }; },
  C_INIT_RandomYawFlip(d) { const pc = d.m_flPercent ?? 0.5; return (p) => { if (rnd() < pc) p.rot.x += Math.PI; }; },
  C_INIT_RingWave(d) {
    const r0 = number(d.m_flInitialRadius), th = number(d.m_flThickness), ppo = number(d.m_flParticlesPerOrbit, -1), s0 = number(d.m_flInitialSpeedMin), s1 = number(d.m_flInitialSpeedMax);
    const even = d.m_bEvenDistribution, tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0), roll = (d.m_flRoll ?? 0) * Math.PI / 180, yaw = (d.m_flYaw ?? 0) * Math.PI / 180; let orbit = 0;
    // The ring lies flat in the world (around the control point, not turned with it) unless it is
    // given a transform; its push outward is horizontal unless m_bXYVelocityOnly is off.
    const oriented = !!d.m_TransformInput, flat = d.m_bXYVelocityOnly !== false;
    return (p, s) => {
      const per = Math.max(1, ppo(p, s) === -1 ? s.max : ppo(p, s)); const a = even ? ((orbit = (orbit + 1) % per) / per) * Math.PI * 2 : rnd() * Math.PI * 2;
      const local = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(r0(p, s)).add(inUnitBall().v.multiplyScalar(th(p, s)));
      local.applyEuler(new THREE.Euler(roll, 0, yaw)); const m = tr(s), c = new THREE.Vector3().setFromMatrixPosition(m);
      p.pos.copy(oriented ? local.applyMatrix4(m) : local.add(c));
      const out = p.pos.clone().sub(c); if (flat) out.z = 0; out.normalize(); p.vel.add(out.multiplyScalar(lerp(s0(p, s), s1(p, s), rnd())));
    };
  },
  C_INIT_PositionWarp(d) {
    const a = vector(d.m_vecWarpMin, [1, 1, 1]), b = vector(d.m_vecWarpMax, [1, 1, 1]), cp = d.m_nControlPointNumber ?? 0, scp = d.m_nScaleControlPointNumber ?? -1;
    const time = d.m_flWarpTime ?? 0, start = d.m_flWarpStartTime ?? 0, invert = d.m_bInvertWarp;
    return (p, s) => { let lo = a(p, s).clone(), hi = b(p, s).clone(); if (invert) [lo, hi] = [hi, lo]; if (scp >= 0) { lo.multiply(s.cp(scp).pos); hi.multiply(s.cp(scp).pos); }
      const w = time === 0 ? new THREE.Vector3(lerp(lo.x, hi.x, rnd()), lerp(lo.y, hi.y, rnd()), lerp(lo.z, hi.z, rnd())) : lo.lerp(hi, saturate((p.created - start) / time));
      const m = s.cp(cp).matrix(), inv = m.clone().invert(); p.pos.applyMatrix4(inv).multiply(w).applyMatrix4(m); };
  },
  C_INIT_NormalAlignToCP(d) { const tr = transform(d.m_transformInput, d.m_nControlPointNumber ?? 0); return (p, s) => p.normal.set(1, 0, 0).transformDirection(tr(s)); },
  C_INIT_RemapParticleCountToScalar(d) {
    const i0 = d.m_nInputMin ?? 0, i1 = d.m_nInputMax ?? 1, o0 = d.m_flOutputMin ?? 0, o1 = d.m_flOutputMax ?? 1, out = field(d.m_nFieldOutput, F.Radius), active = d.m_bActiveRange, method = d.m_nSetMethod;
    return (p) => { if (active && (p.uid < i0 || p.uid > i1)) return; p.setS(out, setMethod(p, out, remapClamped(p.uid, i0, i1, o0, o1), method)); };
  },
  C_INIT_DistanceToCPInit(d) {
    const i0 = number(d.m_flInputMin), i1 = number(d.m_flInputMax, 128), o0 = number(d.m_flOutputMin), o1 = number(d.m_flOutputMax, 1), cp = d.m_nStartCP ?? 0, out = field(d.m_nFieldOutput, F.Radius), method = d.m_nSetMethod, active = d.m_bActiveRange;
    return (p, s) => { const dist = s.cp(cp).pos.distanceTo(p.pos), a = i0(p, s), b = i1(p, s); if (active && (dist < a || dist > b)) return; p.setS(out, setMethod(p, out, remapClamped(dist, a, b, o0(p, s), o1(p, s)), method)); };
  },
  C_INIT_CreateFromParentParticles(d) {
    const random = d.m_bRandomDistribution, scale = d.m_flVelocityScale ?? 0;
    return (p, s) => { const parent = s.parent?.sim?.particles; if (!parent?.length) return; const q = parent[random ? Math.floor(rnd() * parent.length) : p.uid % parent.length]; p.pos.copy(q.pos); p.vel.copy(q.vel).multiplyScalar(scale); };
  },
  // Snapshots: points on the model with their bones (.vsnap), skinned by the hero's skeleton.
  C_INIT_InitSkinnedPositionFromCPSnapshot(d) {
    const cp = d.m_nSnapshotControlPointNumber ?? 0, random = d.m_bRandom === true;
    return (p, s) => { const snap = s.snapshot(cp); if (!snap) return; const i = random ? Math.floor(rnd() * snap.count) : p.uid % snap.count; p.snap = i; p.pos.copy(snap.point(i)); p.prev.copy(p.pos); };
  },
  // Skinned snapshots follow the hero's bones; rigid ones (no bone weights, e.g. the Desolation
  // blades) hold points in the space of the snapshot's control point, which here is the arm.
  C_INIT_InitFromCPSnapshot(d) {
    const cp = d.m_nControlPointNumber ?? 0, random = d.m_bRandom, attr = field(d.m_nAttributeToRead, F.Position);
    return (p, s) => { const snap = s.snapshot(cp); if (!snap || attr !== F.Position) return; const i = random ? Math.floor(rnd() * snap.count) : p.uid % snap.count; p.snap = i;
      p.pos.copy(snap.point(i, s.cp(cp).matrix())); p.prev.copy(p.pos); if (snap.data.bone && s.model) p.bone = s.model.bone(snap.data.bone); };
  },
  C_INIT_CreateOnModel(d) {
    return (p, s) => { const m = s.model; if (!m) return; const bone = m.bones[Math.floor(rnd() * m.bones.length)]; if (!bone) return; p.bone = bone; p.pos.copy(m.bonePosition(bone)).add(inUnitBall().v.multiplyScalar(4)); };
  },
};
function sphere(d, tr) {
  const r0 = number(d.m_fRadiusMin), r1 = number(d.m_fRadiusMax), v0 = number(d.m_fSpeedMin), v1 = number(d.m_fSpeedMax), exp = d.m_fSpeedRandExp ?? 1;
  const l0 = vector(d.m_LocalCoordinateSystemSpeedMin), l1 = vector(d.m_LocalCoordinateSystemSpeedMax), absb = vec(d.m_vecDistanceBiasAbs), biasV = vector(d.m_vecDistanceBias, [1, 1, 1]), local = d.m_bLocalCoords;
  return (p, s) => {
    const m = tr(s), origin = new THREE.Vector3().setFromMatrixPosition(m), m3 = new THREE.Matrix3().setFromMatrix4(m);
    const { v: dir, fraction } = inUnitBall(); if (absb.x) dir.x = Math.abs(dir.x); if (absb.y) dir.y = Math.abs(dir.y); if (absb.z) dir.z = Math.abs(dir.z);
    dir.multiply(biasV(p, s)).normalize(); const a = r0(p, s), b = r1(p, s), dist = (b - a) * fraction + a;
    const offset = dir.clone().multiplyScalar(dist); p.pos.copy(local ? offset.applyMatrix3(m3).add(origin) : origin.clone().add(offset));
    const speed = withExponent(exp, v0(p, s), v1(p, s)), lo = l0(p, s), hi = l1(p, s);
    const ls = new THREE.Vector3(lerp(lo.x, hi.x, rnd()), lerp(lo.y, hi.y, rnd()), lerp(lo.z, hi.z, rnd())).applyMatrix3(m3);
    p.vel.copy((local ? dir.clone().applyMatrix3(m3) : dir).multiplyScalar(speed)).add(ls);
  };
}
// The ground under the hero is the plane of his origin (z 0 of the effects' space).
const GROUND = 0;
// A control point's orientation, offset by angles in degrees (x pitch, y yaw, z roll: Source's QAngle).
const angles = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a.z * Math.PI / 180, a.x * Math.PI / 180, a.y * Math.PI / 180, 'ZYX'));
const qangle = (pitch, yaw, roll) => new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, pitch, yaw, 'ZYX'));
// A point along a path between two control points, bulged sideways (CPathParameters).
function pathPoint(params, t, s) {
  const a = s.cp(params?.m_nStartControlPointNumber ?? 0).pos, b = s.cp(params?.m_nEndControlPointNumber ?? 0).pos, mid = params?.m_flMidPoint ?? 0.5, bulge = params?.m_flBulge ?? 0;
  const p = a.clone().lerp(b, t); if (bulge) { const dir = b.clone().sub(a), side = dir.clone().cross(new THREE.Vector3(0, 0, 1)); if (side.lengthSq() < 1e-6) side.set(0, 1, 0); p.addScaledVector(side.normalize(), bulge * Math.sin(Math.PI * Math.min(1, t / Math.max(1e-3, mid * 2)))); }
  return p;
}
Object.assign(INIT, {
  C_INIT_CreateSequentialPath(d) {
    const n = Math.max(1, d.m_flNumToAssign ?? 100), loop = d.m_bLoop !== false, params = d.m_PathParams; let i = 0;
    return (p, s) => { const k = i++ % n, t = n > 1 ? k / (loop ? n : n - 1) : 0; p.pos.copy(pathPoint(params, t, s)); p.prev.copy(p.pos); p.pathT = t; };
  },
  C_INIT_RandomSecondSequence(d) { const a = d.m_nSequenceMin ?? 0, b = d.m_nSequenceMax ?? 0; return (p) => { p.seq2 = a + Math.floor(rnd() * (b - a + 1)); }; },
  C_INIT_RemapCPtoVector(d) { const op = OP.C_OP_RemapCPtoVector(d); return (p, s) => op([p], 0, s, 1); },
  C_INIT_CreateWithinBox(d) {
    const a = vector(d.m_vecMin), b = vector(d.m_vecMax), cp = d.m_nControlPointNumber ?? 0, local = d.m_bLocalSpace;
    return (p, s) => { const lo = a(p, s), hi = b(p, s), o = new THREE.Vector3(lerp(lo.x, hi.x, rnd()), lerp(lo.y, hi.y, rnd()), lerp(lo.z, hi.z, rnd())); if (local) o.applyQuaternion(s.cp(cp).quat); p.pos.copy(s.cp(cp).pos).add(o); p.prev.copy(p.pos); };
  },
  C_INIT_InheritVelocity: () => () => {},
  C_INIT_PositionPlaceOnGround(d) { const off = number(d.m_flOffset); return (p, s) => { p.pos.z = GROUND + off(p, s); p.prev.z = p.pos.z; }; },
  C_INIT_CreationNoise(d) {
    const out = field(d.m_nFieldOutput, F.Radius), lo = d.m_flOutputMin ?? 0, hi = d.m_flOutputMax ?? 1, ns = d.m_flNoiseScale ?? 0.1, nl = d.m_flNoiseScaleLoc ?? 0.001, abs = d.m_bAbsVal, inv = d.m_bAbsValInv, off = d.m_flOffset ?? 0;
    return (p) => { let n = noise3(p.pos.x * nl + (p.created + off) * ns, p.pos.y * nl, p.pos.z * nl); if (abs || inv) { n = Math.abs(n); if (inv) n = 1 - n; } else n = (n + 1) / 2;
      let v = lerp(lo, hi, saturate(n)); if (ANGLE.has(out)) v *= Math.PI / 180; p.setS(out, v); };
  },
  C_INIT_VelocityRandom(d) {
    const v0 = number(d.m_fSpeedMin), v1 = number(d.m_fSpeedMax), l0 = vector(d.m_LocalCoordinateSystemSpeedMin), l1 = vector(d.m_LocalCoordinateSystemSpeedMax), tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0);
    return (p, s) => { const m3 = new THREE.Matrix3().setFromMatrix4(tr(s)), lo = l0(p, s), hi = l1(p, s);
      const v = inUnitBall().v.multiplyScalar(lerp(v0(p, s), v1(p, s), rnd())).add(new THREE.Vector3(lerp(lo.x, hi.x, rnd()), lerp(lo.y, hi.y, rnd()), lerp(lo.z, hi.z, rnd())).applyMatrix3(m3));
      p.vel.add(v); p.prev.addScaledVector(v, -(s.prevDt || s.sim.maxStep)); };
  },
  C_INIT_RemapInitialCPDirectionToRotation(d) {
    const cp = d.m_nCP ?? 0, out = field(d.m_nFieldOutput, F.Roll), off = (d.m_flOffsetRot ?? 0) * Math.PI / 180, comp = d.m_nComponent ?? 0;
    return (p, s) => { const dir = new THREE.Vector3(...[[1, 0, 0], [0, 1, 0], [0, 0, 1]][comp]).applyQuaternion(s.cp(cp).quat); p.setS(out, Math.atan2(dir.y, dir.x) + off); };
  },
  C_INIT_NormalOffset(d) {
    const a = vec(d.m_OffsetMin), b = vec(d.m_OffsetMax), local = d.m_bLocalCoords, cp = d.m_nControlPointNumber ?? 0, normalize = d.m_bNormalize;
    return (p, s) => { const o = new THREE.Vector3(lerp(a.x, b.x, rnd()), lerp(a.y, b.y, rnd()), lerp(a.z, b.z, rnd())); if (local) o.applyQuaternion(s.cp(cp).quat); p.normal.add(o); if (normalize) p.normal.normalize(); };
  },
  C_INIT_RemapCPOrientationToRotations(d) { const op = OP.C_OP_RemapCPOrientationToRotations(d); return (p, s) => op([p], 0, s, 1); },
  C_INIT_InheritFromParentParticles(d) {
    const f = field(d.m_nFieldOutput, F.Color), scale = d.m_flScale ?? 1, random = d.m_bRandomDistribution, inc = d.m_nIncrement ?? 1;
    return (p, s) => { const parent = s.parent?.sim?.particles; if (!parent?.length) return; const q = parent[random ? Math.floor(rnd() * parent.length) : (p.uid * inc) % parent.length];
      if (f === F.Position || f === F.Color || f === F.Normal) p.setV(f, q.getV(f).clone().multiplyScalar(f === F.Position ? 1 : scale)); else p.setS(f, q.getS(f) * scale); };
  },
});
INIT.C_INIT_PositionOffset = (d) => {
  const a = vector(d.m_OffsetMin), b = vector(d.m_OffsetMax), local = d.m_bLocalCoords, proportional = d.m_bProportional, tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0);
  return (p, s) => { const lo = a(p, s), hi = b(p, s); const o = new THREE.Vector3(lerp(lo.x, hi.x, rnd()), lerp(lo.y, hi.y, rnd()), lerp(lo.z, hi.z, rnd()));
    if (proportional) o.multiplyScalar(p.radius); if (local) o.applyMatrix3(new THREE.Matrix3().setFromMatrix4(tr(s))); p.pos.add(o); };
};

function forwardBasis(forward) {
  const f = forward.clone().normalize(); let right;
  if (Math.abs(f.x) < 1e-6 && Math.abs(f.y) < 1e-6) right = new THREE.Vector3(0, -1, 0); else right = f.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  const up = right.clone().cross(f), left = right.clone().negate();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, left, up));
}
const OP = {
  C_OP_Decay: () => (ps) => { for (const p of ps) if (p.age > p.life) p.dead = true; },
  C_OP_BasicMovement(d) {
    const g = vector(d.m_Gravity), drag = number(d.m_fDrag);
    return (ps, dt, s) => {
      const gm = g(null, s).clone().multiplyScalar(dt * dt), dv = saturate(Math.min(drag(null, s), 0.9999999));
      let df = Math.exp(Math.log(1 - dv) / (1 / 30) * dt); if (s.prevDt > 0) df *= dt / s.prevDt;
      for (const p of ps) { const step = gm.clone().add(p.force.clone().multiplyScalar(dt * dt)).multiplyScalar(p.forceScale).add(p.pos.clone().sub(p.prev).multiplyScalar(df));
        p.vel.copy(step).divideScalar(dt); p.force.set(0, 0, 0); p.prev.copy(p.pos); p.pos.add(step); }
    };
  },
  C_OP_FadeInSimple(d) { const t = d.m_flFadeInTime ?? 0.25, out = field(d.m_nFieldOutput, F.Alpha); return (ps) => { for (const p of ps) if (p.nage <= t) p.setS(out, (p.nage / t) * p.initS(F.Alpha)); }; },
  C_OP_FadeOutSimple(d) { const t = d.m_flFadeOutTime ?? 0.25, out = field(d.m_nFieldOutput, F.Alpha); return (ps) => { for (const p of ps) { const left = 1 - p.nage; if (left <= t) p.setS(out, (left / t) * p.initS(F.Alpha)); } }; },
  C_OP_FadeOut(d) {
    const t0 = d.m_flFadeOutTimeMin ?? 0.25, t1 = d.m_flFadeOutTimeMax ?? 0.25, prop = d.m_bProportional !== false, ease = d.m_bEaseInAndOut !== false;
    return (ps) => { for (const p of ps) { const t = lerp(t0, t1, hash(p.uid, 91)); const left = prop ? 1 - p.nage : p.life - p.age; if (left <= t) { let k = saturate(left / t); if (ease) k = k * k * (3 - 2 * k); p.alpha = k * p.initS(F.Alpha); } } };
  },
  C_OP_InterpolateRadius(d) {
    const st = d.m_flStartTime ?? 0, et = d.m_flEndTime ?? 1, ss = number(d.m_flStartScale, 1), es = number(d.m_flEndScale, 1), ease = d.m_bEaseInAndOut, b = d.m_flBias || 0.5;
    return (ps, dt, s) => { if (et <= st) return; for (const p of ps) { if (p.life <= 0) continue; const t = p.nage; if (t < st || t > et + dt / p.life) continue;
      let k = saturate(remap(t, st, et)); if (ease) k = k * k * (3 - 2 * k); else if (b !== 0.5) k = bias(k, b); const a = ss(p, s), c = es(p, s);
      p.radius = p.initS(F.Radius) * Math.min(Math.max(lerp(a, c, k), Math.min(a, c)), Math.max(a, c)); } };
  },
  C_OP_ColorInterpolate(d) {
    const c = d.m_ColorFade || [255, 255, 255], fadeTo = new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255), st = d.m_flFadeStartTime ?? 0, et = d.m_flFadeEndTime ?? 1, out = field(d.m_nFieldOutput, F.Color), ease = d.m_bEaseInOut !== false;
    return (ps, dt, s, str) => { for (const p of ps) { const t = p.nage; if (t < st || t > et) continue; let k = saturate(remap(t, st, et)); if (ease) k = k * k * (3 - 2 * k);
      const init = p.initV(F.Color).clone(); p.setV(out, init.clone().lerp(init.clone().lerp(fadeTo, k), str)); } };
  },
  C_OP_PositionLock(d) {
    const tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0), s0 = d.m_flStartTime_min ?? 1, s1 = d.m_flStartTime_max ?? 1, e0 = d.m_flEndTime_min ?? 1, e1 = d.m_flEndTime_max ?? 1, rotLock = d.m_bLockRot;
    let prev = null;
    return (ps, dt, s, str) => {
      const m = tr(s), pos = new THREE.Vector3().setFromMatrixPosition(m);
      if (!prev) prev = m.clone();
      const prevPos = new THREE.Vector3().setFromMatrixPosition(prev), delta = pos.clone().sub(prevPos), lock = rotLock ? m.clone().multiply(prev.clone().invert()) : null;
      prev = m.clone(); if (delta.lengthSq() === 0 && !rotLock) return;
      for (const p of ps) {
        let fadeK = 1; if (s0 < 1) { const a = lerp(s0, s1, hash(p.uid, 21)), b = lerp(e0, e1, hash(p.uid, 22)); fadeK = p.nage <= a ? 1 : 1 - saturate(remap(p.nage, a, b)); }
        const k = str * fadeK; if (k <= 0) continue; const cf = dt > 0 ? Math.min(p.age, dt) / dt : 1;
        if (rotLock) { const rp = p.pos.clone().applyMatrix4(lock), rq = p.prev.clone().applyMatrix4(lock); p.pos.lerp(rp, k * cf); p.prev.lerp(rq, k * cf); }
        else { const sd = delta.clone().multiplyScalar(cf * k); p.pos.add(sd); p.prev.add(sd); }
      }
    };
  },
  C_OP_VectorNoise(d) {
    const out = field(d.m_nFieldOutput, F.Color), lo = vec(d.m_vecOutputMin), hi = vec(d.m_vecOutputMax, [1, 1, 1]), scale = d.m_fl4NoiseScale ?? 0.1, tscale = d.m_flNoiseAnimationTimeScale ?? 0, add = d.m_bAdditive;
    const half = hi.clone().sub(lo).multiplyScalar(0.5), base = half.clone().add(lo);
    return (ps, dt, s, str) => { const to = tscale * s.age; for (const p of ps) { const c = p.pos.clone().multiplyScalar(scale); c.x += to;
      const c2 = c.clone().add(new THREE.Vector3(100000.5, 300000.25, 9000001)), c3 = c2.clone().add(new THREE.Vector3(110000.25, 310000.75, 9100000));
      const v = new THREE.Vector3(noiseV(c), noiseV(c2), noiseV(c3)).multiply(half).add(base);
      if (!add) { p.setV(out, v); continue; } v.multiplyScalar(dt * str); p.getV(out).add(v); if (out === F.Position) p.prev.add(v); } };
  },
  C_OP_RampScalarLinear(d) {
    const r0 = d.m_RateMin ?? 0, r1 = d.m_RateMax ?? 0, s0 = d.m_flStartTime_min ?? 0, s1 = d.m_flStartTime_max ?? 0, e0 = d.m_flEndTime_min ?? 1, e1 = d.m_flEndTime_max ?? 1, f = field(d.m_nField, F.Radius);
    return (ps, dt, s, str) => { for (const p of ps) { const a = lerp(s0, s1, hash(p.uid, 11)), b = lerp(e0, e1, hash(p.uid, 12)); if (p.nage < a || p.nage >= b) continue;
      let v = p.getS(f) + lerp(r0, r1, hash(p.uid, 13)) * dt * str; if (f === F.Alpha) v = saturate(v); if (f === F.Radius) v = Math.max(0, v); p.setS(f, v); } };
  },
  C_OP_RampScalarLinearSimple(d) {
    const rate = d.m_Rate ?? 0, st = d.m_flStartTime ?? 0, et = d.m_flEndTime ?? 1, f = field(d.m_nField, F.Radius);
    return (ps, dt, s, str) => { for (const p of ps) if (p.nage > st && p.nage < et) p.setS(f, p.getS(f) + rate * dt * str); };
  },
  C_OP_RampScalarSpline(d) {
    const r0 = d.m_RateMin ?? 0, r1 = d.m_RateMax ?? 0, f = field(d.m_nField, F.Radius), easeOut = d.m_bEaseOut;
    return (ps, dt, s, str) => { for (const p of ps) { let k = p.nage; k = easeOut ? 1 - (1 - k) * (1 - k) : k * k; p.setS(f, p.getS(f) + lerp(r0, r1, hash(p.uid, 14)) * dt * str * (easeOut ? 2 * (1 - p.nage) : 2 * p.nage)); } };
  },
  C_OP_SpinUpdate: () => (ps, dt, s, str) => { for (const p of ps) p.rot.addScaledVector(p.rotSpeed, dt * str); },
  C_OP_OscillateVector(d) {
    const out = field(d.m_nField, F.Position), rMin = vec(d.m_RateMin), rMax = vec(d.m_RateMax), fMin = vec(d.m_FrequencyMin, [1, 1, 1]), fMax = vec(d.m_FrequencyMax, [1, 1, 1]);
    const mult = number(d.m_flOscMult, 2), add = number(d.m_flOscAdd, 0.5), prop = d.m_bProportional !== false, offsets = d.m_bOffset && out === F.Position;
    return (ps, dt, s, str) => { for (const p of ps) { const m = mult(p, s), o = add(p, s), v = new THREE.Vector3();
      for (let i = 0; i < 3; i++) { const r = lerp(rMin.getComponent(i), rMax.getComponent(i), hash(p.uid, 30 + i)), fq = lerp(fMin.getComponent(i), fMax.getComponent(i), hash(p.uid, 40 + i));
        const ph = prop ? p.nage * fq * m + o : fq * (m * s.age + o); v.setComponent(i, r * str * dt * Math.sin(Math.PI * ph)); }
      p.getV(out).add(v); if (out === F.Color) p.color.clampScalar(0, 1); if (offsets) p.prev.add(v); } };
  },
  C_OP_OscillateScalarSimple(d) {
    const rate = d.m_Rate ?? 0, freq = d.m_Frequency ?? 1, f = field(d.m_nField, F.Alpha), mult = d.m_flOscMult ?? 2, add = d.m_flOscAdd ?? 0.5;
    return (ps, dt, s, str) => { const v = rate * dt * str * Math.sin(Math.PI * freq * (mult * s.age + add)); for (const p of ps) { let x = p.getS(f) + v; if (f === F.Alpha) x = saturate(x); p.setS(f, x); } };
  },
  C_OP_NormalLock(d) { return () => {}; },
  C_OP_AttractToControlPoint(d) {
    const tr = transform(d.m_TransformInput, d.m_nControlPointNumber ?? 0), amount = number(d.m_fForceAmount, 100), fall = d.m_fFalloffPower ?? 0, scale = vec(d.m_vecComponentScale, [1, 1, 1]);
    return (ps, dt, s, str) => { const c = new THREE.Vector3().setFromMatrixPosition(tr(s)); for (const p of ps) { const dir = c.clone().sub(p.pos); const dist = Math.max(1, dir.length());
      p.force.add(dir.normalize().multiply(scale).multiplyScalar(amount(p, s) * str / Math.pow(dist, fall))); } };
  },
  C_OP_DistanceToCP(d) {
    const i0 = number(d.m_flInputMin), i1 = number(d.m_flInputMax, 128), o0 = number(d.m_flOutputMin), o1 = number(d.m_flOutputMax, 1), cp = d.m_nStartCP ?? 0, out = field(d.m_nFieldOutput, F.Radius), method = d.m_nSetMethod;
    return (ps, dt, s) => { for (const p of ps) { const dist = s.cp(cp).pos.distanceTo(p.pos); p.setS(out, setMethod(p, out, remapClamped(dist, i0(p, s), i1(p, s), o0(p, s), o1(p, s)), method, true)); } };
  },
  C_OP_SetAttributeToScalarExpression(d) {
    const a = number(d.m_flInput1), b = number(d.m_flInput2), out = field(d.m_nOutputField, F.ScratchFloat), e = d.m_nExpression, method = d.m_nSetMethod;
    return (ps, dt, s) => { for (const p of ps) { const x = a(p, s), y = b(p, s); const v = e === 'SCALAR_EXPRESSION_MUL' ? x * y : e === 'SCALAR_EXPRESSION_ADD' ? x + y : e === 'SCALAR_EXPRESSION_SUBTRACT' ? x - y : e === 'SCALAR_EXPRESSION_DIVIDE' ? x / (y || 1) : x;
      p.setS(out, setMethod(p, out, v, method, true)); } };
  },
  C_OP_SetFloatAttributeToVectorExpression(d) {
    const a = vector(d.m_vInput1), b = vector(d.m_vInput2), out = field(d.m_nOutputField, F.ScratchFloat), e = d.m_nExpression;
    return (ps, dt, s) => { for (const p of ps) { const x = a(p, s), y = b(p, s); p.setS(out, e === 'VECTOR_FLOAT_EXPRESSION_DISTANCE' ? x.distanceTo(y) : e === 'VECTOR_FLOAT_EXPRESSION_DOTPRODUCT' ? x.dot(y) : x.length()); } };
  },
  // Model-bound: particles ride the bones they were created on or the snapshot points they came from.
  C_OP_SnapshotSkinToBones(d) {
    const f0 = d.m_flLifeTimeFadeStart ?? 0, f1 = d.m_flLifeTimeFadeEnd ?? 0, cp = d.m_nControlPointNumber ?? 0;
    return (ps, dt, s) => { const snap = s.snapshot(cp); if (!snap) return; for (const p of ps) { if (p.snap < 0) continue; const k = f1 > f0 ? 1 - saturate(remap(p.nage, f0, f1)) : 1; if (k <= 0) continue;
      const target = snap.point(p.snap); const delta = target.sub(p.pos).multiplyScalar(k); p.pos.add(delta); p.prev.add(delta); } };
  },
  C_OP_SnapshotRigidSkinToBones(d) { return OP.C_OP_SnapshotSkinToBones(d); },
  C_OP_LockToBone(d) {
    const f0 = d.m_flLifeTimeFadeStart ?? 0, f1 = d.m_flLifeTimeFadeEnd ?? 0;
    return (ps, dt, s) => { const m = s.model; if (!m) return; for (const p of ps) { if (!p.bone) continue; const now = m.boneMatrix(p.bone);
      if (!p.boneLocal) { p.boneLocal = p.pos.clone().applyMatrix4(now.clone().invert()); continue; }
      const k = f1 > f0 ? 1 - saturate(remap(p.nage, f0, f1)) : 1; const target = p.boneLocal.clone().applyMatrix4(now); const delta = target.sub(p.pos).multiplyScalar(k); p.pos.add(delta); p.prev.add(delta); } };
  },
  // Particles placed from a bone's snapshot ride that bone; others move with the control point.
  C_OP_MovementRigidAttachToCP(d) {
    const cp = d.m_nControlPointNumber ?? 0; let prev = null;
    return (ps, dt, s) => {
      const m = s.cp(cp).matrix(), lock = prev ? m.clone().multiply(prev.clone().invert()) : null; prev = m.clone();
      for (const p of ps) {
        if (p.bone && s.model) { const now = s.model.boneMatrix(p.bone); if (p.boneLast) { const move = now.clone().multiply(p.boneLast.clone().invert()); p.pos.applyMatrix4(move); p.prev.applyMatrix4(move); } p.boneLast = now; continue; }
        if (lock) { p.pos.applyMatrix4(lock); p.prev.applyMatrix4(lock); }
      }
    };
  },
  // Control points for this system and its children.
  C_OP_SetSingleControlPointPosition(d) {
    const cp = d.m_nCP1 ?? 1, pos = vector(d.m_vecCP1Pos, [128, 0, 0]), once = d.m_bSetOnce, world = d.m_bUseWorldLocation, head = d.m_nHeadLocation ?? 0; let done = false;
    return (ps, dt, s) => { if (once && done) return; const v = pos(null, s).clone(); if (!world) v.applyMatrix4(s.cp(head).matrix()); s.setCP(cp, v); done = true; };
  },
  C_OP_SetControlPointPositions(d) {
    const cps = [[d.m_nCP1 ?? 1, d.m_vecCP1Pos ?? [128, 0, 0]], [d.m_nCP2 ?? 2, d.m_vecCP2Pos ?? [0, 128, 0]], [d.m_nCP3 ?? 3, d.m_vecCP3Pos ?? [-128, 0, 0]], [d.m_nCP4 ?? 4, d.m_vecCP4Pos ?? [0, -128, 0]]];
    const once = d.m_bSetOnce, world = d.m_bUseWorldLocation, head = d.m_nHeadLocation ?? 0; let done = false;
    return (ps, dt, s) => { if (once && done) return; const m = world ? new THREE.Matrix4() : s.cp(head).matrix(); for (const [cp, v] of cps) s.setCP(cp, vec(v).applyMatrix4(m)); done = true; };
  },
  C_OP_SetControlPointOrientation(d) {
    const cp = d.m_nCP ?? 1, rot = vec(d.m_vecRotation), world = d.m_bUseWorldLocation, head = d.m_nHeadLocation ?? 0;
    return (ps, dt, s) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.z * Math.PI / 180, rot.x * Math.PI / 180, rot.y * Math.PI / 180, 'ZYX'));
      if (!world) q.premultiply(s.cp(head).quat); s.setCPRotation(cp, q); };
  },
  C_OP_SetParentControlPointsToChildCP(d) {
    const childCP = d.m_nChildControlPoint ?? 0, count = d.m_nNumControlPoints ?? 1, first = d.m_nFirstSourcePoint ?? 0, group = d.m_nChildGroupID ?? 0, orient = d.m_bSetOrientation;
    return (ps, dt, s) => { const kids = s.sim.children.filter((c) => c.groupId === group); for (let i = 0; i < Math.min(count, kids.length); i++) { const src = s.cp(first + i); kids[i].state.override(childCP, src.pos, orient ? src.quat : null); } };
  },
  // Each child gets a control point at one of this system's particles. With m_bSetOrientation it
  // takes the particle's orientation: particles locked to a control point with its rotation (the
  // arcana's head points, locked to attach_head) turn with that point, so they carry its axes
  // (x up the head: the head flames rise and trail back); others face along their normal (Source's
  // VectorVectors basis).
  C_OP_SetPerChildControlPoint(d) {
    const first = d.m_nFirstControlPoint ?? 0, group = d.m_nChildGroupID ?? 0, orient = d.m_bSetOrientation, byCount = d.m_bNumBasedOnParticleCount;
    let lockCP;
    return (ps, dt, s) => {
      if (lockCP === undefined) { const lock = (s.sim.def.m_Operators || []).find((o) => o._class === 'C_OP_PositionLock' && o.m_bLockRot && !o.m_bDisableOperator); lockCP = lock ? lock.m_TransformInput?.m_nControlPoint ?? lock.m_nControlPointNumber ?? 0 : null; }
      const kids = s.sim.children.filter((c) => c.groupId === group), n = byCount ? Math.min(kids.length, ps.length) : kids.length;
      for (let i = 0; i < n; i++) { const p = ps[i % Math.max(1, ps.length)]; if (!p) break;
        kids[i].state.override(first, p.pos, orient ? (lockCP !== null ? s.cp(lockCP).quat.clone() : forwardBasis(p.normal)) : null); }
    };
  },
  C_OP_SetControlPointFromObjectScale(d) { const out = d.m_nCPOutput ?? 1; return (ps, dt, s) => s.setCP(out, new THREE.Vector3(1, 1, 1)); },
  C_OP_FadeAndKill(d) {
    const si = d.m_flStartFadeInTime ?? 0, ei = d.m_flEndFadeInTime ?? 0.5, so = d.m_flStartFadeOutTime ?? 0.5, eo = d.m_flEndFadeOutTime ?? 1, a0 = d.m_flStartAlpha ?? 1, a1 = d.m_flEndAlpha ?? 0;
    return (ps) => { for (const p of ps) { const t = p.nage, init = p.initS(F.Alpha); if (t >= 1) { p.dead = true; continue; }
      if (t < ei && ei > si) p.alpha = init * lerp(a0, 1, saturate(remap(t, si, ei))); else if (t > so && eo > so) p.alpha = init * lerp(1, a1, saturate(remap(t, so, eo))); } };
  },
  C_OP_FadeIn(d) {
    const t0 = d.m_flFadeInTimeMin ?? 0.25, t1 = d.m_flFadeInTimeMax ?? 0.25, prop = d.m_bProportional !== false;
    return (ps) => { for (const p of ps) { const t = lerp(t0, t1, hash(p.uid, 93)), x = prop ? p.nage : p.age; if (x < t) p.alpha = (x / t) * p.initS(F.Alpha); } };
  },
  C_OP_Spin(d) {
    const rate = (d.m_nSpinRateDegrees ?? 0) * Math.PI / 180, min = (d.m_nSpinRateMinDegrees ?? 0) * Math.PI / 180, stop = d.m_fSpinRateStopTime ?? 0;
    return (ps, dt, s, str) => { for (const p of ps) { let r = rate; if (stop > 0) r = Math.max(min, rate * (1 - saturate(p.age / stop))); p.rot.z += r * dt * str; } };
  },
  C_OP_SpinYaw(d) { const rate = (d.m_nSpinRateDegrees ?? 0) * Math.PI / 180; return (ps, dt, s, str) => { for (const p of ps) p.rot.x += rate * dt * str; }; },
  C_OP_OscillateScalar(d) {
    const r0 = d.m_RateMin ?? 0, r1 = d.m_RateMax ?? 0, f0 = d.m_FrequencyMin ?? 1, f1 = d.m_FrequencyMax ?? 1, f = field(d.m_nField, F.Alpha), prop = d.m_bProportional !== false, mult = d.m_flOscMult ?? 2, add = d.m_flOscAdd ?? 0.5;
    const s0 = d.m_flStartTime_min ?? 0, s1 = d.m_flStartTime_max ?? 0, e0 = d.m_flEndTime_min ?? 1, e1 = d.m_flEndTime_max ?? 1;
    return (ps, dt, s, str) => { for (const p of ps) { const a = lerp(s0, s1, hash(p.uid, 51)), b = lerp(e0, e1, hash(p.uid, 52)); if (p.nage < a || p.nage > b) continue;
      const fq = lerp(f0, f1, hash(p.uid, 53)), ph = prop ? p.nage * fq * mult + add : fq * (mult * s.age + add);
      let x = p.getS(f) + lerp(r0, r1, hash(p.uid, 54)) * str * dt * Math.sin(Math.PI * ph); if (f === F.Alpha) x = saturate(x); p.setS(f, x); } };
  },
  C_OP_SetFloat(d) {
    const v = number(d.m_InputValue), out = field(d.m_nOutputField, F.Radius), method = d.m_nSetMethod, lerpK = number(d.m_Lerp, 1);
    return (ps, dt, s) => { for (const p of ps) { let x = v(p, s); if (ANGLE.has(out) && !/SCALE/.test(method || '')) x *= Math.PI / 180; p.setS(out, lerp(p.getS(out), setMethod(p, out, x, method, true), lerpK(p, s))); } };
  },
  C_OP_Noise(d) {
    const out = field(d.m_nFieldOutput, F.Radius), lo = d.m_flOutputMin ?? 0, hi = d.m_flOutputMax ?? 1, scale = d.m_fl4NoiseScale ?? 0.1, add = d.m_bAdditive, ts = d.m_flNoiseAnimationTimeScale ?? 0;
    return (ps, dt, s, str) => { for (const p of ps) { const n = (noise3(p.pos.x * scale + ts * s.age, p.pos.y * scale, p.pos.z * scale) + 1) / 2; let v = lerp(lo, hi, saturate(n)); if (ANGLE.has(out)) v *= Math.PI / 180;
      p.setS(out, add ? p.getS(out) + v * dt * str : lerp(p.getS(out), v, str)); } };
  },
  C_OP_InheritFromParentParticles(d) { const init = INIT.C_INIT_InheritFromParentParticles(d); return (ps, dt, s) => { for (const p of ps) init(p, s); }; },
  // Model particles (a prop held for a taunt) sit on a control point and turn with it.
  C_OP_SetToCP(d) {
    const cp = d.m_nControlPointNumber ?? 0, off = vec(d.m_vecOffset), local = d.m_bOffsetLocal;
    return (ps, dt, s) => { const c = s.cp(cp), o = local ? off.clone().applyQuaternion(c.quat) : off; for (const p of ps) { p.pos.copy(c.pos).add(o); p.prev.copy(p.pos); } };
  },
  C_OP_RemapCPOrientationToRotations(d) {
    const cp = d.m_TransformInput?.m_nControlPoint ?? d.m_nCP ?? 0, offset = angles(vec(d.m_vecRotation));
    return (ps, dt, s) => { const q = s.cp(cp).quat.clone().multiply(offset), e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
      for (const p of ps) { p.orient = q.clone(); p.rot.set(e.z, e.y, e.x); } };
  },
  C_OP_RemapCPtoScalar(d) {
    const cp = d.m_nCPInput ?? 0, comp = d.m_nField ?? 0, i0 = d.m_flInputMin ?? 0, i1 = d.m_flInputMax ?? 1, o0 = d.m_flOutputMin ?? 0, o1 = d.m_flOutputMax ?? 1, out = field(d.m_nFieldOutput, F.Radius), method = d.m_nSetMethod;
    const st = d.m_flStartTime ?? -1, et = d.m_flEndTime ?? -1;
    return (ps, dt, s) => { const x = s.cp(cp).pos.getComponent(Math.min(2, comp)); let v = remapClamped(x, i0, i1, o0, o1); if (ANGLE.has(out)) v *= Math.PI / 180;
      for (const p of ps) { if (st >= 0 && et > st && (p.nage < st || p.nage > et)) continue; p.setS(out, setMethod(p, out, v, method)); } };
  },
  C_OP_StopAfterCPDuration(d) {
    const dur = number(d.m_flDuration, 1), destroy = d.m_bDestroyImmediately;
    return (ps, dt, s) => { if (s.age < dur(null, s)) return; s.sim.root.stopEmission(); if (destroy) for (const p of ps) p.dead = true; };
  },
  C_OP_MovementPlaceOnGround(d) { const off = number(d.m_flOffset); return (ps, dt, s) => { for (const p of ps) { const z = GROUND + off(p, s); p.prev.z += z - p.pos.z; p.pos.z = z; } }; },
  C_OP_LerpScalar(d) {
    const out = field(d.m_nFieldOutput, F.Radius), target = number(d.m_flOutput), st = d.m_flStartTime ?? 0, et = d.m_flEndTime ?? 1;
    return (ps, dt, s) => { for (const p of ps) { if (p.nage < st) continue; let v = target(p, s); if (ANGLE.has(out)) v *= Math.PI / 180; p.setS(out, lerp(p.initS(out), v, saturate(remap(p.nage, st, et)))); } };
  },
  C_OP_MaxVelocity(d) { const max = d.m_flMaxVelocity ?? 0; return (ps, dt) => { if (max <= 0 || dt <= 0) return; for (const p of ps) { const v = p.pos.clone().sub(p.prev), l = v.length() / dt; if (l > max) p.prev.copy(p.pos).sub(v.multiplyScalar(max / l)); } }; },
  C_OP_ClampScalar(d) { const out = field(d.m_nFieldOutput, F.Radius), lo = number(d.m_flOutputMin), hi = number(d.m_flOutputMax, 1); return (ps, dt, s) => { for (const p of ps) p.setS(out, Math.min(Math.max(p.getS(out), lo(p, s)), hi(p, s))); }; },
  // Children are on unless an operator turns them off; these are the defaults.
  // Particles faded out below a minimum alpha die (systems without C_OP_Decay end their particles so).
  C_OP_AlphaDecay(d) { const min = d.m_flMinAlpha ?? 0; return (ps) => { for (const p of ps) if (p.alpha <= min && p.age > 0) p.dead = true; }; },
  C_OP_EnableChildrenFromParentParticleCount: () => () => {},
  C_OP_DistanceCull(d) {
    const cp = d.m_nControlPointNumber ?? 0, dist = d.m_flDistance ?? 0, inside = d.m_bCullInside, off = vec(d.m_vecPointOffset);
    return (ps, dt, s) => { const c = s.cp(cp).pos.clone().add(off); for (const p of ps) { const far = p.pos.distanceTo(c) > dist; if (far !== !!inside) p.dead = true; } };
  },
  C_OP_MovementRotateParticleAroundAxis(d) {
    const axis = vec(d.m_vecRotAxis, [0, 0, 1]).normalize(), rate = number(d.m_flRotRate, 180), cp = d.m_TransformInput?.m_nControlPoint ?? d.m_nCP ?? 0, local = d.m_bLocalSpace;
    return (ps, dt, s, str) => { const c = s.cp(cp), ax = local ? axis.clone().applyQuaternion(c.quat) : axis, q = new THREE.Quaternion().setFromAxisAngle(ax, rate(null, s) * Math.PI / 180 * dt * str);
      for (const p of ps) { p.pos.sub(c.pos).applyQuaternion(q).add(c.pos); p.prev.sub(c.pos).applyQuaternion(q).add(c.pos); } };
  },
  C_OP_RemapCPtoVector(d) {
    const cp = d.m_nCPInput ?? 0, out = field(d.m_nFieldOutput, F.Color), i0 = vec(d.m_vInputMin), i1 = vec(d.m_vInputMax, [1, 1, 1]), o0 = vec(d.m_vOutputMin), o1 = vec(d.m_vOutputMax, [1, 1, 1]);
    return (ps, dt, s) => { const x = s.cp(cp).pos, v = new THREE.Vector3(...[0, 1, 2].map((k) => remapClamped(x.getComponent(k), i0.getComponent(k), i1.getComponent(k), o0.getComponent(k), o1.getComponent(k)))); for (const p of ps) p.setV(out, v.clone()); };
  },
  C_OP_DampenToCP(d) {
    const cp = d.m_nControlPointNumber ?? 0, range = d.m_flRange ?? 100, scale = d.m_flScale ?? 1;
    return (ps, dt, s) => { const c = s.cp(cp).pos; for (const p of ps) { const dist = p.pos.distanceTo(c); if (dist > range) continue; const k = lerp(1, 1 - scale, 1 - dist / range), step = p.pos.clone().sub(p.prev).multiplyScalar(k); p.prev.copy(p.pos).sub(step); } };
  },
  C_OP_MaintainSequentialPath(d) {
    const params = d.m_PathParams, n = Math.max(1, d.m_flNumToAssign ?? 100), loop = d.m_bLoop !== false;
    return (ps, dt, s) => { ps.forEach((p, i) => { const t = p.pathT ?? (n > 1 ? (i % n) / (loop ? n : n - 1) : 0); p.pos.copy(pathPoint(params, t, s)); p.prev.copy(p.pos); }); };
  },
  C_OP_Orient2DRelToCP(d) {
    const cp = d.m_nCP ?? 0, off = (d.m_flRotOffset ?? 0) * Math.PI / 180, spin = d.m_flSpinStrength ?? 1, out = field(d.m_nFieldOutput, F.Yaw);
    return (ps, dt, s) => { const c = s.cp(cp).pos; for (const p of ps) { const v = c.clone().sub(p.pos); p.setS(out, lerp(p.getS(out), Math.atan2(v.y, v.x) + off, spin)); } };
  },
  C_OP_SetControlPointToCenter(d) {
    const out = d.m_nCP1 ?? 1, off = vec(d.m_vecCP1Pos);
    return (ps, dt, s) => { if (!ps.length) return; const c = new THREE.Vector3(); for (const p of ps) c.add(p.pos); s.setCP(out, c.divideScalar(ps.length).add(off)); };
  },
  C_OP_SetChildControlPoints(d) {
    const group = d.m_nChildGroupID ?? 0, first = d.m_nFirstControlPoint ?? 0, count = d.m_nNumControlPoints ?? 1, src = d.m_nFirstSourcePoint ?? 0, orient = d.m_bSetOrientation;
    return (ps, dt, s) => { const kids = s.sim.children.filter((c) => c.groupId === group); for (const k of kids) for (let i = 0; i < count; i++) { const p = ps[src + i]; if (p) k.state.override(first + i, p.pos, orient ? forwardBasis(p.normal) : null); } };
  },
  C_OP_RotateVector(d) {
    const out = field(d.m_nFieldOutput, F.Normal), a0 = vec(d.m_vecRotAxisMin, [0, 0, 1]), a1 = vec(d.m_vecRotAxisMax, [0, 0, 1]), r0 = d.m_flRotRateMin ?? 180, r1 = d.m_flRotRateMax ?? 180, normalize = d.m_bNormalize;
    return (ps, dt, s, str) => { for (const p of ps) { const ax = a0.clone().lerp(a1, hash(p.uid, 61)).normalize(), q = new THREE.Quaternion().setFromAxisAngle(ax, lerp(r0, r1, hash(p.uid, 62)) * Math.PI / 180 * dt * str); const v = p.getV(out).applyQuaternion(q); if (normalize) v.normalize(); } };
  },
  C_OP_SetVec(d) { const v = vector(d.m_InputValue), out = field(d.m_nOutputField, F.Color); return (ps, dt, s) => { for (const p of ps) p.setV(out, v(p, s).clone()); }; },
  // The end cap (the effect stopped): its particles go after a time, a value going to another first.
  // Nothing before it, whatever the operator's end-cap state says (Marci's basket marks none).
  C_OP_EndCapTimedDecay(d) { const time = d.m_flDecayTime ?? 1; return (ps, dt, s) => { if (s.endedAt !== undefined && s.age - s.endedAt >= time) for (const p of ps) p.dead = true; }; },
  C_OP_LerpEndCapScalar(d) {
    const out = field(d.m_nFieldOutput, F.Alpha), to = d.m_flOutput ?? 1, time = d.m_flLerpTime ?? 1;
    return (ps, dt, s) => { if (s.endedAt === undefined) return; const k = time > 0 ? saturate((s.age - s.endedAt) / time) : 1; for (const p of ps) { p.capFrom ??= p.getS(out); p.setS(out, lerp(p.capFrom, to, k)); } };
  },
  // Lights, speed-to-CP links: nothing to draw.
  C_OP_RemapSpeedtoCP: () => () => {},
  C_OP_RemapSpeed: () => () => {},
  C_OP_SelectivelyEnableChildren: () => () => {},
  C_OP_RenderDeferredLight: () => () => {},
};

const EMIT = {
  C_OP_ContinuousEmitter(d) {
    const dur = number(d.m_flEmissionDuration), start = number(d.m_flStartTime), rate = number(d.m_flEmitRate, 100); let pending = 0, flushed = 0, finished = false;
    return { reset() { pending = 0; flushed = 0; finished = false; }, emit(dt, s, emit) {
      if (finished) return; const end = s.age, st = start(null, s), du = dur(null, s); let a = end - dt, b = end; if (st > b) return; if (du) { a = Math.max(st, a); b = Math.min(st + du, b); }
      if (b > a) { pending += Math.max(0, rate(null, s)) * (b - a); const to = Math.floor(pending + 0.001), n = to - flushed; if (n > 0) { flushed = to; const step = (b - a) / n; for (let i = 0; i < n; i++) emit(end - Math.min(a + (i + 1) * step, b)); } }
      if (du && end > st + du) finished = true; } };
  },
  C_OP_InstantaneousEmitter(d) {
    const count = number(d.m_nParticlesToEmit, 100), start = number(d.m_flStartTime), snapCP = d.m_nSnapshotControlPoint ?? -1; let done = false;
    return { reset() { done = false; }, emit(dt, s, emit) { if (done) return; const st = start(null, s); if (s.age < st) return; done = true;
      let n = snapCP >= 0 && s.snapshot(snapCP) ? s.snapshot(snapCP).count : Math.floor(count(null, s)); n = Math.min(n, s.max); for (let i = 0; i < n; i++) emit(s.age - st); } };
  },
  C_OP_NoiseEmitter(d) {
    const dur = number(d.m_flEmissionDuration), start = number(d.m_flStartTime), ns = number(d.m_flNoiseScale, 0.1), o0 = number(d.m_flOutputMin), o1 = number(d.m_flOutputMax, 100), off = d.m_flOffset ?? 0;
    let pending = 1, flushed = 0, finished = false;
    return { reset() { pending = 1; flushed = 0; finished = false; }, emit(dt, s, emit) {
      if (finished) return; const end = s.age, st = start(null, s), du = dur(null, s); let a = end - dt, b = end; if (st > b) return; if (du) { a = Math.max(st, a); b = Math.min(st + du, b); }
      if (b > a) { const t = (end + off) * ns(null, s), n = noise3(t, t, t), lo = o0(null, s), hi = o1(null, s), r = Math.max(0, lo + 0.5 * (hi - lo) + 0.5 * (hi - lo) * n);
        pending += r * (b - a); const to = Math.floor(pending), k = to - flushed; if (k > 0) { flushed = to; const step = (b - a) / k; for (let i = 0; i < k; i++) emit(end - Math.min(a + (i + 1) * step, b)); } }
      if (du && end > st + du) finished = true; } };
  },
};

// ---------------------------------------------------------------- control points and systems
class ControlPoint {
  constructor() { this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); }
  matrix() { return new THREE.Matrix4().compose(this.pos, this.quat, new THREE.Vector3(1, 1, 1)); }
}
class State {
  constructor(sim, parent) { this.sim = sim; this.parent = parent; this.own = new Map(); this.age = 0; this.prevDt = 0; this.seed = Math.floor(rnd() * 1e6); }
  get max() { return this.sim.maxParticles; }
  get model() { return this.sim.root.model; }
  cp(i) { return this.own.get(i) || (this.parent ? this.parent.cp(i) : this.sim.root.cps.get(i) || this.sim.root.cps.get(0) || new ControlPoint()); }
  setCP(i, pos) { const c = this.own.get(i) || new ControlPoint(); c.pos.copy(pos); this.own.set(i, c); }
  setCPRotation(i, q) { const c = this.own.get(i) || Object.assign(new ControlPoint(), { pos: this.cp(i).pos.clone() }); c.quat.copy(q); this.own.set(i, c); }
  override(i, pos, quat) { const c = this.own.get(i) || new ControlPoint(); c.pos.copy(pos); if (quat) c.quat.copy(quat); this.own.set(i, c); }
  snapshot(cp) { return this.sim.snapshot || this.parent?.snapshot(cp) || null; }
}

export class Simulation {
  constructor(def, lib, root = null, parentState = null) {
    this.def = def; this.lib = lib; this.root = root || this; this.children = []; this.particles = []; this.emitted = 0;
    if (!root) { this.cps = new Map(); this.model = null; }
    this.state = new State(this, parentState);
    this.maxParticles = Math.min(def.m_nMaxParticles ?? 1000, 2000);
    const cc = def.m_ConstantColor || [255, 255, 255, 255];
    this.constants = { color: new THREE.Vector3(cc[0] / 255, cc[1] / 255, cc[2] / 255), alpha: cc[3] / 255, radius: def.m_flConstantRadius ?? 5, life: def.m_flConstantLifespan ?? 1,
      roll: (def.m_flConstantRotation ?? 0) * Math.PI / 180, rollSpeed: (def.m_flConstantRotationSpeed ?? 0) * Math.PI / 180, seq: def.m_nConstantSequenceNumber ?? 0 };
    this.maxStep = def.m_flMaximumTimeStep ?? 0.1;
    this.preSim = def.m_flPreSimulationTime ?? 0;
    this.groupId = def.m_nGroupID ?? 0;
    const build = (list, table) => (list || []).filter((d) => !d.m_bDisableOperator).map((d) => { const f = table[d._class]; if (!f) { lib.unsupported.add(d._class); return null; } const fn = f(d); return fn ? { fn, strength: strength(d), endcap: endcapState(d) } : null; }).filter(Boolean);
    this.pre = build(def.m_PreEmissionOperators, OP);
    this.emitters = build(def.m_Emitters, EMIT);
    // Initializers keep their definition index and the fields they write: below behaviour version 6
    // the first writer of a field wins (up to m_nFirstMultipleOverride_BackwardCompat).
    this.version = def.m_nBehaviorVersion ?? 0; this.firstMultiple = def.m_nFirstMultipleOverride_BackwardCompat ?? -1;
    this.inits = (def.m_Initializers || []).map((d, index) => {
      if (d.m_bDisableOperator || endcapSkip(d)) return null; const f = INIT[d._class]; if (!f) { lib.unsupported.add(d._class); return null; }
      const fn = f(d); return fn ? { fn, index, fields: writes(d) } : null;
    }).filter(Boolean);
    this.ops = build(def.m_Operators, OP);
    this.renderers = (def.m_Renderers || []).filter((r) => !r.m_bDisableOperator).map((r) => lib.renderer(r, this)).filter(Boolean);
    this.snapshot = def.m_hSnapshot ? lib.snapshot(def.m_hSnapshot) : null; if (this.snapshot) this.snapshot.sim = this;
    for (const c of def.m_Children || []) {
      if (c.m_bEndCap || c.m_bDisableChild) continue;
      const cd = lib.system(c.m_ChildRef); if (!cd) continue;
      const child = new Simulation(cd, lib, this.root, this.state); child.delay = c.m_flDelay ?? 0; this.children.push(child);
    }
    this.delay = 0; this.stopped = false;
  }
  // No more particles from here on (the effect's animation ended): those alive live out their lives,
  // with the operators of the end cap.
  stopEmission() { for (const sim of this.all()) if (!sim.stopped) { sim.stopped = true; sim.state.endedAt = sim.state.age; } }
  get finished() { return this.stopped && this.count() === 0; }
  // Takes this system's meshes out of the scene (an effect that has run its course).
  dispose() { for (const sim of this.all()) for (const r of sim.renderers) r.dispose(); }
  emit(ageAtSpawn) {
    if (this.particles.length >= this.maxParticles) return;
    const p = new Particle(this.constants); p.sys = this.state; p.uid = this.emitted++; p.id = p.uid; p.index = this.particles.length;
    p.pos.copy(this.state.cp(0).pos); p.created = this.state.age - ageAtSpawn; p.age = ageAtSpawn;
    let written = new Set([F.CreationTime]);
    for (const i of this.inits) {
      if (this.version < 6 && (this.firstMultiple < 0 || i.index < this.firstMultiple) && i.fields.length && i.fields.every((f) => written.has(f))) continue;
      i.fn(p, this.state); for (const f of i.fields) written.add(f);
    }
    // The previous position one previous step back: movement scales the step by dt / previous dt.
    p.prev.copy(p.pos).addScaledVector(p.vel, -(this.state.prevDt || this.dt || this.maxStep));
    p.initial = p.snapshot();
    this.particles.push(p);
  }
  update(dt, first = true) {
    if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return; }
    if (first && this.preSim > 0 && !this.preSimDone) { this.preSimDone = true; for (let t = 0; t < this.preSim; t += this.maxStep) this.step(this.maxStep); }
    let left = Math.min(dt, this.maxStep * 10);
    while (left > 1e-6) { const st = Math.min(left, this.maxStep); left -= st; this.step(st); }
    for (const c of this.children) c.update(dt, first);
  }
  step(dt) {
    const s = this.state; this.dt = dt; s.age += dt;
    for (const p of this.particles) p.age = s.age - p.created;
    const runs = (o) => o.endcap === null || o.endcap === this.stopped;
    for (const o of this.pre) { if (!runs(o)) continue; const k = o.strength(s); if (k > 0) o.fn(this.particles, dt, s, k); }
    if (!this.stopped) for (const e of this.emitters) if (runs(e)) e.fn.emit(dt, s, (age) => this.emit(age));
    for (const o of this.ops) { if (!runs(o)) continue; const k = o.strength(s); if (k > 0) o.fn(this.particles, dt, s, k); }
    if (this.particles.some((p) => p.dead)) this.particles = this.particles.filter((p) => !p.dead);
    this.particles.forEach((p, i) => { p.index = i; });
    s.prevDt = dt;
  }
  render(camera, groupInverse) { for (const r of this.renderers) r.update(this.particles, this.state, camera, groupInverse); for (const c of this.children) c.render(camera, groupInverse); }
  *all() { yield this; for (const c of this.children) yield* c.all(); }
  count() { let n = this.particles.length; for (const c of this.children) n += c.count(); return n; }
}

// ---------------------------------------------------------------- rendering
const vertexShader = `
attribute vec4 color; attribute vec4 uvA; attribute vec4 uvB; attribute float blend;
varying vec4 vColor; varying vec2 vUvA; varying vec2 vUvB; varying float vBlend;
void main() { vColor = color; vUvA = mix(uvA.xy, uvA.zw, uv); vUvB = mix(uvB.xy, uvB.zw, uv); vBlend = blend; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragmentShader = `
uniform sampler2D map; uniform float overbright; uniform float addSelf; uniform bool saturateColor; uniform int mode; uniform bool blendFrames;
varying vec4 vColor; varying vec2 vUvA; varying vec2 vUvB; varying float vBlend;
void main() {
  vec4 t = texture2D(map, vUvA); if (blendFrames) t = mix(t, texture2D(map, vUvB), vBlend);
  vec3 c = vColor.rgb * t.rgb; float a = t.a * vColor.a;
  if (mode == 5) { vec3 m = mix(vec3(0.5), mix(vec3(0.5), c, vColor.rgb), vec3(a)); gl_FragColor = vec4(clamp(m, 0.0, 1.0), a); return; }
  c *= overbright; if (saturateColor) c = clamp(c, 0.0, 1.0); c *= addSelf;
  gl_FragColor = vec4(c * a, mode == 1 ? 0.0 : a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function material(tex, r) {
  const mode = r.m_nOutputBlendMode === 'PARTICLE_OUTPUT_BLEND_MODE_ADD' ? 1 : r.m_nOutputBlendMode === 'PARTICLE_OUTPUT_BLEND_MODE_MOD2X' ? 5 : 0;
  const m = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: tex }, overbright: { value: number(r.m_flOverbrightFactor, 1)(null, null) }, addSelf: { value: 1 + number(r.m_flAddSelfAmount, 0)(null, null) },
      saturateColor: { value: r.m_bSaturateColorPreAlphaBlend !== false }, mode: { value: mode }, blendFrames: { value: r.m_bBlendFramesSeq0 !== false } },
  });
  // Mod2x: colour = 2 × source × destination, so 50 % grey changes nothing. The canvas's alpha must
  // stay as it is: blended like the colour, it fell to 2 × a × alpha, and the sprite's whole square
  // cut a see-through hole in the hero, invisible on a dark background, a pale square on a light one.
  if (mode === 5) Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor, blendEquation: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation });
  else Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, premultipliedAlpha: true });
  return m;
}
const lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
class QuadBatch {
  constructor(group, tex, r, capacity) {
    // Colours are authored in gamma space and made linear unless the renderer says otherwise; mod2x
    // keeps them as they are, since its neutral is 0.5 (see texture()).
    this.linear = r.m_bGammaCorrectVertexColors !== false && r.m_nOutputBlendMode !== 'PARTICLE_OUTPUT_BLEND_MODE_MOD2X';
    this.capacity = capacity; const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 12); this.uv = new Float32Array(capacity * 8); this.col = new Float32Array(capacity * 16); this.ua = new Float32Array(capacity * 16); this.ub = new Float32Array(capacity * 16); this.bl = new Float32Array(capacity * 4);
    const idx = new Uint32Array(capacity * 6); for (let i = 0; i < capacity; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    for (const [n, a, k] of [['position', this.pos, 3], ['uv', this.uv, 2], ['color', this.col, 4], ['uvA', this.ua, 4], ['uvB', this.ub, 4], ['blend', this.bl, 1]]) g.setAttribute(n, new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < capacity; i++) this.uv.set([0, 1, 0, 0, 1, 0, 1, 1], i * 8);
    this.mesh = new THREE.Mesh(g, material(tex, r)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; group.add(this.mesh); this.n = 0;
  }
  begin() { this.n = 0; }
  quad(corners, color, uvA, uvB, blend) {
    if (this.n >= this.capacity) return;
    // A card with any value that is not a number would be drawn as a solid square (or not at all,
    // depending on the GPU): it is skipped.
    if (!Number.isFinite(blend) || !corners.every((c) => Number.isFinite(c.x + c.y + c.z)) || !(Array.isArray(color[0]) ? color.flat() : color).every(Number.isFinite) || !uvA.every(Number.isFinite) || !uvB.every(Number.isFinite)) return;
    const i = this.n++;
    for (let k = 0; k < 4; k++) { this.pos.set([corners[k].x, corners[k].y, corners[k].z], i * 12 + k * 3); const c = Array.isArray(color[0]) ? color[k] : color; this.col.set(this.linear ? [lin(c[0]), lin(c[1]), lin(c[2]), c[3]] : c, i * 16 + k * 4); this.ua.set(uvA, i * 16 + k * 4); this.ub.set(uvB, i * 16 + k * 4); this.bl[i * 4 + k] = blend; }
  }
  end() { const g = this.mesh.geometry; g.setDrawRange(0, this.n * 6); for (const k of ['position', 'color', 'uvA', 'uvB', 'blend']) g.attributes[k].needsUpdate = true; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
function sheetFrame(info, p, rate, type) {
  const seqs = info?.sequences; if (!seqs?.length) return null;
  const seq = seqs[p.seq % seqs.length]; if (!seq?.frames.length) return null;
  if (seq.frames.length < 2) return { a: seq.frames[0].uv, b: seq.frames[0].uv, fa: seq.frames[0], fb: seq.frames[0], t: 0 };
  const total = seq.frames.reduce((a, f) => a + f.time, 0) || seq.frames.length;
  const passes = (type === 'ANIMATION_TYPE_FIT_LIFETIME' ? p.nage : p.age) * rate;
  // A sheet's last frame may last 0 (caustic.vtex): its blend toward the next is 0, not 0 / 0. A NaN
  // here reached the shader and drew the whole card white.
  let pos = total * (seq.clamp ? saturate(passes) : passes - Math.floor(passes)); if (!Number.isFinite(pos)) pos = 0;
  for (let i = 0; i < seq.frames.length; i++) { const f = seq.frames[i]; if (pos < f.time || i === seq.frames.length - 1) { const n = seq.clamp ? Math.min(i + 1, seq.frames.length - 1) : (i + 1) % seq.frames.length; return { a: f.uv, b: seq.frames[n].uv, fa: f, fb: seq.frames[n], t: f.time > 0 ? saturate(pos / f.time) : 0 }; } pos -= f.time; }
  return null;
}
const FULL = [0, 0, 1, 1];
// Screen-facing basis in the particle space, from the camera.
function billboard(camera, groupInverse) {
  const m = new THREE.Matrix3().setFromMatrix4(groupInverse.clone().multiply(camera.matrixWorld));
  const right = new THREE.Vector3(1, 0, 0).applyMatrix3(m).normalize(), up = new THREE.Vector3(0, 1, 0).applyMatrix3(m).normalize();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).applyMatrix4(groupInverse);
  return { right, up, eye };
}
class SpriteRenderer {
  dispose() { this.batch.dispose(); }
  constructor(r, lib, sim) {
    const t = lib.texture(r); this.info = t.info; this.batch = new QuadBatch(lib.group, t.texture, r, sim.maxParticles); this.rate = r.m_flAnimationRate ?? 0.1; this.type = r.m_nAnimationType;
    this.orient = r.m_nOrientationType; this.radiusScale = number(r.m_flRadiusScale, 1); this.alphaScale = number(r.m_flAlphaScale, 1);
    this.minSize = number(r.m_flMinSize, 0)(); this.maxSize = number(r.m_flMaxSize, 5000)(); this.fadeStart = number(r.m_flStartFadeSize, 1e8)(); this.fadeEnd = number(r.m_flEndFadeSize, 2e8)();
  }
  update(ps, s, camera, gi) {
    const b = this.batch, { right, up, eye } = billboard(camera, gi); b.begin();
    for (const p of ps) {
      // Screen-size limits: a card that grows too large on screen fades, and its size is clamped.
      const dist = eye.distanceTo(p.pos); let r = p.radius * this.radiusScale(p, s), fade = 1;
      if (r > this.fadeStart * dist) { if (r >= this.fadeEnd * dist) continue; fade = 1 - remap(r, this.fadeStart * dist, this.fadeEnd * dist); }
      r = Math.min(Math.max(r, this.minSize * dist), this.maxSize * dist);
      const a = p.alpha * this.alphaScale(p, s) * fade; if (r <= 0 || a < 1 / 255) continue;
      let R, U;
      if (this.orient === 'PARTICLE_ORIENTATION_ALIGN_TO_PARTICLE_NORMAL') { const n = p.normal.clone().normalize(), ref = Math.abs(n.z) > 0.1 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1); U = n.clone().cross(ref).normalize(); R = U.clone().cross(n); }
      else if (this.orient === 'PARTICLE_ORIENTATION_WORLD_Z_ALIGNED') { R = new THREE.Vector3(0, -1, 0); U = new THREE.Vector3(1, 0, 0); }
      else { R = right.clone(); U = up.clone(); }
      const c = Math.cos(p.rot.z), sn = Math.sin(p.rot.z), rr = R.clone().multiplyScalar(c).addScaledVector(U, sn).multiplyScalar(r), uu = U.clone().multiplyScalar(c).addScaledVector(R, -sn).multiplyScalar(r);
      // Sheet frames are cropped to their content: the card shrinks to the crop window, as in the game.
      const o = p.pos.clone(), f = sheetFrame(this.info, p, this.rate, this.type);
      let uvA = FULL, uvB = FULL;
      if (f) {
        const win = (fr) => { const [u0, v0, u1, v1] = fr.uv, [c0, d0, c1, d1] = fr.crop || fr.uv, w = u1 - u0 || 1, h = v1 - v0 || 1; return [(c0 - u0) / w, (d0 - v0) / h, (c1 - u0) / w, (d1 - v0) / h]; };
        const A = win(f.fa), B = win(f.fb), W = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
        const rect = (fr) => { const [u0, v0, u1, v1] = fr.uv; return [u0 + W[0] * (u1 - u0), v0 + W[1] * (v1 - v0), u0 + W[2] * (u1 - u0), v0 + W[3] * (v1 - v0)]; };
        o.addScaledVector(rr, W[2] + W[0] - 1).addScaledVector(uu, 1 - W[1] - W[3]); rr.multiplyScalar(W[2] - W[0]); uu.multiplyScalar(W[3] - W[1]);
        uvA = rect(f.fa); uvB = rect(f.fb);
      }
      b.quad([o.clone().sub(rr).sub(uu), o.clone().sub(rr).add(uu), o.clone().add(rr).add(uu), o.clone().add(rr).sub(uu)], [p.color.x * fade, p.color.y * fade, p.color.z * fade, a], uvA, uvB, f ? f.t : 0);
    }
    b.end();
  }
}
class TrailRenderer {
  dispose() { this.batch.dispose(); }
  constructor(r, lib, sim) {
    const t = lib.texture(r); this.info = t.info; this.batch = new QuadBatch(lib.group, t.texture, r, sim.maxParticles); this.min = r.m_flMinLength ?? 0; this.max = r.m_flMaxLength ?? 2000;
    this.radiusScale = number(r.m_flRadiusScale, 1); this.tail = number(r.m_flTailAlphaScale, 1); this.head = number(r.m_flHeadAlphaScale, 1); this.ignoreDT = r.m_bIgnoreDT;
    this.lengthScale = r.m_flLengthScale ?? 1; this.fadeIn = r.m_flLengthFadeInTime ?? 0; this.ratio = r.m_flConstrainRadiusToLengthRatio ?? 1; this.shift = r.m_flForwardShift ?? 0;
    const tc = r.m_vecTexturesInput?.[0]?.m_TextureControls; this.flipV = tc && number(tc.m_flFinalTextureScaleV, 1)() < 0; this.rate = r.m_flAnimationRate ?? 0.1; this.type = r.m_nAnimationType;
  }
  // RenderTrails: a card from the particle back toward its previous position, as long as the
  // movement times m_flTrailLength (per second unless m_bIgnoreDT), no wider than it is long.
  update(ps, s, camera, gi) {
    const b = this.batch, { eye } = billboard(camera, gi); b.begin(); const oneOverDt = this.ignoreDT || !s.sim.dt ? 1 : 1 / s.sim.dt;
    for (const p of ps) {
      const diff = p.prev.clone().sub(p.pos), dl = diff.length(); if (dl < 1e-6) continue; const dir = diff.divideScalar(dl);
      let len = this.lengthScale * p.trail * dl * oneOverDt; if (this.fadeIn > 0) len *= Math.min(1, p.age / this.fadeIn); len = Math.min(this.max, Math.max(this.min, len)); if (len <= 0) continue;
      const hw = Math.min(p.radius * this.radiusScale(p, s), this.ratio * len), a = p.alpha * p.alpha2; if (hw <= 0 || a < 1 / 255) continue;
      const center = p.pos.clone().addScaledVector(dir, len * (0.5 - this.shift)), V = dir.clone().multiplyScalar(len / 2);
      let U = dir.clone().cross(eye.clone().sub(p.pos)); if (U.lengthSq() < 1e-8) U = dir.clone().cross(new THREE.Vector3(0, 0, 1)); U.normalize().multiplyScalar(hw);
      const f = sheetFrame(this.info, p, this.rate, this.type); let uv = f ? f.a : FULL, uv2 = f ? f.b : FULL;
      if (this.flipV) { uv = [uv[0], uv[3], uv[2], uv[1]]; uv2 = [uv2[0], uv2[3], uv2[2], uv2[1]]; }
      const head = [p.color.x, p.color.y, p.color.z, a * this.head(p, s)], tail = [p.color.x, p.color.y, p.color.z, a * this.tail(p, s)];
      // Corners (uv 0,1)(0,0)(1,0)(1,1): V runs from the head (1) to the tail (0), U across.
      b.quad([center.clone().sub(U).sub(V), center.clone().sub(U).add(V), center.clone().add(U).add(V), center.clone().add(U).sub(V)], [head, tail, tail, head], uv, uv2, f ? f.t : 0);
    }
    b.end();
  }
}
class RopeRenderer {
  dispose() { this.batch.dispose(); }
  constructor(r, lib, sim) {
    const t = lib.texture(r); this.batch = new QuadBatch(lib.group, t.texture, r, sim.maxParticles); this.radiusScale = number(r.m_flRadiusScale, 1);
    this.vWorld = r.m_flTextureVWorldSize ?? 10; this.vScroll = r.m_flTextureVScrollRate ?? 0; this.info = t.info;
  }
  update(ps, s, camera, gi) {
    const b = this.batch, { eye } = billboard(camera, gi); b.begin(); if (ps.length < 2) return b.end();
    const pts = [...ps].sort((x, y) => x.uid - y.uid); let v = s.age * this.vScroll / this.vWorld;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], dir = q.pos.clone().sub(p.pos), len = dir.length(); if (len < 1e-4) continue; dir.divideScalar(len);
      const sp = dir.clone().cross(eye.clone().sub(p.pos)).normalize().multiplyScalar(p.radius * this.radiusScale(p, s)), sq = dir.clone().cross(eye.clone().sub(q.pos)).normalize().multiplyScalar(q.radius * this.radiusScale(q, s));
      const v2 = v + len / this.vWorld;
      b.quad([p.pos.clone().sub(sp), q.pos.clone().sub(sq), q.pos.clone().add(sq), p.pos.clone().add(sp)], [p.color.x, p.color.y, p.color.z, (p.alpha + q.alpha) / 2], [0, v2, 1, v], [0, v2, 1, v], 0);
      v = v2;
    }
    b.end();
  }
}

// C_OP_RenderModels: a model per particle at its position, turned by its orientation (or yaw,
// pitch, roll), scaled by its radius (1 is the model's own size), animated by its age.
const GLTF_TO_SOURCE = SOURCE_TO_GLTF.clone().invert();
class ModelRenderer {
  constructor(r, lib, sim) {
    this.lib = lib; this.list = (r.m_ModelList || []).map((m) => m.m_model).filter(Boolean); this.activity = r.m_ActivityName || null; this.animated = r.m_bAnimated;
    this.rate = (r.m_flAnimationRate ?? 30) / 30; this.instances = new Map();
  }
  update(ps, s) {
    const alive = new Set();
    for (const p of ps) {
      let inst = this.instances.get(p);
      if (!inst) {
        const m = this.lib.models.get(this.list[p.uid % Math.max(1, this.list.length)], this.activity, s.sim.def._path); if (!m) continue;
        const mixer = this.animated && m.clip ? new THREE.AnimationMixer(m.scene) : null; if (mixer) mixer.clipAction(m.clip).play();
        m.scene.matrixAutoUpdate = false; this.lib.group.add(m.scene); inst = { scene: m.scene, mixer }; this.instances.set(p, inst);
      }
      alive.add(p);
      const q = p.orient || qangle(p.rot.y, p.rot.x, p.rot.z), r = Math.max(1e-4, p.radius);
      inst.scene.matrix.compose(p.pos, q, new THREE.Vector3(r, r, r)).multiply(GLTF_TO_SOURCE); inst.scene.matrixWorldNeedsUpdate = true; inst.scene.visible = p.alpha > 0.01;
      if (inst.mixer) inst.mixer.setTime(p.age * this.rate);
    }
    for (const [p, inst] of this.instances) if (!alive.has(p)) { this.lib.group.remove(inst.scene); this.instances.delete(p); }
  }
  dispose() { for (const inst of this.instances.values()) this.lib.group.remove(inst.scene); this.instances.clear(); }
}

export class Library {
  // systems: { path: definition }; textures: { vtex: { file, sequences } }; url(file) gives a texture's address.
  // models (optional): { get(vmdl) → { scene, clip } } gives the models of C_OP_RenderModels.
  constructor({ systems, textures, snapshots, url, models = null, options = {} }) {
    this.models = models;
    this.options = options; this.systems = systems; this.textures = textures; this.snapshots = snapshots; this.url = url; this.cache = new Map(); this.unsupported = new Set();
    this.group = new THREE.Group(); this.group.matrixAutoUpdate = false; this.group.matrix.copy(SOURCE_TO_GLTF); this.loader = new THREE.TextureLoader();
    for (const [path, def] of Object.entries(systems || {})) if (def && !def._path) Object.defineProperty(def, '_path', { value: path });
  }
  system(path) { const k = path.replace(/\.vpcf$/, ''), d = this.systems[k]; return d || null; }
  // Colour textures are read as sRGB, except for mod2x: its «modulate» textures are 50 % grey where
  // they leave the picture alone, which as sRGB would be 21 % linear and darken the whole square.
  texture(r) {
    const path = r.m_vecTexturesInput?.[0]?.m_hTexture || r.m_hTexture || 'materials/particle/particle_glow_05.vtex';
    const raw = r.m_nOutputBlendMode === 'PARTICLE_OUTPUT_BLEND_MODE_MOD2X', key = raw ? `${path}#raw` : path;
    if (!this.cache.has(key)) {
      const info = this.textures[path], t = info ? this.loader.load(this.url(info.file)) : null;
      if (t) { t.colorSpace = raw ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      this.cache.set(key, { texture: t, info });
    }
    return this.cache.get(key);
  }
  renderer(r, sim) {
    // A renderer whose texture did not come with the hero would draw bare squares: it is left out.
    if (r._class === 'C_OP_RenderModels') return this.models ? new ModelRenderer(r, this, sim) : null;
    if (!this.texture(r).texture) return null;
    switch (r._class) {
      case 'C_OP_RenderSprites': return r.m_bRefract ? null : new SpriteRenderer(r, this, sim);
      case 'C_OP_RenderTrails': return new TrailRenderer(r, this, sim);
      case 'C_OP_RenderRopes': return new RopeRenderer(r, this, sim);
      case 'C_OP_RenderDeferredLight': return null;
      default: this.unsupported.add(r._class); return null;
    }
  }
  snapshot(path) { const data = this.snapshots[path]; return data?.position?.length ? new Snapshot(data, null) : null; }
  dispose() { this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); for (const { texture } of this.cache.values()) texture?.dispose(); }
}

// Snapshot points follow the hero: skinned by their bones, or rigid with the snapshot's control point.
class Snapshot {
  constructor(data, sim) { this.data = data; this.sim = sim; this.count = data.position?.length || 0; }
  point(i, local) {
    const m = this.sim.root.model, pos = new THREE.Vector3(...this.data.position[i]), skin = this.data.skinning?.[i];
    if (m && skin?.length) return m.skin(pos, skin);
    if (m && this.data.bone) return m.boneLocal(this.data.bone, pos);
    if (local) return pos.applyMatrix4(local);
    return pos.applyMatrix4(this.sim.state.cp(0).matrix());
  }
}
