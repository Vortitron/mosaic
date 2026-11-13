// Pictures that move on: camera stills (a new one every ten seconds) and the
// artwork of whatever is playing. Wherever one is shown (a room's page, the
// house plan's cameras view) it is a box with a fixed shape, marked
// data-cam="camera.x"; refreshCams() fills it and, when there is a newer
// picture, loads that out of sight and fades it in over the old one. So a
// picture never blanks while the next loads, and nothing under it moves.

const EVERY = 10000;
const shown = new Map(); // entity -> the url last shown, to start a redrawn box with
const shapes = new Map(); // entity -> width / height of its pictures
const loading = new Map(); // url -> Promise<Image>
const stamps = new Map(); // camera -> { fp, at, same }: when its picture last changed

// A picture's fingerprint: 12 x 12 greys. Two stills of a live camera always
// differ a little (noise); a snapshot camera serves the very same file.
function fingerprint(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 12;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 12, 12);
    const d = g.getImageData(0, 0, 12, 12).data;
    const out = new Uint8Array(144);
    for (let i = 0; i < 144; i++) out[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
    return out;
  } catch (e) {
    return null; // another site's picture: no way to compare, so take it as new
  }
}

export function sameShot(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length < 0.3;
}

// "14:03:27", or "12 nov 14:03" when it is not today's.
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function stampText(stamp, now = Date.now()) {
  if (!stamp) return '';
  const d = new Date(stamp.at);
  const p = (n) => String(n).padStart(2, '0');
  const today = new Date(now).toDateString() === d.toDateString();
  const t = today ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : `${d.getDate()} ${MON[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return stamp.same ? `same since ${t}` : t;
}

// A new still of a camera: did the picture change? Its time is when it did.
export function noteShot(id, fp, at = Date.now()) {
  const had = stamps.get(id);
  if (had && sameShot(had.fp, fp)) had.same = true;
  else stamps.set(id, { fp, at, same: false });
  return stamps.get(id);
}
export const stampOf = (id) => stamps.get(id) || null;

const domainOf = (id) => id.split('.')[0];

// The picture an entity has now, or null. A camera's still goes stale, so its
// url changes every ten seconds; artwork changes with the track.
export function camUrl(hass, id, now = Date.now()) {
  const st = hass.states[id];
  if (!st || st.state === 'unavailable') return null;
  const p = st.attributes.entity_picture;
  if (!p) return null;
  if (domainOf(id) === 'camera') return `${p}${p.includes('?') ? '&' : '?'}t=${Math.floor(now / EVERY)}`;
  return p;
}

// A room's moving pictures: its cameras, then what is playing in it.
export function picturesOf(hass, ids) {
  const live = (id) => hass.states[id] && hass.states[id].state !== 'unavailable' && !!hass.states[id].attributes.entity_picture;
  const cams = ids.filter((id) => domainOf(id) === 'camera' && live(id));
  const media = ids.filter((id) => domainOf(id) === 'media_player' && live(id) && ['playing', 'paused'].includes(hass.states[id].state));
  return [...cams, ...media];
}

export const lastShown = (id) => shown.get(id) || '';
export const shapeOf = (id) => shapes.get(id) || 16 / 9;

function load(url) {
  if (!loading.has(url)) {
    loading.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        img.fp = fingerprint(img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    }).finally(() => setTimeout(() => loading.delete(url), 1000)));
  }
  return loading.get(url);
}

const SVG = 'http://www.w3.org/2000/svg';

// Put `url` on top of what the box shows, faded in, and drop what was under it.
function swap(box, url, fade) {
  const isSvg = box instanceof SVGElement;
  const old = [...box.querySelectorAll(isSvg ? 'image' : 'img')];
  let pic;
  if (isSvg) {
    const like = old[old.length - 1];
    pic = like ? like.cloneNode(false) : document.createElementNS(SVG, 'image');
    pic.setAttribute('href', url);
  } else {
    pic = document.createElement('img');
    pic.alt = '';
    pic.src = url;
  }
  pic.classList.add('campic');
  box.dataset.url = url;
  const time = !isSvg && box.querySelector('.camtime');
  if (time) time.textContent = stampText(stamps.get(box.dataset.cam));
  if (!fade || !old.length || old.every((o) => !(o.getAttribute('href') || o.getAttribute('src')))) {
    for (const o of old) o.remove();
    box.append(pic);
    return;
  }
  pic.style.opacity = '0';
  box.append(pic);
  // Next frame: fade it up, then let the old ones go.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    pic.style.opacity = '';
    setTimeout(() => { for (const o of old) o.remove(); }, 650);
  }));
}

// Fill and refresh every picture box under `root`.
export function refreshCams(root, hass, now = Date.now()) {
  if (!root || !hass) return;
  for (const box of root.querySelectorAll('[data-cam]')) {
    const id = box.dataset.cam;
    // Not on screen (a tab not showing): leave it until it is.
    if (!box.getClientRects().length) continue;
    if (!(box instanceof SVGElement)) {
      if (shapes.has(id)) box.style.aspectRatio = String(shapes.get(id));
      // When the picture is from: a camera's, in the corner, over it.
      if (id.startsWith('camera.') && !box.querySelector('.camtime')) {
        const t = document.createElement('span');
        t.className = 'camtime';
        box.append(t);
      }
    }
    // A box just drawn starts with the last picture, at once (it is cached).
    if (!box.dataset.url && shown.has(id)) swap(box, shown.get(id), false);
    const url = camUrl(hass, id, now);
    if (!url || box.dataset.url === url || box.dataset.want === url) continue;
    box.dataset.want = url;
    load(url).then((img) => {
      if (box.dataset.want !== url) return;
      delete box.dataset.want;
      shown.set(id, url);
      if (id.startsWith('camera.') && img.stampedFor !== id) {
        img.stampedFor = id;
        noteShot(id, img.fp);
      }
      if (img.naturalWidth && img.naturalHeight) {
        shapes.set(id, img.naturalWidth / img.naturalHeight);
        if (!(box instanceof SVGElement)) box.style.aspectRatio = String(shapes.get(id));
      }
      if (box.isConnected) swap(box, url, true);
    }, () => {
      if (box.dataset.want === url) delete box.dataset.want;
    });
  }
}
