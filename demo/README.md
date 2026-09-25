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
