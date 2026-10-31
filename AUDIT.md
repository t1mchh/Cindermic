# Cindermic stability audit

Checkpoint: `689e749` (before recovery changes).

## Architecture inspected

Next.js statically exports the React interface. Node serves the export and a loopback-only control WebSocket on 43130. Electron either starts that backend or reuses it. A separate TLS WebSocket on 43129 authenticates phone senders using the pairing token; the QR link pins its certificate. Native iPhone AVAudioEngine capture and browser AudioWorklet capture send mono PCM16 at 48 kHz. Desktop playback uses an AudioWorklet with a bounded jitter buffer. There is no WebRTC, cloud service, system microphone driver, or working Bluetooth transport.

## Findings before changes

- **Protocol mismatch:** the validator reads the CND1 magic in network byte order, while both capture implementations write the integer in native/little-endian order. Real senders can be rejected as malformed despite authentication succeeding.
- **Native queue race:** AudioCapture invokes MicController on a background sample queue, while socket, mute, disconnect, and timers mutate the same controller on the main queue. AVAudioEngine startup/teardown still runs on the main queue; route-change recovery can re-enter startup. These are concrete responsiveness/race hazards. The historical physical-iPhone freeze has not yet been reproduced with diagnostics, so no single historical root cause is proven.
- **Lifecycle gaps:** pending Capacitor listener registration can outlive React cleanup. Browser socket JSON is parsed without protection, control connection startup lacks a handshake deadline, and playback startup can race a subsequent stop.
- **False readiness:** the receiver publishes Connected immediately after authentication, before receiving any valid audio. Native capture failures can therefore leave misleading status.
- **Incomplete pairing:** there is a desktop QR image, but no phone camera scanner. Manual pairing requires the complete pinned link; a bare IP cannot securely supply the certificate identity.
- **Icons:** two duplicate icon generators reuse filenames at incompatible sizes and calculate scale incorrectly. The generated manifest contains duplicate and invalid entries, explaining unreliable/black app icons.
- **Unsupported Android scaffold:** Java plugin extends an unavailable class, has missing methods/imports, no sender connection implementation, duplicates audio headers, and doesn't implement the bridge API. Its generation script corrupts manifest syntax and repeats attributes. It must not be presented as supported.
- **Repository/package clutter:** generated `cdist/` is not ignored; its output path disagrees with CI artifacts. A copied Next require hook has no callers. Desktop packaging includes native build sources and nonexistent node_resources even though runtime needs only the export and backend.
- **Playback and performance:** the playback resampler uses 128 instead of the output sample rate, corrupting playback speed and underrun behavior. A global `will-change: transform, opacity` promotes every element and increases rendering overhead.
- **UI:** promotional headings, a decorative sidebar poster, repeated status labels, and oversized cards obscure pairing and utility controls.

## Verification boundary

Existing automated tests cover the backend and playback; the browser audio regression is required after protocol changes. An unsigned Xcode build verifies compilation only. Camera permission, QR scanning, locked-screen capture, network roaming, and interruptions must be marked **NOT DEVICE-TESTED** until exercised on hardware. Simultaneous recording with Snapchat cannot be guaranteed by iOS. A separately installed virtual audio device remains necessary for Discord/OBS/game input.

## Recovery implemented

- Standardized the CND1 wire header in browser and native senders, corrected playback resampling, and added regressions that check capture bytes against the actual receiver and verify playback consumption.
- Moved AVAudioSession/AVAudioEngine work onto a serial capture queue, bounded audio delivery to the main-thread connection controller, guarded route recovery, and added capture-start deadlines. Socket/handshake timeouts remain independent of the UI. Failures and cancellation leave controls usable.
- Added late-listener disposal guards, safe socket JSON parsing, control handshake deadlines, and playback cancellation guards. Mute persists through reconnect. First valid audio establishes desktop Connected status; authentication alone does not.
- Implemented native VisionKit QR scanning, permission/error/cancel cleanup, strict pairing validation, and a complete-link fallback. QR endpoints refresh when desktop interfaces change; no-network state no longer advertises loopback as a usable phone address. Keychain updates preserve the previous record if replacement fails.
- Replaced promotional dashboard content and excessive effects with compact microphone, pairing, and output controls. English, German, Russian, saved language choice, dark/light modes, and a live meter remain. Invalid pairing errors appear inside the active dialog.
- Generated a new opaque lime/graphite/violet icon. Removed conflicting icon generators and use one valid 1024-pixel iOS asset. Electron, favicon, and Apple touch icon also use the new artwork. Prompt and provenance are in `docs/icon.md`.
- Archived unsupported Android app/plugin scaffolding, `scripts/android.mjs`, both obsolete icon generators, and the unused `server/require-hook.js`. Removed the obsolete SVG icon, Android and Barlow font dependencies, unused translation keys, and decorative CSS. Generated desktop packages are ignored and excluded from source history/archives; old user artifacts were not deleted.
- Persisted mute settings atomically and ensured receiver shutdown also closes incomplete TLS handshakes. Mac packaging stages outside synced Documents folders to avoid Finder-metadata signing failures and creates an ad-hoc-signed ZIP for personal use. CI and Windows output paths agree again.

## Verification results

| Check                                                                                                     | Result                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| TypeScript and Next route types                                                                           | Passed                                    |
| Unit/integration tests                                                                                    | 23 passed, 0 failed                       |
| Production Next.js export                                                                                 | Passed                                    |
| Synthetic browser microphone through receiver and playback                                                | Passed                                    |
| Mute, backend restart, reconnect preserving mute, deliberate disconnect                                   | Passed                                    |
| Real generated QR decoded with Apple Vision on Mac and compared with receiver endpoint/credentials        | Passed                                    |
| Unsigned generic-iPhone Xcode build, including scanner and local audio plugin                             | BUILD SUCCEEDED                           |
| iOS English/German/Russian permissions and single opaque icon asset                                       | Included in generated project             |
| Mac ZIP packaging and deep signature verification after extraction                                        | Passed                                    |
| Packaged Mac launch with its own backend and functional output-panel navigation                           | Passed                                    |
| English/German/Russian UI, light/dark themes, 320/390/1240-pixel layouts, invalid manual pairing feedback | Checked; narrow-screen overflow corrected |
| Physical iPhone camera, audio, lock-screen endurance, Wi-Fi roaming, microphone interruptions             | **NOT DEVICE-TESTED**                     |
| Windows installer, physical routing devices, and system-wide input                                        | **NOT DEVICE-TESTED** on this Mac         |

The historical phone freeze is not claimed resolved on hardware: the identified blocking/race hazards and protocol failures are corrected, but a device run is still necessary. No measured end-to-end latency or simultaneous microphone use with other iPhone apps is claimed. Discord/OBS/games still require a separately installed virtual audio device. Bare-IP pairing cannot replace the token and pinned certificate supplied by the pairing link. Bluetooth, Wi-Fi Direct, USB, and Android remain unsupported. The Mac archive is for local personal use and is not notarized for public distribution.
