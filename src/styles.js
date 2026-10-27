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
.page { position: relative; flex: 0 0 100%; height: 100%; overflow-y: auto; scroll-snap-align: start; scrollbar-width: thin; padding: var(--pad); }
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
/* Soft: a little light falls across each tile, so a wall of colour isn't a slab. */
:host(:not(.flat)) .tile:not(.over) { background-image: linear-gradient(160deg, rgba(255,255,255,.13), rgba(255,255,255,0) 48%, rgba(0,0,0,.14)); }
/* The weather tile's sky. */
.tile[data-mood="sun"] { background-image: radial-gradient(circle at 82% 18%, rgba(255,214,102,.75), rgba(255,170,60,.25) 32%, transparent 60%) !important; }
.tile[data-mood="partly"] { background-image: radial-gradient(circle at 80% 20%, rgba(255,214,102,.45), transparent 40%), radial-gradient(ellipse at 30% 75%, rgba(255,255,255,.22), transparent 55%) !important; }
.tile[data-mood="cloud"] { background-image: radial-gradient(ellipse at 70% 30%, rgba(255,255,255,.28), transparent 55%), linear-gradient(180deg, rgba(120,130,150,.35), rgba(0,0,0,.15)) !important; }
.tile[data-mood="rain"] { background-image: repeating-linear-gradient(105deg, rgba(255,255,255,.08) 0 2px, transparent 2px 14px), linear-gradient(180deg, rgba(40,50,70,.45), rgba(0,0,0,.25)) !important; }
.tile[data-mood="storm"] { background-image: linear-gradient(180deg, rgba(20,20,40,.6), rgba(0,0,0,.35)), radial-gradient(circle at 60% 20%, rgba(255,240,180,.4), transparent 30%) !important; }
.tile[data-mood="snow"] { background-image: radial-gradient(circle, rgba(255,255,255,.35) 1px, transparent 1.5px), linear-gradient(180deg, rgba(255,255,255,.18), rgba(0,0,0,.1)) !important; background-size: 14px 14px, auto !important; }
.tile[data-mood="fog"] { background-image: linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,.08)) !important; }
.tile[data-mood="night"] { background-image: radial-gradient(circle at 80% 22%, rgba(255,255,230,.5) 0 6%, transparent 7%), linear-gradient(180deg, rgba(5,10,40,.55), rgba(0,0,0,.25)) !important; }
.ghead[data-room] { cursor: pointer; }
.ghead[data-room]::after { content: ' ›'; }
.brand { width: 44px; height: 44px; flex: 0 0 44px; object-fit: contain; padding: 6px; background: var(--chrome); }
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
/* On a wide page the switch stays near its name: rows are no wider than a
   phone's, with a faint band to carry the eye across. */
