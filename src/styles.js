// Looks: Metro typography (big light lowercase, semilight body), square
// tiles in one accent colour, black or white behind them, no rounded corners.

export const FONT = '"Segoe UI", "Mosaic Selawik", system-ui, sans-serif';

export const CSS = `
:host {
  display: block;
  --gap: 5px;
  --pad: 12px;
  --bg: #000; --fg: #fff; --fg2: #9a9a9a; --chrome: #1f1f1f; --line: #333;
  /* the accent as text: lighter on black, darker on white, so it stays readable */
  --accent2: color-mix(in srgb, var(--accent) 62%, #fff);
  font-family: ${FONT};
  font-weight: 350;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
:host(.light) { --bg: #fff; --fg: #000; --fg2: #666; --chrome: #e6e6e6; --line: #ccc; --accent2: color-mix(in srgb, var(--accent) 78%, #000); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.root { position: relative; height: var(--h, 640px); }

/* --- panorama: Start and the A-Z list side by side ------------------------- */
.pan { display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
.pan::-webkit-scrollbar { display: none; }
.page { flex: 0 0 100%; height: 100%; overflow-y: auto; scroll-snap-align: start; scrollbar-width: thin; padding: var(--pad); }
.desk .pan { scroll-snap-type: none; overflow: hidden; }
.desk .page.list { flex: 0 0 320px; order: -1; border-right: 1px solid var(--line); padding: 24px 16px; }
.desk .page.start { flex: 1 1 auto; padding: 24px 32px; }
.desk .tolist { display: none; }

/* --- Start ------------------------------------------------------------------ */
.groups { position: relative; display: flex; flex-wrap: wrap; gap: 28px 44px; align-items: flex-start; }
.group { width: calc(var(--cols) * var(--unit) + (var(--cols) - 1) * var(--gap)); }
.group h2 { margin: 6px 0 10px; font-size: 15px; font-weight: 350; text-transform: lowercase; color: var(--fg); }
.group:first-child h2:empty { display: none; }
.grid { display: grid; grid-template-columns: repeat(var(--cols), var(--unit)); grid-auto-rows: var(--unit); gap: var(--gap); grid-auto-flow: row dense; }
.tile { position: relative; overflow: hidden; background: var(--accent); color: #fff; cursor: pointer; perspective: 800px;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; transition: transform 90ms ease-out, background-color 300ms; outline-offset: 2px; touch-action: manipulation; }
.tile.off { background: color-mix(in srgb, var(--accent) 34%, var(--bg)); }
:host(.light) .tile.off { background: color-mix(in srgb, var(--accent) 50%, #9a9a9a); }
/* !important beats the light theme's off tiles, but not the inline background-position each tile gets */
.wall .tile { background-color: #000 !important; background-image: var(--wall) !important; background-repeat: no-repeat !important; background-size: var(--wall-size, cover) !important; }
.wall .tile::before { content: ''; position: absolute; inset: 0; background: color-mix(in srgb, var(--accent) 42%, transparent); transition: background-color 300ms; }
.wall .tile.off::before { background: rgba(0, 0, 0, .55); }
.tile.missing { background: var(--chrome); color: var(--fg2); }
.tile.pressed { transform: scale(0.96); }
.tile.small { grid-column: span 1; grid-row: span 1; }
.tile.medium { grid-column: span 2; grid-row: span 2; }
.tile.wide { grid-column: span 4; grid-row: span 2; }
.tile.large { grid-column: span 4; grid-row: span 4; }
.faces { position: absolute; inset: 0; transform-origin: 50% 50%; backface-visibility: hidden; }
.face { position: absolute; inset: 0; display: flex; }
.label { position: absolute; left: 8px; bottom: 6px; right: 34px; font-size: 12.5px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.badge { position: absolute; right: 8px; bottom: 5px; font-size: 13px; font-weight: 400; pointer-events: none; }
.over .label, .over .badge { text-shadow: 0 0 6px rgba(0,0,0,.8); }
.f-icon { align-items: center; justify-content: center; padding-bottom: 6%; }
.f-icon ha-icon, .f-icon ha-state-icon { --mdc-icon-size: calc(var(--unit) * 0.72); color: #fff; }
.small .f-icon ha-icon, .small .f-icon ha-state-icon { --mdc-icon-size: calc(var(--unit) * 0.56); }
.large .f-icon ha-icon, .large .f-icon ha-state-icon { --mdc-icon-size: calc(var(--unit) * 1.3); }
.f-big { flex-direction: column; padding: 6px 8px; }
.f-big .big { font-weight: 300; font-size: calc(var(--unit) * 0.78); line-height: 1.05; letter-spacing: -0.02em; white-space: nowrap; }
.small .f-big .big { font-size: calc(var(--unit) * 0.42); }
.f-big .sub { font-size: 13px; opacity: 0.85; text-transform: lowercase; }
.f-big .bicon { position: absolute; right: 8px; top: 8px; --mdc-icon-size: 28px; opacity: .9; }
.small .f-big .sub, .small .f-big .bicon, .medium .f-big .bicon { display: none; }
.f-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.f-img .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 8px 24px; font-size: 14px; font-weight: 400;
  background: linear-gradient(transparent, rgba(0,0,0,.65)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f-text { flex-direction: column; padding: 8px 8px 26px; overflow: hidden; }
.f-text .t1 { font-size: 13px; opacity: 0.85; text-transform: lowercase; }
.f-text .t2 { font-size: 17px; font-weight: 350; line-height: 1.2; white-space: pre-line; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.f-text .t3 { font-size: 13px; opacity: 0.85; margin-top: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f-date { flex-direction: column; padding: 4px 8px; }
.f-date .day { font-weight: 300; font-size: calc(var(--unit) * 1.05); line-height: 1; letter-spacing: -0.03em; }
.f-date .wd { font-size: 15px; }
.tile.wide .f-date { flex-direction: row; align-items: flex-end; gap: 12px; padding-bottom: 26px; }
.f-ring { align-items: center; justify-content: center; padding-bottom: 10%; }
.ring { width: calc(var(--unit) * 0.95); height: calc(var(--unit) * 0.95); }
.ring circle { fill: none; stroke: #fff; }
.ring .outer { stroke-width: 7; }
.ring .inner { stroke-width: 2.5; opacity: .9; }
.thinking .ring .inner, .ring.thinking .inner { animation: breathe 1.1s ease-in-out infinite alternate; transform-origin: 50% 50%; }
@keyframes breathe { from { transform: scale(0.82); opacity: .5; } to { transform: scale(1.05); opacity: 1; } }
.tolist { display: flex; align-items: center; gap: 10px; margin: 28px 0 8px auto; font-size: 15px; color: var(--fg); }
.tolist .arrow, .back { width: 36px; height: 36px; border: 2px solid currentColor; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; }

/* --- the A-Z list ------------------------------------------------------------ */
.listmodes { display: flex; gap: 18px; margin: 0 0 10px; }
.listmodes button { font-size: 24px; font-weight: 300; text-transform: lowercase; color: var(--fg2); }
.listmodes button.on { color: var(--fg); }
.apptitle small { display: block; font-size: 12px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--fg2); }
.search { width: 100%; font: inherit; font-size: 16px; padding: 8px 10px; border: 2px solid var(--line); background: var(--bg); color: var(--fg); outline: none; margin: 2px 0 14px; }
.search:focus { border-color: var(--accent); }
.letter { display: flex; align-items: flex-end; width: 44px; height: 44px; padding: 0 0 4px 6px; margin: 14px 0 8px; border: 2px solid var(--accent); color: var(--fg); font-size: 22px; font-weight: 350; line-height: 1; }
.row { display: flex; align-items: center; gap: 12px; padding: 6px 0; cursor: pointer; -webkit-tap-highlight-color: transparent; min-height: 52px; }
.row:active { opacity: .7; }
.ricon { flex: 0 0 44px; height: 44px; background: var(--accent); display: flex; align-items: center; justify-content: center; color: #fff; }
.ricon.off { background: color-mix(in srgb, var(--accent) 34%, var(--bg)); }
.ricon ha-state-icon { --mdc-icon-size: 26px; }
.rname { flex: 1 1 auto; min-width: 0; font-size: 18px; line-height: 1.2; }
.rname small { display: block; font-size: 13px; color: var(--accent2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rname span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.askrow .ricon { background: none; }
.askrow .ring circle { stroke: var(--accent); }
.empty { color: var(--fg2); font-size: 15px; padding: 12px 0; }

/* --- overlays: a room, the assistant, the jump list, a question -------------- */
.overlay { position: fixed; inset: 0; z-index: 8; background: var(--bg); display: flex; flex-direction: column; animation: enter 260ms cubic-bezier(.1,.9,.2,1); }
@keyframes enter { from { transform: translateY(40px) rotateX(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
.apptitle { display: flex; align-items: center; gap: 14px; padding: 14px var(--pad) 0; font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.pivots { display: flex; gap: 22px; padding: 6px var(--pad) 8px; overflow-x: auto; scrollbar-width: none; white-space: nowrap; }
.pivots::-webkit-scrollbar { display: none; }
.pivots button { font-size: 34px; font-weight: 300; text-transform: lowercase; color: var(--fg2); transition: color 200ms; }
.pivots button.on { color: var(--fg); }
.ppages { flex: 1 1 auto; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.ppages::-webkit-scrollbar { display: none; }
.ppage { flex: 0 0 100%; overflow-y: auto; scroll-snap-align: start; padding: 4px var(--pad) 40px; }
.wideapp .ppage { flex-basis: min(100%, 520px); }
.rimg { width: 100%; max-width: 520px; display: block; margin-bottom: 4px; }
.toggle { flex: 0 0 auto; width: 50px; height: 24px; border: 2px solid var(--fg); border-radius: 12px; position: relative; }
.toggle::after { content: ''; position: absolute; top: 3px; left: 4px; width: 14px; height: 14px; border-radius: 50%; background: var(--fg); transition: left 150ms; }
.toggle.on { background: var(--accent); border-color: var(--accent); }
.toggle.on::after { left: 28px; background: #fff; }
.play { flex: 0 0 auto; width: 40px; height: 40px; border: 2px solid var(--fg); border-radius: 50%; font-size: 14px; }

.assist .talk { flex: 1 1 auto; overflow-y: auto; padding: 8px var(--pad) 12px; display: flex; flex-direction: column; gap: 14px; }
.assist .hero { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; padding: 18px var(--pad) 6px; }
.assist .hero .ring { width: 84px; height: 84px; }
.assist .hero .ring circle { stroke: var(--accent); }
.assist .hero .hello { font-size: 26px; font-weight: 300; }
.turn { max-width: 640px; font-size: 18px; line-height: 1.35; white-space: pre-wrap; }
.turn.me { color: var(--fg2); align-self: flex-end; text-align: right; }
.turn.err { color: #e51400; }
.askbar { display: flex; gap: 8px; padding: 10px var(--pad) calc(10px + env(safe-area-inset-bottom)); background: var(--chrome); }
.askbar input { flex: 1 1 auto; font: inherit; font-size: 17px; padding: 8px 10px; background: var(--bg); color: var(--fg); border: 2px solid var(--line); outline: none; min-width: 0; }
.askbar input:focus { border-color: var(--accent); }
.askbar button { width: 46px; background: var(--accent); color: #fff; font-size: 20px; }
.askbar .mic { background: none; color: var(--fg); border: 2px solid var(--line); display: flex; align-items: center; justify-content: center; }
.askbar .mic.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.ring.listening .outer { animation: listen 0.9s ease-in-out infinite alternate; transform-origin: 50% 50%; }
@keyframes listen { from { stroke-width: 5; } to { stroke-width: 11; } }

.jump { background: rgba(0,0,0,.88); justify-content: center; align-items: center; }
:host(.light) .jump { background: rgba(255,255,255,.92); }
.jump .letters { display: grid; grid-template-columns: repeat(4, 72px); gap: 8px; }
.jump button { height: 72px; background: var(--accent); color: #fff; font-size: 30px; font-weight: 350; text-align: left; padding: 0 0 6px 8px; display: flex; align-items: flex-end; }
.jump button:disabled { background: var(--chrome); color: var(--fg2); cursor: default; }

.msg { background: rgba(0,0,0,.6); justify-content: flex-start; animation: none; }
.msg .box { background: var(--chrome); padding: 22px var(--pad) 18px; animation: drop 220ms cubic-bezier(.1,.9,.2,1); }
@keyframes drop { from { transform: translateY(-40px); opacity: 0; } to { transform: none; opacity: 1; } }
.msg h3 { margin: 0 0 8px; font-size: 22px; font-weight: 400; }
.msg p { margin: 0 0 18px; font-size: 15px; color: var(--fg2); }
.msg .btns { display: flex; gap: 10px; }
.msg .btns button { flex: 1 1 0; border: 2px solid var(--fg); padding: 8px; font-size: 16px; }
.msg .btns .yes { background: var(--accent); border-color: var(--accent); color: #fff; }

/* --- customising Start ---------------------------------------------------- */
.editbar { display: none; position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; gap: 10px; background: var(--chrome); padding: 10px var(--pad) calc(10px + env(safe-area-inset-bottom)); }
.editing .editbar { display: flex; }
.editbar button { flex: 1 1 0; border: 2px solid var(--fg); padding: 8px; font-size: 16px; }
.editbar [data-done="save"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.editing .page.start { padding-bottom: 90px; }
.editing .tolist { display: none; }
.editing .tile { transform: scale(0.9); opacity: 0.7; transition: transform 150ms, opacity 150ms; }
.editing .tile.sel { transform: none; opacity: 1; z-index: 2; overflow: visible; touch-action: none; }
.ebtn { display: none; position: absolute; z-index: 3; width: 30px; height: 30px; border-radius: 50%; background: var(--fg); color: var(--bg); font-size: 15px; align-items: center; justify-content: center; }
.editing .tile.sel .ebtn { display: flex; }
.ebtn.unpin { top: -11px; right: -11px; }
.ebtn.resize { bottom: -11px; right: -11px; }
/* Notices rise from the bottom edge, where they cover no menu or title. */
.editing .group h2 { margin: 6px 0 10px; }
.editing .groups { user-select: none; -webkit-user-select: none; }
.editing .gname { user-select: text; -webkit-user-select: text; }
.gname { font: inherit; font-size: 15px; color: var(--fg); background: transparent; border: 0; border-bottom: 2px solid var(--line); padding: 2px 0; width: 100%; outline: none; text-transform: lowercase; }
.gname:focus { border-color: var(--accent); }
.editing .grid.empty { min-height: var(--unit); outline: 2px dashed var(--line); outline-offset: 2px; }
.editing .grid.empty::after { content: 'drag tiles here'; grid-column: 1 / -1; align-self: center; color: var(--fg2); font-size: 14px; padding-left: 8px; }
.addgroup { display: block; margin: 8px 0 0; border: 2px dashed var(--line); color: var(--fg2); padding: 10px 16px; font-size: 15px; }
.toast { position: absolute; bottom: 0; left: 0; right: 0; z-index: 9; background: var(--accent); color: #fff; padding: 12px var(--pad) calc(12px + env(safe-area-inset-bottom)); font-size: 15px; transform: translateY(110%); transition: transform 250ms cubic-bezier(.1,.9,.2,1); pointer-events: none; }
.toast.on { transform: none; }
.msg .menu h3 { margin-bottom: 12px; }
.msg .menu button { display: block; width: 100%; text-align: left; font-size: 20px; font-weight: 350; padding: 10px 0; }

@media (prefers-reduced-motion: reduce) { .overlay, .msg .box { animation: none; } .tile { transition: none; } }
`;
