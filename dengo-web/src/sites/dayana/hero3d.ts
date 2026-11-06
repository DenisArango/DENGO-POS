// The hero's 3D scene. Pencils, crayons, erasers and little notebooks float
// in the navy night, and in the middle stand Roja and Azul, two crayons
// with faces: they breathe, blink, follow the pointer with their eyes, wave,
// and jump when you tap them. Scrolling out of the hero, the supplies fly
// past the camera and the two crayons drop out of the frame (the 2D Roja
// takes over in the corner). Built from primitives, toon-shaded with an
// ink outline so they match the SVG crew on the rest of the page.

import {
  AmbientLight, BackSide, BoxGeometry, CanvasTexture, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture,
  DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, NearestFilter,
  PerspectiveCamera, Raycaster, RedFormat, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
  type BufferGeometry, type Material, type Object3D,
} from 'three'

const INK = '#1a1433'
const SUPPLY = ['#e8141c', '#ffffff', '#ffb800', '#2a56d6', '#12a356', '#ff7a1a', '#55c2ff', '#ff8fc6']

export interface CrewLook { name: string; wax: string; wrap: string; shade: string }
interface Body {
  root: Group; inner: Group; armL: Group; armR: Group; eyes: Group[]; pupils: Mesh[]; mouth: Mesh; grin: Mesh
  base: Vector3; scale: number; phase: number; jump: number; blinkAt: number; waveUntil: number; look: Vector2; hitbox: Mesh; name: string
}
interface Item { obj: Object3D; base: Vector3; push: Vector3; vel: Vector3; spin: Vector3; phase: number; scale: number }

let gradient: DataTexture | null = null
const grad = () => {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([80, 170, 255]), 3, 1, RedFormat)
    gradient.minFilter = gradient.magFilter = NearestFilter
    gradient.needsUpdate = true
  }
  return gradient
}
const toonCache = new Map<string, MeshToonMaterial>()
const toon = (c: string) => {
  if (!toonCache.has(c)) toonCache.set(c, new MeshToonMaterial({ color: new Color(c), gradientMap: grad() }))
  return toonCache.get(c)!
}
const inkHull = new MeshBasicMaterial({ color: INK, side: BackSide })
const inkFlat = new MeshBasicMaterial({ color: INK })
const white = new MeshBasicMaterial({ color: '#ffffff' })

/** Add an ink outline: the same shape, a little larger, drawn inside-out. */
function outline<T extends Mesh>(m: T, sx: number, sy = sx, sz = sx): T {
  const h = new Mesh(m.geometry, inkHull)
  h.scale.set(sx, sy, sz)
  m.add(h)
  return m
}
const mesh = (g: BufferGeometry, m: Material) => new Mesh(g, m)

