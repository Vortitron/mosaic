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
      img.onload = () => resolve(img);
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
    if (!(box instanceof SVGElement) && shapes.has(id)) box.style.aspectRatio = String(shapes.get(id));
    // A box just drawn starts with the last picture, at once (it is cached).
    if (!box.dataset.url && shown.has(id)) swap(box, shown.get(id), false);
    const url = camUrl(hass, id, now);
    if (!url || box.dataset.url === url || box.dataset.want === url) continue;
    box.dataset.want = url;
    load(url).then((img) => {
      if (box.dataset.want !== url) return;
      delete box.dataset.want;
      shown.set(id, url);
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
