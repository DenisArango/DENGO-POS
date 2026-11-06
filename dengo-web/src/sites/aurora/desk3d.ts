// The hero's 3D desk: pencils, crayons and erasers floating in the dark.
// They drift, turn, shy away from the pointer and fly past the camera as
// the visitor scrolls out of the hero. Built from primitives (no models to
// download), flat-shaded in the page's crayon colours.

import {
  AmbientLight, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D,
} from 'three'

const COLORS = ['#ffc61a', '#ff4130', '#2f5bff', '#00a865', '#ff8fc6', '#ffffff', '#ff9a1a', '#7b5cff']

interface Item { obj: Object3D; base: Vector3; push: Vector3; vel: Vector3; spin: Vector3; phase: number; scale: number }

const mats = new Map<string, MeshStandardMaterial>()
const mat = (c: string, rough = 0.55, metal = 0) => {
  const k = `${c}|${rough}|${metal}`
  if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color: new Color(c), roughness: rough, metalness: metal, flatShading: true }))
  return mats.get(k)!
}

function pencil(color: string) {
  const g = new Group()
  const body = new Mesh(new CylinderGeometry(0.22, 0.22, 3.6, 6), mat(color, 0.45))
  const wood = new Mesh(new ConeGeometry(0.22, 0.7, 6), mat('#e9c393', 0.8)); wood.position.y = 2.15
  const lead = new Mesh(new ConeGeometry(0.075, 0.24, 6), mat('#1b1b22', 0.4)); lead.position.y = 2.38
  const ferrule = new Mesh(new CylinderGeometry(0.235, 0.235, 0.32, 14), mat('#c9ccd6', 0.25, 0.9)); ferrule.position.y = -1.96
  const eraser = new Mesh(new CylinderGeometry(0.22, 0.22, 0.34, 14), mat('#ff8fc6', 0.9)); eraser.position.y = -2.29
  g.add(body, wood, lead, ferrule, eraser)
  return g
}

function crayon(color: string) {
  const g = new Group()
  const wax = new Mesh(new CylinderGeometry(0.3, 0.3, 2.4, 14), mat(color, 0.7))
  const wrap = new Mesh(new CylinderGeometry(0.315, 0.315, 1.5, 14), mat(color === '#ffffff' ? '#2f5bff' : '#120e2e', 0.9)); wrap.position.y = -0.2
  const band = new Mesh(new CylinderGeometry(0.32, 0.32, 0.12, 14), mat('#ffc61a', 0.6)); band.position.y = 0.4
  const tip = new Mesh(new ConeGeometry(0.3, 0.55, 14), mat(color, 0.7)); tip.position.y = 1.47
  g.add(wax, wrap, band, tip)
  return g
}

function eraser(color: string) {
  const g = new Group()
  const a = new Mesh(new BoxGeometry(1.3, 0.5, 0.7), mat('#ffffff', 0.95))
  const b = new Mesh(new BoxGeometry(0.62, 0.52, 0.72), mat(color, 0.9)); b.position.x = 0.35
  g.add(a, b)
  return g
}

export function mountDesk(canvas: HTMLCanvasElement, opts: { count: number; still: boolean; hole: (x: number, y: number) => boolean }) {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 18)

  scene.add(new HemisphereLight('#fff3dc', '#2f1d6b', 1.4))
  scene.add(new AmbientLight('#ffffff', 0.35))
  const key = new DirectionalLight('#ffffff', 2.4); key.position.set(6, 8, 10); scene.add(key)
  const rim = new DirectionalLight('#ff8fc6', 1.6); rim.position.set(-8, -4, -6); scene.add(rim)

  const world = new Group(); scene.add(world)
  const items: Item[] = []
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  for (let i = 0; i < opts.count; i++) {
    const c = COLORS[i % COLORS.length]!
    const r = i % 7
    const obj = r < 4 ? pencil(c) : r < 6 ? crayon(c) : eraser(COLORS[(i + 3) % COLORS.length]!)
    // Keep a quieter hole behind the headline (left/centre), crowd the edges.
    let x = rnd(-13, 13), y = rnd(-7.5, 7.5)
    for (let k = 0; k < 12 && opts.hole(x, y); k++) { x = rnd(-13, 13); y = rnd(-7.5, 7.5) }
    const base = new Vector3(x, y, rnd(-10, 4))
    const scale = rnd(0.75, 1.25)
    obj.position.copy(base)
    obj.rotation.set(rnd(0, Math.PI * 2), rnd(0, Math.PI * 2), rnd(0, Math.PI * 2))
    obj.scale.setScalar(0.0001)
    world.add(obj)
    items.push({ obj, base, push: new Vector3(), vel: new Vector3(), spin: new Vector3(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.3, 0.3)), phase: rnd(0, Math.PI * 2), scale })
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false }
  let progress = 0
  let intro = 0
  let introTarget = 0
  let running = false
  let raf = 0
  const t0 = performance.now()
  const tmp = new Vector3()

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Narrow screens: pull back so the desk still fills the width.
    camera.position.z = w < h ? 26 : 18
    camera.updateProjectionMatrix()
  }

  const frame = () => {
    const t = (performance.now() - t0) / 1000
    intro += (introTarget - intro) * 0.06
    pointer.x += (pointer.tx - pointer.x) * 0.06
    pointer.y += (pointer.ty - pointer.y) * 0.06

    // Pointer in world space on the z=0 plane.
    tmp.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize()
    const dist = -camera.position.z / tmp.z
    const px = camera.position.x + tmp.x * dist, py = camera.position.y + tmp.y * dist

    for (const it of items) {
      const o = it.obj
      // Shy away from the pointer (spring back home).
      if (pointer.active) {
        const dx = o.position.x - px, dy = o.position.y - py
        const d2 = dx * dx + dy * dy
        if (d2 < 16) { const f = (1 - d2 / 16) * 0.09; it.vel.x += dx * f; it.vel.y += dy * f }
      }
      it.vel.addScaledVector(it.push, -0.04).multiplyScalar(0.9)
      it.push.add(it.vel)
      const fly = progress * (14 + it.base.z)
      o.position.set(
        it.base.x * (1 + progress * 0.5) + it.push.x,
        it.base.y + Math.sin(t * 0.7 + it.phase) * 0.35 + it.push.y,
        it.base.z + fly,
      )
      o.rotation.x += it.spin.x * 0.01 * (1 + progress * 4)
      o.rotation.y += it.spin.y * 0.01 * (1 + progress * 4)
      o.rotation.z += it.spin.z * 0.01
      o.scale.setScalar(Math.max(0.0001, it.scale * intro))
    }
    world.rotation.y = pointer.x * 0.12
    world.rotation.x = -pointer.y * 0.08
    renderer.render(scene, camera)
    if (running) raf = requestAnimationFrame(frame)
  }

  const start = () => { if (running || opts.still) return; running = true; raf = requestAnimationFrame(frame) }
  const stop = () => { running = false; cancelAnimationFrame(raf) }

  resize()
  addEventListener('resize', () => { resize(); if (!running) frame() })
  addEventListener('pointermove', e => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1
    pointer.ty = -(e.clientY / innerHeight) * 2 + 1
    pointer.active = e.pointerType === 'mouse'
  }, { passive: true })

  const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting && !document.hidden) start(); else stop() })
  io.observe(canvas)
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (canvas.getBoundingClientRect().bottom > 0) start() })

  return {
    reveal() {
      introTarget = 1
      if (opts.still) { intro = 1; frame() } else start()
    },
    setProgress(p: number) { progress = p; if (opts.still) frame() },
  }
}
