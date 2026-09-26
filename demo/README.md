# IRIS Doctor demo recording

The recording script drives the real local portal and produces a captioned WebM
and MP4 in this directory. It signs in before recording, so credentials are not
shown in the video. It requires the audit master switch to be enabled. By
default, `%System/%Login/Login` must be disabled. If it is enabled and you
explicitly authorize temporary staging, set `IRISOPS_STAGE_DEMO=1` before
recording. The script restores the event to its original state afterward,
including when a later step fails.

With the Docker stack running, set `IRIS_USER` and `IRIS_PASSWORD` in your shell,
then run `cd frontend && npm run record:demo`. The script uses
`http://localhost:52773` by default; set `IRISOPS_URL` to use a different local
instance. FFmpeg must be on `PATH` to produce the MP4. The script will leave the
raw WebM available if conversion fails.

The extended recording calls MCP's `iris_get_health` before and after the fix
and shows Time Machine's automatically captured comparison. Set
`IRISOPS_MCP_URL` if MCP is not at `http://localhost:3333/mcp`.

Review the final video before publishing it. The recording is silent and the
results reflect the actual state of the instance at recording time.

## Four-minute narrated demo (no browser-extension time limit)

`VIDEO_SCRIPT.md` is the scene guide. The new recorder follows its journal
freeze-on-error story; it does not use the older login-auditing scenario above.
It signs in before video capture, records the real local portal for four minutes,
calls MCP, and produces an MP4 with an offline voiceover and selectable subtitles.

1. Run `pwsh -NoProfile -File demo/synthesize-voice.ps1` from the repository root.
   This produces `demo/irisops-voiceover.wav` from `VIDEO_TRANSCRIPT.md`.
2. Set `IRIS_USER` and `IRIS_PASSWORD` in your current shell (do not put them in
   the script or a committed file). Have IRIS and the MCP server running.
3. If `FreezeOnError` is already enabled, temporarily staging it as disabled
   requires explicit authorization. Only then set `IRISOPS_STAGE_JOURNAL=1`.
   The recorder restores it to enabled even after a recording failure.
4. Run `cd frontend; npm run record:full-demo`.

The saved file is `demo/irisops-full-demo-<timestamp>.mp4`; the raw WebM is
kept alongside it. Inspect the complete video and verify that the on-screen
state matches the narration before sharing it. The offline voice is synthetic;
you can replace its track with a polished HeyGen narration later.

If the local Kokoro API is running at `http://localhost:8880`, run
`node demo/kokoro-voiceover.mjs` from the repository root to generate a more
natural track and a `-kokoro.mp4` copy of the latest full demo. Set
`KOKORO_VOICE` to another installed voice if desired; the default is
`af_heart`. Pass an explicit MP4 path as the first argument to use another
recording. The script keeps video and subtitles unchanged.
