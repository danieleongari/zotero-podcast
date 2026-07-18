# Zotero Podcast

[![CI](https://github.com/danieleongari/zotero-podcast/actions/workflows/ci.yml/badge.svg)](https://github.com/danieleongari/zotero-podcast/actions/workflows/ci.yml)
[![Release](https://github.com/danieleongari/zotero-podcast/actions/workflows/release-please.yml/badge.svg)](https://github.com/danieleongari/zotero-podcast/actions/workflows/release-please.yml)

Zotero Podcast is a Zotero 9 add-on that turns selected documents or recursive collections into an
English, multi-voice podcast using OpenAI. It is inspired by
[VoiceMyDocs](https://github.com/danieleongari/voicemydocs).

## Features

- Convert selected Zotero items, standalone attachments, or nested collections from the context
  menu.
- Read all extractable PDF, EPUB, HTML, and snapshot attachments through Zotero's full-text cache.
- Choose one of three built-in formats or save custom prompts, models, duration, speakers, and
  voices.
- Review an itemized cost estimate before submitting.
- Continue using Zotero while a single background job reports progress and supports cancellation.
- Receive an MP3, a source-aware summary, and a cited dialogue transcript without modifying Zotero
  items.

## Install

1. Download `zotero-podcast.xpi` from a release.
2. In Zotero 9, open **Tools → Plugins**, choose **Install Plugin From File**, and select the XPI.
3. Open **Settings → Zotero Podcast**, save an OpenAI API key, and choose a writable output folder.
4. Select items or a collection, right-click, and choose **Convert to podcast**.

Selected document text is sent to OpenAI only after Submit. The API key is stored with Mozilla's
credential manager. Document contents and credentials are not logged.

## Outputs

Each successful job writes exactly:

```text
YYYY-MM-DD_HHmmss_NAME_podcast.mp3
YYYY-MM-DD_HHmmss_NAME_summary.txt
YYYY-MM-DD_HHmmss_NAME_transcript.txt
```

Temporary job data is removed on success, cancellation, and handled failures. The MP3 and transcript
begin with an AI-generated-audio disclosure.

## Development

Node.js 24 is recommended.

```bash
npm install
npm test
npm run lint:check
npm run build
```

The release build appears in `.scaffold/build/zotero-podcast.xpi`, accompanied by `update.json`.
`npm run test:zotero` runs scaffold-hosted Zotero tests when a compatible Zotero test environment is
available.

## Releases

Release Please maintains the version, changelog, tag, and GitHub release from conventional commits.
Merge its release pull request to publish a release. The release workflow builds the tagged source,
validates the manifest version and SHA-512 update hash, and attaches `zotero-podcast.xpi` and
`update.json` to the GitHub release.

No custom repository secret is required. A published release can also be rebuilt from **Actions →
Publish release artifacts → Run workflow** by entering its `vX.Y.Z` tag.

## Models and costs

The initial model and price registry is dated 2026-07-18. Cost values shown by the add-on are
estimates; OpenAI billing is authoritative. Update `src/pricing.ts` and its tests when prices change.

## License

Zotero Podcast is licensed under AGPL-3.0-or-later. The bundled MP3 encoder is
`@breezystack/lamejs`, used unmodified under LGPL-3.0; see `THIRD_PARTY_NOTICES.md`.
