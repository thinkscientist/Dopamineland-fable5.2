import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Soundtrack } from './audio.js';
import { CandyCosmos, LiquidDream, HyperTunnel, Stardust } from './worlds.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FX = reduced ? 0.35 : 1; // scales the most intense screen effects
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { low: coarse || (navigator.hardwareConcurrency || 8) <= 4 || params.has('low') };

// ───────────────────────── intro title letters ─────────────────────────
let li = 0;
document.querySelectorAll('.title .word').forEach((w) => {
  for (const ch of w.dataset.word) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    s.style.setProperty('--i', li++);
    s.style.setProperty('--r', (Math.random() * 10 - 5).toFixed(1));
    w.appendChild(s);
  }
});

// ───────────────────────── renderer ─────────────────────────
const canvas = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.textContent = 'Dopamine Land needs WebGL, and this browser would not give us any. Try another browser or device.';
  document.body.appendChild(d);
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.low ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
const shared = { uPx: { value: pixelRatio }, uH: { value: 1 } };

// ───────────────────────── worlds ─────────────────────────
const ctx = { renderer, shared, quality };
const worlds = [new CandyCosmos(ctx), new LiquidDream(ctx), new HyperTunnel(ctx), new Stardust(ctx)];
worlds.forEach((w) => {
  w.group.visible = false;
  scene.add(w.group);
});
let current = Math.min(worlds.length - 1, Math.max(0, (parseInt(params.get('world'), 10) || 1) - 1));
worlds[current].group.visible = true;

// ───────────────────────── confetti ─────────────────────────
const CN = quality.low ? 1200 : 2600;
const conf = {
  pos: new Float32Array(CN * 3), vel: new Float32Array(CN * 3), col: new Float32Array(CN * 3),
  life: new Float32Array(CN), size: new Float32Array(CN), next: 0,
};
const confGeo = new THREE.BufferGeometry();
confGeo.setAttribute('position', new THREE.BufferAttribute(conf.pos, 3).setUsage(THREE.DynamicDrawUsage));
confGeo.setAttribute('aCol', new THREE.BufferAttribute(conf.col, 3).setUsage(THREE.DynamicDrawUsage));
confGeo.setAttribute('aLife', new THREE.BufferAttribute(conf.life, 1).setUsage(THREE.DynamicDrawUsage));
confGeo.setAttribute('aSize', new THREE.BufferAttribute(conf.size, 1).setUsage(THREE.DynamicDrawUsage));
const confetti = new THREE.Points(
  confGeo,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uH: shared.uH },
    vertexShader: /* glsl */ `
      attribute vec3 aCol;
      attribute float aLife, aSize;
      uniform float uH;
      varying vec4 vCol;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float l = clamp(aLife, 0.0, 1.0);
        gl_PointSize = aLife > 0.0 ? aSize * (0.4 + 0.6 * l) * uH * 0.87 / max(0.5, -mv.z) : 0.0;
        vCol = vec4(aCol * 1.6, l * l);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vCol;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float core = smoothstep(0.5, 0.0, d);
        float star = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.2)
                   + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.2);
        gl_FragColor = vec4(vCol.rgb, (core * core + star * 0.7) * vCol.a);
      }`,
  })
);
confetti.frustumCulled = false;
confetti.renderOrder = 50;
scene.add(confetti);

