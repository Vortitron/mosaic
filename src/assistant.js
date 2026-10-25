// The Cortana corner, with Claude in it: a conversation through Home
// Assistant's own Assist. Whatever agent the home has set up answers (the
// Anthropic integration, or any agent using the Vome LLM API), so the card
// itself never talks to an AI service or holds a key.

export async function resolveAgent(hass, conf = {}) {
  let agentId = conf.agent_id || null;
  let pipelineName = null;
  if (!agentId) {
    try {
      const res = await hass.callWS({ type: 'assist_pipeline/pipeline/list' });
      const p = res.pipelines.find((x) => x.id === res.preferred_pipeline) || res.pipelines[0];
      if (p) {
        agentId = p.conversation_engine || null;
        pipelineName = p.name || null;
      }
    } catch (e) {
      /* no assist_pipeline: Assist's default agent answers */
    }
  }
  return { agentId, name: conf.name || agentName(hass, agentId, pipelineName) };
}

export function agentName(hass, agentId, pipelineName) {
  const entry = agentId && hass.entities && hass.entities[agentId];
  if (entry && entry.platform === 'anthropic') return 'Claude';
  if (agentId && /claude|anthropic/i.test(agentId)) return 'Claude';
  // Home Assistant's own agent understands set phrases; it is not an AI, so it
  // keeps Assist's name.
  if (!agentId || agentId === 'conversation.home_assistant') return 'Assist';
  if (pipelineName && pipelineName !== 'Home Assistant') return pipelineName;
  const st = agentId && hass.states[agentId];
  if (st && st.attributes.friendly_name) return st.attributes.friendly_name;
  return 'Assist';
}

export class Conversation {
  constructor() {
    this.id = null;
    this.turns = []; // { who: 'me' | 'it', text }
    this.busy = false;
  }

  async ask(hass, agent, text) {
    this.turns.push({ who: 'me', text });
    this.busy = true;
    try {
      const msg = { type: 'conversation/process', text, conversation_id: this.id };
      if (agent.agentId) msg.agent_id = agent.agentId;
      if (hass.language) msg.language = hass.language;
      const res = await hass.callWS(msg);
      this.id = res.conversation_id || this.id;
      const speech = res.response && res.response.speech && res.response.speech.plain && res.response.speech.plain.speech;
      const reply = speech || (res.response && res.response.response_type === 'error' ? 'Something went wrong.' : 'Done.');
      this.turns.push({ who: 'it', text: reply });
      return reply;
    } catch (e) {
      const reply = `I could not reach the assistant: ${(e && e.message) || e}`;
      this.turns.push({ who: 'it', text: reply, error: true });
      return reply;
    } finally {
      this.busy = false;
    }
  }

  get last() {
    const t = [...this.turns].reverse().find((x) => x.who === 'it' && !x.error);
    return t ? t.text : null;
  }
}
