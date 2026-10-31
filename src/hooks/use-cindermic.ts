'use client';

import { useClipRecorder } from './use-clip-recorder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { parsePairing } from '../../shared/pairing.mjs';
import { readLevel } from '../../shared/protocol.mjs';
import { AudioReceiver, type SoundProfile } from '@/lib/audio-receiver';
import { BrowserSender, type SenderStatus } from '@/lib/browser-sender';
import { NativeBridge } from '@/lib/native-bridge';
import { WebBridge } from '@/lib/web-bridge';
import type { AppState, Bridge, Command } from '@/lib/types';

const initialState: AppState = { status: 'offline', muted: false, backendConnected: false };

export function useCindermic() {
  const clip = useClipRecorder();
  const [profile, setProfile] = useState<SoundProfile>('natural');
  const [state, setState] = useState(initialState);
  const [native, setNative] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanBusy = useRef(false);
  const [phone, setPhone] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(46).fill(0));
  const [senderStatus, setSenderStatus] = useState<SenderStatus>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [routing, setRouting] = useState(false);
  const [gain, setGain] = useState(100);
  const bridge = useRef<Bridge | null>(null);
  const audio = useRef<AudioReceiver | null>(null);
  const sender = useRef<BrowserSender | null>(null);
  const outputBusy = useRef(false);
  const outputGeneration = useRef(0);
  const currentState = useRef(state);
  const lastMeter = useRef(0);
  const connected = ['connected', 'interrupted'].includes(state.status);
  const live = state.status === 'connected' && !state.muted;

  const showError = useCallback(
    (error: unknown) => setNotice(error instanceof Error ? error.message : String(error)),
    [],
  );

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    const connection: Bridge = native ? new NativeBridge() : new WebBridge();
    const receiver = new AudioReceiver();
    const capture = new BrowserSender(connection);
    let disposed = false;
    bridge.current = connection;
    audio.current = receiver;
    sender.current = capture;
    setNative(native);
    setPhone(native || new URLSearchParams(location.search).get('view') === 'phone');
    capture.onStatus = (status, error) => {
      if (!disposed) {
        setSenderStatus(status);
        if (error) setNotice(error);
      }
    };
    const stateListener = connection.onState((patch) => {
      if (disposed) return;
      setState((previous) => ({ ...previous, ...patch }));
    });
    const pairingListener = connection.onPairingRequired(() => setPairingOpen(true));
    const audioListener = connection.onAudio((packet) => {
      const state = currentState.current;
      if (state.muted || state.status !== 'connected') return;
      clip.recorder.current.append(packet, performance.now());
      receiver.push(packet);
      if (Date.now() - lastMeter.current < 80) return;
      lastMeter.current = Date.now();
      const rms = readLevel(packet);
      setLevel(rms);
      setLevels((previous) => [...previous.slice(1), rms]);
    });
    void connection.connect().catch(showError);
    return () => {
      disposed = true;
      stateListener();
      pairingListener();
      audioListener();
      connection.close();
      void capture.stop();
      void receiver.stop();
    };
  }, [showError]);

  useEffect(() => {
    currentState.current = state;
    audio.current?.mute(!live);
    sender.current?.setMuted(state.muted);
    if (!live) {
      clip.recorder.current.markGap();
      audio.current?.flush();
      setLevel(0);
      setLevels(Array(46).fill(0));
    }
    if (connected) setPairingOpen(false);
  }, [state, live, connected]);

  useEffect(() => {
    if (!phone || !live) return;
    const rms = state.level || 0;
    setLevel(rms);
    setLevels((previous) => [...previous.slice(1), rms]);
  }, [phone, live, state.level]);

  async function command(value: Command) {
    try {
      if (value.type === 'pair') {
        setNotice('');
        parsePairing(value.link);
      }
      const result = await bridge.current?.command(value);
      if (result) setState((previous) => ({ ...previous, ...result }));
    } catch (error) {
      showError(error);
    }
  }

  async function mainAction() {
    setNotice('');
    if (connected) return command({ type: 'mute', muted: !state.muted });
    if (Capacitor.isNativePlatform())
      return command({
        type: ['offline', 'failed'].includes(state.status) ? 'connect' : 'disconnect',
      });
    if (senderStatus !== 'idle') await sender.current?.stop();
    else await sender.current?.start();
  }

  async function scanPairing() {
    if (scanBusy.current || !bridge.current?.scanPairing) return;
    scanBusy.current = true;
    setNotice('');
    setScanning(true);
    try {
      const result = await bridge.current.scanPairing();
      if (result.link) await command({ type: 'pair', link: result.link });
    } catch (error) {
      showError(error);
    } finally {
      scanBusy.current = false;
      setScanning(false);
    }
  }

  async function disconnect() {
    await sender.current?.stop();
    await command({ type: 'disconnect' });
  }

  async function findOutputs() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const available = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'audiooutput',
      );
      setDevices(available);
      const cable = available.find((device) =>
        /cable input|blackhole|voicemeeter input/i.test(device.label),
      );
      if (cable) setDeviceId(cable.deviceId);
    } catch (error) {
      showError(error);
    }
  }

  async function toggleRouting() {
    if (outputBusy.current) return;
    outputBusy.current = true;
    const generation = ++outputGeneration.current;
    try {
      if (routing) {
        await audio.current?.stop();
        setRouting(false);
        return;
      }
      if (!deviceId) throw new Error('Choose an output device first.');
      await audio.current?.start(deviceId === 'default' ? '' : deviceId);
      if (generation !== outputGeneration.current) return;
      audio.current?.setProfile(profile);
      audio.current?.setGain(gain / 100);
      audio.current?.mute(!live);
      setRouting(true);
    } catch (error) {
      setRouting(false);
      if (generation === outputGeneration.current) showError(error);
    } finally {
      outputBusy.current = false;
    }
  }

  function selectDevice(value: string) {
    outputGeneration.current++;
    setDeviceId(value);
    void audio.current?.stop();
    setRouting(false);
  }
  function changeGain(value: number) {
    setGain(value);
    audio.current?.setGain(value / 100);
  }
  function changeProfile(value: SoundProfile) {
    setProfile(value);
    audio.current?.setProfile(value);
    try {
      localStorage.setItem('cindermic-profile', value);
    } catch {}
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cindermic-profile');
      if (saved === 'natural' || saved === 'voice' || saved === 'warm') setProfile(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        !connected ||
        native ||
        pairingOpen ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.code !== 'KeyM'
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest('input, textarea, select') || event.target.isContentEditable)
      )
        return;
      event.preventDefault();
      void command({ type: 'mute', muted: !state.muted });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [connected, native, pairingOpen, state.muted]);

  async function copyPairing() {
    try {
      await navigator.clipboard.writeText(state.pairing || '');
      return true;
    } catch {
      setNotice('Clipboard access is unavailable. Select and copy the pairing link instead.');
      return false;
    }
  }

  return {
    state,
    phone,
    native,
    scanning,
    scanPairing,
    connected,
    live,
    level,
    levels,
    senderStatus,
    pairingOpen,
    setPairingOpen,
    notice,
    clearNotice: () => setNotice(''),
    devices,
    deviceId,
    routing,
    gain,
    profile,
    changeProfile,
    clip,
    command,
    mainAction,
    disconnect,
    findOutputs,
    toggleRouting,
    selectDevice,
    changeGain,
    copyPairing,
  };
}

export type CindermicModel = ReturnType<typeof useCindermic>;