const _c = new THREE.Color();
const _v = new THREE.Vector3();
function spawnConfetti(point, count, power = 1) {
  for (let k = 0; k < count; k++) {
    const i = conf.next;
    conf.next = (conf.next + 1) % CN;
    _v.randomDirection().multiplyScalar((2 + Math.random() * 9) * power);
    conf.pos.set([point.x, point.y, point.z], i * 3);
    conf.vel.set([_v.x, _v.y + 2 * power, _v.z], i * 3);
    _c.setHSL(Math.random(), 1, 0.6);
    conf.col.set([_c.r, _c.g, _c.b], i * 3);
    conf.life[i] = 0.7 + Math.random() * 0.9;
    conf.size[i] = 0.12 + Math.random() * 0.3;
  }
}
function updateConfetti(dt) {
  const drag = Math.exp(-dt * 2.4);
  for (let i = 0; i < CN; i++) {
    if (conf.life[i] <= 0) continue;
    conf.life[i] -= dt * 0.75;
    const i3 = i * 3;
    conf.vel[i3] *= drag;
    conf.vel[i3 + 1] = conf.vel[i3 + 1] * drag - 3.5 * dt;
    conf.vel[i3 + 2] *= drag;
    conf.pos[i3] += conf.vel[i3] * dt;
    conf.pos[i3 + 1] += conf.vel[i3 + 1] * dt;
    conf.pos[i3 + 2] += conf.vel[i3 + 2] * dt;
  }
  for (const k in confGeo.attributes) confGeo.attributes[k].needsUpdate = true;
}

// ───────────────────────── post-processing ─────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const b0 = worlds[current].bloom;
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), b0.strength, b0.radius, b0.threshold);
composer.addPass(bloom);