/** The paper wrapper: the colour, two wavy bands, pink cheeks and a label with the crayon's name. */
function wrapper(look: CrewLook) {
  const W = 1024, H = 512
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = look.wrap; g.fillRect(0, 0, W, H)
  const band = (y0: number) => {
    g.beginPath()
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 24) * 7)
    for (let x = W; x >= 0; x -= 8) g.lineTo(x, y0 + 24 + Math.sin((x / W) * Math.PI * 24) * 7)
    g.closePath(); g.fillStyle = look.shade; g.fill()
  }
  band(26); band(450)
  // cheeks, either side of the front (u = 0.5)
  g.fillStyle = 'rgba(255, 143, 180, 0.8)'
  for (const dx of [-98, 98]) { g.beginPath(); g.ellipse(W / 2 + dx, 228, 30, 17, 0, 0, Math.PI * 2); g.fill() }
  // label
  const lw = 230, lh = 74, lx = W / 2 - lw / 2, ly = 352
  g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 8
  g.beginPath(); g.roundRect(lx, ly, lw, lh, lh / 2); g.fill(); g.stroke()
  g.fillStyle = look.shade; g.font = `700 66px Caveat, 'Comic Sans MS', cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(look.name, W / 2, ly + lh / 2 + 4)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function crewMember(look: CrewLook): Omit<Body, 'base' | 'scale' | 'phase' | 'jump' | 'blinkAt' | 'waveUntil' | 'look'> {
  const root = new Group()
  const inner = new Group(); root.add(inner)

  const body = outline(mesh(new CylinderGeometry(1, 1, 3.2, 48, 1, false, -Math.PI, Math.PI * 2), new MeshToonMaterial({ map: wrapper(look), gradientMap: grad() })), 1.045, 1.02, 1.045)
  inner.add(body)
  const ring = outline(mesh(new CylinderGeometry(0.97, 0.97, 0.26, 40), toon(look.wax)), 1.05, 1.1, 1.05); ring.position.y = 1.73; inner.add(ring)
  const tip = outline(mesh(new CylinderGeometry(0.32, 0.97, 1.25, 40), toon(look.wax)), 1.06, 1.03, 1.06); tip.position.y = 2.48; inner.add(tip)
  const cap = outline(mesh(new SphereGeometry(0.32, 24, 12), toon(look.wax)), 1.12); cap.scale.set(1, 0.42, 1); cap.position.y = 3.1; inner.add(cap)
  // a streak of light on the wax
  const hi = mesh(new BoxGeometry(0.08, 1.1, 0.02), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }))
  hi.position.set(-0.36, 2.45, 0.66); hi.rotation.set(-0.5, -0.45, -0.28); inner.add(hi)

  // eyes
  const eyes: Group[] = [], pupils: Mesh[] = []
  for (const s of [-1, 1]) {
    const e = new Group(); e.position.set(s * 0.37, 0.58, 0.9); e.rotation.y = s * 0.38
    const w = outline(mesh(new SphereGeometry(0.28, 28, 18), toon('#ffffff')), 1.13); w.scale.set(1, 1.22, 0.55); e.add(w)
    const p = mesh(new SphereGeometry(0.135, 18, 12), inkFlat); p.position.z = 0.12; p.scale.set(1, 1.1, 0.6)
    const gl = mesh(new SphereGeometry(0.045, 10, 8), white); gl.position.set(-0.04, 0.05, 0.08); p.add(gl)
    e.add(p); inner.add(e); eyes.push(e); pupils.push(p)
  }
  // mouth: a smile, and an open grin for jumps
  const mouth = mesh(new TorusGeometry(0.19, 0.045, 8, 24, Math.PI), inkFlat); mouth.rotation.z = Math.PI; mouth.position.set(0, 0.2, 1.0); inner.add(mouth)
  const grin = mesh(new SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new MeshBasicMaterial({ color: '#5b0b1e' }))
  grin.scale.set(1, 1.1, 0.35); grin.position.set(0, 0.22, 0.97); grin.visible = false; inner.add(grin)

  // arms and white gloves
  const arm = (s: number) => {
    const pivot = new Group(); pivot.position.set(s * 0.98, 0.12, 0)
    const a = outline(mesh(new CapsuleGeometry(0.11, 0.7, 4, 10), toon(look.wax)), 1.45, 1.08, 1.45); a.position.y = -0.48; pivot.add(a)
    const h = outline(mesh(new SphereGeometry(0.23, 18, 12), toon('#ffffff')), 1.16); h.position.y = -0.98; pivot.add(h)
    pivot.rotation.z = s * 0.35
    inner.add(pivot)
    return pivot
  }
  const armL = arm(-1), armR = arm(1)
  // legs and sneakers
  for (const s of [-1, 1]) {
    const l = outline(mesh(new CapsuleGeometry(0.12, 0.4, 4, 10), toon(look.shade)), 1.4, 1.1, 1.4); l.position.set(s * 0.38, -1.92, 0); inner.add(l)
    const sh = outline(mesh(new SphereGeometry(0.26, 20, 12), toon('#ffffff')), 1.14); sh.scale.set(1.2, 0.72, 1.6); sh.position.set(s * 0.42, -2.26, 0.14); inner.add(sh)
  }
  // an invisible box to hit with the pointer
  const hitbox = new Mesh(new BoxGeometry(2.6, 5.8, 2.2), new MeshBasicMaterial({ visible: false })); hitbox.position.y = 0.4; root.add(hitbox)
  return { root, inner, armL, armR, eyes, pupils, mouth, grin, hitbox, name: look.name }
}

// ── The supplies ──────────────────────────────────────────────────────────
const flatCache = new Map<string, MeshStandardMaterial>()
const flat = (c: string, rough = 0.55, metal = 0) => {
  const k = `${c}|${rough}|${metal}`
  if (!flatCache.has(k)) flatCache.set(k, new MeshStandardMaterial({ color: new Color(c), roughness: rough, metalness: metal, flatShading: true }))
  return flatCache.get(k)!
}
function pencil(color: string) {
  const g = new Group()
  const body = mesh(new CylinderGeometry(0.22, 0.22, 3.6, 6), flat(color, 0.45))
  const wood = mesh(new ConeGeometry(0.22, 0.7, 6), flat('#e9c393', 0.8)); wood.position.y = 2.15
  const lead = mesh(new ConeGeometry(0.075, 0.24, 6), flat('#1b1b22', 0.4)); lead.position.y = 2.38
  const ferrule = mesh(new CylinderGeometry(0.235, 0.235, 0.32, 14), flat('#c9ccd6', 0.25, 0.9)); ferrule.position.y = -1.96
  const eraser = mesh(new CylinderGeometry(0.22, 0.22, 0.34, 14), flat('#ff8fc6', 0.9)); eraser.position.y = -2.29
  g.add(body, wood, lead, ferrule, eraser)
  return g
}
function crayon(color: string) {
  const g = new Group()
  const wax = mesh(new CylinderGeometry(0.3, 0.3, 2.4, 14), flat(color, 0.7))
  const wrap = mesh(new CylinderGeometry(0.315, 0.315, 1.5, 14), flat(color === '#ffffff' ? '#173a9e' : INK, 0.9)); wrap.position.y = -0.2
  const band = mesh(new CylinderGeometry(0.32, 0.32, 0.12, 14), flat('#ffb800', 0.6)); band.position.y = 0.4
  const tip = mesh(new ConeGeometry(0.3, 0.55, 14), flat(color, 0.7)); tip.position.y = 1.47
  g.add(wax, wrap, band, tip)
  return g
}
function eraser(color: string) {
  const g = new Group()
  const a = mesh(new BoxGeometry(1.3, 0.5, 0.7), flat('#ffffff', 0.95))
  const b = mesh(new BoxGeometry(0.62, 0.52, 0.72), flat(color, 0.9)); b.position.x = 0.35
  g.add(a, b)
  return g
}
function notebook(color: string) {
  const g = new Group()
  const cover = mesh(new BoxGeometry(1.5, 2, 0.16), flat(color, 0.8))
  const pages = mesh(new BoxGeometry(1.42, 1.92, 0.18), flat('#fffaf0', 0.95)); pages.position.x = 0.05
  const spiral = mesh(new CylinderGeometry(0.06, 0.06, 1.9, 6), flat('#c9ccd6', 0.3, 0.8)); spiral.position.x = -0.75
  g.add(pages, cover, spiral); cover.position.z = -0.03
  return g
}

export interface HeroScene { reveal(): void; setProgress(p: number): void; hop(name?: string): void }

export function mountHero(canvas: HTMLCanvasElement, opts: {
  crew: CrewLook[]; count: number; still: boolean
  /** Where the supplies must not float (world x/y at z=0); defaults to around the hero's headline and crew. */
  hole?: (x: number, y: number, portrait: boolean) => boolean
  onHit?: (name: string, x: number, y: number) => void
}): HeroScene | null {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.outputColorSpace = SRGBColorSpace
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 18)

  scene.add(new HemisphereLight('#fff3dc', '#1b2a6b', 1.5))
  scene.add(new AmbientLight('#ffffff', 0.4))
  const key = new DirectionalLight('#ffffff', 2.6); key.position.set(5, 8, 10); scene.add(key)
  const rim = new DirectionalLight('#ff5a5a', 1.4); rim.position.set(-8, -4, -6); scene.add(rim)

  const world = new Group(); scene.add(world)
  const items: Item[] = []
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const portrait = () => canvas.clientWidth < canvas.clientHeight
  // keep the headline and the crew clear
  const hole = (x: number, y: number) => opts.hole ? opts.hole(x, y, portrait()) : portrait()
    ? (y < 0.5 && y > -8) || (Math.abs(x) < 3.6 && y > 0.5 && y < 7.5)
    : (x < 1.4 && y > -5 && y < 4.5) || (x > 1.8 && x < 8.6 && y > -4.2 && y < 2.8)
  for (let i = 0; i < opts.count; i++) {
    const c = SUPPLY[i % SUPPLY.length]!
    const r = i % 9
    const obj = r < 4 ? pencil(c) : r < 7 ? crayon(c) : r < 8 ? eraser(SUPPLY[(i + 3) % SUPPLY.length]!) : notebook(SUPPLY[(i + 1) % SUPPLY.length]!)
    let x = rnd(-13, 13), y = rnd(-8, 8)
    for (let k = 0; k < 16 && hole(x, y); k++) { x = rnd(-13, 13); y = rnd(-8, 8) }
    const base = new Vector3(x, y, rnd(-10, 3))
    obj.position.copy(base)
    obj.rotation.set(rnd(0, Math.PI * 2), rnd(0, Math.PI * 2), rnd(0, Math.PI * 2))
    obj.scale.setScalar(0.0001)
    world.add(obj)
    items.push({ obj, base, push: new Vector3(), vel: new Vector3(), spin: new Vector3(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.3, 0.3)), phase: rnd(0, Math.PI * 2), scale: rnd(0.75, 1.2) })
  }

  const crew: Body[] = opts.crew.map((look, i) => ({
    ...crewMember(look), base: new Vector3(), scale: 1, phase: i * 1.7, jump: -1, blinkAt: 1 + i * 1.3, waveUntil: i === 0 ? 3.2 : 0, look: new Vector2(),
  }))
  crew.forEach(b => { b.root.scale.setScalar(0.0001); scene.add(b.root) })

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false }
  let progress = 0, intro = 0, introTarget = 0, running = false, raf = 0, revealAt = 0
  const t0 = performance.now()
  const tmp = new Vector3()
  const ray = new Raycaster()

  const place = () => {
    const halfH = Math.tan((camera.fov / 2) * Math.PI / 180) * camera.position.z
    const halfW = halfH * camera.aspect
    if (portrait()) {
      // above the headline: the top quarter of a phone screen
      const s = Math.min(0.66, halfW / 5.4)
      crew[0]?.base.set(-halfW * 0.36, halfH * 0.6, 0); crew[1]?.base.set(halfW * 0.38, halfH * 0.58, -0.6)
      crew.forEach(b => (b.scale = s))
    } else {
      crew[0]?.base.set(halfW * 0.34, -1.05, 0.4); crew[1]?.base.set(halfW * 0.7, -1.2, -0.4)
      crew.forEach(b => (b.scale = Math.min(0.92, halfH / 6)))
    }
  }
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.z = w < h ? 26 : 18
    camera.updateProjectionMatrix()
    place()
  }

  const ease = (t: number) => 1 - Math.pow(1 - t, 3)
  const elastic = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1

  const frame = () => {
    const t = (performance.now() - t0) / 1000
    intro += (introTarget - intro) * 0.05
    pointer.x += (pointer.tx - pointer.x) * 0.08
    pointer.y += (pointer.ty - pointer.y) * 0.08

    tmp.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize()
    const dist = -camera.position.z / tmp.z
    const px = camera.position.x + tmp.x * dist, py = camera.position.y + tmp.y * dist

    for (const it of items) {
      const o = it.obj
      if (pointer.active) {
        const dx = o.position.x - px, dy = o.position.y - py
        const d2 = dx * dx + dy * dy
        if (d2 < 16) { const f = (1 - d2 / 16) * 0.09; it.vel.x += dx * f; it.vel.y += dy * f }
      }
      it.vel.addScaledVector(it.push, -0.04).multiplyScalar(0.9)
      it.push.add(it.vel)
      const fly = progress * (14 + it.base.z)
      o.position.set(it.base.x * (1 + progress * 0.5) + it.push.x, it.base.y + Math.sin(t * 0.7 + it.phase) * 0.35 + it.push.y, it.base.z + fly)
      o.rotation.x += it.spin.x * 0.01 * (1 + progress * 4)
      o.rotation.y += it.spin.y * 0.01 * (1 + progress * 4)
      o.rotation.z += it.spin.z * 0.01
      o.scale.setScalar(Math.max(0.0001, it.scale * intro))
    }

    crew.forEach((b, i) => {
      // pop in, one after the other
      const pop = opts.still ? 1 : introTarget ? elastic(Math.min(1, Math.max(0, (t - revealAt - 0.25 - i * 0.22) / 1.1))) : 0
      // follow the pointer with the eyes and a turn of the body
      const lx = Math.max(-1, Math.min(1, (px - b.root.position.x) / 6))
      const ly = Math.max(-1, Math.min(1, (py - (b.root.position.y + 1.2)) / 5))
      b.look.x += (lx - b.look.x) * 0.12; b.look.y += (ly - b.look.y) * 0.12
      b.pupils.forEach(p => { p.position.x = b.look.x * 0.09; p.position.y = b.look.y * 0.1 })
      b.root.rotation.y = b.look.x * 0.42 + (i ? -0.12 : 0.1)
      b.root.rotation.x = -b.look.y * 0.08
      // jump
      let jy = 0, spin = 0, sq = 1
      if (b.jump >= 0) {
        const j = (t - b.jump) / 0.95
        if (j >= 1) { b.jump = -1; b.grin.visible = false; b.mouth.visible = true }
        else {
          jy = Math.sin(Math.PI * Math.min(1, j * 1.15)) * 2.4
          spin = ease(Math.min(1, j * 1.1)) * Math.PI * 2
          sq = j < 0.12 ? 1 - j * 1.4 : j > 0.85 ? 1 - (1 - j) * 0.9 : 1 + Math.sin(Math.PI * j) * 0.06
        }
      }
      const bob = Math.sin(t * 2.1 + b.phase) * 0.09
      b.root.position.set(b.base.x, b.base.y + bob + jy - progress * 9 * (1 + i * 0.25), b.base.z)
      b.inner.rotation.y = spin
      b.inner.rotation.z = Math.sin(t * 1.3 + b.phase) * 0.035 + progress * (i ? 0.8 : -0.8)
      b.inner.scale.set(2 - sq, sq, 2 - sq)
      b.root.scale.setScalar(Math.max(0.0001, b.scale * pop))
      // arms: a lazy swing, a wave now and then, both up in a jump
      const waving = t < b.waveUntil
      if (b.jump >= 0) { b.armL.rotation.z += (-2.6 - b.armL.rotation.z) * 0.3; b.armR.rotation.z += (2.6 - b.armR.rotation.z) * 0.3 }
      else {
        b.armL.rotation.z += (-0.32 + Math.sin(t * 1.6 + b.phase) * 0.08 - b.armL.rotation.z) * 0.15
        const r = waving ? 2.45 + Math.sin(t * 9) * 0.32 : 0.32 - Math.sin(t * 1.6 + b.phase) * 0.08
        b.armR.rotation.z += (r - b.armR.rotation.z) * 0.18
      }
      if (!waving && Math.random() < 0.0016) b.waveUntil = t + 2.2
    })
    // blink: a short squash of the eyes, then the next one 2.5–5.5 s later
    crew.forEach(b => {
      const d = t - b.blinkAt
      if (d > 0.14) b.blinkAt = t + 2.5 + Math.random() * 3
      const s = d > 0 && d <= 0.14 ? Math.abs(d - 0.07) / 0.07 : 1
      b.eyes.forEach(e => { e.scale.y = Math.max(0.1, s) })
    })

    world.rotation.y = pointer.x * 0.1
    world.rotation.x = -pointer.y * 0.06
    renderer.render(scene, camera)
    if (running) raf = requestAnimationFrame(frame)
  }

  const start = () => { if (running || opts.still) return; running = true; raf = requestAnimationFrame(frame) }
  const stop = () => { running = false; cancelAnimationFrame(raf) }

  const hop = (b: Body) => {
    if (b.jump >= 0) return
    b.jump = (performance.now() - t0) / 1000
    b.grin.visible = true; b.mouth.visible = false
    if (opts.still) frame()
  }
  const hitTest = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
    const hits = ray.intersectObjects(crew.map(b => b.hitbox), false)
    return hits[0] ? crew.find(b => b.hitbox === hits[0]!.object) ?? null : null
  }

  resize()
  addEventListener('resize', () => { resize(); if (!running) frame() })
  addEventListener('pointermove', e => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1
    pointer.ty = -(e.clientY / innerHeight) * 2 + 1
    pointer.active = e.pointerType === 'mouse'
    if (e.pointerType === 'mouse' && progress < 0.3) {
      const over = !!hitTest(e.clientX, e.clientY) && !(e.target as HTMLElement).closest('a, button, input')
      canvas.parentElement!.style.cursor = over ? 'pointer' : ''
    }
  }, { passive: true })
  canvas.parentElement!.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('a, button, input, form')) return
    const b = hitTest(e.clientX, e.clientY)
    if (!b) return
    hop(b)
    b.root.updateMatrixWorld()
    const p = new Vector3(0, 3.6, 0).applyMatrix4(b.root.matrixWorld).project(camera)
    const r = canvas.getBoundingClientRect()
    opts.onHit?.(b.name, r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height)
  })

  const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting && !document.hidden) start(); else stop() })
  io.observe(canvas)
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (canvas.getBoundingClientRect().bottom > 0) start() })

  return {
    reveal() {
      introTarget = 1
      revealAt = (performance.now() - t0) / 1000
      if (opts.still) { intro = 1; frame() } else start()
    },
    setProgress(p: number) { progress = p; if (opts.still) frame() },
    hop(name?: string) { const b = crew.find(c => c.name === name) ?? crew[0]; if (b) hop(b) },
  }
}
