This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building and distributing with Xcode

Use local native generation followed by Xcode archives and Apple TestFlight. Do not use EAS Build, EAS Submit, hosted JavaScript updates, Expo account project IDs, or Expo Go preview links. Native Expo SDK dependencies remain local build/runtime dependencies until deliberately replaced.

Set `EXPO_OFFLINE=1` and `EXPO_NO_TELEMETRY=1` for local generation and CI. Use the app's `scripts/build-store.sh` for iOS, Mac Catalyst and simulator builds. Signing credentials belong in secure local storage or an approved GitHub release environment, never in source files. See the Store release guide for the required variables.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Version history required by the user

For every user-facing update, run `npm run version:update -- patch --title "..." --note "..."` (or minor/major as appropriate). It updates package/app/lockfile versions, the in-app history, and CHANGELOG.md together. Include important unresolved limitations in the notes. Run `npm run version:check` with the normal checks, commit the update, tag it `v<version>`, and push main plus the new tag to the user's authorized `origin`. The release workflow publishes matching GitHub Release notes. Preserve remote edits and never force-push. Do not create a new version for documentation-only fixes unless they constitute a user-facing update.

<!-- required-agent-tools:start -->
## Required design and video tools

Read `.agent-tools/policy.md` for UI or video work. Use **Impeccable** and **Hallmark** for UI design and review, and **Hyperframes** for video creation. If missing, run `python3 .agent-tools/setup.py` (add `--browser` for rendered Hallmark checks). Tools install globally for Codex; app runtime dependencies stay separate. Invoke checks through `.agent-tools/run.py`. Respect existing project design rules; dot. apps use the shared brand kit. Report checks actually run and any limitations.
<!-- required-agent-tools:end -->
