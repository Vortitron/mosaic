// The card's settings in Home Assistant's dashboard editor: the accent from a
// grid of swatches, as on the phone's own accent settings, and the rest
// through Home Assistant's own form, so it looks like every other card.
// Tiles are arranged on the dashboard itself (hold a tile), not here.

import { ACCENTS, accentColour } from './model.js';
import { toForm, fromForm } from './config.js';

const SCHEMA = [
  {
    name: 'theme',
    selector: { select: { mode: 'dropdown', options: [{ value: 'auto', label: 'Follow Home Assistant' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] } },
  },
  {
    name: 'list',
    selector: { select: { mode: 'dropdown', options: [{ value: 'devices', label: 'Devices' }, { value: 'entities', label: 'Entities' }] } },
  },
  {
    name: 'columns',
    selector: { select: { mode: 'dropdown', options: [{ value: '6', label: '6: three medium tiles across' }, { value: '8', label: '8: four medium tiles across' }] } },
  },
  { name: 'wallpaper', selector: { text: {} } },
  { name: 'light_colours', selector: { boolean: {} } },
  { name: 'editable', selector: { boolean: {} } },
  { name: 'show_assistant', selector: { boolean: {} } },
  { name: 'agent_id', selector: { conversation_agent: {} } },
  { name: 'assistant_name', selector: { text: {} } },
];

const LABELS = {
  theme: 'Theme',
  list: 'The A–Z list starts on',
  columns: 'Small-tile columns on a phone',
  wallpaper: 'Wallpaper seen through the tiles (/local/… or an image or camera entity)',
  light_colours: 'A lit lamp’s tile takes the lamp’s colour',
  editable: 'Admins hold a tile to customise Start',
  show_assistant: 'Show the assistant',
  agent_id: 'Assistant (empty: your preferred Assist pipeline)',
  assistant_name: 'Assistant’s name (empty: worked out from the agent)',
};

export class MosaicStartEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `<style>
        .hint { margin: 0 0 12px; color: var(--secondary-text-color); font-size: 14px; }
        .label { font-size: 14px; margin: 4px 0 8px; }
        .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 6px; margin-bottom: 18px; }
        .swatches button { aspect-ratio: 1; border: 0; cursor: pointer; outline-offset: 2px; }
        .swatches button.on { outline: 3px solid var(--primary-text-color); }
      </style>
      <p class="hint">Arrange the tiles on the dashboard itself: hold a tile to move, resize or unpin it, and hold anything in the A–Z list to pin it.</p>
      <div class="label">Accent colour</div>
      <div class="swatches" role="radiogroup" aria-label="accent colour">${Object.entries(ACCENTS)
        .map(([name, hex]) => `<button type="button" role="radio" data-accent="${name}" title="${name}" aria-label="${name}" style="background:${hex}"></button>`)
        .join('')}</div>
      <ha-form></ha-form>`;
      this.shadowRoot.querySelector('.swatches').addEventListener('click', (e) => {
        const b = e.target.closest('[data-accent]');
        if (b) this._changed({ ...this._config, accent: b.dataset.accent });
      });
      this._form = this.shadowRoot.querySelector('ha-form');
      this._form.schema = SCHEMA;
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.addEventListener('value-changed', (e) => this._changed(fromForm(this._config, e.detail.value)));
    }
    const current = String(this._config.accent || 'cobalt').toLowerCase();
    const hex = accentColour(current).toLowerCase();
    for (const b of this.shadowRoot.querySelectorAll('[data-accent]')) {
      const on = b.dataset.accent === current || ACCENTS[b.dataset.accent].toLowerCase() === hex;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    this._form.hass = this._hass;
    this._form.data = toForm(this._config);
  }

  _changed(config) {
    this._config = config;
    this._render();
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

