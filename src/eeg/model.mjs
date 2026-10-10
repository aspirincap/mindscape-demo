export const MAX_EVENTS = 2000;
export const MAX_BYTES = 8 * 1024 * 1024;

export function createCapture() {
  return { events: [], sizes: [], size: 0, evicted: 0, lastId: 0, clearedAtId: 0, packets: [], raw16: [], raw8: [] };
}

export function appendEvents(capture, events) {
  for (const event of events) {
    // Snapshot replay after reconnect must not duplicate or resurrect cleared data.
    if (event.id <= Math.max(capture.lastId, capture.clearedAtId)) continue;
    capture.lastId = event.id;
    const size = JSON.stringify(event).length;
    capture.events.push(event); capture.sizes.push(size); capture.size += size;
    while (capture.events.length > MAX_EVENTS || capture.size > MAX_BYTES) {
      capture.events.shift(); capture.size -= capture.sizes.shift(); capture.evicted++;
    }
    event.packets.forEach((packet, index) => {
      capture.packets.push({ ...packet, id: `${event.id}.${index}`, timestamp: event.timestamp, port: event.port, baud: event.baud });
      if (packet.checksumValid && !packet.decodeError) {
        for (const value of packet.raw16 || []) capture.raw16.push({ value, timestamp: event.timestamp });
        for (const value of packet.raw8 || []) capture.raw8.push({ value, timestamp: event.timestamp });
      }
    });
  }
  capture.packets = capture.packets.slice(-400);
  capture.raw16 = capture.raw16.slice(-4096);
  capture.raw8 = capture.raw8.slice(-4096);
  return capture;
}

export function clearCapture(capture) {
  return { ...createCapture(), lastId: capture.lastId, clearedAtId: capture.lastId };
}

export function rawBytes(events) {
  const bytes = new Uint8Array(events.reduce((n, event) => n + event.length, 0));
  let offset = 0;
  for (const event of events) {
    for (const hex of event.hex.trim().split(/\s+/).filter(Boolean)) bytes[offset++] = parseInt(hex, 16);
  }
  return bytes.subarray(0, offset);
}

export function qualityLabel(value) {
  if (value == null) return '等待信号字段';
  if (value === 0) return '电极接触良好';
  if (value === 200) return '未检测到有效接触';
  return '信号存在干扰';
}
