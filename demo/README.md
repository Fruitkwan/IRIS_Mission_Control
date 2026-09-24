# IRIS Doctor demo recording

The recording script drives the real local portal and produces a captioned WebM
and MP4 in this directory. It signs in before recording, so credentials are not
shown in the video. It requires the audit master switch to be enabled and the
`%System/%Login/Login` event to be disabled. After filming the remediation, it
restores that event to its original disabled state, including when a later step
fails.

With the Docker stack running, set `IRIS_USER` and `IRIS_PASSWORD` in your shell,
then run `cd frontend && npm run record:demo`. The script uses
`http://localhost:52773` by default; set `IRISOPS_URL` to use a different local
instance. FFmpeg must be on `PATH` to produce the MP4. The script will leave the
raw WebM available if conversion fails.

Review the final video before publishing it. The recording is silent and the
results reflect the actual state of the instance at recording time.
