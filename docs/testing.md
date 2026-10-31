# Testing

## Automated checks

```sh
npm run check
npm test
npm run test:audio
```

The unit and integration suite covers malformed packets, sender authentication, local Origin and Host checks, control-session authorization, mute, interruption state, session replacement, and playback-buffer behavior.

The audio test runs the real exported frontend in a dedicated Electron window with Chromium's synthetic microphone. It exercises browser capture, the capture worklet, WebSocket transport, the backend receiver, playback startup, mute, backend restart, automatic reconnect, and intentional disconnect. It also checks profile selection, the M mute shortcut, recording across mute/reconnect, and the actual WAV download. Test output is muted and the real microphone is not used. Credentials are isolated and removed after the test.

## Manual Mac check

1. Run `npm run dev` and open `http://localhost:3000`.
2. Start the Mac microphone and verify that the meter responds to speech.
3. Use headphones, choose an output, and enable playback.
4. Mute and unmute. Open another browser tab to verify state synchronization.
5. Restart only `npm run dev:server`. Keep capture running and verify recovery.
6. Repeat the restart while muted and verify that reconnection remains silent.
7. Disconnect and verify that capture stops and does not reconnect itself.

The synthetic test establishes software behavior. Actual microphone quality, hardware output routing, and perceived latency require this manual check.

## Native device checks

`npm run ios:sync` verifies generation and synchronization of the standard Xcode project. `npm run ios:build` additionally compiles it without signing. Neither validates microphone access, screen-lock endurance, interruption recovery, battery use, or Windows driver behavior. Test those separately on the intended devices after the Mac workflow is stable.

On an actual iPhone: test QR permission allow/deny, invalid QR, scanner cancellation, successful pairing, repeated Connect taps, disconnect during startup, lock/unlock for at least 15 minutes, desktop restart, a Wi-Fi interruption, and another app taking microphone priority. Verify silence while muted after reconnect. These scenarios remain **NOT DEVICE-TESTED** until recorded with hardware results.

## Visual and clip update

The current suite contains 26 unit/integration tests. The additional clip tests verify WAV metadata and PCM contents, silence across mute/reconnect gaps, invalid packet rejection, and the two-minute memory limit. The enhanced synthetic-audio test verifies the saved WAV file through Electron's download path, profile selection, and keyboard shortcut behavior in addition to the original streaming checks.
