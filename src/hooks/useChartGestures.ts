import { useEffect, useRef, type RefObject } from 'react'

// Pointer/touch gestures for the trend chart, attached as NATIVE listeners on the
// chart wrapper (so `wheel`/`touchmove` can be non-passive and call
// preventDefault — React's synthetic wheel/touch listeners are passive):
//   • wheel scroll (laptop trackpad / mouse wheel) → zoom, anchored under the cursor
//   • two-finger pinch (touch)                     → zoom, anchored at the pinch midpoint
//   • middle-button drag                           → horizontal pan (grab-and-drag)
// The left-button drag-to-zoom stays owned by Recharts inside the chart.

interface Handlers {
  // factor < 1 zooms in, > 1 zooms out; anchorFraction is 0..1 across the chart width.
  onZoom?: (factor: number, anchorFraction: number) => void
  // fraction is cumulative drag distance since the gesture began, as a share of
  // chart width (positive = dragged right). phase 'end' fires on release.
  onPan?: (fraction: number, phase: 'move' | 'end') => void
  enabled?: boolean
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function useChartGestures(ref: RefObject<HTMLElement | null>, handlers: Handlers) {
  const { enabled = true } = handlers
  // Latest handlers held in a ref so the native listeners (bound once) always call
  // through to fresh closures without re-registering on every render.
  const h = useRef(handlers)
  h.current = handlers

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const fracX = (clientX: number) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 ? clamp01((clientX - r.left) / r.width) : 0.5
    }

    // --- wheel = zoom under the cursor ---
    const onWheel = (e: WheelEvent) => {
      if (!h.current.onZoom) return
      e.preventDefault()
      // Magnitude-aware step so a big scroll zooms more; capped so one notch is gentle.
      const step = 1.0015 ** Math.min(Math.abs(e.deltaY), 120)
      h.current.onZoom(e.deltaY > 0 ? step : 1 / step, fracX(e.clientX))
    }

    // --- two-finger pinch = zoom about the midpoint ---
    let pinchDist = 0
    const touchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const touchMidX = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchDist = touchDist(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !h.current.onZoom) return
      e.preventDefault()
      const d = touchDist(e.touches)
      if (pinchDist > 0 && d > 0) {
        // Fingers spreading (d > pinchDist) → factor < 1 → zoom in.
        h.current.onZoom(pinchDist / d, fracX(touchMidX(e.touches)))
      }
      pinchDist = d
    }
    const endPinch = () => {
      pinchDist = 0
    }

    // --- middle-button drag = horizontal pan ---
    let panning = false
    let startX = 0
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1 || !h.current.onPan) return
      e.preventDefault() // suppress the browser's middle-click autoscroll
      panning = true
      startX = e.clientX
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!panning || !h.current.onPan) return
      const r = el.getBoundingClientRect()
      if (r.width > 0) h.current.onPan((e.clientX - startX) / r.width, 'move')
    }
    const endPan = () => {
      if (!panning) return
      panning = false
      h.current.onPan?.(0, 'end')
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', endPinch)
    el.addEventListener('touchcancel', endPinch)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endPan)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', endPinch)
      el.removeEventListener('touchcancel', endPinch)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endPan)
    }
  }, [ref, enabled])
}
