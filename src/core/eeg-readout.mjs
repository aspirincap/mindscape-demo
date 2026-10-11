import { EEG_FRESH_MS } from './eeg-protocol.mjs';

// Display original device scores, never the simulator or calibrated visual controls.
export function sceneEEGReadout(source, live, connection) {
  const device = source === 'device' && live?.source === 'device';
  const connected = device && connection?.connected && connection.bridge && connection.serial === 'connected';
  const score = key => {
    const value = live?.[key], age = live?.lastValidAgeMs?.[key];
    return connected && live.poorSignal === 0 && live.validity?.[key] === true
      && Number.isFinite(age) && age >= 0 && age < EEG_FRESH_MS
      && Number.isFinite(value) && value >= .01 && value <= 1
      ? Math.round(value * 100) : null;
  };
  const attention = score('attention'), meditation = score('relaxation');
  let status;
  if (!device) status = '请接入脑电设备';
  else if (!connection?.connected) status = '会话未连接';
  else if (!connection.bridge) status = '等待设备发送';
  else if (connection.serial !== 'connected') status = '等待串口连接';
  else if (live.poorSignal > 0) status = '接触待调整';
  else if (attention !== null && meditation !== null) status = '实时设备读数';
  else if (attention !== null || meditation !== null) status = '部分读数无效或过期';
  else if (Object.values(live.lastValidAgeMs || {}).some(age => Number.isFinite(age) && age >= EEG_FRESH_MS)) status = '读数已过期';
  else status = '等待有效读数';
  return { attention, meditation, status, hasReading: attention !== null || meditation !== null };
}
