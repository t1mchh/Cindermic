export const SAMPLE_RATE = 48000;
export const FRAME_SAMPLES = 960;
export const HEADER_BYTES = 12;
export const AUDIO_MAGIC = 0x434e4431;

export function isAudioPacket(bytes) {
  if (!(bytes instanceof Uint8Array)) return false;
  if (
    bytes.byteLength < 14 ||
    bytes.byteLength > 9612 ||
    (bytes.byteLength - HEADER_BYTES) % 2 !== 0
  )
    return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0) === AUDIO_MAGIC && view.getUint32(8, true) === SAMPLE_RATE;
}

export function readLevel(bytes) {
  if (!isAudioPacket(bytes)) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let energy = 0;
  for (let i = HEADER_BYTES; i < view.byteLength; i += 2)
    energy += (view.getInt16(i, true) / 32768) ** 2;
  return Math.sqrt(energy / ((view.byteLength - HEADER_BYTES) / 2));
}

export function reconnectDelay(attempt, random = Math.random()) {
  return Math.min(15000, 1000 * 2 ** Math.min(Math.max(attempt - 1, 0), 4) * (0.85 + random * 0.3));
}
