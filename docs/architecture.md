# Architecture

## Runtime

The Next.js frontend is a static client. During development it runs on port 3000; in production the local backend serves its exported files. The app is usable in a normal browser. Electron adds a desktop window around the same frontend and reuses an already-running local backend when present.

`server/backend.cjs` owns the loopback HTTP server, browser sessions, control messages, QR generation, and settings persistence. `server/receiver.cjs` owns sender authentication, audio forwarding, mute, and connection state. Browser and native senders both enter this receiver; there is no separate simulated browser backend.

## Frontend boundaries

- `use-cindermic.ts` connects state, capture, playback, and the interface. Components receive its model and render one panel each.
- `web-bridge.ts` handles browser control sockets and reconnects after a backend restart.
- `browser-sender.ts` requests microphone access, owns the capture worklet, and reconnects the sender transport.
- `audio-receiver.ts` owns playback, gain, a high-pass filter, and a limiter. Playback is explicitly enabled by the user.
- `native-bridge.ts` connects the same interface to the Capacitor audio plugin.

Browser capture and native capture stay separate. A browser cannot provide iPhone background-audio guarantees. Platform behavior belongs in the native plugin, not in React components.

## Audio

Capture is mono PCM16 at 48 kHz, normally 960 samples per packet. Packets begin with `CND1`, a UInt32LE sequence, and a UInt32LE sample rate. The remaining bytes contain PCM16LE samples.

`shared/protocol.mjs` validates packets, reads input level, and computes reconnect delay. Public AudioWorklet modules contain the realtime capture and playback loops; worklets cannot import application React code.

The playback buffer waits for 60 ms of audio before starting, outputs silence on underrun, and bounds queued audio to 200 ms. Sender backpressure also drops data instead of collecting an unlimited queue. These are buffer limits, not measured end-to-end latency guarantees. TLS WebSocket uses TCP, so a congested network can introduce retransmission delay.

## Local access

The control server binds only to loopback. It checks Host and Origin and requires a random session token on browser WebSocket connections. Foreign web origins cannot read session credentials or open control sockets.

The phone receiver accepts TLS connections on local interfaces. A pairing link contains the desktop address, a random sender token, and the exact certificate fingerprint. iPhone pairing is saved in Keychain; local backend credentials stay in a Git-ignored directory. The local development service does not use Electron's credential APIs and can run independently of Electron.

## Native project

Capacitor generates `ios/` from `capacitor.config.ts`, `out/`, and the local `@cindermic/audio` package. The plugin is a normal Swift package and is discovered by `cap sync`; there is no custom WebKit file server or handwritten Xcode project.

The native plugin exposes one typed command API and publishes state events. Pairing uses Apple VisionKit for native QR scanning, with a pasted-link fallback. The camera is stopped and dismissed on success, invalid input, cancellation, or scanner failure. [Apple scanner delegate reference](https://developer.apple.com/documentation/visionkit/datascannerviewcontrollerdelegate). The iOS command does not deploy to a phone automatically.

Native capture starts and stops on its own serial queue. Captured packets are delivered through a bounded queue to the main-thread controller, which owns connection state, timers, mute, and socket references. The receiver publishes Connected only after receiving a valid audio frame. Authentication alone means Connecting. iOS and browser handshakes have deadlines; retry delay is bounded at 15 seconds. A changed phone network retries the saved pinned endpoint; a changed desktop IP requires scanning/copying its updated pairing link.
