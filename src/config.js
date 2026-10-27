// The card's config as the editor's flat form, and back. No DOM here, so it
// is tested in node.

export function toForm(config) {
  const a = config.assistant;
  return {
    theme: config.theme || 'auto',
    list: config.list || 'devices',
    columns: String(config.columns || 6),
    wallpaper: config.wallpaper || '',
    light_colours: !!config.light_colours,
    editable: config.editable !== false,
    show_assistant: a !== false,
    agent_id: (a && a.agent_id) || '',
    assistant_name: (a && a.name) || '',
  };
}

export function fromForm(config, form) {
  const out = { ...config };
  const set = (key, value, fallback) => {
    if (value === fallback || value === '' || value === undefined || value === null) delete out[key];
    else out[key] = value;
  };
  set('theme', form.theme, 'auto');
  set('list', form.list, 'devices');
  set('columns', Number(form.columns) || 6, 6);
  set('wallpaper', form.wallpaper, '');
  set('light_colours', !!form.light_colours, false);
  set('editable', form.editable !== false, true);
  if (form.show_assistant === false) out.assistant = false;
  else {
    const assistant = {};
    if (form.agent_id) assistant.agent_id = form.agent_id;
    if (form.assistant_name) assistant.name = form.assistant_name;
    if (Object.keys(assistant).length) out.assistant = assistant;
    else delete out.assistant;
  }
  return out;
}
