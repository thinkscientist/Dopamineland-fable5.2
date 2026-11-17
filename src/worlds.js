import * as THREE from 'three';
import { NOISE, PAL } from './glsl.js';

const TAU = Math.PI * 2;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
const mod = (x, n) => ((x % n) + n) % n;

const CANDY = [0xff4fa3, 0xff9a3c, 0xffe45e, 0x4dffc3, 0x38d6ff, 0x9b5cff, 0xff6b6b, 0xffffff];

// ───────────────────────── shared building blocks ─────────────────────────

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _glow;
const glow = () => (_glow ||= glowTexture());

function makeSky(top, mid, bot, glowAmt = 0.5) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uBot: { value: new THREE.Color(bot) },
      uTime: { value: 0 },
      uGlow: { value: glowAmt },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${PAL}
      uniform vec3 uTop, uMid, uBot;
      uniform float uTime, uGlow;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y * 0.5 + 0.5;
        vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.5, h));
        col = mix(col, uTop, smoothstep(0.45, 1.0, h));
        float n = snoise(d * 1.8 + vec3(0.0, uTime * 0.03, 0.0)) * 0.5 + 0.5;
        float n2 = snoise(d * 4.2 - vec3(uTime * 0.04)) * 0.5 + 0.5;
        col += pal(n * 0.7 + uTime * 0.02) * pow(n * n2, 2.0) * uGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function makeStars(count, shared, rMin = 70, rMax = 160) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(rand(rMin, rMax));
    pos.set([v.x, v.y, v.z], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: shared.uPx },
    vertexShader: /* glsl */ `
      ${PAL}
      attribute float aSeed;
      uniform float uTime, uPx;
      varying vec3 vCol;
      void main(){
        float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0);
        vCol = mix(vec3(1.0), pal(aSeed), 0.6) * tw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.2 + aSeed * aSeed * 4.0) * uPx * tw;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCol, a * a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ═════════════════════════ 1 · CANDY COSMOS ═════════════════════════

export class CandyCosmos {
  name = 'Candy Cosmos';
  sub = 'A galaxy of sweets orbiting a beating heart of jelly.';
  bloom = { strength: 0.5, radius: 0.6, threshold: 0.86 };
  tint = new THREE.Color(0xff4fa3);
  burstDist = 13;

  constructor({ renderer, shared, quality }) {
    const group = (this.group = new THREE.Group());

    this.sky = makeSky(0x160447, 0x3d0d63, 0x0a001f, 0.3);
    group.add(this.sky);
    this.stars = makeStars(quality.low ? 900 : 2200, shared);
    group.add(this.stars);

    // candy-coloured environment so every sweet gets glossy reflections
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x12032b);
    const blobGeo = new THREE.SphereGeometry(1, 24, 16);
    [
      [0xff4fa3, [9, 5, 4], 4.5, 5],
      [0x38d6ff, [-9, 2, -5], 4.5, 5],
      [0xffe45e, [0, 10, -3], 4, 6],
      [0x9b5cff, [2, -9, 6], 5, 3],
      [0x4dffc3, [-5, -4, 9], 3, 4],
      [0xffffff, [5, 8, 8], 1.5, 12],
    ].forEach(([c, p, s, k]) => {
      const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
      m.position.set(...p);
      m.scale.setScalar(s);
      envScene.add(m);
    });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();

    group.add(new THREE.HemisphereLight(0xffffff, 0x5020c0, 0.45));
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.1);
    sun.position.set(4, 8, 6);
    group.add(sun);
    this.lampA = new THREE.PointLight(0xff4fa3, 60, 40);
    this.lampB = new THREE.PointLight(0x38d6ff, 60, 40);
    group.add(this.lampA, this.lampB);

    // ── the jelly heart ──
    this.heartU = {
      uTime: { value: 0 },
      uKick: { value: 0 },
      uBoost: { value: 0 },
    };
    this.heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.9, quality.low ? 28 : 48),
      new THREE.ShaderMaterial({
        uniforms: this.heartU,
        vertexShader: /* glsl */ `
          ${NOISE}
          uniform float uTime, uKick, uBoost;
          varying vec3 vPos;
          varying float vD;
          void main(){
            vec3 n = normalize(position);
            float n1 = snoise(n * 1.25 + uTime * 0.32);
            float n2 = snoise(n * 3.1 - uTime * 0.55);
            float d = n1 * 0.34 + n2 * 0.1 * (1.0 + uBoost * 2.0) + uKick * 0.14;
            vD = d;
            vec4 wp = modelMatrix * vec4(position * (1.0 + d), 1.0);
            vPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          ${PAL}
          uniform float uTime, uKick;
          varying vec3 vPos;
          varying float vD;
          void main(){
            vec3 V = normalize(cameraPosition - vPos);
            vec3 N = normalize(cross(dFdx(vPos), dFdy(vPos)));
            if (dot(N, V) < 0.0) N = -N;
            float f = pow(1.0 - dot(N, V), 2.0);
            vec3 base = pal(vD * 0.9 + uTime * 0.07 + dot(N, vec3(0.3, 0.5, 0.2)) * 0.35);
            vec3 col = base * (0.42 + 0.3 * uKick);
            col += pal(f * 1.1 + uTime * 0.12 + 0.45) * f * 1.9;
            vec3 L = normalize(vec3(0.4, 0.8, 0.6));
            col += pow(max(dot(reflect(-L, N), V), 0.0), 48.0) * 1.6;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    group.add(this.heart);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow(), color: 0xff5fb0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22 })
    );
    this.halo.scale.setScalar(13);
    group.add(this.halo);

    // ── the swarm ──
    const per = quality.low ? 130 : 320;
    const geos = [
      new THREE.SphereGeometry(1, 28, 20),
      new THREE.TorusGeometry(0.9, 0.42, 18, 40),
      new THREE.CapsuleGeometry(0.55, 1.1, 8, 20),
      new THREE.OctahedronGeometry(1.15, 0),
      new THREE.IcosahedronGeometry(1.05, 0),
    ];
    const n = (this.count = per * geos.length);
    this.meshes = geos.map((geo, k) => {
      const flat = k >= 3;
      const mat = new THREE.MeshPhysicalMaterial({
        roughness: flat ? 0.08 : 0.2,
        metalness: flat ? 0.55 : 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        envMap: env,
        envMapIntensity: 0.75,
        flatShading: flat,
      });
      const m = new THREE.InstancedMesh(geo, mat, per);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      const c = new THREE.Color();
      for (let j = 0; j < per; j++) m.setColorAt(j, c.set(CANDY[(Math.random() * CANDY.length) | 0]));
      group.add(m);
      return m;
    });
    this.per = per;
    this.d = {
      rad: new Float32Array(n), th: new Float32Array(n), w: new Float32Array(n), y: new Float32Array(n),
      size: new Float32Array(n), ph: new Float32Array(n), spin: new Float32Array(n),
      pos: new Float32Array(n * 3), off: new Float32Array(n * 3), vel: new Float32Array(n * 3),
      axis: [],
    };
    for (let i = 0; i < n; i++) {
      const r = 4 + Math.pow(Math.random(), 1.5) * 15;
      this.d.rad[i] = r;
      this.d.th[i] = rand(TAU);
      this.d.w[i] = (0.75 / Math.sqrt(r)) * rand(0.6, 1.4);
      this.d.y[i] = gauss() * (0.5 + r * 0.2);
      this.d.size[i] = 0.1 + Math.pow(Math.random(), 2.4) * 0.55;
      this.d.ph[i] = rand(TAU);
      this.d.spin[i] = rand(-1.5, 1.5);
      this.d.axis.push(new THREE.Vector3().randomDirection());
    }
    this.spinT = 0;
    this._dummy = new THREE.Object3D();
  }

  burst(ray) {
    const { pos, vel } = this.d;
    const o = ray.origin, dir = ray.direction;
    for (let i = 0; i < this.count; i++) {
      const dx = pos[i * 3] - o.x, dy = pos[i * 3 + 1] - o.y, dz = pos[i * 3 + 2] - o.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      const px = dx - dir.x * t, py = dy - dir.y * t, pz = dz - dir.z * t;
      const dist = Math.hypot(px, py, pz) + 0.001;
      if (dist > 9) continue;
      const k = 26 / (1 + dist * dist * 0.35) / dist;
      vel[i * 3] += px * k;
      vel[i * 3 + 1] += py * k;
      vel[i * 3 + 2] += pz * k;
    }
    this.heartKick = 1;
  }

  update(f) {
    const { t, dt, kick, boost, pointer, camera, beats } = f;
    this.spinT += dt * (1 + boost * 6);
    this.heartKick = (this.heartKick || 0) * Math.exp(-dt * 4);

    this.sky.material.uniforms.uTime.value = t;
    this.stars.material.uniforms.uTime.value = t;
    this.heartU.uTime.value = t + this.spinT * 0.3;
    this.heartU.uKick.value = kick + this.heartKick * 1.5;
    this.heartU.uBoost.value = boost;
    this.heart.rotation.y = this.spinT * 0.2;
    this.halo.scale.setScalar(12 + kick * 3 + boost * 4);
    this.halo.material.color.setHSL(mod(0.9 + t * 0.03, 1), 1, 0.6);

    this.lampA.position.set(Math.cos(t * 0.7) * 7, 3, Math.sin(t * 0.7) * 7);
    this.lampB.position.set(Math.cos(t * 0.5 + 3) * 8, -3, Math.sin(t * 0.5 + 3) * 8);

    const d = this.d, dm = this._dummy;
    const damp = Math.exp(-dt * 2.6), back = Math.exp(-dt * 1.5);
    const wavePhase = beats * Math.PI * 0.5;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      d.off[i3] = (d.off[i3] + d.vel[i3] * dt) * back;
      d.off[i3 + 1] = (d.off[i3 + 1] + d.vel[i3 + 1] * dt) * back;
      d.off[i3 + 2] = (d.off[i3 + 2] + d.vel[i3 + 2] * dt) * back;
      d.vel[i3] *= damp; d.vel[i3 + 1] *= damp; d.vel[i3 + 2] *= damp;

      const th = d.th[i] + d.w[i] * this.spinT;
      const r = d.rad[i];
      const x = Math.cos(th) * r + d.off[i3];
      const y = d.y[i] + Math.sin(t * 0.7 + d.ph[i]) * 0.45 + d.off[i3 + 1];
      const z = Math.sin(th) * r + d.off[i3 + 2];
      d.pos[i3] = x; d.pos[i3 + 1] = y; d.pos[i3 + 2] = z;

      const wave = Math.max(0, Math.sin(r * 0.55 - wavePhase));
      const s = d.size[i] * (1 + 0.5 * wave * wave * wave * wave + kick * 0.12);
      dm.position.set(x, y, z);
      dm.quaternion.setFromAxisAngle(d.axis[i], this.spinT * d.spin[i] + d.ph[i]);
      dm.scale.setScalar(s);
      dm.updateMatrix();
      this.meshes[(i / this.per) | 0].setMatrixAt(i % this.per, dm.matrix);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;

    const az = pointer.x * 0.7 + t * 0.06;
    const el = 0.32 + pointer.y * 0.28;
    const dist = 17 - boost * 3.5;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    this.sky.position.copy(camera.position);
  }
}

