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
  add('scene.movie', 'scening', { friendly_name: 'Movie Night' }, 'living_room');
  add('vacuum.robot', 'docked', { friendly_name: 'Robot Vacuum' }, null);
  add('weather.home', 'partlycloudy', { friendly_name: 'Home', temperature: 11.2, temperature_unit: '°C', humidity: 81, wind_speed: 14, wind_speed_unit: 'km/h' }, null);
  add('person.andy', 'home', { friendly_name: 'Andy' }, null);
  add('person.sam', 'not_home', { friendly_name: 'Sam' }, null);
  const soon = new Date(Date.now() + 2 * 3600e3);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  add('calendar.family', 'off', { friendly_name: 'Family', message: 'Dentist', start_time: fmt(soon), end_time: fmt(new Date(soon.getTime() + 3600e3)) }, null);
  add('automation.night', 'on', { friendly_name: 'Night mode' }, null);
  add('conversation.claude', 'unknown', { friendly_name: 'Claude conversation' }, null, { platform: agent });

  // Devices as Home Assistant has them: the plug's main entity has no name of
  // its own, so its friendly name is the device's.
  device('kettle_plug', 'Kettle', 'kitchen', ['switch.kettle', 'sensor.kettle_power', 'sensor.kettle_energy', 'sensor.kettle_signal'], { manufacturer: 'Shelly', model: 'Plug S' });
  device('kitchen_climate', 'Kitchen Climate', 'kitchen', ['sensor.kitchen_temperature', 'sensor.kitchen_humidity', 'sensor.kitchen_debug'], { manufacturer: 'Aqara' });
  device('bedroom_tv', 'Bedroom TV', 'bedroom', ['media_player.bedroom']);
  const calls = [];
  const ws = [];
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
    calls, ws, set,
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      const id = data.entity_id;
      setTimeout(() => {
        if (service === 'toggle' && ['light', 'switch'].includes(domain)) flip(id);
        if (service === 'toggle' && domain === 'cover') set(id, states[id].state === 'open' ? 'closed' : 'open');
        if (service === 'media_play_pause') set(id, states[id].state === 'playing' ? 'paused' : 'playing');
      }, 100);
    },
    callWS: async (msg) => {
      ws.push(msg);
      if (msg.type === 'assist_pipeline/pipeline/list') return { preferred_pipeline: 'p1', pipelines: [{ id: 'p1', name: 'Home Assistant', conversation_engine: 'conversation.claude' }] };
      if (msg.type === 'conversation/process') {
        await new Promise((r) => setTimeout(r, 600));
        return { conversation_id: 'c1', response: { response_type: 'action_done', speech: { plain: { speech: `I turned on the kitchen island light. (You said: ${msg.text})` } } } };
      }
      throw new Error('unknown ' + msg.type);
    },
  };
  return hass;
}
