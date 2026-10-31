export function parsePairing(link) {
  try {
    if (typeof link !== 'string' || link.length > 2048) throw new Error();
    const url = new URL(link.trim());
    if (
      url.protocol !== 'cindermic:' ||
      url.hostname !== 'pair' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname ||
      url.hash
    )
      throw new Error();
    const values = {};
    for (const key of ['host', 'port', 'token', 'fingerprint']) {
      if (url.searchParams.getAll(key).length !== 1) throw new Error();
      values[key] = url.searchParams.get(key);
    }
    const { host, token, fingerprint } = values;
    const port = Number(values.port);
    if (
      !host ||
      host.length > 253 ||
      !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) ||
      host.includes('..')
    )
      throw new Error();
    if (!/^\d{1,5}$/.test(values.port) || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error();
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-fA-F0-9]{64}$/.test(fingerprint)) throw new Error();
    return { host, port, token, fingerprint: fingerprint.toLowerCase() };
  } catch {
    throw new Error(
      'That pairing link is invalid. Copy or scan a fresh link from the desktop app.',
    );
  }
}
