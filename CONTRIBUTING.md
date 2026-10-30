# Contributing to Immersed

Help make Japanese immersion comfortable on an iPhone. Useful contributions include reproducible playback bugs, native-speaker transcript review, accessibility checks, dictionary improvements and careful subtitle evaluation.

## Run the prototype

Use Node.js 24. Clone this repository, then:

```sh
npm ci
npm run language:setup
npm run context:setup
npm run preview
```

Open the link in Expo Go. The server must stay running for analysis and dictionary access. Python recognition dependencies and permitted audio acquisition are separate; see [development](docs/DEVELOPMENT.md). No account credentials or paid model API are required for dictionary or count-based context checks.

## Before a pull request

Explain the concrete problem, resulting behavior, and what you checked. Keep changes focused. Read [AGENTS.md](AGENTS.md) for version-specific Expo requirements.

```sh
npm run lint
npm run typecheck
npm run version:check
npm run test:server
npm run test:language
npm run test:e2e
```

Python changes also need the relevant tests in `tests/test_*.py`. Avoid changing imported app files while browser tests run: Metro hot reload can reset the app during a test.

## Improve Japanese accuracy

Use the subtitle issue template with a public video, timestamp, actual text and expected text. Distinguish speech-recognition errors from word segmentation, homophone choice, timing and dictionary senses. Do not add a correction table for individual example videos. Preserve names, negation, numbers, slang and uncommon valid language. Corpus frequency is not a reason on its own to rewrite what someone said.

The count-based evaluation uses held-out text with synthetic homophone mistakes. Report coverage, wrong suggestions and changes to clean input alongside successful recoveries. This is separate from speech error rates on real conversation recordings.

## Data and releases

Code is MIT licensed; third-party dictionaries, corpus data and models keep their own licenses. Preserve [credits](THIRD_PARTY.md), source revisions, checksums and attribution. Do not commit model weights, downloaded dictionaries, credentials or private recordings. User-facing releases update the version history and changelog together; maintainers publish tags and matching notes.
