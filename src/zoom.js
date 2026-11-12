// Pinch to zoom and drag to pan, for the house tab's plan. The view is a
// fixed window (overflow hidden); the target inside it is moved and scaled
// with one transform, from its top-left corner. The maths has no DOM.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Keep the scaled content covering the view: no dragging it off into space.
export function clampView(t, size) {
  const s = clamp(t.s, MIN_ZOOM, MAX_ZOOM);
  return { s, x: clamp(t.x, size.w - size.w * s, 0), y: clamp(t.y, size.h - size.h * s, 0) };
}

// Zoom by `ratio` from the transform `from`, so that what was under the
// point `was` (view coordinates) ends up under `now`: two fingers keep hold
// of the same two bits of the house as they spread and slide.
export function zoomAbout(from, was, now, ratio, size) {
  const s = clamp(from.s * ratio, MIN_ZOOM, MAX_ZOOM);
  const cx = (was.x - from.x) / from.s;
  const cy = (was.y - from.y) / from.s;
  return clampView({ s, x: now.x - cx * s, y: now.y - cy * s }, size);
}

export const panBy = (from, dx, dy, size) => clampView({ s: from.s, x: from.x + dx, y: from.y + dy }, size);

// Attach to a view and the element inside it. Returns { reset, get, set }.
// onChange(t) is called with each new transform (to show a "fit" button).
// A touch that moved does not count as a tap: the click after it is dropped.
export function attachZoom(view, target, { onChange = () => {}, start = null } = {}) {
  let t = { s: 1, x: 0, y: 0 };
  const pointers = new Map();
  let base = null; // the transform, and the fingers, when this gesture began
  let moved = false;
  const size = () => ({ w: view.clientWidth, h: view.clientHeight });
  const local = (e) => {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const apply = (next) => {
    t = next;
    target.style.transformOrigin = '0 0';
    target.style.transform = t.s === 1 ? '' : `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) scale(${t.s.toFixed(3)})`;
    view.classList.toggle('zoomed', t.s > 1.01);
    onChange(t);
  };
  const rebase = () => {
    const pts = [...pointers.values()];
    base = { t, pts: pts.map((p) => ({ ...p })) };
  };
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pointers.size) moved = false;
    pointers.set(e.pointerId, local(e));
    rebase();
    if (pointers.size === 2) moved = true;
  };
  const move = (e) => {
    if (!pointers.has(e.pointerId) || !base) return;
    pointers.set(e.pointerId, local(e));
    const pts = [...pointers.values()];
    if (pts.length >= 2 && base.pts.length >= 2) {
      const d0 = dist(base.pts[0], base.pts[1]) || 1;
      apply(zoomAbout(base.t, mid(base.pts[0], base.pts[1]), mid(pts[0], pts[1]), dist(pts[0], pts[1]) / d0, size()));
    } else if (pts.length === 1 && base.pts.length === 1) {
      const dx = pts[0].x - base.pts[0].x;
      const dy = pts[0].y - base.pts[0].y;
      if (Math.hypot(dx, dy) > 8) moved = true;
      if (t.s > 1 && moved) apply(panBy(base.t, dx, dy, size()));
    }
  };
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    rebase();
  };
  // The click that ends a pinch or a drag is not a tap on a room.
  const click = (e) => {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  };
  // A mouse wheel, or a trackpad pinch (which arrives as a wheel with ctrl).
  const wheel = (e) => {
    e.preventDefault();
    const p = local(e);
    apply(zoomAbout(t, p, p, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), size()));
  };
  view.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  view.addEventListener('click', click, true);
  view.addEventListener('wheel', wheel, { passive: false });
  if (start) apply(clampView(start, size()));
  return {
    get: () => t,
    set: (next) => apply(clampView(next, size())),
    reset: () => apply({ s: 1, x: 0, y: 0 }),
    detach: () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    },
  };
}