const MAX_RIPPLES = 4;
const finalPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uAberration: { value: 0 },
    uWarp: { value: 0 },
    uWash: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uHue: { value: 0 },
    uSat: { value: 1.12 },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -1)) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uAberration, uWarp, uWash, uHue, uSat;
    uniform vec3 uTint;
    uniform vec3 uRipples[${MAX_RIPPLES}];
    varying vec2 vUv;

    vec3 hueRot(vec3 c, float a){
      const vec3 k = vec3(0.57735);
      float ca = cos(a), sa = sin(a);
      return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
    }
    vec3 tap(vec2 uv, vec2 dir, float ab){
      return vec3(
        texture2D(tDiffuse, uv + dir * ab).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir * ab).b);
    }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      float glint = 0.0;
      // click shockwaves
      for (int i = 0; i < ${MAX_RIPPLES}; i++){
        vec3 r = uRipples[i];
        if (r.z >= 0.0){
          vec2 d = uv - r.xy;
          d.x *= uAspect;
          float dist = length(d);
          float w = dist - r.z * 0.85;
          float env = exp(-w * w * 260.0) * exp(-r.z * 2.4);
          uv += normalize(d + 1e-5) * vec2(1.0 / uAspect, 1.0) * env * 0.05;
          glint += env;
        }
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ab = uAberration * (0.25 + r2 * 3.5);
      vec3 col;
      if (uWarp > 0.002){
        col = vec3(0.0);
        for (int i = 0; i < 10; i++){
          float k = float(i) / 9.0;
          vec2 u = 0.5 + c * (1.0 - uWarp * 0.42 * k);
          col += tap(u, c, ab + uWarp * 0.02 * k);
        }
        col /= 10.0;
      } else {
        col = tap(uv, c, ab);
      }
      col += glint * vec3(1.0, 0.85, 0.95) * 0.22;
      col = mix(col, uTint * 1.4 + col * 0.6, uWash);
      if (uHue != 0.0) col = max(hueRot(col, uHue), 0.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      // vignette + grain
      col *= 1.0 - smoothstep(0.25, 1.05, length(c * vec2(1.0, 1.15)) * 1.25) * 0.55;
      col += (hash(vUv * 913.0 + fract(uTime) * 71.0) - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finalPass);
composer.addPass(new OutputPass());
const FU = finalPass.uniforms;
let rippleNext = 0;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  FU.uAspect.value = w / h;
  shared.uPx.value = pixelRatio;
  shared.uH.value = h * pixelRatio;
}
window.addEventListener('resize', resize);
resize();

// ───────────────────────── state ─────────────────────────
const audio = new Soundtrack();
const state = {
  live: false,
  pointerT: new THREE.Vector2(), // target, NDC
  pointer: new THREE.Vector2(), // smoothed
  down: false, downAt: 0,
  boost: 0,
  score: 0, combo: 0, lastHit: -9,
  level: 0, euphoria: 0, // euphoria = seconds remaining
  hue: 0,
  trans: null, // { p, to }
  lastSwitchBeat: 0,
  lastRainBeat: -1,
};

// ───────────────────────── HUD ─────────────────────────
const el = {
  intro: $('#intro'), enter: $('#enter'), hud: $('#hud'), score: $('#score'), fill: $('#meter-fill'), combo: $('#combo'),
  world: document.querySelector('.world'), wIndex: $('#world-index'), wName: $('#world-name'), wSub: $('#world-sub'),
  dots: $('#dots'), pops: $('#pops'), banner: $('#banner'), cursor: $('#cursor'),
};
const WORDS = ['YUM', 'WOW', 'NICE', 'OOH', 'YES!', 'ZING', 'POP', 'MMM', 'WHEE', 'BLISS', 'JUICY', 'SWEET', 'YAY', 'GLOW', 'ZAP', 'AHH'];
const POP_COLORS = ['#ff4fa3', '#ff9a3c', '#ffe45e', '#4dffc3', '#38d6ff', '#9b5cff'];

worlds.forEach((w, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = w.name;
  b.setAttribute('aria-label', w.name);
  b.addEventListener('click', () => goTo(i));
  el.dots.appendChild(b);
});
function paintWorldHud() {
  const w = worlds[current];
  el.wIndex.textContent = `0${current + 1} / 0${worlds.length}`;
  el.wName.textContent = w.name;
  el.wSub.textContent = w.sub;
  [...el.dots.children].forEach((d, i) => d.classList.toggle('on', i === current));
  el.world.classList.remove('swap');
  void el.world.offsetWidth;
  el.world.classList.add('swap');
}
paintWorldHud();

function pop(x, y, text, big) {
  const s = document.createElement('span');
  s.className = 'pop';
  s.textContent = text;
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  s.style.setProperty('--c', POP_COLORS[(Math.random() * POP_COLORS.length) | 0]);
  s.style.setProperty('--rot', (Math.random() * 30 - 15).toFixed(1) + 'deg');
  if (big) s.style.fontSize = 'clamp(30px, 5vw, 70px)';
  s.addEventListener('animationend', () => s.remove());
  el.pops.appendChild(s);
}
function bump(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// ───────────────────────── world switching ─────────────────────────
function goTo(i) {
  i = (i + worlds.length) % worlds.length;
  if (state.trans || i === current) return;
  state.trans = { p: 0, to: i, swapped: false };
  state.lastSwitchBeat = audio.beats;
  audio.whoosh(true);
}
const next = () => goTo(current + 1);
const prev = () => goTo(current - 1);

function updateTransition(dt) {
  const tr = state.trans;
  if (!tr) {
    FU.uWarp.value = 0;
    FU.uWash.value = 0;
    return;
  }
  tr.p += dt / 1.25;
  if (tr.p >= 0.5 && !tr.swapped) {
    tr.swapped = true;
    worlds[current].group.visible = false;
    current = tr.to;
    worlds[current].group.visible = true;
    paintWorldHud();
  }
  const k = Math.sin(Math.min(1, tr.p) * Math.PI);
  FU.uWarp.value = Math.pow(k, 1.4) * (reduced ? 0.3 : 1);
  FU.uWash.value = Math.pow(k, 3) * 0.85;
  FU.uTint.value.copy(worlds[tr.to].tint);
  if (tr.p >= 1) state.trans = null;
}

// ───────────────────────── interaction ─────────────────────────
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _pt = new THREE.Vector3();

function hit(clientX, clientY, silent) {
  const w = window.innerWidth, h = window.innerHeight;
  _ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const world = worlds[current];
  raycaster.ray.at(world.burstDist, _pt);
  const extra = world.burst(raycaster.ray, _pt, _ndc) || 0;
  spawnConfetti(_pt, quality.low ? 60 : 130, world.burstDist / 11);

  const r = FU.uRipples.value[rippleNext];
  rippleNext = (rippleNext + 1) % MAX_RIPPLES;
  r.set(clientX / w, 1 - clientY / h, 0);

  if (silent) return;
  const now = performance.now() / 1000;
  state.combo = now - state.lastHit < 1.3 ? state.combo + 1 : 1;
  state.lastHit = now;
  const gain = 10 * state.combo + extra * 25;
  state.score += gain;
  el.score.textContent = state.score.toLocaleString('en-US');
  bump(el.score, 'bump');
  if (state.combo >= 3) {
    el.combo.textContent = `×${state.combo} COMBO`;
    el.combo.classList.add('on');
    bump(el.combo, 'hit');
  }
  const word = extra ? (extra > 1 ? `POP ×${extra}` : 'POP!') : WORDS[(Math.random() * WORDS.length) | 0];
  pop(clientX, clientY, state.combo >= 3 ? `${word} +${gain}` : word, state.combo >= 6);
  audio.sparkle(state.combo);

  if (state.euphoria <= 0) {
    state.level = Math.min(1, state.level + 0.055 + Math.min(state.combo, 6) * 0.012 + extra * 0.03);
    if (state.level >= 1) startEuphoria();
  }
}

function startEuphoria() {
  state.euphoria = 9;
  document.body.classList.add('euphoria');
  bump(el.banner, 'show');
  audio.fanfare();
  state.score += 1000;
  el.score.textContent = state.score.toLocaleString('en-US');
}

const isUi = (t) => t instanceof Element && !!t.closest('button, #intro');

window.addEventListener('pointermove', (e) => {
  state.pointerT.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  cur.x = e.clientX;
  cur.y = e.clientY;
});
window.addEventListener('pointerdown', (e) => {
  if (!state.live || isUi(e.target)) return;
  state.pointerT.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  cur.x = e.clientX;
  cur.y = e.clientY;
  state.down = true;
  state.downAt = performance.now();
  el.cursor.classList.add('down');
  hit(e.clientX, e.clientY);
});
const release = () => {
  state.down = false;
  el.cursor.classList.remove('down');
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
window.addEventListener('contextmenu', (e) => e.preventDefault());

function toggleSound() {
  audio.setMuted(!audio.muted);
  document.body.classList.toggle('muted', audio.muted);
}
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('#btn-sound').addEventListener('click', toggleSound);
$('#btn-full').addEventListener('click', toggleFull);

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!state.live) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enter();
    }
    return;
  }
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'arrowright') { e.preventDefault(); next(); }
  else if (k === 'arrowleft') prev();
  else if (k === 'm') toggleSound();
  else if (k === 'f') toggleFull();
  else if (k >= '1' && k <= String(worlds.length)) goTo(+k - 1);
});

