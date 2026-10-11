import React from 'react';
import { sceneEEGReadout } from './core/eeg-readout.mjs';
import './scene-eeg-scores.css';

export function SceneEEGScores({ source, live, connection, breath }) {
  const readings = sceneEEGReadout(source, live, connection);
  return <section className="scene-eeg-scores" aria-label="设备专注分与冥想分" title={`${readings.status} · 设备原始相对分 1–100`}>
    <dl className="scene-eeg-values">
      <div><dt>专注分</dt><dd data-testid="scene-eeg-attention">{readings.attention ?? '—'}</dd></div>
      <div><dt>冥想分</dt><dd data-testid="scene-eeg-meditation">{readings.meditation ?? '—'}</dd></div>
    </dl>
    <span className="sr-only">{readings.status}，设备相对分范围为 1 至 100。</span>
    {breath && <p className="scene-eeg-breath" title={breath.note}>呼吸引导 · {breath.label}{breath.seconds !== null && ` ${breath.seconds} 秒`}</p>}
  </section>;
}
