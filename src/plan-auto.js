// A floor plan sketched from the home's rooms, for everyone without one:
// each floor laid out as a block of near-square rooms (a squarified treemap),
// a room's size from how much is in it, gardens and paths in a strip along
// one side. It is marked as a sketch; the plan editor turns it into the real
// thing. Same format as a drawn plan.

const OUTDOOR = /garden|yard|trädgård|tradgard|lawn|walkway|path|drive|uppfart|patio|terrace|balcony|altan|veranda|porch|outside|ute/i;

export const isOutdoorName = (name) => OUTDOOR.test(String(name || ''));

// Square metres for a room with n devices: small rooms stay small, busy ones grow.
export const roomArea = (n) => Math.max(6, Math.min(36, 7 + n * 2.2));

// Squarified treemap (Bruls, Huijsen & van Wijk): lay `items` ({ weight })
// into the rectangle x, y, w, h, rows of near-square boxes.
export function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!items.length || total <= 0) return [];
  const scale = (w * h) / total;
  const nodes = items.map((i) => ({ ...i, a: i.weight * scale })).sort((p, q) => q.a - p.a);
  const out = [];
  let rect = { x, y, w, h };
  const worst = (row, side) => {
    const s = row.reduce((t, n) => t + n.a, 0);
    const max = Math.max(...row.map((n) => n.a));
    const min = Math.min(...row.map((n) => n.a));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (row) => {
    const s = row.reduce((t, n) => t + n.a, 0);
    if (rect.w >= rect.h) {
      // A column down the left of what is left.
      const cw = s / rect.h;
      let cy = rect.y;
      for (const n of row) {
        const ch = n.a / cw;
        out.push({ ...n, rect: [rect.x, cy, rect.x + cw, cy + ch] });
        cy += ch;
      }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const rh = s / rect.w;
      let cx = rect.x;
      for (const n of row) {
        const cw = n.a / rh;
        out.push({ ...n, rect: [cx, rect.y, cx + cw, rect.y + rh] });
        cx += cw;
      }
      rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
    }
  };
  let row = [];
  for (const n of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else {
      place(row);
      row = [n];
    }
  }
  if (row.length) place(row);
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;

// rooms: [{ area, name, floor, devices }]; floors: [{ floor_id, name, level }]
export function sketchPlan(rooms, floors) {
  const plan = { sketch: true, rooms: [], levels: {} };
  const byFloor = new Map();
  for (const r of rooms) {
    const key = r.floor || '';
    if (!byFloor.has(key)) byFloor.set(key, []);
    byFloor.get(key).push(r);
  }
  for (const [key, list] of byFloor) {
    const indoor = list.filter((r) => !isOutdoorName(r.name));
    const outdoor = list.filter((r) => isOutdoorName(r.name));
    const total = indoor.reduce((s, r) => s + roomArea(r.devices), 0);
    // A building a third wider than it is deep.
    const w = Math.sqrt(total * 1.35);
    const h = total / w || 0;
    for (const n of squarify(indoor.map((r) => ({ r, weight: roomArea(r.devices) })), 0, 0, w, h)) {
      plan.rooms.push({ id: n.r.area, name: n.r.name, area: n.r.area, level: key || undefined, rects: [n.rect.map(r2)] });
    }
    // Outside: a strip down the right-hand side.
    if (outdoor.length) {
      const depth = 3.5;
      const each = (h || 8) / outdoor.length;
      outdoor.forEach((r, i) => plan.rooms.push({ id: r.area, name: r.name, area: r.area, level: key || undefined, outdoor: true, rects: [[r2(w + 0.5), r2(i * each), r2(w + 0.5 + depth), r2((i + 1) * each)]] }));
    }
    const floor = floors.find((f) => f.floor_id === key);
    if (key) plan.levels[key] = { floor: floor && typeof floor.level === 'number' ? floor.level * 2.7 : 0 };
  }
  return plan;
}
