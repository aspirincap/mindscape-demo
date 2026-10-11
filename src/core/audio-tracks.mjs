// Original user-supplied MP3 bytes. Playback trims target -23 LUFS, limited
// to +6 dB gain and -2 dBTP peak headroom; source files are not re-encoded.
const entries = [
  ['piano', '氛围钢琴', '01-ambient-piano.mp3', .992, 'Ambient Piano Music #2', 'benpm', '320525', 'by'],
  ['stream', '森林溪流', '02-forest-stream.mp3', 1.0827, 'Small stream in forest', 'Cinetony', '559955', 'zero'],
  ['underwater', '深海氛围', '03-underwater-ambience.mp3', 1.9953, 'Underwater Ambience', 'Fission9', '504641', 'zero'],
  ['waves', '轻柔海浪', '04-gentle-waves.mp3', 1.7681, 'waves 02 160717_0917.flac', 'klankbeeld', '441627', 'by'],
  ['leaves', '秋风落叶', '06-autumn-leaves.mp3', .554, 'Autumn wind with leaves rustling.wav', 'GregorQuendel', '483076', 'by'],
  ['arctic', '极地风声', '17-arctic-wind.mp3', .7621, 'air tone arctic wind blowing, distant water tone Quaqtaq, Nunavik.flac', 'kyles', '450143', 'zero'],
  ['polar', '极地合成风', '19-polar-wind-synth.mp3', .5553, 'Arctic Winds Northpole Nr2 (.wav)', 'enricoviets', '402652', 'zero'],
  ['tent', '帐篷听风', '20-windy-tent.mp3', 1.0902, 'windy tent.wav', 'bruno.auzet', '527434', 'zero'],
];
export const AUDIO_TRACKS = Object.freeze(Object.fromEntries(entries.map(([id, name, file, gain, title, author, sound, license]) => [id, Object.freeze({
  id, name, src: `/audio/${file}`, gain, title, author,
  source: `https://freesound.org/people/${author}/sounds/${sound}/`,
  license: license === 'by' ? 'CC BY 4.0' : 'CC0 1.0',
  licenseUrl: license === 'by' ? 'https://creativecommons.org/licenses/by/4.0/' : 'https://creativecommons.org/publicdomain/zero/1.0/',
})])));
export const SCENE_AUDIO = Object.freeze({
  fuji: 'piano', 'grand-canyon': 'piano',
  'scene-01': 'underwater', 'scene-02': 'stream', 'scene-03': 'piano',
  'scene-04': 'stream', 'scene-05': 'arctic', 'scene-06': 'leaves',
  'scene-07': 'stream', 'scene-08': 'stream', 'scene-09': 'waves',
  'scene-10': 'arctic', 'scene-11': 'underwater', 'scene-12': 'underwater',
  'scene-13': 'underwater', 'scene-14': 'underwater', 'scene-15': 'underwater',
  'scene-16': 'underwater', 'scene-17': 'arctic', 'scene-18': 'piano',
  'scene-19': 'polar', 'scene-20': 'tent',
});
export const trackForWorld = world => AUDIO_TRACKS[SCENE_AUDIO[world] || 'piano'];
export function audioLevel(state, volume) {
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const mix = state.source === 'device' ? clamp(state.feedbackMix ?? 0) : 1;
  const calm = clamp(state.source === 'device' ? state.relaxationControl ?? .5 : state.coherence ?? .5);
  return clamp(volume) * .7 * (1 + (calm - .5) * .12 * mix);
}
export function loopEnvelope(time, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, time / .6, (duration - time) / .6));
}