.ppage .row, .plist .row { max-width: 560px; }
.ppage .row:nth-of-type(even), .ipage .row:nth-of-type(even) { background: color-mix(in srgb, var(--fg) 4%, transparent); }
.ppage .row, .ipage .row { padding-left: 6px; padding-right: 6px; }
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
.apptitle { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; padding: 14px var(--pad) 0; font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.pivots { flex: 0 0 auto; display: flex; gap: 22px; padding: 6px var(--pad) 8px; overflow-x: auto; scrollbar-width: none; white-space: nowrap; }
.pivots::-webkit-scrollbar { display: none; }
.pivots button { font-size: 34px; font-weight: 300; text-transform: lowercase; color: var(--fg2); transition: color 200ms; }
.pivots button.on { color: var(--fg); }
.ppages { flex: 1 1 auto; min-height: 0; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.ppages::-webkit-scrollbar { display: none; }
.ppage { position: relative; flex: 0 0 100%; overflow-y: auto; scroll-snap-align: start; padding: 4px var(--pad) 40px; }
.wideapp .ppage, .wideapp .ipage { padding-right: max(var(--pad), calc(100% - 760px)); }
/* A desktop app shows one pivot at a time (so the headers switch) and puts
   art in the space beside it. */
.app > .art { display: none; }
.wideapp > .art { display: flex; position: absolute; right: 3vw; top: 120px; bottom: 30px; width: calc(100% - 820px); min-width: 0; align-items: center; justify-content: center; pointer-events: none; }
.wideapp > .art .liveplan { pointer-events: auto; max-height: 100%; }
.art .bigicon { --mdc-icon-size: min(42vh, 30vw); color: var(--fg); opacity: .07; }
@media (max-width: 1150px) { .wideapp > .art { display: none; } .wideapp .ppage, .wideapp .ipage { padding-right: var(--pad); } }
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

/* --- the floor plan -------------------------------------------------------- */
.liveplan { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: flex-start; }
.liveplan .storey { margin: 0; flex-basis: 0; min-width: 140px; }
.liveplan figcaption { font-size: 13px; color: var(--fg2); text-transform: lowercase; margin-bottom: 4px; }
.art .liveplan { flex-direction: column; flex-wrap: nowrap; width: 100%; height: 100%; overflow: hidden; }
.art .liveplan .storey { max-width: none; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.art .liveplan svg { flex: 1 1 auto; min-height: 0; height: 100%; }
.plan { width: 100%; height: auto; display: block; overflow: visible; }
.planart { width: auto !important; flex: 1 1 340px; max-width: 620px; }
.plan .wall { fill: none; stroke: var(--fg2); stroke-width: .14; opacity: .55; }
.plan .wall.out { stroke-dasharray: .35 .25; opacity: .35; }
.plan .room rect { fill: color-mix(in srgb, var(--fg) 5%, transparent); transition: fill 300ms; }
.plan .room.out rect { fill: transparent; }
.plan .room.known { cursor: pointer; }
.plan .room.known rect { fill: color-mix(in srgb, var(--accent) 16%, var(--bg)); }
.plan .room.lit rect { fill: var(--accent); }
.plan .room.playing:not(.lit) rect { fill: color-mix(in srgb, var(--accent) 45%, var(--bg)); }
.plan .room.dim { opacity: .55; }
.plan .room.here rect { fill: var(--accent); }
.plan .room.here.dim, .plan .room.here { opacity: 1; }
.plan .room.known:hover rect, .plan .room.known:focus rect { fill: color-mix(in srgb, var(--accent) 70%, var(--fg)); }
.plan text.on { fill: #fff; stroke: rgba(0,0,0,.25); }
.rooms .ppage > .liveplan { max-width: 640px; margin-bottom: 8px; }
.rooms .ppage > .liveplan svg { max-height: 46vh; }
.plan text { fill: var(--fg); text-anchor: middle; dominant-baseline: central; font-weight: 400; pointer-events: none; paint-order: stroke; stroke: var(--bg); stroke-width: .05; }

/* Temperature and humidity: each room in its own colour, the reading on it. */
.plan .room.measured rect { fill: var(--fill); }
.plan text.value { font-weight: 300; }
.planmodes { display: flex; gap: 14px; margin: -4px 0 8px; }
.planmodes button { font-size: 14px; color: var(--fg2); text-transform: lowercase; }
.planmodes button.on { color: var(--fg); border-bottom: 2px solid var(--accent); }
/* The house stacked: each floor turned and flattened, the top one highest.
   Hovering a floor lifts it and fades the others. */
.plan.stacked .lift { transition: transform 300ms cubic-bezier(.1,.9,.2,1), opacity 300ms; }
.plan.stacked:hover .lift { opacity: .35; }
.plan.stacked .lift:hover { opacity: 1; transform: translate(0, -0.5px); }
.plan .floorname { fill: var(--fg2); font-size: .55px; text-anchor: end; dominant-baseline: central; text-transform: lowercase; }
.plan .slab { fill: color-mix(in srgb, var(--fg) 10%, var(--bg)); stroke: var(--fg2); stroke-width: .1; opacity: .9; }

/* --- the people view -------------------------------------------------------- */
.plan .room.occupied rect { fill: color-mix(in srgb, var(--accent) 55%, var(--bg)); }
.plan .who circle { fill: #fff; stroke: var(--accent); stroke-width: .1; }
.plan .who.thing rect { fill: var(--accent2); stroke: #fff; stroke-width: .06; }
.plan .who text.init { fill: var(--accent); font-weight: 600; text-anchor: middle; dominant-baseline: central; stroke: none; }
.plan .who text.whoname { fill: #fff; text-anchor: middle; dominant-baseline: hanging; paint-order: stroke; stroke: rgba(0,0,0,.6); stroke-width: .06; }
.plan .who.found circle { animation: found 1s ease-in-out infinite alternate; }
@keyframes found { from { stroke-width: .1; } to { stroke-width: .35; } }
.wholist { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 6px; }
.whochip { border: 1px solid var(--line); padding: 4px 9px; font-size: 13px; color: var(--fg2); }
.whochip b { color: var(--fg); font-weight: 400; }
.whochip.thing b::before { content: '◆ '; color: var(--accent2); }
.whochip.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); }
.whochip.quiet { opacity: .7; }

/* --- the plan editor --------------------------------------------------------- */
.planart h2 small { color: var(--fg2); font-size: 13px; }
.planedit-link { font-size: 13px; margin: -6px 0 6px; }
.pe { flex: 1 1 auto; min-height: 0; display: flex; gap: 16px; padding: 4px var(--pad) 0; }
.pecanvas { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; }
.pepanel { flex: 0 0 300px; overflow-y: auto; padding-bottom: 20px; }
.planedit .apptitle small { display: block; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--fg2); }
@media (max-width: 760px) { .pe { flex-direction: column; } .pecanvas { flex: 0 0 52vh; } .pepanel { flex: 1 1 auto; } }
.pesvg { width: 100%; height: 100%; touch-action: none; user-select: none; background: color-mix(in srgb, var(--fg) 3%, var(--bg)); }
.pesvg .grid line { stroke: var(--line); stroke-width: .02; }
.pesvg .pr rect { fill: color-mix(in srgb, var(--accent) 35%, var(--bg)); stroke: var(--fg2); stroke-width: .06; cursor: move; fill-opacity: .85; }
.pesvg .pr.out rect { fill: transparent; stroke-dasharray: .3 .2; }
.pesvg .pr.sel rect { fill: var(--accent); }
.pesvg .pr rect.part { stroke: var(--fg); stroke-width: .12; }
.pesvg .pr text { fill: var(--fg); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.pesvg .pr.sel text { fill: #fff; }
.pesvg .ph { fill: #fff; stroke: var(--accent); stroke-width: .1; cursor: nwse-resize; }
.pesvg.movedrawing { cursor: grab; }
.pesvg.movedrawing .pr { pointer-events: none; opacity: .6; }
.pebar { display: flex; gap: 10px; padding: 10px var(--pad) calc(10px + env(safe-area-inset-bottom)); background: var(--chrome); }
.pebar button { flex: 1 1 0; border: 2px solid var(--fg); padding: 8px; font-size: 16px; }
.pebar .yes { background: var(--accent); border-color: var(--accent); color: #fff; }
.fileb { display: inline-block; margin: 4px 0 10px; cursor: pointer; }
.peimport { width: 100%; font: 13px monospace; background: var(--bg); color: var(--fg); border: 2px solid var(--line); padding: 8px; margin-bottom: 12px; }

/* --- Windows Phone's progress dots: five dots that hurry in, dawdle, hurry out */
.dots { position: absolute; left: 0; right: 0; top: 0; height: 6px; overflow: hidden; pointer-events: none; z-index: 5; }
.dots i { position: absolute; top: 1px; left: -8px; width: 4px; height: 4px; border-radius: 50%; background: var(--accent2); animation: dot 2.8s infinite; opacity: 0; }
.dots i:nth-child(2) { animation-delay: .16s; } .dots i:nth-child(3) { animation-delay: .32s; } .dots i:nth-child(4) { animation-delay: .48s; } .dots i:nth-child(5) { animation-delay: .64s; }
@keyframes dot { 0% { left: 0; opacity: 0; animation-timing-function: cubic-bezier(.1,.7,.4,1); } 8% { opacity: 1; } 35% { left: 42%; animation-timing-function: linear; } 65% { left: 58%; animation-timing-function: cubic-bezier(.6,0,.9,.3); } 92% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
.waiting { color: var(--fg2); font-size: 15px; padding: 18px 0 6px; }
/* Long lists: the browser skips laying out rows far off screen. */
.listbody .row, .listbody .letter, .plist .row { content-visibility: auto; contain-intrinsic-size: auto 56px; }

/* --- the back of a tile ----------------------------------------------------- */
.tile.flipped .faces, .tile.flipped > .label, .tile.flipped > .badge { visibility: hidden; }
.tback { display: none; position: absolute; inset: 0; flex-direction: column; padding: 6px 7px 7px; background: color-mix(in srgb, var(--accent) 82%, #000); color: #fff; text-align: left; }
.wall .tback { background: color-mix(in srgb, var(--accent) 70%, rgba(0,0,0,.7)); }
.tile.flipped .tback { display: flex; }
.bhead { display: flex; align-items: baseline; gap: 6px; font-size: 13px; font-weight: 400; }
.btitle { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bopen { opacity: .8; font-size: 14px; }
.bsub { font-size: 12px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bbody { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 6px; min-height: 0; }
.chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--unit) * 0.82), 1fr)); grid-auto-rows: 1fr; gap: 4px; flex: 1 1 auto; margin-top: 4px; min-height: 0; }
.chip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 2px; border: 1px solid rgba(255,255,255,.45); color: #fff; min-height: 0; overflow: hidden; }
.chip.on { background: rgba(255,255,255,.92); color: var(--accent); border-color: transparent; }
.chip ha-state-icon, .chip ha-icon { --mdc-icon-size: calc(var(--unit) * 0.34); }
.chip span { font-size: 10px; line-height: 1.1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tback .toggle { border-color: #fff; align-self: flex-start; width: 58px; height: 28px; border-radius: 14px; }
.tback .toggle::after { background: #fff; top: 4px; left: 5px; width: 16px; height: 16px; }
.tback .toggle.on { background: #fff; border-color: #fff; }
.tback .toggle.on::after { left: 33px; background: var(--accent); }
.bstep { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.bstep button, .bbtns button { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.6); color: #fff; font-size: 20px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.bbtns { display: flex; gap: 6px; }
.bbtns button.on { background: #fff; color: var(--accent); }
.bbtns ha-icon { --mdc-icon-size: 20px; }

/* --- settings ----------------------------------------------------------------- */
.ghead { margin: 18px 0 6px; font-size: 14px; font-weight: 400; color: var(--accent2); text-transform: lowercase; }
.ghead small { float: right; color: var(--fg2); font-size: 12px; }
.ppage .ghead:first-child { margin-top: 4px; }
.ptools { display: flex; gap: 8px; align-items: center; }
.ptools .search { margin: 2px 0 10px; }
.pbtn { flex: 0 0 auto; white-space: nowrap; border: 2px solid var(--fg); padding: 7px 12px; font-size: 15px; margin-bottom: 8px; }
.mini { flex: 0 0 auto; border: 2px solid var(--line); padding: 4px 10px; font-size: 14px; margin-left: 6px; }
.mini.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.letter-icon { font-size: 22px; font-weight: 300; text-transform: lowercase; }
.ricon.bad { background: #e51400; }
.calm { padding: 30px 0; color: var(--fg2); font-size: 15px; }
.calm .big { font-size: 40px; font-weight: 300; color: var(--fg); margin-bottom: 8px; }
.field { display: block; margin: 10px 0 14px; }
.field > span { display: block; font-size: 13px; color: var(--fg2); margin-bottom: 4px; }
.field input, .field select { width: 100%; font: inherit; font-size: 17px; padding: 8px 10px; background: var(--bg); color: var(--fg); border: 2px solid var(--line); outline: none; border-radius: 0; }
.field input:focus, .field select:focus { border-color: var(--accent); }
.finfo { color: var(--fg2); font-size: 14px; margin: 4px 0 8px; }
.links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 6px 0 10px; }
.link { color: var(--accent2); font-size: 15px; text-decoration: none; padding: 4px 0; }
.link.danger { color: #e51400; }
.toggle.small { width: 40px; height: 20px; margin-left: 8px; }
.toggle.small::after { width: 10px; height: 10px; }
.toggle.small.on::after { left: 22px; }
.row.dim .rname { opacity: 0.5; }
.helpergrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin-bottom: 12px; }
.helpergrid button { display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; aspect-ratio: 1; background: var(--accent); color: #fff; padding: 8px; font-size: 14px; text-align: left; }
.helpergrid ha-icon { --mdc-icon-size: 30px; }
.msg .more { font-size: 15px; color: var(--accent2); padding: 6px 0; }
.fbody { padding: 6px var(--pad) 40px; overflow-y: auto; flex: 1 1 auto; max-width: 640px; }
.ftitle { font-size: 30px; font-weight: 300; margin: 6px 0 10px; text-transform: lowercase; }
.fdesc { color: var(--fg2); font-size: 15px; white-space: pre-line; }
.ferr { color: #e51400; font-size: 15px; }
.fbody .btns { display: flex; gap: 10px; margin-top: 18px; }
.fbody .btns button { flex: 1 1 0; border: 2px solid var(--fg); padding: 8px; font-size: 16px; }
.fbody .btns .yes { background: var(--accent); border-color: var(--accent); color: #fff; }
.menuopt { display: block; width: 100%; text-align: left; font-size: 20px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.pick .ptools, .pick .plist, .integration .ipage { padding: 4px var(--pad) 40px; }
.pick .plist, .integration .ipage { overflow-y: auto; flex: 1 1 auto; }
.pick .ptools { padding-bottom: 0; }

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
.toast:not(.on) { visibility: hidden; transition: transform 250ms cubic-bezier(.1,.9,.2,1), visibility 0s 250ms; }
.toast.on { transform: none; }
.msg .menu h3 { margin-bottom: 12px; }
.msg .menu button { display: block; width: 100%; text-align: left; font-size: 20px; font-weight: 350; padding: 10px 0; }

@media (prefers-reduced-motion: reduce) { .overlay, .msg .box { animation: none; } .tile { transition: none; } }
`;