// ═════════════════════════ 2 · LIQUID DREAM ═════════════════════════

export class LiquidDream {
  name = 'Liquid Dream';
  sub = 'Molten colour that bends around your touch. Pop the bubbles.';
  bloom = { strength: 0.38, radius: 0.6, threshold: 0.8 };
  tint = new THREE.Color(0x38d6ff);
  burstDist = 10;

  constructor({ quality }) {
    const group = (this.group = new THREE.Group());

    this.liquidU = {
      uTime: { value: 0 }, uKick: { value: 0 }, uBoost: { value: 0 }, uAspect: { value: 1 },
      uPointer: { value: new THREE.Vector2() }, uRipple: { value: new THREE.Vector3(0, 0, 99) },
    };
    const liquid = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.liquidU,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          ${PAL}
          uniform float uTime, uKick, uBoost, uAspect;
          uniform vec2 uPointer;
          uniform vec3 uRipple;
          varying vec2 vUv;
          float fbm(vec2 p, float z){
            float a = 0.5, s = 0.0;
            for (int i = 0; i < ${quality.low ? 3 : 4}; i++){
              s += a * snoise(vec3(p, z + float(i) * 7.3));
              p = p * 2.03 + vec2(3.1, 1.7);
              a *= 0.5;
            }
            return s;
          }
          void main(){
            vec2 asp = vec2(uAspect, 1.0);
            vec2 p = (vUv - 0.5) * asp * 2.0;
            // the liquid bulges toward the pointer
            vec2 d = p - uPointer * asp;
            float md = dot(d, d);
            p -= d * 0.42 * exp(-md * 1.4);
            // click ripple
            vec2 rd = p - uRipple.xy * asp;
            float rl = length(rd);
            float w = rl - uRipple.z * 1.6;
            p += normalize(rd + 1e-4) * sin(w * 14.0) * exp(-w * w * 5.0) * exp(-uRipple.z * 1.6) * 0.14;

            float z = uTime * 0.07;
            float t = uTime * 0.11;
            vec2 q = vec2(fbm(p + vec2(0.0, t), z), fbm(p + vec2(5.2, 1.3) - t, z));
            vec2 r = vec2(fbm(p + 1.9 * q + vec2(1.7, 9.2) + t * 0.6, z), fbm(p + 1.9 * q + vec2(8.3, 2.8) - t * 0.4, z));
            float f = fbm(p + 2.3 * r, z);

            vec3 col = pal(f * 0.75 + length(q) * 0.55 + uTime * 0.025);
            col = mix(col, pal(r.x * 0.7 + 0.62 + uTime * 0.04), clamp(length(r) * 0.95, 0.0, 1.0));
            col = mix(col, vec3(1.0, 0.25, 0.62), clamp(q.y * 0.9, 0.0, 0.6));
            col *= 0.3 + 0.8 * smoothstep(-0.7, 0.7, f);
            // glossy crests
            float crest = pow(clamp(r.y * 1.25 + 0.15, 0.0, 1.0), 4.0);
            col += vec3(1.0, 0.92, 0.85) * crest * (1.1 + uKick * 0.9);
            // marbling veins
            float vein = smoothstep(0.035, 0.0, abs(fract(f * 3.0 + q.x) - 0.5) - 0.0);
            col += pal(f + 0.3) * vein * 0.25;
            col *= 0.72 + 0.16 * uKick + 0.25 * uBoost;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    liquid.frustumCulled = false;
    liquid.renderOrder = -10;
    group.add(liquid);

    // ── bubbles ──
    const n = (this.count = quality.low ? 40 : 90);
    const seeds = new Float32Array(n);
    this.b = [];
    for (let i = 0; i < n; i++) {
      seeds[i] = Math.random();
      this.b.push({
        x: rand(-13, 13), y: rand(-8, 8), z: rand(-6, 3.5),
        s: 0.25 + Math.pow(Math.random(), 2) * 1.3, v: rand(0.35, 1.1), ph: rand(TAU),
        vx: 0, vy: 0, grow: 1,
      });
    }
    const geo = new THREE.SphereGeometry(1, 40, 28);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.bubbleU = { uTime: { value: 0 } };
    this.bubbles = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.bubbleU,
        vertexShader: /* glsl */ `
          attribute float aSeed;
          varying vec3 vN, vPos;
          varying float vSeed;
          void main(){
            mat4 m = modelMatrix * instanceMatrix;
            vec4 wp = m * vec4(position, 1.0);
            vPos = wp.xyz;
            vN = normalize(mat3(m) * normal);
            vSeed = aSeed;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          ${PAL}
          uniform float uTime;
          varying vec3 vN, vPos;
          varying float vSeed;
          void main(){
            vec3 N = normalize(vN);
            vec3 V = normalize(cameraPosition - vPos);
            float f = pow(1.0 - max(dot(N, V), 0.0), 2.4);
            vec3 col = pal(f * 0.9 + vSeed + uTime * 0.12) * f * 1.5;
            vec3 L = normalize(vec3(-0.5, 0.8, 0.6));
            float s = pow(max(dot(reflect(-L, N), V), 0.0), 60.0);
            float s2 = pow(max(dot(reflect(L, N), V), 0.0), 24.0) * 0.25;
            col += vec3(s * 2.2 + s2);
            col += 0.05;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
      n
    );
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.frustumCulled = false;
    group.add(this.bubbles);
    this._dummy = new THREE.Object3D();
    this.popped = 0;
  }

  burst(ray, point, ndc) {
    this.liquidU.uRipple.value.set(ndc.x, ndc.y, 0);
    const o = ray.origin, dir = ray.direction;
    let pops = 0;
    for (const b of this.b) {
      const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      const px = dx - dir.x * t, py = dy - dir.y * t;
      const dist = Math.hypot(px, py) + 0.001;
      if (dist < b.s + 0.5 && b.grow > 0.6) {
        b.grow = 0; // pop → respawn below
        b.y = -9 - rand(3);
        b.x = rand(-13, 13);
        pops++;
      } else if (dist < 8) {
        const k = 14 / (1 + dist * dist * 0.3) / dist;
        b.vx += px * k;
        b.vy += py * k;
      }
    }
    return pops;
  }

  update(f) {
    const { t, dt, kick, boost, pointer, camera, aspect } = f;
    const u = this.liquidU;
    this.flow = (this.flow || 0) + dt * (1 + boost * 4);
    u.uTime.value = this.flow;
    u.uKick.value = kick;
    u.uBoost.value = boost;
    u.uAspect.value = aspect;
    u.uPointer.value.set(pointer.x, pointer.y);
    u.uRipple.value.z += dt;
    this.bubbleU.uTime.value = t;

    const dm = this._dummy;
    const damp = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.count; i++) {
      const b = this.b[i];
      b.y += (b.v * (1 + boost * 5) + b.vy) * dt;
      b.x += b.vx * dt;
      b.vx *= damp; b.vy *= damp;
      b.grow = Math.min(1, b.grow + dt * 0.9);
      if (b.y > 9.5) { b.y = -9.5; b.x = rand(-13, 13); }
      const wob = Math.sin(t * 0.8 + b.ph);
      const g = b.grow * b.grow * (3 - 2 * b.grow);
      const s = b.s * g * (1 + kick * 0.07);
      dm.position.set(b.x + wob * 0.5, b.y, b.z);
      dm.scale.set(s * (1 + wob * 0.05), s * (1 - wob * 0.05), s);
      dm.updateMatrix();
      this.bubbles.setMatrixAt(i, dm.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;

    camera.position.set(pointer.x * 1.6, pointer.y * 1.0, 11 - boost * 1.5);
    camera.lookAt(0, 0, 0);
  }
}

// ═════════════════════════ 3 · HYPER TUNNEL ═════════════════════════

const pathX = (s) => Math.sin(s * 0.021) * 7 + Math.sin(s * 0.047) * 3;
const pathY = (s) => Math.cos(s * 0.017) * 5 + Math.sin(s * 0.039) * 2;

export class HyperTunnel {
  name = 'Hyper Tunnel';
  sub = 'Neon rings at the speed of joy. Hold to go faster.';
  bloom = { strength: 0.55, radius: 0.6, threshold: 0.32 };
  tint = new THREE.Color(0x9b5cff);
  burstDist = 9;

  constructor({ shared, quality }) {
    const group = (this.group = new THREE.Group());
    this.sky = makeSky(0x05000f, 0x12002b, 0x05000f, 0.22);
    group.add(this.sky);

    this.spacing = 3.2;
    const per = (this.per = quality.low ? 18 : 28);
    this.N = per * 3;
    this.L = this.N * this.spacing;
    const R = 5.2;
    const geos = [
      new THREE.TorusGeometry(R, 0.075, 6, 96),
      new THREE.TorusGeometry(R * 1.12, 0.075, 6, 6),
      new THREE.TorusGeometry(R * 1.3, 0.075, 6, 4),
    ];
    this.meshes = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), per);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      const c = new THREE.Color(1, 1, 1);
      for (let j = 0; j < per; j++) m.setColorAt(j, c);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
      return m;
    });

    // speed streaks
    const sn = quality.low ? 700 : 1800;
    const seed = new Float32Array(sn * 2 * 3);
    const end = new Float32Array(sn * 2);
    for (let i = 0; i < sn; i++) {
      const a = rand(TAU), r = rand(1.4, R * 0.96), z = rand(this.L);
      for (let k = 0; k < 2; k++) {
        seed.set([a, r, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sn * 6), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    sg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.streakU = { uTravel: { value: 0 }, uStretch: { value: 1 }, uL: { value: this.L }, uTime: { value: 0 } };
    this.streaks = new THREE.LineSegments(
      sg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.streakU,
        vertexShader: /* glsl */ `
          ${PAL}
          attribute vec3 aSeed;
          attribute float aEnd;
          uniform float uTravel, uStretch, uL, uTime;
          varying vec4 vCol;
          vec2 path(float s){
            return vec2(sin(s * 0.021) * 7.0 + sin(s * 0.047) * 3.0, cos(s * 0.017) * 5.0 + sin(s * 0.039) * 2.0);
          }
          void main(){
            float dist = mod(aSeed.z - uTravel * 1.25, uL) + aEnd * uStretch;
            vec2 off = path(uTravel + dist) - path(uTravel);
            float a = aSeed.x + dist * 0.004;
            vec3 p = vec3(cos(a) * aSeed.y + off.x, sin(a) * aSeed.y + off.y, -dist);
            float fade = pow(1.0 - clamp(dist / uL, 0.0, 1.0), 1.5);
            vCol = vec4(pal(aSeed.x * 0.16 + uTime * 0.05) * 1.2, fade * (1.0 - aEnd * 0.9) * 0.8);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec4 vCol;
          void main(){ gl_FragColor = vCol; }`,
      })
    );
    this.streaks.frustumCulled = false;
    group.add(this.streaks);

    // the light at the end
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow(), color: 0xffc0e0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.6 })
    );
    this.sun.renderOrder = -5;
    group.add(this.sun);

    this.travel = rand(1000);
    this.flash = 0;
    this._dummy = new THREE.Object3D();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._zAxis = new THREE.Vector3(0, 0, 1);
  }

  burst() {
    this.flash = 1;
  }

  update(f) {
    const { t, dt, kick, boost, pointer, camera, beats } = f;
    const speed = 26 * (1 + boost * 3.2) + kick * 7;
    this.travel += speed * dt;
    this.flash *= Math.exp(-dt * 3);
    const tr = this.travel, L = this.L, sp = this.spacing;
    const cx = pathX(tr), cy = pathY(tr);
    const beatI = Math.floor(beats);

    const dm = this._dummy, c = this._c;
    for (let i = 0; i < this.N; i++) {
      const dist = mod(i * sp - tr, L);
      const a = tr + dist;
      const id = Math.round(a / sp);
      const fade = Math.pow(1 - dist / L, 1.6) * Math.min(1, dist / 7);
      // orient ring along the path tangent
      const e = 0.5;
      this._v.set(pathX(a + e) - pathX(a - e), pathY(a + e) - pathY(a - e), -2 * e).normalize().negate();
      dm.quaternion.setFromUnitVectors(this._zAxis, this._v);
      this._q.setFromAxisAngle(this._zAxis, id * 0.19 + t * 0.25 * (id % 2 ? 1 : -1));
      dm.quaternion.multiply(this._q);
      dm.position.set(pathX(a) - cx, pathY(a) - cy, -dist);
      const lit = mod(id - beatI, 4) === 0 ? 1 : 0.15;
      const pulse = kick * lit + this.flash * Math.max(0, 1 - Math.abs(dist - (1 - this.flash) * 90) / 14);
      dm.scale.setScalar(1 + pulse * 0.1);
      dm.scale.z = 1 + pulse * 5;
      dm.updateMatrix();
      const mesh = this.meshes[i % 3], j = (i / 3) | 0;
      mesh.setMatrixAt(j, dm.matrix);
      c.setHSL(mod(id * 0.047 + t * 0.04, 1), 1, 0.5).multiplyScalar((0.5 + pulse * 1.5) * fade);
      mesh.setColorAt(j, c);
    }
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }

    const su = this.streakU;
    su.uTravel.value = tr;
    su.uTime.value = t;
    su.uStretch.value = 1.5 + speed * 0.09;

    const far = L * 0.92;
    this.sun.position.set(pathX(tr + far) - cx, pathY(tr + far) - cy, -far);
    this.sun.scale.setScalar(52 + kick * 10);
    this.sun.material.color.setHSL(mod(0.92 + t * 0.03, 1), 1, 0.72);

    camera.position.set(pointer.x * 2.2, pointer.y * 2.2, 0);
    const la = 16;
    camera.lookAt(pathX(tr + la) - cx + pointer.x * 3, pathY(tr + la) - cy + pointer.y * 3, -la);
    camera.rotateZ(Math.sin(t * 0.31) * 0.22 - pointer.x * 0.25);
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = t;
  }
}

// ═════════════════════════ 4 · STARDUST ═════════════════════════

function shapeGalaxy(i, n, out) {
  const arms = 5;
  const r = Math.pow(Math.random(), 0.62) * 8.5;
  const a = ((i % arms) / arms) * TAU + r * 0.62 + gauss() * (0.22 + 0.5 / (1 + r));
  out[0] = Math.cos(a) * r;
  out[1] = gauss() * (0.9 / (1 + r * 0.45) + 0.1);
  out[2] = Math.sin(a) * r;
}
function shapeHeart(i, n, out) {
  const t = rand(TAU);
  const s = Math.pow(Math.random(), 0.33);
  const k = 0.36 * s;
  out[0] = 16 * Math.pow(Math.sin(t), 3) * k;
  out[1] = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k + 0.8;
  out[2] = gauss() * 3.4 * Math.sqrt(Math.max(0, 1 - s * s)) + gauss() * 0.15;
}
function shapeKnot(i, n, out) {
  const u = rand(TAU), p = 2, q = 3;
  const r = Math.cos(q * u) + 2;
  const k = 2.3;
  out[0] = r * Math.cos(p * u) * k + gauss() * 0.42;
  out[1] = r * Math.sin(p * u) * k + gauss() * 0.42;
  out[2] = -Math.sin(q * u) * k * 1.4 + gauss() * 0.42;
}
function shapeBloom(i, n, out) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const rad = Math.sqrt(1 - y * y);
  const th = i * 2.399963;
  const phi = Math.acos(y);
  const r = 5 * (1 + 0.34 * Math.sin((th % TAU) * 6) * Math.sin(phi * 5)) * (0.94 + Math.random() * 0.1);
  out[0] = Math.cos(th) * rad * r;
  out[1] = y * r;
  out[2] = Math.sin(th) * rad * r;
}
const SHAPES = [shapeGalaxy, shapeHeart, shapeKnot, shapeBloom];
const SHAPE_TILT = [0.5, 0, 0.2, 0.15];

export class Stardust {
  name = 'Stardust';
  sub = 'A hundred thousand sparks that keep finding new shapes.';
  bloom = { strength: 0.7, radius: 0.8, threshold: 0.3 };
  tint = new THREE.Color(0xffe45e);
  burstDist = 14;

  constructor({ shared, quality }) {
    const group = (this.group = new THREE.Group());
    this.sky = makeSky(0x06021a, 0x1c0646, 0x030010, 0.12);
    group.add(this.sky);
    this.stars = makeStars(quality.low ? 600 : 1500, shared);
    group.add(this.stars);

    const n = quality.low ? 38000 : 110000;
    const geo = new THREE.BufferGeometry();
    const tmp = [0, 0, 0];
    SHAPES.forEach((fn, k) => {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        fn(i, n, tmp);
        arr.set(tmp, i * 3);
      }
      geo.setAttribute(k === 0 ? 'position' : 'p' + k, new THREE.BufferAttribute(arr, 3));
    });
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seed.set([Math.random(), Math.random(), 0.035 + Math.pow(Math.random(), 3) * 0.14, Math.random()], i * 4);
    }
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));

    this.u = {
      uFrom: { value: new THREE.Vector4(1, 0, 0, 0) },
      uTo: { value: new THREE.Vector4(1, 0, 0, 0) },
      uProg: { value: 1 },
      uTime: { value: 0 }, uKick: { value: 0 }, uPulse: { value: 0 }, uBoost: { value: 0 },
      uH: shared.uH,
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.u,
        vertexShader: /* glsl */ `
          ${PAL}
          attribute vec3 p1, p2, p3;
          attribute vec4 aSeed;
          uniform vec4 uFrom, uTo;
          uniform float uProg, uTime, uKick, uPulse, uBoost, uH;
          varying vec3 vCol;
          void main(){
            vec3 a = position * uFrom.x + p1 * uFrom.y + p2 * uFrom.z + p3 * uFrom.w;
            vec3 b = position * uTo.x + p1 * uTo.y + p2 * uTo.z + p3 * uTo.w;
            float pr = clamp((uProg - aSeed.x * 0.45) / 0.55, 0.0, 1.0);
            pr = pr * pr * (3.0 - 2.0 * pr);
            vec3 p = mix(a, b, pr);
            float mid = sin(pr * 3.14159);
            vec3 rnd = vec3(sin(aSeed.y * 91.7), cos(aSeed.y * 57.3), sin(aSeed.x * 73.1));
            p += rnd * mid * 3.2;
            float ang = mid * 1.6;
            p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
            float tt = uTime * 0.6;
            p += 0.11 * (1.0 + uBoost * 3.5 + uKick * 0.9) * vec3(
              sin(p.y * 1.7 + tt + aSeed.y * 6.28),
              sin(p.z * 1.5 + tt * 1.1 + aSeed.x * 6.28),
              sin(p.x * 1.6 + tt * 0.9 + aSeed.w * 6.28));
            p *= 1.0 + uPulse * (0.2 + aSeed.y * 0.7) + uKick * 0.035;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(1.0, aSeed.z * uH * 0.87 / -mv.z * (1.0 + uKick * 0.35));
            vCol = pal(aSeed.w * 0.3 + length(p) * 0.05 + p.y * 0.06 + p.x * 0.035 + uTime * 0.045) * (0.6 + mid * 0.6 + uPulse);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vCol;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vCol, a * a * 0.8);
          }`,
      })
    );
    this.points.frustumCulled = false;
    group.add(this.points);

    this.shape = 0;
    this.morphAt = -1;
    this.pulse = 0;
    this.spin = 0;
  }

  _morph() {
    const next = (this.shape + 1) % SHAPES.length;
    this.u.uFrom.value.set(0, 0, 0, 0).setComponent(this.shape, 1);
    this.u.uTo.value.set(0, 0, 0, 0).setComponent(next, 1);
    this.u.uProg.value = 0;
    this.shape = next;
  }

  burst() {
    this.pulse = 1;
  }

  update(f) {
    const { t, dt, kick, boost, pointer, camera, beats } = f;
    const u = this.u;
    const slot = Math.floor(beats / 12);
    if (this.morphAt < 0) this.morphAt = slot;
    if (slot !== this.morphAt && u.uProg.value >= 1) {
      this.morphAt = slot;
      this._morph();
    }
    u.uProg.value = Math.min(1, u.uProg.value + dt / 2.6);
    this.pulse *= Math.exp(-dt * 3.2);
    u.uTime.value = t;
    u.uKick.value = kick;
    u.uPulse.value = this.pulse;
    u.uBoost.value = boost;

    this.spin += dt * (0.14 + boost * 1.4);
    this.points.rotation.y = this.spin;
    const tilt = SHAPE_TILT[this.shape];
    this.points.rotation.x += (tilt - this.points.rotation.x) * Math.min(1, dt * 1.2);

    this.sky.material.uniforms.uTime.value = t;
    this.stars.material.uniforms.uTime.value = t;

    const az = pointer.x * 0.9;
    const el = 0.12 + pointer.y * 0.45;
    const dist = 19 - boost * 4;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    this.sky.position.copy(camera.position);
  }
}
