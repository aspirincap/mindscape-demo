export class AudioEngine {
  async start() {
    if (this.context) return this.context.resume();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('当前浏览器不支持环境音频。');
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 600;
    this.filter.connect(this.master);
    this.voices = [110, 164.81, 220, 329.63].map((frequency, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency; gain.gain.value = 0.035 / (1 + i * 0.25);
      osc.connect(gain); gain.connect(this.filter); osc.start();
      return { osc, gain };
    });
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02; data[i] = brown * 3.5; }
    this.noise = ctx.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0.1;
    this.noise.connect(this.noiseGain); this.noiseGain.connect(this.filter); this.noise.start();
    await ctx.resume();
  }
  update(state, world, enabled, volume = 0.5) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const mix = state.source === 'device' ? state.feedbackMix || 0 : 1;
    const coherence = state.source === 'device' ? .76 + mix * ((state.relaxationControl ?? .5) - .5) * .5 : state.coherence;
    const tension = 1 - coherence;
    this.master.gain.setTargetAtTime(enabled ? volume * 0.7 : 0, now, 0.4);
    this.filter.frequency.setTargetAtTime(380 + coherence * 1300, now, 1);
    this.noiseGain.gain.setTargetAtTime(0.04 + tension * 0.13, now, 1);
    const notes = ['scene-01','scene-07','scene-09','scene-11','scene-12','scene-13','scene-14','scene-15','scene-16'].includes(world) ? [110, 164.81, 220, 329.63] : [130.81, 196, 261.63, 392];
    this.voices.forEach(({ osc, gain }, i) => {
      osc.frequency.setTargetAtTime(notes[i] + Math.sin(now * 0.23 + i) * tension * 1.3, now, 0.8);
      gain.gain.setTargetAtTime((0.018 + coherence * 0.028) / (1 + i * 0.3), now, 1);
    });
  }
  dispose() { this.context?.close(); }
}
