'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipRecorder, MAX_CLIP_SECONDS } from '../../shared/clip-recorder.mjs';

export function useClipRecorder() {
  const recorder = useRef(new ClipRecorder());
  const started = useRef(0);
  const objectUrl = useRef('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clipUrl, setClipUrl] = useState('');
  const [filename, setFilename] = useState('cindermic.wav');
  const finish = useCallback(() => {
    const data = recorder.current.finish(performance.now());
    setRecording(false);
    if (!data) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
    setClipUrl(objectUrl.current);
    setFilename(`cindermic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`);
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - started.current) / 1000;
      setSeconds(Math.min(MAX_CLIP_SECONDS, Math.floor(elapsed)));
      if (elapsed >= MAX_CLIP_SECONDS) finish();
    }, 250);
    return () => clearInterval(timer);
  }, [recording, finish]);
  useEffect(
    () => () => {
      recorder.current.clear();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  function start() {
    if (recorder.current.samples) return;
    started.current = performance.now();
    recorder.current.start(started.current);
    setSeconds(0);
    setRecording(true);
  }
  function discard() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = '';
    setClipUrl('');
  }
  return { recording, seconds, clipUrl, filename, start, finish, discard, recorder };
}
