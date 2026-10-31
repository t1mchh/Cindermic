import { translate, type Locale, type MessageKey } from './index';

const rules: [RegExp, MessageKey][] = [
  [/camera.*(permission|denied|allow)/i, 'errorCamera'],
  [/scanner|scanning/i, 'errorScanner'],
  [/valid microphone audio/i, 'errorMicrophone'],
  [/clipboard/i, 'errorClipboard'],
  [/keychain|save.*pairing/i, 'errorKeychain'],
  [/pairing link.*invalid|invalid.*pairing link/i, 'errorPairing'],
  [
    /interrupted|waiting for microphone|microphone.*(busy|priority)|another app/i,
    'errorInterrupted',
  ],
  [/permission|notallowed|denied|allow microphone|not allowed/i, 'errorPermission'],
  [/capture ended/i, 'errorCaptureEnded'],
  [/no usable microphone|notfound|requested device|microphone.*unavailable/i, 'errorMicrophone'],
  [/choose.*output.*first/i, 'errorOutput'],
  [
    /output.*unavailable|output.*failed|cannot select.*output|not supported|setsinkid/i,
    'errorOutputFailed',
  ],
  [/rejected|replaced/i, 'errorReplaced'],
  [/timed out|timeout|not responding|isn’t responding|stopped responding/i, 'errorTimeout'],
  [/session.*connect/i, 'errorSession'],
  [/connection|network|offline|socket|host|internet|certificate|server/i, 'errorReconnect'],
];

export function localizeError(message: string, locale: Locale) {
  const key = rules.find(([pattern]) => pattern.test(message))?.[1] || 'errorGeneric';
  return translate(locale, key);
}

export function sourceName(name: string | undefined, locale: Locale) {
  if (!name) return translate(locale, 'navMic');
  if (name === 'Mac microphone' || name === 'Mac browser microphone')
    return translate(locale, 'macMicrophone');
  return name.replace(/^Desktop · /, `${translate(locale, 'desktop')} · `);
}
