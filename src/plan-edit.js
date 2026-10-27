// Drawing the floor plan, for everyone: start from the sketch Mosaic makes of
// your rooms (or a plan you already have), drag rooms into place, pull a
// corner to size them, add a part for an L-shaped room, and trace over a
// drawing or photo of the floor if you have one. Saved into the dashboard
// as the card's floorplan. Mixed into the card.

import { planLevels, validPlan, bbox } from './plan.js';
import { roomArea, sketchPlan } from './plan-auto.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SNAP = 0.25;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const r2 = (v) => Math.round(v * 100) / 100;
const norm = ([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];

export const planEditMethods = {
  // A sketch of the home's rooms, by floor (see plan-auto.js).
  _sketch() {
    const hass = this._hass;
    const counts = new Map();
    for (const d of Object.values(hass.devices || {})) if (d.area_id) counts.set(d.area_id, (counts.get(d.area_id) || 0) + 1);
    const floors = Object.values(hass.floors || {}).map((f) => ({ floor_id: f.floor_id, name: f.name, level: f.level }));
    // A room Home Assistant has on no floor goes on the ground floor (or the lowest there is).
    const ground = floors.find((f) => f.level === 0) || [...floors].sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
    const rooms = Object.values(hass.areas || {}).map((a) => ({ area: a.area_id, name: a.name, floor: a.floor_id || (ground ? ground.floor_id : ''), devices: counts.get(a.area_id) || 0 }));
    return sketchPlan(rooms, floors);
  },

  // The floors the editor offers: the plan's own storeys and every Home
  // Assistant floor, top first.
  _peLevels() {
    const hass = this._hass;
    const have = planLevels(this._pe.plan, hass);
    const out = have.map((l) => ({ key: l.key, name: l.name, height: l.height, floorId: l.floorId }));
    for (const f of Object.values(hass.floors || {})) {
      if (out.some((l) => l.floorId === f.floor_id || l.key === f.floor_id)) continue;
      out.push({ key: f.floor_id, name: f.name, height: typeof f.level === 'number' ? f.level : 0, floorId: f.floor_id });
    }
    if (!out.length) out.push({ key: '', name: 'the house', height: 0 });
    return out.sort((a, b) => b.height - a.height);
  },

  _openPlanEditor(levelKey) {
    if (!this._canEdit()) return this._toast('Only an admin can change the floor plan.');
    const base = JSON.parse(JSON.stringify(validPlan(this._plan) ? this._plan : this._sketch()));
    base.backdrops = base.backdrops || {};
    this._pe = { plan: base, level: '', sel: null, moveDrawing: false, dirty: false };
    const levels = this._peLevels();
    this._pe.level = levelKey !== undefined && levels.some((l) => l.key === levelKey) ? levelKey : levels[0].key;
    const under = this._overlay;
    this._overlay = { kind: 'planedit', under };
    this._layer().innerHTML = `<div class="overlay app planedit" role="dialog" aria-label="floor plan">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>floor plan${base.sketch ? '<small>a sketch of your rooms: drag them where they really are</small>' : ''}</span></div>
      <div class="pivots" role="tablist"></div>
      <div class="pe"><div class="pecanvas"></div><div class="pepanel"></div></div>
      <div class="pebar"><button class="yes" data-pe="save">done</button><button data-pe="cancel">cancel</button></div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.addEventListener('click', (e) => this._peClick(e));
    app.addEventListener('change', (e) => this._peChange(e));
    app.addEventListener('input', (e) => this._peInput(e));
    this._peWire(app.querySelector('.pecanvas'));
    this._peRender();
  },

  _peRooms() {
    return this._pe.plan.rooms.map((r, i) => ({ r, i })).filter(({ r }) => (r.level || '') === (this._pe.level || ''));
  },

  _peRender() {
    const app = this._layer().querySelector('.planedit');
    if (!app) return;
    const levels = this._peLevels();
    app.querySelector('.pivots').innerHTML = levels.map((l) => `<button role="tab" data-level="${esc(l.key)}" class="${l.key === this._pe.level ? 'on' : ''}">${esc(l.name)}</button>`).join('');
    this._peDraw();
    this._pePanel();
  },

  // The canvas: a metre grid, the drawing to trace (if any), the rooms.
  _peDraw() {
    const box = this._layer().querySelector('.pecanvas');
    if (!box) return;
    const pe = this._pe;
    const rooms = this._peRooms();
    const bd = pe.plan.backdrops[pe.level || 'main'];
    const parts = rooms.flatMap(({ r }) => r.rects);
    const frame = parts.length ? bbox([{ rects: parts }]) : { x1: 0, y1: 0, x2: 12, y2: 9 };
    if (bd) {
      frame.x1 = Math.min(frame.x1, bd.x);
      frame.y1 = Math.min(frame.y1, bd.y);
      frame.x2 = Math.max(frame.x2, bd.x + bd.w);
      frame.y2 = Math.max(frame.y2, bd.y + bd.w * (bd.ratio || 0.7));
    }
    const pad = 2.5;
    const vb = [Math.floor(frame.x1 - pad), Math.floor(frame.y1 - pad), Math.ceil(frame.x2 - frame.x1 + pad * 2), Math.ceil(frame.y2 - frame.y1 + pad * 2)];
    if (!pe.frame || pe.drag == null) pe.frame = vb; // the frame holds still while dragging
    const [vx, vy, vw, vh] = pe.frame;
    const grid = [];
    for (let x = Math.ceil(vx); x <= vx + vw; x++) grid.push(`<line x1="${x}" y1="${vy}" x2="${x}" y2="${vy + vh}"/>`);
    for (let y = Math.ceil(vy); y <= vy + vh; y++) grid.push(`<line x1="${vx}" y1="${y}" x2="${vx + vw}" y2="${y}"/>`);
    const sel = pe.sel;
    const shapes = rooms.map(({ r, i }) => {
      const label = this._peName(r);
      const big = [...r.rects].sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
      return `<g class="pr${r.outdoor ? ' out' : ''}${sel && sel.r === i ? ' sel' : ''}">${r.rects.map((q, j) => `<rect data-r="${i}" data-q="${j}" class="${sel && sel.r === i && sel.q === j ? 'part' : ''}" x="${q[0]}" y="${q[1]}" width="${q[2] - q[0]}" height="${q[3] - q[1]}"/>`).join('')}<text x="${(big[0] + big[2]) / 2}" y="${(big[1] + big[3]) / 2}" font-size="${Math.max(0.3, Math.min(0.6, (big[3] - big[1]) * 0.3))}">${esc(label)}</text></g>`;
    }).join('');
    const handle = sel && pe.plan.rooms[sel.r] && pe.plan.rooms[sel.r].rects[sel.q] ? (() => {
      const q = pe.plan.rooms[sel.r].rects[sel.q];
      return `<circle class="ph" data-h="1" cx="${q[2]}" cy="${q[3]}" r="0.32"/>`;
    })() : '';
    const image = bd ? `<image href="${esc(bd.url)}" x="${bd.x}" y="${bd.y}" width="${bd.w}" height="${bd.w * (bd.ratio || 0.7)}" opacity="${bd.opacity ?? 0.5}" preserveAspectRatio="none" class="${pe.moveDrawing ? 'moving' : ''}"/>` : '';
    box.innerHTML = `<svg class="pesvg${pe.moveDrawing ? ' movedrawing' : ''}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" role="application" aria-label="the floor plan of ${esc((this._peLevels().find((l) => l.key === pe.level) || {}).name || 'this floor')}">${image}<g class="grid">${grid.join('')}</g>${shapes}${handle}</svg>`;
  },

  _peName(r) {
    const a = r.area && this._hass.areas && this._hass.areas[r.area];
    return (a && a.name) || r.name || r.id || 'room';
  },

  // The panel: the room picked, adding rooms, the drawing to trace.
  _pePanel() {
    const box = this._layer().querySelector('.pepanel');
    if (!box) return;
    const pe = this._pe;
    const hass = this._hass;
    const areas = Object.values(hass.areas || {}).sort((a, b) => a.name.localeCompare(b.name));
    const placed = new Set(pe.plan.rooms.map((r) => r.area).filter(Boolean));
    const r = pe.sel && pe.plan.rooms[pe.sel.r];
    const bd = pe.plan.backdrops[pe.level || 'main'];
    const room = r ? `<h4 class="ghead">${esc(this._peName(r))}</h4>
      <label class="field"><span>which room this is</span><select data-pe="area"><option value="">not a Home Assistant room</option>${areas.map((a) => `<option value="${esc(a.area_id)}" ${a.area_id === r.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      ${r.area ? '' : `<label class="field"><span>its name</span><input data-pe="name" value="${esc(r.name || '')}" placeholder="landing, WC, store…"></label>`}
      <div class="links"><button class="link" data-pe="part">+ part (an L-shaped room)</button>${r.rects.length > 1 ? '<button class="link" data-pe="unpart">remove this part</button>' : ''}<button class="link" data-pe="outdoor">${r.outdoor ? 'indoors' : 'outside'}</button><button class="link danger" data-pe="remove">take off the plan</button></div>`
      : '<p class="fdesc">Tap a room to change it; drag it to move it, the round handle to size it.</p>';
    const missing = areas.filter((a) => !placed.has(a.area_id));
    const add = `<h4 class="ghead">add</h4><label class="field"><span>a room not on the plan yet</span><select data-pe="addarea"><option value="">choose…</option>${missing.map((a) => `<option value="${esc(a.area_id)}">${esc(a.name)}</option>`).join('')}</select></label>
      <div class="links"><button class="link" data-pe="addother">+ a space that isn't a Home Assistant room</button></div>`;
    const drawing = `<h4 class="ghead">a drawing to trace</h4>
      ${bd ? `<label class="field"><span>its width, in metres</span><input data-pe="bdw" inputmode="decimal" value="${esc(bd.w)}"></label>
        <label class="field"><span>how faint</span><input type="range" min="0.1" max="1" step="0.05" data-pe="bdo" value="${esc(bd.opacity ?? 0.5)}"></label>
        <div class="links"><button class="link" data-pe="movedrawing">${pe.moveDrawing ? 'done moving it' : 'move it'}</button><button class="link danger" data-pe="nodrawing">remove it</button></div>`
      : `<p class="fdesc">A floor plan, an estate agent's drawing, a photo of a sketch: put it under the rooms and trace them.</p>
        <label class="pbtn fileb">choose a picture<input type="file" accept="image/*" data-pe="upload" hidden></label>
        <label class="field"><span>or its address</span><input data-pe="bdurl" placeholder="/local/plans/ground.png"></label>`}`;
    const more = `<h4 class="ghead">more</h4><div class="links"><button class="link" data-pe="import">import a plan (house.wad's format)</button><button class="link" data-pe="resketch">start again from a sketch</button></div>`;
    box.innerHTML = room + add + drawing + more;
  },

  // --- dragging -----------------------------------------------------------------

  _peWire(box) {
    const point = (e) => {
      const svg = box.querySelector('svg');
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    box.addEventListener('pointerdown', (e) => {
      const pe = this._pe;
      const at = point(e);
      const handle = e.target.closest('[data-h]');
      const part = e.target.closest('rect[data-r]');
      if (pe.moveDrawing && pe.plan.backdrops[pe.level || 'main']) {
        const bd = pe.plan.backdrops[pe.level || 'main'];
        pe.drag = { kind: 'drawing', from: at, start: { x: bd.x, y: bd.y } };
      } else if (handle && pe.sel) {
        pe.drag = { kind: 'size', from: at, start: [...pe.plan.rooms[pe.sel.r].rects[pe.sel.q]] };
      } else if (part) {
        pe.sel = { r: Number(part.dataset.r), q: Number(part.dataset.q) };
        pe.drag = { kind: 'move', from: at, start: [...pe.plan.rooms[pe.sel.r].rects[pe.sel.q]] };
        this._pePanel();
      } else {
        pe.sel = null;
        pe.drag = null;
        this._peDraw();
        this._pePanel();
        return;
      }
      box.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      const pe = this._pe;
      if (!pe || !pe.drag) return;
      const at = point(e);
      const dx = at.x - pe.drag.from.x;
      const dy = at.y - pe.drag.from.y;
      if (pe.drag.kind === 'drawing') {
        const bd = pe.plan.backdrops[pe.level || 'main'];
        bd.x = r2(pe.drag.start.x + dx);
        bd.y = r2(pe.drag.start.y + dy);
      } else {
        const [x1, y1, x2, y2] = pe.drag.start;
        const q = pe.drag.kind === 'move'
          ? [snap(x1 + dx), snap(y1 + dy), snap(x1 + dx) + (x2 - x1), snap(y1 + dy) + (y2 - y1)]
          : [x1, y1, Math.max(x1 + 0.5, snap(x2 + dx)), Math.max(y1 + 0.5, snap(y2 + dy))];
        pe.plan.rooms[pe.sel.r].rects[pe.sel.q] = q.map(r2);
      }
      pe.dirty = true;
      this._peDraw();
    });
    const end = () => {
      if (!this._pe || !this._pe.drag) return;
      this._pe.drag = null;
      this._pe.frame = null;
      this._peDraw();
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
  },

  // --- the panel's buttons ------------------------------------------------------------

  async _peClick(e) {
    const pe = this._pe;
    const lvl = e.target.closest('[data-level]');
    if (lvl) {
      pe.level = lvl.dataset.level;
      pe.sel = null;
      pe.frame = null;
      return this._peRender();
    }
    const b = e.target.closest('[data-pe]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') {
      if (e.target.closest('.back')) return this._peLeave();
      return;
    }
    const act = b.dataset.pe;
    const r = pe.sel && pe.plan.rooms[pe.sel.r];
    if (act === 'save') return this._peSave();
    if (act === 'cancel') return this._peLeave();
    if (act === 'part' && r) {
      const q = r.rects[pe.sel.q];
      r.rects.push([q[2], q[1], r2(q[2] + 2), r2(q[1] + 2)]);
      pe.sel = { r: pe.sel.r, q: r.rects.length - 1 };
    }
    if (act === 'unpart' && r && r.rects.length > 1) {
      r.rects.splice(pe.sel.q, 1);
      pe.sel = { r: pe.sel.r, q: 0 };
    }
    if (act === 'outdoor' && r) r.outdoor = !r.outdoor || undefined;
    if (act === 'remove' && r) {
      pe.plan.rooms.splice(pe.sel.r, 1);
      pe.sel = null;
    }
    if (act === 'addother') this._peAdd(null, 'new space');
    if (act === 'movedrawing') pe.moveDrawing = !pe.moveDrawing;
    if (act === 'nodrawing') {
      delete pe.plan.backdrops[pe.level || 'main'];
      pe.moveDrawing = false;
    }
    if (act === 'resketch') {
      return this._ask({ title: 'start again?', text: 'The plan goes back to a sketch of your rooms. Nothing is saved until you press done.', yes: 'start again', then: () => {
        const keep = pe.plan.backdrops;
        pe.plan = this._sketch();
        pe.plan.backdrops = keep;
        pe.sel = null;
        pe.frame = null;
        pe.dirty = true;
        this._peRender();
      } });
    }
    if (act === 'import') return this._peImport();
    pe.dirty = true;
    pe.frame = null;
    this._peDraw();
    this._pePanel();
  },

  _peChange(e) {
    const pe = this._pe;
    const t = e.target;
    const r = pe.sel && pe.plan.rooms[pe.sel.r];
    const act = t.dataset.pe;
    if (act === 'area' && r) {
      r.area = t.value || undefined;
      if (r.area) r.id = r.area;
    }
    if (act === 'name' && r) r.name = t.value.trim();
    if (act === 'addarea' && t.value) {
      const a = this._hass.areas[t.value];
      this._peAdd(t.value, a ? a.name : t.value);
    }
    if (act === 'bdw') {
      const w = Number(String(t.value).replace(',', '.'));
      if (w > 0) pe.plan.backdrops[pe.level || 'main'].w = w;
    }
    if (act === 'bdurl' && t.value.trim()) this._peBackdrop(t.value.trim());
    if (act === 'upload' && t.files && t.files[0]) return this._peUpload(t.files[0]);
    pe.dirty = true;
    pe.frame = null;
    this._peDraw();
    this._pePanel();
  },

  _peInput(e) {
    if (e.target.dataset.pe !== 'bdo') return;
    this._pe.plan.backdrops[this._pe.level || 'main'].opacity = Number(e.target.value);
    this._pe.dirty = true;
    const img = this._layer().querySelector('.pesvg image');
    if (img) img.setAttribute('opacity', e.target.value);
  },

  // A new room, beside what is already on this floor, about the size it should be.
  _peAdd(areaId, name) {
    const pe = this._pe;
    const here = this._peRooms().flatMap(({ r }) => r.rects);
    const b = here.length ? bbox([{ rects: here }]) : { x1: 0, y1: 0, x2: 0, y2: 0 };
    const side = r2(Math.sqrt(roomArea(0)) + 0.5);
    const room = { id: areaId || `space_${Date.now().toString(36)}`, rects: [[r2(snap(b.x2 + 1)), r2(snap(b.y1)), r2(snap(b.x2 + 1) + side), r2(snap(b.y1) + side)]] };
    if (areaId) room.area = areaId;
    else room.name = name;
    if (pe.level) room.level = pe.level;
    pe.plan.rooms.push(room);
    pe.sel = { r: pe.plan.rooms.length - 1, q: 0 };
  },

  // The drawing goes under this floor, its width a guess the user corrects.
  _peBackdrop(url) {
    const pe = this._pe;
    const key = pe.level || 'main';
    const here = this._peRooms().flatMap(({ r }) => r.rects);
    const b = here.length ? bbox([{ rects: here }]) : { x1: 0, y1: 0, w: 15 };
    const img = new Image();
    img.onload = () => {
      const bd = pe.plan.backdrops[key];
      if (bd) bd.ratio = r2(img.naturalHeight / img.naturalWidth);
      pe.frame = null;
      this._peDraw();
    };
    img.src = url;
    pe.plan.backdrops[key] = { url, x: r2(b.x1), y: r2(b.y1), w: r2(Math.max(8, b.w || 15)), opacity: 0.5, ratio: 0.7 };
    pe.moveDrawing = false;
  },

  // A picture from this device, kept by Home Assistant's own image store
  // (as area and person pictures are).
  async _peUpload(file) {
    const fd = new FormData();
    fd.append('file', file);
    this._waiting(this._layer().querySelector('.planedit'), true);
    try {
      const res = await this._hass.fetchWithAuth('/api/image/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const { id } = await res.json();
      this._peBackdrop(`/api/image/serve/${id}/original`);
      this._pe.dirty = true;
    } catch (err) {
      this._toast(`Couldn't keep the picture: ${(err && err.message) || err}`);
    }
    this._waiting(this._layer().querySelector('.planedit'), false);
    this._pe.frame = null;
    this._peDraw();
    this._pePanel();
  },

  _peImport() {
    const under = this._overlay;
    this._overlay = { kind: 'menu', under };
    const div = document.createElement('div');
    div.className = 'overlay msg';
    div.innerHTML = `<div class="box" role="dialog" aria-label="import a plan"><h3>import a plan</h3><p>Paste a plan in house.wad's format (a floorplan from its card's settings, or a Mosaic plan).</p>
      <textarea class="peimport" rows="8" placeholder='{ "rooms": [ ... ] }'></textarea>
      <div class="btns"><button class="yes">import</button><button class="no">cancel</button></div></div>`;
    this._layer().append(div);
    const finish = () => {
      div.remove();
      this._overlay = under;
    };
    div.addEventListener('click', (e) => {
      if (e.target === div || e.target.closest('.no')) return finish();
      if (!e.target.closest('.yes')) return;
      let plan;
      try {
        plan = JSON.parse(div.querySelector('textarea').value);
        if (plan.floorplan) plan = plan.floorplan;
      } catch (err) {
        return this._toast("That isn't a plan Mosaic can read.");
      }
      if (!validPlan(plan)) return this._toast('That plan has no rooms in it.');
      plan.backdrops = plan.backdrops || this._pe.plan.backdrops || {};
      this._pe.plan = plan;
      this._pe.sel = null;
      this._pe.frame = null;
      this._pe.dirty = true;
      finish();
      this._peRender();
    });
    div.querySelector('textarea').focus();
  },

  _peLeave() {
    const go = () => {
      this._pe = null;
      this._close();
    };
    if (this._pe && this._pe.dirty) return this._ask({ title: 'leave without saving?', text: 'Your changes to the plan will be lost.', yes: 'leave', then: go });
    go();
  },

  async _peSave() {
    const plan = JSON.parse(JSON.stringify(this._pe.plan));
    delete plan.sketch;
    for (const r of plan.rooms) r.rects = r.rects.map((q) => norm(q).map(r2));
    for (const [k, bd] of Object.entries(plan.backdrops || {})) if (!bd || !bd.url) delete plan.backdrops[k];
    if (plan.backdrops && !Object.keys(plan.backdrops).length) delete plan.backdrops;
    // The plan is now this card's own; a plan borrowed from another dashboard is left as it was.
    if (await this._saveConfig({ floorplan: plan, floorplan_from: null }, 'Floor plan saved')) {
      this._plan = plan;
      this._planIsSketch = false;
      this._pe = null;
      this._close();
      this._fillGroups();
      this._refreshPlans(true);
    }
  },
};
