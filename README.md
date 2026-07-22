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
- Read at most 10 documents per podcast with document-by-document extraction progress.
- Receive an MP3 and a companion folder containing the exact LLM inputs and outputs without
  modifying Zotero items.

## Install

1. Download `zotero-podcast.xpi` from a release.
2. In Zotero 9, open **Tools → Plugins**, choose **Install Plugin From File**, and select the XPI.
3. Open **Settings → Zotero Podcast**, save an OpenAI API key, and choose a writable output folder.
4. Select items or a collection, right-click, and choose **Convert to podcast**.

Selected document text is sent to OpenAI only after Submit. The API key is stored with Mozilla's
credential manager. The API key is never logged. For process transparency, document contents are
saved locally in the generated `summarization_in.txt` file.

## Outputs

Each successful job writes exactly:

```text
YYYY-MM-DD_HHmmss_NAME_podcast/
  NAME.mp3
  summarization_in.txt
  summarization_out.txt
  transcription_in.txt
  transcription_out.txt
  costs.txt
```

The podcast folder is the only top-level artifact, and its sole MP3 is named after the project. The
process files use prominent separators and preserve every model call, including chunked
summarization, reduction, or transcript repair calls. They present prompts, settings, and model
values in a human-readable format rather than JSON notation. `costs.txt` compares predicted and
calculated actual costs for summarization, script generation, speech synthesis, and local output.
Temporary job data is removed on success, cancellation, and handled failures. The MP3 begins with an
actual podcast turn, without a prefixed AI disclosure.

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
