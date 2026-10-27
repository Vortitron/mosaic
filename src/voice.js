// Talking to the assistant, through Home Assistant's own Assist pipeline:
// the microphone goes to the home's speech-to-text, the words to its agent,
// and (when the pipeline has text-to-speech) the answer is spoken back.
// Nothing here talks to a speech service of its own: the browser's built-in
// recognition would send the audio to Google, so it is not used.

// An AudioWorklet that hands each block of microphone samples to the card.
const WORKLET = `class MosaicRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mosaic-recorder', MosaicRecorder);`;

export const canListen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioContext && window.AudioWorkletNode && window.isSecureContext);

// 32-bit float samples -> 16-bit little-endian PCM, after the handler byte
// Home Assistant uses to route binary messages to this run.
export function pcmFrame(handler, f32) {
  const out = new Uint8Array(1 + f32.length * 2);
  out[0] = handler;
  const view = new DataView(out.buffer);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(1 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export class VoiceRun {
  // on: { state(s), heard(text), reply(text, conversationId), error(message), done() }
  constructor(hass, { pipeline, conversationId, speak, on }) {
    this.hass = hass;
    this.pipeline = pipeline;
    this.conversationId = conversationId;
    this.speak = speak;
    this.on = on;
    this.handler = null;
    this.queue = [];
    this.micOpen = false;
    this.finished = false;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      return this._fail('The microphone is not available here. Your browser may need permission, or the page has to be opened over https.');
    }
    try {
      this.ctx = new AudioContext({ sampleRate: 16000 });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ctx, 'mosaic-recorder');
      this.node.port.onmessage = (e) => this._audio(e.data);
      source.connect(this.node);
      this.micOpen = true;
    } catch (e) {
      return this._fail(`This browser could not record for Assist: ${(e && e.message) || e}`);
    }
    this.on.state('listening');
    const run = {
      type: 'assist_pipeline/run',
      start_stage: 'stt',
      end_stage: this.speak ? 'tts' : 'intent',
      input: { sample_rate: this.ctx.sampleRate },
      pipeline: this.pipeline,
      timeout: 60,
    };
    if (this.conversationId) run.conversation_id = this.conversationId;
    try {
      this.unsub = await this.hass.connection.subscribeMessage((ev) => this._event(ev), run);
    } catch (e) {
      this._fail(`Assist would not listen: ${(e && e.message) || e}`);
    }
  }

  // Stop listening now (a second tap on the microphone): Assist gets what it has.
  stop() {
    this._closeMic();
  }

  cancel() {
    this._closeMic();
    this._finish();
  }

  _audio(f32) {
    if (!this.micOpen) return;
    if (this.handler === null) {
      // Samples arrive before Assist has said where to send them; keep a
      // couple of seconds so the start of a sentence isn't lost.
      this.queue.push(f32);
      if (this.queue.length > 250) this.queue.shift();
      return;
    }
    this._send(f32);
  }

  _send(f32) {
    const socket = this.hass.connection && this.hass.connection.socket;
    if (socket && socket.readyState === 1) socket.send(pcmFrame(this.handler, f32));
  }

  _closeMic() {
    if (!this.micOpen) return;
    this.micOpen = false;
    if (this.handler !== null) {
      const socket = this.hass.connection && this.hass.connection.socket;
      // The handler byte on its own tells Assist the audio has ended.
      if (socket && socket.readyState === 1) socket.send(new Uint8Array([this.handler]));
    }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
  }

  _event(ev) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'run-start':
        this.handler = d.runner_data && d.runner_data.stt_binary_handler_id;
        for (const f of this.queue.splice(0)) this._send(f);
        break;
      case 'stt-vad-end':
        this._closeMic();
        this.on.state('thinking');
        break;
      case 'stt-end':
        this._closeMic();
        this.on.state('thinking');
        if (d.stt_output && d.stt_output.text) this.on.heard(d.stt_output.text);
        break;
      case 'intent-end': {
        const r = d.intent_output || {};
        const speech = r.response && r.response.speech && r.response.speech.plain && r.response.speech.plain.speech;
        this.on.reply(speech || 'Done.', r.conversation_id || this.conversationId);
        if (this.speak) this.on.state('speaking');
        break;
      }
      case 'tts-end':
        if (d.tts_output && d.tts_output.url) {
          const audio = new Audio(d.tts_output.url);
          audio.play().catch(() => {});
        }
        break;
      case 'error':
        this._fail(d.message || d.code || 'Assist stopped.');
        break;
      case 'run-end':
        this._finish();
        break;
      default:
        break;
    }
  }

  _fail(message) {
    this._closeMic();
    this.on.error(message);
    this._finish();
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.unsub) {
      Promise.resolve(this.unsub()).catch(() => {});
      this.unsub = null;
    }
    this.on.state('idle');
    this.on.done();
  }
}
