# Try Immersed on your iPhone with TestFlight

## Status

**Paused in favor of free Expo Go previews.** The TestFlight workflow is manual-only and does not run on code pushes. Apple Developer enrollment is not needed to use the current prototype through Expo Go.

The repository has a store-signed EAS build profile, automatic build-number increments, a build/upload command, and a GitHub workflow. **No EAS project, Apple signing credentials, App Store Connect record, TestFlight invitation, or successful signed build has been created in this session.** Expo CLI reports `Not logged in`; the GitHub connection previously rejected creation of `Somamill/immersed`. These account steps must be completed before this configuration can produce an installable app.

## One-time setup

### 1. Accounts and phone

- Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) or use an existing paid membership with access to App Store Connect. Accept any outstanding Apple agreements. Enrollment must be active before signing/distribution works.
- Create or use an [Expo account](https://expo.dev/signup). EAS Build runs the iOS compiler in the cloud; a Mac is not required. Build quotas, queue priority, and charges depend on the Expo plan.
- Install [TestFlight](https://apps.apple.com/app/testflight/id899247664) on the iPhone.
- Keep `com.somamill.immersed` as the bundle identifier unless your Apple team cannot register it. If it changes, update `app.json` before the first build and use the same identifier for the Apple app record.

### 2. Link Expo and prepare Apple signing

Use a trusted terminal for account authentication; do not paste passwords, two-factor codes, Expo tokens, or Apple private keys into chat or the repository. This can be done on a Windows/Linux/Mac computer with Node.js, or in an authenticated cloud terminal.

From the project folder:

```sh
npm ci
npx eas-cli@latest login
npx eas-cli@latest init
```

Initialize a new project under the intended Expo account. This writes the real EAS project ID into `app.json`; commit that change. No project ID is fabricated in this draft.

For a phone-only Expo login, the current CLI also supports `npx eas-cli@latest login --device --non-interactive`. It prints an Expo device-approval link and a request ID. Open the link on the iPhone, approve the session, then resume the request using the CLI's printed instructions (including its number-matching step if shown). This signs the cloud workspace in without entering an Expo password in chat. Start a new request if the link expires. Apple signing authentication is a separate step.

For the first build and upload, run:

```sh
npm run testflight
```

This runs `eas build --platform ios --profile production --auto-submit`. Follow the interactive prompts for the Apple Developer team, distribution certificate, provisioning profile, and App Store Connect app/submit credentials. Expo can manage signing credentials remotely. If you prefer to create the app record manually, use App Store Connect → Apps → + → New App, with the matching bundle identifier, primary language English, and a unique SKU such as `immersed-ios`.

When the App Store Connect record exists, find its numeric **Apple ID** under App Information. This is `ascAppId`, not the Apple login email, bundle identifier, or Apple Team ID. Add it to `eas.json` under `submit.production.ios.ascAppId` for repeatable CLI submissions. The CI workflow can also supply it using the `ASC_APP_ID` repository variable.

Set up an App Store Connect API key for unattended uploads:

```sh
npx eas-cli@latest credentials --platform ios
```

Choose the production profile, then **App Store Connect: Manage your API Key → Set up your project to use an API Key for EAS Submit**. Store the key in Expo's managed credential service. Run the first build/upload interactively and resolve any missing credentials before using CI.

If the build succeeded but the upload failed, submit that existing build by its EAS build ID instead of paying for a rebuild:

```sh
npx eas-cli@latest submit --platform ios --profile production --id YOUR_EAS_BUILD_ID
```

### 3. Install the first build

1. Wait for the EAS build and upload, then Apple's processing. Queue and processing times vary.
2. In [App Store Connect](https://appstoreconnect.apple.com/), open Immersed → TestFlight. Resolve any Missing Compliance/export questions based on the app's actual encryption usage.
3. Create an **Internal Testing** group, for example `My iPhone`. Add your own eligible App Store Connect account as a tester; the account owner can test their own app. Enable automatic distribution for future builds in that group, if offered.
4. Accept the invitation on the iPhone and install through TestFlight. No public App Store listing is needed. Internal testing avoids external Beta App Review; external testers may require review.
5. Enable automatic updates for Immersed in TestFlight, or tap Update when a new build appears. Updates can be delayed by iOS scheduling; manual Update is available when processed. TestFlight builds expire after 90 days.

Test the actual phone experience: Japanese speech (Silent Mode off), word lookup pausing playback, save/relaunch persistence, and sentence controls. Browser tests and an iOS bundle export do not prove native signing or on-device behavior.

## Every update after setup

### Directly from this cloud project

With Expo authentication and managed Apple credentials available, run `npm run testflight` after checks pass. It uploads a snapshot from the cloud folder to EAS without requiring GitHub or a Mac. The remote build number increments automatically.

### Manually from GitHub Actions (optional paid-membership route)

1. Create an empty private repository and push this project. The earlier connection could not create repositories; do not assume it has been published.
2. Commit the linked `app.json` from `eas init` and ensure the first interactive build/upload worked.
3. In the repository's Actions secrets, add `EXPO_TOKEN` from your [Expo personal access tokens](https://expo.dev/settings/access-tokens). Use a token with access to the owning Expo project.
4. Add an Actions **variable** `ASC_APP_ID` with the numeric App Store Connect Apple ID. API keys and signing credentials stay managed by EAS.
5. Push app changes, then select Actions → **Send iPhone update to TestFlight** → Run workflow. It checks lint and types, then queues a cloud build with automatic upload. Pushes alone do not trigger it.
6. Follow the Expo build/submission links in Actions, then open TestFlight once Apple finishes processing. CI success here means **queued**, not delivered.

Each manual run triggers a full native build and may consume build quota. If you later choose automatic paid-membership distribution, a push trigger can be added after account setup.

The current simple pipeline rebuilds for every update. Later, EAS Update could deliver compatible JavaScript/content changes to an installed build more quickly. It is **not enabled** here. Native modules and native configuration changes always need a new binary; over-the-air updates cannot bypass Apple's applicable rules.

## Official references

- [Expo TestFlight guide](https://docs.expo.dev/submit/testflight/)
- [Expo iOS submission and managed API key setup](https://docs.expo.dev/submit/ios/)
- [Build version management](https://docs.expo.dev/build-reference/app-versions/)
- [CI prerequisites](https://docs.expo.dev/build/building-on-ci/)
