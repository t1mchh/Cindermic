# Cindermic

A personal microphone app built with Next.js, a local Node.js backend, and optional Electron and iOS wrappers.

## Develop on your Mac

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Both the frontend and backend start together and reload when their source changes.

1. Press **Start mic** and allow microphone access.
2. Speak and check the input meter. Audio passes through the browser capture worklet and the real backend receiver.
3. Open **Audio output**, choose headphones or your system default, and press **Enable output**.
4. Test mute and disconnect from the microphone screen.

Use headphones for listening tests to avoid feedback. Audio output starts disabled. You do not need an iPhone or Xcode for this workflow.

The language selector supports English, German, and Russian. Your choice and theme are saved on each device. Edit translations in `src/i18n/`; permission prompts follow the iPhone’s app/system language.

## Commands

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Develop frontend and backend together                       |
| `npm run build`        | Export the frontend to `out/`                               |
| `npm start`            | Serve the production build with the local backend           |
| `npm run desktop`      | Build and open the Electron desktop app                     |
| `npm run check`        | Check TypeScript                                            |
| `npm test`             | Run backend, protocol, and playback-buffer tests            |
| `npm run test:audio`   | Run the full browser audio test with a synthetic microphone |
| `npm run format`       | Format source files                                         |
| `npm run ios`          | Build, sync the iOS project, and open Xcode                 |
| `npm run ios:sync`     | Build and sync the iOS project without opening Xcode        |
| `npm run ios:build`    | Generate and compile the iOS project without signing        |
| `npm run android`      | Sync and open the Android project in Android Studio         |
| `npm run android:build`| Build a debug APK                                            |
| `npm run dist:mac`     | Package the Mac desktop app                                 |
| `npm run dist:win`     | Build a Windows installer on Windows                        |
| `npm run dist:win:zip` | Build a portable Windows ZIP                                |

`npm run build` does not run Xcode or touch an iPhone.

## Source layout

```text
src/
  app/          Next.js entry points
  components/   Interface panels and dialogs
  hooks/        App state and audio lifecycle
  i18n/         English, German, Russian dictionaries and saved language
  lib/          Browser capture, playback, and platform bridges
  styles/       Theme, desktop layout, and responsive styles
server/         Local HTTP API, WebSocket control, and audio receiver
shared/         Audio protocol constants and helpers
desktop/        Electron window and backend startup
native/audio/   Local Capacitor plugin for native iPhone audio
native/locales/ iOS microphone and network permission translations
scripts/        iOS generation and asset tooling
tests/          Unit, integration, and browser audio tests
docs/           Architecture and testing notes
```

Generated files live in `out/`, `.next/`, `ios/`, and `release/`. Pairing credentials and local settings live in `.local/` for the standalone backend, or Electron's user-data directory for the desktop app. These directories are ignored by Git.

## Move to Xcode

Once the Mac workflow is ready:

```sh
npm run ios
```

This exports the same Next.js interface, creates a standard Capacitor iOS project if necessary, syncs the local Swift audio plugin, and opens Xcode. Choose **App → Signing & Capabilities → Team**, select your connected iPhone as the run destination, and press **Run**. The project requires iOS 17 or newer. For a compile check without signing or installing, run `npm run ios:build`.

Make interface changes in `src/`, native audio changes in `native/audio/`, then run `npm run ios` again. The generated `ios/` project is not the source of truth. The sync script adds microphone, local-network, and background-audio settings without installing or launching the app on a device.

**Important for mobile builds:** The iOS icon generation and app build require running outside macOS sandbox (the `sips` command is blocked in sandbox). To build iOS apps, run from Terminal outside Claude Code's sandbox:
```sh
# First, install Android support (for both platforms)
npm install @capacitor/android

# Generate iOS icons (requires sips access)
node scripts/generate-ios-icons.mjs

# Or use the main setup script
node scripts/ios.mjs open
```

### Android setup (optional)
To build Android apps, first install the Android platform:
```sh
npm install @capacitor/android
npm run android:sync
```
Then open Android Studio with `npm run android` and build from there.

iOS uses a pasted desktop pairing link for now. The QR code is also displayed for a future camera-scanning flow. Native microphone capture, locked-screen behavior, and interruption recovery still require device validation; generating an Xcode project does not validate them. iOS may interrupt capture when another app records audio.

## Other applications

To appear as a microphone in Discord, OBS, or games, route Cindermic into a separately installed virtual audio device. The application does not install a system driver. On Windows with VB-CABLE, play to **CABLE Input** and select **CABLE Output** as the microphone in the target app.

## Connection scope

The web UI and control API use loopback HTTP on port 43130. The phone audio receiver uses TLS on port 43129. The development frontend uses port 3000. No account, subscription, cloud relay, or telemetry is required.

Reconnection uses bounded backoff and preserves mute. Intentional disconnect stops retries. A changed desktop IP address requires a new pairing link. Bluetooth, Wi-Fi Direct, USB, and a custom virtual microphone driver are not implemented.

See [architecture](docs/architecture.md) for module boundaries and [testing](docs/testing.md) for the verification workflow. No open-source license has been selected; the project is currently marked private and unlicensed.
