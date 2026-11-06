// Small joyful effects shared by Dayana's pages: crayon-coloured confetti
// and price bubbles that drift and bounce off the edges of their box.
// Everything checks prefers-reduced-motion and cleans up after itself.

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const CRAYONS = ['#e8141c', '#ffb800', '#2a56d6', '#12a356', '#ff7a1a', '#ff8fc6', '#55c2ff']

/** A burst of confetti from a point on the screen (client coordinates). */
export function confetti(x: number, y: number, count = 70, spread = 1) {
  if (reduceMotion()) return
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden'
  document.body.appendChild(layer)
  let left = count
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    const w = 6 + Math.random() * 8, h = Math.random() < 0.4 ? w : w * (0.35 + Math.random() * 0.4)
    const round = Math.random() < 0.3
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${CRAYONS[i % CRAYONS.length]};border-radius:${round ? '50%' : '2px'};border:1.5px solid #1a1433`
    layer.appendChild(p)
    const ang = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.3 * spread
    const v = 260 + Math.random() * 420
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v
    const fall = 420 + Math.random() * 380
    const spin = (Math.random() - 0.5) * 1080
    const dur = 1300 + Math.random() * 900
    p.animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px)) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + fall}px)) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }).onfinish = () => { if (--left === 0) layer.remove() }
  }
}

/** Confetti from the middle of an element. */
export function confettiFrom(el: Element, count = 70) {
  const r = el.getBoundingClientRect()
  confetti(r.left + r.width / 2, r.top + r.height / 3, count)
}

/** Bubbles that drift around their container and bounce off its edges (and nudge away from the pointer). */
export function drift(box: HTMLElement, items: HTMLElement[]) {
  if (reduceMotion() || !items.length) return
  const st = items.map(el => ({ el, x: 0, y: 0, vx: (Math.random() - 0.5) * 0.9, vy: (Math.random() - 0.5) * 0.9, r: 0 }))
  let W = 0, H = 0
  const measure = () => {
    const b = box.getBoundingClientRect(); W = b.width; H = b.height
    st.forEach((s, i) => {
      s.r = s.el.offsetWidth / 2
      if (!s.x) { s.x = s.r + ((i * 0.37 + 0.15) % 1) * Math.max(1, W - 2 * s.r); s.y = s.r + ((i * 0.61 + 0.2) % 1) * Math.max(1, H - 2 * s.r) }
    })
  }
  measure(); addEventListener('resize', measure)
  let px = -999, py = -999
  box.addEventListener('pointermove', e => { const b = box.getBoundingClientRect(); px = e.clientX - b.left; py = e.clientY - b.top })
  box.addEventListener('pointerleave', () => { px = py = -999 })
  let on = true
  new IntersectionObserver(([e]) => { on = !!e?.isIntersecting }).observe(box)
  const tick = () => {
    if (on) for (const s of st) {
      const dx = s.x - px, dy = s.y - py, d2 = dx * dx + dy * dy, R = s.r + 70
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1; s.vx += (dx / d) * 0.35; s.vy += (dy / d) * 0.35 }
      s.vx *= 0.985; s.vy *= 0.985
      const sp = Math.hypot(s.vx, s.vy)
      if (sp < 0.35) { s.vx *= 1.04; s.vy *= 1.04 }
      if (sp > 4) { s.vx *= 0.9; s.vy *= 0.9 }
      s.x += s.vx; s.y += s.vy
      if (s.x < s.r) { s.x = s.r; s.vx = Math.abs(s.vx) } else if (s.x > W - s.r) { s.x = W - s.r; s.vx = -Math.abs(s.vx) }
      if (s.y < s.r) { s.y = s.r; s.vy = Math.abs(s.vy) } else if (s.y > H - s.r) { s.y = H - s.r; s.vy = -Math.abs(s.vy) }
      s.el.style.transform = `translate(${s.x - s.r}px, ${s.y - s.r}px) rotate(${s.vx * 6}deg)`
    }
    // bubbles bounce off each other too
    if (on) for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i]!, c = st[j]!
      const dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r + 6, d = Math.hypot(dx, dy) || 1
      if (d < min) {
        const nx = dx / d, ny = dy / d, push = (min - d) / 2
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; c.vx -= rel * nx; c.vy -= rel * ny }
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
