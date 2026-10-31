# Working on Cindermic

Run `npm run dev` and edit `src/` or `server/`. Both processes reload automatically. Build with `npm run build` before testing production behavior with `npm start`.

Keep UI components in `src/components/`, browser lifecycle code in `src/lib/`, and platform code in `native/audio/`. Shared protocol behavior belongs in `shared/`. Do not edit generated assets in `out/` or the generated Xcode project in `ios/`.

Run `npm run format`, `npm run check`, and the tests relevant to your change. Use `npm run test:audio` for changes to capture, transport, playback, mute, or reconnection. Comments should explain a non-obvious constraint rather than restating the code.

Never commit local pairing identities, certificates, or `.local/`. Use the README commands to regenerate native and packaged outputs.
