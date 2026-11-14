// A stand-in for the frontend's hass object: registries, states, services
// that act like a real house, and an Assist agent that answers.
export function makeFakeHass(onUpdate, { agent = 'anthropic' } = {}) {
  const floors = { ground: { floor_id: 'ground', name: 'Downstairs', level: 0 }, up: { floor_id: 'up', name: 'Upstairs', level: 1 } };
  const areas = {};
  const area = (id, name, floor, icon) => (areas[id] = { area_id: id, name, floor_id: floor, icon: icon || null });
  area('hallway', 'Hallway', 'ground');
  area('kitchen', 'Kitchen', 'ground', 'mdi:stove');
  area('living_room', 'Living Room', 'ground');
  area('garden', 'Garden', null);
  area('bedroom', 'Bedroom', 'up');
  area('office', 'Office', 'up');
  area('comms', 'Comms Room', 'ground');
  const entities = {};
  const devices = {};
  const states = {};
  const old = new Date(Date.now() - 3600e3).toISOString();
  const add = (id, state, attributes, areaId, extra = {}) => {
    states[id] = { entity_id: id, state, attributes, last_changed: old, last_updated: old };
    entities[id] = { entity_id: id, area_id: areaId || null, device_id: null, platform: 'demo', ...extra };
  };
  // A device owns entities; they take its room unless they have their own.
  const device = (id, name, areaId, ids, more = {}) => {
    devices[id] = { id, name, name_by_user: null, area_id: areaId, manufacturer: more.manufacturer || null, model: more.model || null };
    for (const e of ids) entities[e] = { ...entities[e], device_id: id, area_id: null };
  };
  const light = (id, name, a, on, b = 255) => add(`light.${id}`, on ? 'on' : 'off', { friendly_name: name, brightness: on ? b : null }, a);
  light('hallway', 'Hallway Light', 'hallway', true);
  light('kitchen_ceiling', 'Kitchen Ceiling', 'kitchen', true, 200);
  light('kitchen_island', 'Kitchen Island', 'kitchen', false);
  light('sofa', 'Living Room Sofa Lamp', 'living_room', true, 120);
  light('floor', 'Living Room Floor Lamp', 'living_room', false);
  light('bedside', 'Bedside Lamp', 'bedroom', false);
  light('desk', 'Desk Lamp', 'office', true);
  light('string', 'Garden String Lights', 'garden', false);
  add('switch.kettle', 'off', { friendly_name: 'Kettle' }, 'kitchen');
  add('sensor.kettle_power', '0', { friendly_name: 'Kettle Power', device_class: 'power', unit_of_measurement: 'W' }, 'kitchen');
  add('sensor.kettle_energy', '12.5', { friendly_name: 'Kettle Energy', device_class: 'energy', unit_of_measurement: 'kWh' }, 'kitchen');
  add('sensor.kettle_signal', '-61', { friendly_name: 'Kettle Signal strength', unit_of_measurement: 'dBm' }, 'kitchen', { entity_category: 'diagnostic' });
  add('switch.server_rack', 'on', { friendly_name: 'Server Rack' }, 'comms');
  add('switch.monitor', 'on', { friendly_name: 'Monitor' }, 'office');
  add('sensor.kitchen_temperature', '21.4', { friendly_name: 'Kitchen Temperature', device_class: 'temperature', unit_of_measurement: '°C' }, 'kitchen');
  add('input_number.office_setpoint', '19.5', { friendly_name: 'Office Setpoint', min: 10, max: 25, step: 0.5, unit_of_measurement: '°C' }, 'office');
  add('number.desk_lamp_fade', '30', { friendly_name: 'Desk Lamp Fade', min: 0, max: 120, step: 1, unit_of_measurement: 's' }, 'office');
  add('sensor.phone_battery', '64', { friendly_name: 'Phone Battery', device_class: 'battery', unit_of_measurement: '%' }, 'living_room');
  add('sensor.kitchen_humidity', '48', { friendly_name: 'Kitchen Humidity', device_class: 'humidity', unit_of_measurement: '%' }, 'kitchen');
  add('sensor.bedroom_temperature', '18.9', { friendly_name: 'Bedroom Temperature', device_class: 'temperature', unit_of_measurement: '°C' }, 'bedroom');
  add('sensor.office_co2', '812', { friendly_name: 'Office CO2', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }, 'office');
  add('sensor.kitchen_debug', '1', { friendly_name: 'Kitchen Debug' }, 'kitchen', { entity_category: 'diagnostic' });
  add('binary_sensor.hall_motion', 'on', { friendly_name: 'Hallway Motion', device_class: 'motion' }, 'hallway');
  add('binary_sensor.bedroom_window', 'on', { friendly_name: 'Bedroom Window', device_class: 'window' }, 'bedroom');
  add('lock.front_door', 'locked', { friendly_name: 'Front Door' }, 'hallway');
  add('cover.office_blind', 'open', { friendly_name: 'Office Blind', current_position: 70 }, 'office');
  add('climate.house', 'heat', { friendly_name: 'House Heating', current_temperature: 20.5, temperature: 21, hvac_action: 'heating' }, 'hallway');
  add('media_player.living_room', 'playing', { friendly_name: 'Living Room Speaker', media_title: 'Clair de Lune', media_artist: 'Debussy', entity_picture: '/tools/harness/art.svg' }, 'living_room');
  add('media_player.bedroom', 'off', { friendly_name: 'Bedroom TV' }, 'bedroom');
  add('camera.garden', 'idle', { friendly_name: 'Garden Camera', entity_picture: '/tools/harness/cam.svg?token=x' }, 'garden');
  add('camera.driveway', 'idle', { friendly_name: 'Driveway Camera', entity_picture: '/tools/harness/cam.svg?token=z' }, null);
  add('camera.front_door', 'idle', { friendly_name: 'Front Door Camera', entity_picture: '/tools/harness/cam.svg?token=y' }, 'hallway');
  add('sensor.tv_plug_power', '4.2', { friendly_name: 'TV Plug Power', device_class: 'power', unit_of_measurement: 'W' }, 'living_room');
  add('sensor.desk_plug_power', '86', { friendly_name: 'Desk Plug Power', device_class: 'power', unit_of_measurement: 'W' }, 'office');
  add('sensor.heat_pump_power', '0.9', { friendly_name: 'Heat Pump Power', device_class: 'power', unit_of_measurement: 'kW' }, 'hallway');
  add('sensor.grid_power', '1.9', { friendly_name: 'Grid Power', device_class: 'power', unit_of_measurement: 'kW' }, 'comms');
  add('scene.movie', 'scening', { friendly_name: 'Movie Night' }, 'living_room');
  add('vacuum.robot', 'docked', { friendly_name: 'Robot Vacuum' }, null);
  add('weather.home', 'partlycloudy', { friendly_name: 'Home', temperature: 11.2, temperature_unit: '°C', humidity: 81, wind_speed: 14, wind_speed_unit: 'km/h' }, null);
  add('person.andy', 'home', { friendly_name: 'Andy', device_trackers: ['device_tracker.pixel_8'], entity_picture: '/tools/harness/andy.svg' }, null);
  // Andy's phone sends the app's Bluetooth beacon; Bermuda follows it room to
  // room and says how far it is from each listener.
  add('sensor.pixel_8_ble_transmitter', 'Transmitting', { friendly_name: 'Pixel 8 BLE Transmitter', id: '0a1b8d57-aaaa-bbbb-cccc-0123456789ab_100_40004' }, null);
  add('device_tracker.pixel_8', 'home', { friendly_name: 'Pixel 8' }, null);
  add('sensor.bermuda_0a1b8d57aaaabbbbcccc0123456789ab_100_40004_area', 'Living Room', { friendly_name: 'Pixel 8 Area' }, null, { platform: 'bermuda' });
  add('sensor.bermuda_0a1b8d57aaaabbbbcccc0123456789ab_100_40004_distance_to_kitchen_proxy', '2.5', { friendly_name: 'Pixel 8 Distance to Kitchen Proxy', unit_of_measurement: 'm' }, null, { platform: 'bermuda' });
  add('sensor.bermuda_0a1b8d57aaaabbbbcccc0123456789ab_100_40004_distance_to_hall_proxy', '4', { friendly_name: 'Pixel 8 Distance to Hall Proxy', unit_of_measurement: 'm' }, null, { platform: 'bermuda' });
  // The office's presence radar sees someone 1.5 m in front of it.
  add('binary_sensor.office_radar_occupancy', 'on', { friendly_name: 'Office Radar Occupancy', device_class: 'occupancy' }, 'office');
  add('sensor.office_radar_moving_distance', '150', { friendly_name: 'Office Radar Moving distance', unit_of_measurement: 'cm', device_class: 'distance' }, 'office');
  // A tag on the car keys.
  add('sensor.car_keys_area', 'Kitchen', { friendly_name: 'Car Keys Area' }, null, { platform: 'bermuda' });
  add('person.sam', 'not_home', { friendly_name: 'Sam' }, null);
  const soon = new Date(Date.now() + 2 * 3600e3);
  let calendarEvents = {};
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  add('calendar.family', 'off', { friendly_name: 'Family', message: 'Dentist', start_time: fmt(soon), end_time: fmt(new Date(soon.getTime() + 3600e3)), supported_features: 7 }, null);
  add('calendar.bins', 'off', { friendly_name: 'Bins', supported_features: 0 }, null);
  // A few weeks of a made-up family's events, for the calendar tab.
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const at = (days, h, m = 0) => new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + days, h, m);
  const ymd = (days) => { const x = at(days, 0); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const timed = (uid, days, h, len, summary, extra = {}) => ({ uid, summary, start: { dateTime: at(days, h).toISOString() }, end: { dateTime: new Date(at(days, h).getTime() + len * 3600e3).toISOString() }, ...extra });
  const allDay = (uid, days, n, summary) => ({ uid, summary, start: { date: ymd(days) }, end: { date: ymd(days + n) } });
  calendarEvents = {
    'calendar.family': [
      { ...timed('e1', 0, soon.getHours(), 1, 'Dentist'), start: { dateTime: soon.toISOString() }, end: { dateTime: new Date(soon.getTime() + 3600e3).toISOString() }, location: 'High Street surgery' },
      ...[1, 8, 15, 22].map((n, i) => timed(`swim${i}`, n, 17, 1, 'Swimming', { location: 'Leisure centre', recurrence_id: `r${i}` })),
      allDay('e3', 9, 3, 'Grandma visiting'),
      timed('e4', 3, 19, 2.5, 'Book club', { description: 'Bring the second half read.' }),
      timed('e5', 5, 22, 4, 'Birthday party'),
    ],
    'calendar.bins': [0, 14, 28].map((n, i) => allDay(`b${i}`, n + 4, 1, 'Bins: paper and card')),
  };
  add('automation.night', 'on', { friendly_name: 'Night mode' }, null);
  add('conversation.claude', 'unknown', { friendly_name: 'Claude conversation' }, null, { platform: agent });

  // Devices as Home Assistant has them: the plug's main entity has no name of
  // its own, so its friendly name is the device's.
  device('kettle_plug', 'Kettle', 'kitchen', ['switch.kettle', 'sensor.kettle_power', 'sensor.kettle_energy', 'sensor.kettle_signal'], { manufacturer: 'Shelly', model: 'Plug S' });
  device('kitchen_climate', 'Kitchen Climate', 'kitchen', ['sensor.kitchen_temperature', 'sensor.kitchen_humidity', 'sensor.kitchen_debug'], { manufacturer: 'Aqara' });
  device('bedroom_tv', 'Bedroom TV', 'bedroom', ['media_player.bedroom']);
  // The Energy dashboard: a grid meter (its power beside it on the device),
  // a price, Nord Pool's spot prices for the day, and the devices it tracks:
  // a lamp counted inside the TV plug, a server with no room, and a heater
  // defined in YAML (no unique ID, so no registry entry and no room to give).
  add('sensor.grid_import_energy', '18234.5', { friendly_name: 'Meter Energy import', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null);
  add('sensor.grid_export_energy', '12.1', { friendly_name: 'Meter Energy export', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null);
  device('grid_meter', 'Meter', 'comms', ['sensor.grid_import_energy', 'sensor.grid_export_energy', 'sensor.grid_power']);
  add('sensor.grid_import_energy_cost', '4210.2', { friendly_name: 'Meter Energy import cost', unit_of_measurement: 'SEK', device_class: 'monetary' }, null);
  add('sensor.electricity_price', '1.85', { friendly_name: 'Electricity price', unit_of_measurement: 'SEK/kWh' }, null);
  const spot = Array.from({ length: 24 }, (_, h) => ({ start: at(0, h).toISOString(), end: at(0, h + 1).toISOString(), value: Math.round((0.6 + 0.5 * Math.sin(((h - 5) / 24) * 2 * Math.PI) + (h >= 7 && h <= 9 ? 0.4 : 0) + (h >= 17 && h <= 19 ? 0.6 : 0)) * 1000) / 1000 }));
  const hourNow = new Date().getHours();
  add('sensor.nordpool_kwh_se3_sek', String(spot[hourNow].value), { friendly_name: 'Nord Pool SE3', unit_of_measurement: 'SEK/kWh', raw_today: spot, raw_tomorrow: [], tomorrow_valid: false }, null);
  add('sensor.server_power', '112', { friendly_name: 'Server PSU Power', device_class: 'power', unit_of_measurement: 'W' }, null);
  add('sensor.yaml_heater_power', '450', { friendly_name: 'Garage Heater Power', device_class: 'power', unit_of_measurement: 'W' }, null);
  delete entities['sensor.yaml_heater_power'];
  // The devices' energy counters (the Energy dashboard counts by these).
  for (const [id, v] of [['heat_pump_energy', 4120], ['desk_plug_energy', 210], ['tv_plug_energy', 96], ['sofa_lamp_energy', 12], ['server_energy', 880], ['garage_heater_energy', 640], ['old_lamp_energy', 31]]) add(`sensor.${id}`, String(v), { friendly_name: id.replace(/_/g, ' '), device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null);
  // For the energy check: a fridge with an energy counter nobody counts, a
  // dehumidifier that reports only power, the desk plug again through a
  // second integration, and a counted lamp whose power sensor was renamed.
  add('sensor.fridge_power', '62', { friendly_name: 'Fridge Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, null);
  add('sensor.fridge_energy', '310.2', { friendly_name: 'Fridge Energy', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null);
  device('fridge_plug', 'Fridge', 'comms', ['sensor.fridge_power', 'sensor.fridge_energy']);
  add('sensor.dehumidifier_power', '210', { friendly_name: 'Dehumidifier Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, 'bedroom');
  // The old lamp's plug was replaced: the new one is seen twice, its power
  // through a local integration (no room) and its total through the cloud
  // (in the living room, where the old one was). A reading lamp is set
  // inside the old one.
  add('sensor.lamp_plug_power', '41', { friendly_name: 'Lamp plug Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, null, { platform: 'tuya_local' });
  device('lamp_local', 'Lamp plug', null, ['sensor.lamp_plug_power']);
  add('sensor.lamp_plug_total_energy', '3.2', { friendly_name: 'Lamp plug (cloud) Total energy', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null, { platform: 'tuya' });
  device('lamp_cloud', 'Lamp plug', 'living_room', ['sensor.lamp_plug_total_energy']);
  add('sensor.reading_lamp_energy', '5.1', { friendly_name: 'Reading lamp energy', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, null);
  entities['sensor.old_lamp_energy'].area_id = 'living_room';
  // The aquarium is counted by an Integral helper whose power sensor went
  // with its old plug; its new plug, in the kitchen, reports only power.
  add('sensor.aquarium_energy', '58.4', { friendly_name: 'Aquarium energy', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total' }, 'kitchen', { platform: 'integration', config_entry_id: 'int_aquarium' });
  add('sensor.aquarium_plug_power', '18', { friendly_name: 'Aquarium plug Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, null, { platform: 'shelly' });
  device('aquarium_plug', 'Aquarium plug', 'kitchen', ['sensor.aquarium_plug_power']);
  // The office heater is unplugged: its plug unavailable, its counter there.
  add('sensor.office_heater_power', 'unavailable', { friendly_name: 'Office heater Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, 'office');
  states['sensor.office_heater_power'].last_changed = new Date(Date.now() - 9 * 86400e3).toISOString();
  add('sensor.office_heater_energy', '739.1', { friendly_name: 'Office heater energy', device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, 'office', { platform: 'energy_sensor_generator', config_entry_id: 'esg', config_subentry_id: 'sub_heater' });
  // The stopped counters stopped days ago.
  for (const id of ['sensor.old_lamp_energy', 'sensor.aquarium_energy', 'sensor.office_heater_energy']) states[id].last_changed = new Date(Date.now() - 3 * 86400e3).toISOString();
  add('sensor.desk_plug_cloud_power', '86', { friendly_name: 'Desk Plug (cloud) Power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, 'office');
  const energyPrefs = {
    energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_import_energy', stat_energy_to: 'sensor.grid_export_energy', entity_energy_price: 'sensor.electricity_price', number_energy_price: null, stat_cost: null, cost_adjustment_day: 0 }],
    device_consumption: [
      { stat_consumption: 'sensor.heat_pump_energy', name: 'Heat pump', stat_rate: 'sensor.heat_pump_power' },
      { stat_consumption: 'sensor.desk_plug_energy', name: 'Desk', stat_rate: 'sensor.desk_plug_power' },
      { stat_consumption: 'sensor.tv_plug_energy', name: 'TV and things', stat_rate: 'sensor.tv_plug_power' },
      { stat_consumption: 'sensor.sofa_lamp_energy', name: 'Sofa lamp', included_in_stat: 'sensor.tv_plug_energy' },
      { stat_consumption: 'sensor.kettle_energy', name: 'Kettle', stat_rate: 'sensor.kettle_power' },
      { stat_consumption: 'sensor.server_energy', name: 'Server PSU', stat_rate: 'sensor.server_power' },
      { stat_consumption: 'sensor.garage_heater_energy', name: 'Garage heater', stat_rate: 'sensor.yaml_heater_power' },
      { stat_consumption: 'sensor.old_lamp_energy', name: 'Old lamp', stat_rate: 'sensor.old_lamp_power' },
      { stat_consumption: 'sensor.reading_lamp_energy', name: 'Reading lamp', included_in_stat: 'sensor.old_lamp_energy' },
      { stat_consumption: 'sensor.aquarium_energy', name: 'Aquarium', stat_rate: 'sensor.aquarium_power' },
      { stat_consumption: 'sensor.office_heater_energy', name: 'Office heater', stat_rate: 'sensor.office_heater_power' },
    ],
  };
  // Today's hourly statistics, as the recorder keeps them.
  const perHour = { 'sensor.grid_import_energy': [0.6, 0.5, 0.5, 0.5, 0.6, 0.8, 1.4, 2.1, 1.6, 1.0, 0.9, 0.9, 1.1, 0.9, 0.8, 0.9, 1.2, 2.4, 2.6, 2.0, 1.5, 1.1, 0.9, 0.7], 'sensor.heat_pump_energy': 0.45, 'sensor.desk_plug_energy': 0.06, 'sensor.tv_plug_energy': 0.05, 'sensor.sofa_lamp_energy': 0.01, 'sensor.kettle_energy': 0.04, 'sensor.server_energy': 0.11, 'sensor.garage_heater_energy': 0.3, 'sensor.old_lamp_energy': 0, 'sensor.reading_lamp_energy': 0.02, 'sensor.lamp_plug_total_energy': 0.041, 'sensor.aquarium_energy': 0, 'sensor.office_heater_energy': 0 };
  // Hours from the start asked for (yesterday's a little lower than
  // today's), thirty days that wander, and five-minute power for a day.
  const hourly = (id, base, dayOff, hours) => Array.from({ length: hours }, (_, h) => {
    let v = (Array.isArray(base) ? base[h] : base) * (dayOff ? 0.85 + 0.1 * Math.cos(h) : 1);
    if (id.endsWith('_cost')) v *= 1.4 + spot[h].value;
    if (!dayOff && h === hourNow) v *= new Date().getMinutes() / 60;
    return { start: at(dayOff, h).getTime(), end: at(dayOff, h + 1).getTime(), change: Math.round(v * 1000) / 1000 };
  });
  const statsFor = (msg) => {
    const out = {};
    const from = new Date(msg.start_time).getTime();
    for (const id of msg.statistic_ids) {
      if (msg.period === '5minute') {
        if (id !== 'sensor.grid_power') continue;
        out[id] = [];
        for (let t = Math.ceil(from / 300e3) * 300e3; t < Date.now(); t += 300e3) {
          const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
          out[id].push({ start: t, end: t + 300e3, mean: Math.round(600 + 900 * Math.max(0, Math.sin(((h - 5) / 24) * 2 * Math.PI)) + (h > 17 && h < 19.5 ? 1400 : 0) + 120 * Math.sin(t / 7e5)) });
        }
        continue;
      }
      const base = id.endsWith('_cost') ? perHour['sensor.grid_import_energy'] : perHour[id];
      if (base === undefined) continue;
      if (msg.period === 'day') {
        out[id] = Array.from({ length: 30 }, (_, k) => {
          const d = -29 + k;
          const total = (Array.isArray(base) ? base.reduce((a, b) => a + b, 0) : base * 24) * (0.8 + 0.35 * Math.abs(Math.sin(k * 1.7))) * (d === 0 ? (hourNow + 1) / 24 : 1);
          return { start: at(d, 0).getTime(), end: at(d + 1, 0).getTime(), change: Math.round(total * (id.endsWith('_cost') ? 2.1 : 1) * 1000) / 1000 };
        }).filter((r) => r.start >= from - 1);
        continue;
      }
      out[id] = [...(from < at(0, 0).getTime() ? hourly(id, base, -1, 24) : []), ...hourly(id, base, 0, hourNow + 1)];
    }
    return out;
  };
  const calls = [];
  const ws = [];
  const flows = [];
  let hass;
  const rebuild = () => {
    hass = { ...hass, states: { ...states } };
    onUpdate && onUpdate(hass);
  };
  const set = (id, state, attrs = {}) => {
    states[id] = { ...states[id], state, attributes: { ...states[id].attributes, ...attrs }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() };
    rebuild();
  };
  const flip = (id) => set(id, states[id].state === 'on' ? 'off' : 'on');
  hass = {
    states: { ...states }, entities, devices, areas, floors,
    user: { id: 'u', name: 'Test', is_admin: true },
    config: { location_name: 'Test House' },
    themes: { darkMode: true },
    language: 'en',
    calls, ws, set, flows,
    dashboard: { strategy: { type: 'custom:mosaic', accent: 'cobalt' } },
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      const id = data.entity_id;
      setTimeout(() => {
        if (service === 'toggle' && ['light', 'switch'].includes(domain)) flip(id);
        if (service === 'toggle' && domain === 'cover') set(id, states[id].state === 'open' ? 'closed' : 'open');
        if (service === 'media_play_pause') set(id, states[id].state === 'playing' ? 'paused' : 'playing');
      }, 100);
    },
    // Home Assistant's calendar API: the events in a range.
    callApi: async (method, path, data) => {
      // Helper flows: an Integral helper made, or one's options changed.
      if (method === 'POST' && path === 'config/config_entries/flow') {
        flows.push({ start: data });
        return { type: 'form', flow_id: `flow${flows.length}`, step_id: 'user', data_schema: [] };
      }
      if (method === 'POST' && /^config\/config_entries\/flow\/flow\d+$/.test(path)) {
        flows.push({ input: data });
        const id = `sensor.${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        add(id, '0.0', { friendly_name: data.name, device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total' }, null, { platform: 'integration', config_entry_id: `made${flows.length}` });
        hass = { ...hass, entities: { ...entities } };
        rebuild();
        return { type: 'create_entry', result: { entry_id: `made${flows.length}` } };
      }
      // Energy Sensor Generator: a source moved to another power sensor.
      if (method === 'POST' && path === 'config/config_entries/subentries/flow') {
        flows.push({ subentry: data });
        return { type: 'form', flow_id: 'sub1', step_id: 'reconfigure', data_schema: [{ name: 'source_entity_id', default: 'sensor.office_heater_power' }, { name: 'name', default: '' }, { name: 'periods', default: ['daily'] }, { name: 'energy_counter', description: { suggested_value: null } }] };
      }
      if (method === 'POST' && path === 'config/config_entries/subentries/flow/sub1') {
        flows.push({ input: data });
        states['sensor.office_heater_energy'] = { ...states['sensor.office_heater_energy'], last_changed: new Date().toISOString() };
        rebuild();
        return { type: 'abort', reason: 'reconfigure_successful' };
      }
      if (method === 'POST' && path === 'config/config_entries/options/flow') {
        flows.push({ options: data });
        const was = { int_aquarium: { source: 'sensor.aquarium_power', method: 'left', round: 2 } }[data.handler] || {};
        return { type: 'form', flow_id: 'opts1', step_id: 'init', data_schema: Object.entries(was).map(([name, v]) => ({ name, description: { suggested_value: v } })) };
      }
      if (method === 'POST' && path === 'config/config_entries/options/flow/opts1') {
        flows.push({ input: data });
        return { type: 'create_entry', result: true };
      }
      const m = /^calendars\/([^?]+)\?start=([^&]+)&end=(.+)$/.exec(path);
      if (method === 'GET' && m) {
        const [a, b] = [new Date(decodeURIComponent(m[2])), new Date(decodeURIComponent(m[3]))];
        const t = (v) => new Date(v.dateTime || `${v.date}T00:00:00`);
        return (calendarEvents[m[1]] || []).filter((e) => t(e.start) < b && t(e.end) > a);
      }
      throw new Error('unknown ' + method + ' ' + path);
    },
    callWS: async (msg) => {
      ws.push(msg);
      if (msg.type === 'calendar/event/create') {
        const list = (calendarEvents[msg.entity_id] = calendarEvents[msg.entity_id] || []);
        const ev = msg.event;
        list.push({ uid: `new${list.length}`, summary: ev.summary, location: ev.location, description: ev.description, start: ev.dtstart.length === 10 ? { date: ev.dtstart } : { dateTime: new Date(ev.dtstart).toISOString() }, end: ev.dtend.length === 10 ? { date: ev.dtend } : { dateTime: new Date(ev.dtend).toISOString() } });
        return null;
      }
      if (msg.type === 'calendar/event/delete') {
        calendarEvents[msg.entity_id] = (calendarEvents[msg.entity_id] || []).filter((e) => !(e.uid === msg.uid && (!msg.recurrence_id || e.recurrence_id === msg.recurrence_id)));
        return null;
      }
      if (msg.type === 'manifest/list') return msg.integrations.map((domain) => ({ domain, iot_class: { tuya: 'cloud_poll', tuya_local: 'local_push', shelly: 'local_push' }[domain] || 'local_polling' }));
      if (msg.type === 'manifest/get') return { domain: msg.integration, version: { energy_sensor_generator: '0.2.1' }[msg.integration] || null };
      if (msg.type === 'config/entity_registry/list') return Object.values(entities);
      if (msg.type === 'config/entity_registry/get') return entities[msg.entity_id] || null;
      if (msg.type === 'energy/get_prefs') return JSON.parse(JSON.stringify(energyPrefs));
      if (msg.type === 'recorder/statistics_during_period') return statsFor(msg);
      if (msg.type === 'energy/save_prefs') {
        for (const k of ['energy_sources', 'device_consumption', 'device_consumption_water']) if (msg[k]) energyPrefs[k] = msg[k];
        return JSON.parse(JSON.stringify(energyPrefs));
      }
      if (msg.type === 'config/device_registry/update') {
        devices[msg.device_id] = { ...devices[msg.device_id], area_id: msg.area_id };
        hass = { ...hass, devices: { ...devices } };
        rebuild();
        return devices[msg.device_id];
      }
      if (msg.type === 'config/entity_registry/update') {
        if (!entities[msg.entity_id]) throw { code: 'not_found', message: 'Entity not found' };
        entities[msg.entity_id] = { ...entities[msg.entity_id], area_id: msg.area_id };
        hass = { ...hass, entities: { ...entities } };
        rebuild();
        return { entity_entry: entities[msg.entity_id] };
      }
      if (msg.type === 'assist_pipeline/pipeline/list') return { preferred_pipeline: 'p1', pipelines: [{ id: 'p1', name: 'Home Assistant', conversation_engine: 'conversation.claude' }] };
      // The dashboard this card sits on: a Mosaic strategy dashboard.
      if (msg.type === 'lovelace/config') return JSON.parse(JSON.stringify(hass.dashboard));
      if (msg.type === 'lovelace/config/save') {
        hass.dashboard = msg.config;
        return null;
      }
      if (msg.type === 'conversation/process') {
        await new Promise((r) => setTimeout(r, 600));
        // A believable answer for the README's screenshot; anything else gets the stock one.
        const speech = /left on/i.test(msg.text)
          ? 'Two things: the kitchen ceiling light, and the TV plug, which is drawing 4 W on standby. Shall I turn them off?'
          : `I turned on the kitchen island light. (You said: ${msg.text})`;
        return { conversation_id: 'c1', response: { response_type: 'action_done', speech: { plain: { speech } } } };
      }
      throw new Error('unknown ' + msg.type);
    },
  };
  return hass;
}

// A made-up floor plan for the made-up house, in house.wad's format.
export const FAKE_PLAN = {
  rooms: [
    { id: 'hall', name: 'Hallway', area: 'hallway', rects: [[0, 4, 2.5, 9]] },
    { id: 'kitchen', name: 'Kitchen', area: 'kitchen', rects: [[2.5, 0, 7, 4]] },
    { id: 'living', name: 'Living Room', area: 'living_room', rects: [[2.5, 4, 9, 9], [7, 2, 9, 4]] },
    { id: 'comms', name: 'Comms Room', area: 'comms', rects: [[0, 0, 2.5, 4]] },
    { id: 'garden', name: 'Garden', area: 'garden', outdoor: true, rects: [[9, 0, 13, 9]] },
    { id: 'bedroom', name: 'Bedroom', area: 'bedroom', level: 'up', rects: [[0, 0, 5, 5]] },
    { id: 'office', name: 'Office', area: 'office', level: 'up', rects: [[5, 0, 9, 5]] },
    { id: 'landing', name: 'Landing', level: 'up', rects: [[0, 5, 9, 7]] },
  ],
  levels: { up: { floor: 2.7 } },
  // Where the Bluetooth listeners are, for placing people within a room.
  scanners: { 'Kitchen Proxy': [6, 1], 'Hall Proxy': [1, 6] },
  // A presence radar in the office, in the corner, looking into the room.
  radars: [{ radar: 'office_radar', at: [5.2, 0.2], facing: 45, level: 'up' }],
};