function enter() {
  if (state.live) return;
  state.live = true;
  audio.start();
  state.lastSwitchBeat = 0;
  el.intro.classList.add('gone');
  document.body.classList.add('live');
  el.hud.removeAttribute('aria-hidden');
  el.enter.blur();
  // a welcome burst, centre screen
  hit(window.innerWidth / 2, window.innerHeight / 2, true);
  setTimeout(() => (el.intro.style.display = 'none'), 1300);
}
el.enter.addEventListener('click', enter);

document.addEventListener('visibilitychange', () => {
  if (!audio.started) return;
  if (document.hidden) audio.ctx.suspend();
  else audio.ctx.resume();
});

// custom cursor
const cur = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
const curDot = el.cursor.querySelector('i');
const curRing = el.cursor.querySelector('b');

// ───────────────────────── main loop ─────────────────────────
const clock = new THREE.Clock();
let t = 0;
let perfAcc = 0, perfN = 0;
const _rainPt = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  t += dt;

  // adaptive resolution: if we can't hold ~40fps, shed pixels
  if (!document.hidden && rawDt < 0.5) {
    perfAcc += rawDt;
    if (++perfN >= 80) {
      const avg = perfAcc / perfN;
      perfAcc = perfN = 0;
      if (avg > 0.027 && pixelRatio > 0.6) {
        pixelRatio = Math.max(0.6, pixelRatio - 0.25);
        resize();
      }
    }
  }

  // pointer smoothing
  state.pointer.lerp(state.pointerT, 1 - Math.exp(-dt * 4));

  // euphoria + meter
  const eup = state.euphoria > 0;
  if (eup) {
    state.euphoria -= dt;
    state.level = Math.max(0, state.euphoria / 9);
    if (state.euphoria <= 0) document.body.classList.remove('euphoria');
  } else {
    state.level = Math.max(0, state.level - dt * 0.028);
  }
  el.fill.style.transform = `scaleX(${state.level.toFixed(3)})`;
  if (state.combo && performance.now() / 1000 - state.lastHit > 1.3) {
    state.combo = 0;
    el.combo.classList.remove('on');
  }

  // boost: hold to engage hyperdrive
  const holding = state.down && performance.now() - state.downAt > 170;
  const boostT = Math.max(holding ? 1 : 0, eup ? 0.55 : 0);
  state.boost += (boostT - state.boost) * (1 - Math.exp(-dt * (boostT > state.boost ? 2.2 : 3.5)));

  audio.update(dt, state.boost);
  const beats = audio.beats;
  const kick = audio.kick * (0.65 + audio.levels.bass * 0.6);

  // auto-tour: move on every 16 bars
  if (state.live && !state.trans && beats - state.lastSwitchBeat >= 64) next();

  // euphoria rains confetti on the beat
  if (eup) {
    const b2 = Math.floor(beats * 2);
    if (b2 !== state.lastRainBeat) {
      state.lastRainBeat = b2;
      _ndc.set(Math.random() * 1.6 - 0.8, Math.random() * 1.4 - 0.5);
      raycaster.setFromCamera(_ndc, camera);
      raycaster.ray.at(worlds[current].burstDist, _rainPt);
      spawnConfetti(_rainPt, 70, worlds[current].burstDist / 11);
    }
  }

  updateTransition(dt);

  const w = worlds[current];
  camera.fov += (60 + state.boost * 26 - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
  w.update({ t, dt, beats, kick, boost: state.boost, pointer: state.pointer, camera, aspect: camera.aspect, levels: audio.levels });
  updateConfetti(dt);

  // bloom eases toward the current world's look
  const e = Math.min(1, dt * 3);
  bloom.strength += (w.bloom.strength * (1 + state.boost * 0.35) - bloom.strength) * e;
  bloom.radius += (w.bloom.radius - bloom.radius) * e;
  bloom.threshold += (w.bloom.threshold - bloom.threshold) * e;

  // final pass
  FU.uTime.value = t;
  FU.uAberration.value = (0.0035 + kick * 0.003 + state.boost * 0.013) * FX;
  state.hue = eup ? state.hue + dt * 2.2 : state.hue * Math.exp(-dt * 3);
  FU.uHue.value = Math.abs(state.hue) < 0.001 ? 0 : state.hue;
  FU.uSat.value = 1.12 + (eup ? 0.2 : 0);
  for (const r of FU.uRipples.value) {
    if (r.z >= 0) {
      r.z += dt;
      if (r.z > 2.2) r.z = -1;
    }
  }

  composer.render();

  // cursor
  cur.rx += (cur.x - cur.rx) * (1 - Math.exp(-dt * 14));
  cur.ry += (cur.y - cur.ry) * (1 - Math.exp(-dt * 14));
  curDot.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
  curRing.style.transform = `translate(${cur.rx}px, ${cur.ry}px) scale(${1 + kick * 0.18})`;
}
frame();

// handy for debugging / screenshots
window.dopamine = { goTo, enter, state, audio, startEuphoria };
