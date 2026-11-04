# Linden local speech OpenCode plugin

The plugin owns native whisper.cpp execution, model downloads and persisted resource state. OpenCode provides plugin installation, updates, removal, activation and RPC. The existing Linden recorder and audio preparation remain in the host; canonical mono 16 kHz PCM crosses `linden.speech` RPC. No legacy module manager is activated.

Build with `LINDEN_SPEECH_BINARY=/absolute/path/to/whisper-cli bun run build`. Supply a binary built for the current platform. The validated distribution currently contains Linux x64 only; other platforms require their own native build and verification. Models are downloaded from pinned official Hugging Face resources and verified before activation; they are not included in Git.

Use `dist` as a built local import directory or publish its contents at the root of the `linden-ai/opencode-plugins/local-speech/latest` Git branch. The official catalog is maintained on the main branch. The plugin version is 0.0.1. This source change also requires an updated Linden client to expose speech RPC and the management panel.

Resources live under the engine XDG data directory, `opencode/linden-plugin-resources/local-speech`. Plugin removal detaches the plugin and disables dependent applications; model resources remain available for reinstall. Delete individual resources through Manage before removal if desired. Engine disposal aborts active transcription and downloads.

Validation: `bun test test/integration.test.ts` runs the actual compiled OpenCode engine, installs from an isolated Git repository, downloads the official 190 MB Small Q5 model, transcribes JFK audio, cancels active transcription and resource download, checks/installs an update, verifies model persistence, and removes the plugin. It uses temporary XDG directories and does not populate the user's production profile. Internet access and the built Linux engine/Whisper binaries are required. Browser visual checks use fixtures; live microphone capture is not exercised by this test.
