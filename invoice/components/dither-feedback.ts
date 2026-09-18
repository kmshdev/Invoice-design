// Token-based adaptation of Dither Kit's public ordered-Bayer button treatment.
// Source: Boring-Software-Inc/dither-kit, registry/dither-kit/button.tsx (MIT declared).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function enhanceDither(host: HTMLElement) {
  const control = host.closest<HTMLElement>('a, button, summary')
  if (!control) return () => {}
  const canvas = document.createElement('canvas')
  canvas.className = 'dither-feedback'
  canvas.setAttribute('aria-hidden', 'true')
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  host.append(canvas)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const hover = matchMedia('(hover: hover)')
  const abort = new AbortController()
  const options = { signal: abort.signal }
  let frame = 0
  let intensity = 0
  let target = 0
  let hovered = false
  let pressed = false
  let color = getComputedStyle(host).color

  function paint() {
    context!.clearRect(0, 0, canvas.width, canvas.height)
    if (intensity < 0.005) return
    context!.fillStyle = color
    for (let y = 0; y < canvas.height; y++) {
      const density = 0.25 + 0.75 * ((y + 0.5) / canvas.height)
      for (let x = 0; x < canvas.width; x++) {
        const threshold = (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16
        const lit = density > threshold - 0.1 * intensity
        context!.globalAlpha =
          Math.min(1, intensity) * (lit ? 0.28 : 0.06) * (0.3 + density * 0.7)
        context!.fillRect(x, y, 1, 1)
      }
    }
    context!.globalAlpha = 1
  }
  function tick() {
    intensity += (target - intensity) * 0.2
    if (Math.abs(target - intensity) < 0.005) intensity = target
    paint()
    frame = intensity === target ? 0 : requestAnimationFrame(tick)
  }
  function update() {
    target = pressed ? 1.5 : hovered || control!.matches(':focus-visible') ? 1 : 0
    color = getComputedStyle(host).color
    cancelAnimationFrame(frame)
    if (reduced.matches) {
      intensity = target
      frame = 0
      paint()
    } else frame = requestAnimationFrame(tick)
  }
  control.addEventListener(
    'pointerenter',
    () => {
      hovered = hover.matches
      update()
    },
    options,
  )
  control.addEventListener(
    'pointerleave',
    () => {
      hovered = false
      pressed = false
      update()
    },
    options,
  )
  control.addEventListener(
    'pointerdown',
    () => {
      pressed = true
      update()
    },
    options,
  )
  window.addEventListener(
    'pointerup',
    () => {
      if (pressed) {
        pressed = false
        update()
      }
    },
    options,
  )
  control.addEventListener(
    'pointercancel',
    () => {
      pressed = false
      update()
    },
    options,
  )
  control.addEventListener('focus', update, options)
  control.addEventListener('blur', update, options)
  control.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        pressed = true
        update()
      }
    },
    options,
  )
  control.addEventListener(
    'keyup',
    () => {
      pressed = false
      update()
    },
    options,
  )
  reduced.addEventListener('change', update, options)
  const resize = new ResizeObserver(() => {
    canvas.width = Math.max(4, Math.round(host.clientWidth / 2))
    canvas.height = Math.max(4, Math.round(host.clientHeight / 2))
    paint()
  })
  resize.observe(host)
  return () => {
    abort.abort()
    resize.disconnect()
    cancelAnimationFrame(frame)
    canvas.remove()
  }
}

let dispose: (() => void)[] = []
function mount() {
  dispose.forEach((cleanup) => cleanup())
  dispose = Array.from(document.querySelectorAll<HTMLElement>('[data-dither]')).map(
    enhanceDither,
  )
}
mount()
document.addEventListener('astro:page-load', mount)
document.addEventListener('astro:before-swap', () => {
  dispose.forEach((cleanup) => cleanup())
  dispose = []
})
