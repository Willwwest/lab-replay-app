# LAB Replay — local pilot

Standalone app in its own repository. Shares a local portfolio API with the LAB member app. The service roster is a snapshot of the other app's synthetic member IDs, families and coaches.

```
npm install
npm run dev            # app on 5180
npm run service        # local portfolio service on 5182
npm test               # domain, workflow, access and design-system guards
npm run build          # checks design drift first
npm run format         # Prettier, same config as the member app
npm run design:sync    # copy design-system files from the member app
```

The UI is built from the member app's design system; see DESIGN.md. The code before this rebuild is kept in `design-v1-backup/`.

Open http://127.0.0.1:5180. On phones, use a trusted HTTPS host for direct camera access; plain LAN HTTP cannot provide camera permission. Importing a phone-recorded video is also supported. Review layout supports phones, tablets and computers; actual iOS hardware testing is still required.

Run `npm run dev` and `npm run service` in separate terminals. Service requires Node 24 (SQLite), ffmpeg and ffprobe on PATH. Both apps proxy `/replay-api` to port 5182. The service binds to loopback and is a local demonstration, not a production authentication system. In Replay, open the coach chip at the top right and pick a demo coach. In the other LAB app, sign in with a demo family and choose **Portfolio**.

## Course-to-portfolio workflow

1. Pick a member in the session library, then record or import a take; it's assigned to that member. Original drafts remain local in IndexedDB.
2. In Course map, trace numbered points on the user-supplied gym layout. Label obstacles, link points to playhead timestamps and save reusable courses. Imported replacement layouts also work. The map preserves proportions and is attached to the take as a versioned snapshot.
3. Set the clip and request analysis, then start it under Requests. Complete the coach assessment and next-attempt cue. Edits to a take stay in a draft until you choose Save on the save bar; requesting analysis, saving an attempt and preparing a clip save it first. The hero's Next step card names what the take still needs, and the portfolio card keeps Prepare disabled until the checks pass.
4. **Prepare portfolio clip** explicitly uploads the original and asks the local CPU renderer to encode only the selected interval into H.264 MP4 with a course-map inset. Output is silent. Originals are deleted after the render attempt; prepared MP4s and snapshots persist in `data/`.
5. Preview the rendered clip, then **Publish to member portfolio**. The LAB app reads published reviews through the service, scoped by member ID and family membership. Reviews include the clip, course route, coach assessment, cue and selected key frames.
6. **Withdraw from portfolio** blocks subsequent member reads. Already downloaded copies cannot be recalled. Preparing updated output creates a new snapshot rather than mutating a published review.

`server/roster.json` contains synthetic data exported from the other app. Demo sessions are issued by known demo phone number without verification, mirroring the existing app's demo boundary. Production needs a shared verified identity provider, real roster synchronization, HTTPS routing, resumable private storage, retention controls and deployed workers before real member use. No cloud services or GPUs are provisioned.

## Working features

- Record (audio off), keep, discard, restart; import video.
- Local video library in IndexedDB with member/course context.
- Video playback, speed, 0.1-second seek, selected clip looping.
- Clip boundary selection and explicit analysis requests.
- Persistent queue; start/cancel; duplicate protection; interrupted jobs become failed and require a new request.
- Browser MediaPipe inference in a worker, only within the requested interval. Approximately 2 frames/second, at most about 600 samples. This is sparse review assistance, not high-speed movement grading.
- Tracking coverage and sampled frames; manual key frames with notes.
- Coach assessment, strengths, next cue; self-contained HTML member review export and original video download.

Browser storage is not a backup and may be evicted or cleared. Export important originals and reports. Published outputs now use shared disk/SQLite storage; original drafts and reusable course templates are still device-local. No production identity, original-video cross-device sync, remote GPU submission, automatic course segmentation, calibrated biomechanics or automatic performance grading is implemented yet. A saved HTML report includes selected stills and notes, not the original video.

## Analysis assets

The model and WASM assets are served locally from public/models. WASM files come from @mediapipe/tasks-vision 0.10.32. Pose model source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task . Retain third-party notices and verify model redistribution terms before public distribution. MediaPipe source code is Apache-2.0. Work Sans is fetched from Google Fonts; self-host with its license before an offline deployment.

## Next delivery

1. Replace demo sessions and the roster snapshot with shared verified accounts and roster synchronization; deploy private storage and resumable uploads.
2. Server-enforced submission queue and job cancellation; onsite/remote worker adapter described in WORKER-CONTRACT.md.
3. Extend the course route with obstacle segments and rubric-specific grading; validate models with coach-labelled footage.
4. Side-by-side synchronized comparisons, drawing tools and member delivery.

The local pilot has no background auto-processing. Browser jobs start explicitly, one at a time. Onsite/remote choices save exportable manifests only; they do not upload recordings or rent compute.

## Verification

`npm run e2e:portfolio` (`scripts/portfolio-review.mjs`) exercises the roster, map drawing, real pose worker, analysis prerequisite, CPU clipping/map compositing, preview/publish, family-app playback, family isolation and withdrawal. It uses `test-results/sample.mp4` (four-second FFmpeg test pattern) and running apps on 5180/5173 plus service on 5182. Test output MP4 duration was confirmed as exactly two seconds. This validates plumbing, not movement grading accuracy. `npm run e2e:capture` covers the draft gate, save bar, real pose worker, cancellation and the camera (Chrome's fake device). `npm run e2e:pages` opens every screen at six widths and fails on sideways overflow, broken layout or console errors. `node --test server/access.test.js` checks permission scope and publication prerequisites. Screenshots are in ignored `test-results/`. Real iOS and representative gym footage remain required for pilot acceptance.

## Live run timer

**Run** times a course as it happens. Pick who's running and a saved course (or the open take's course, or **Quick run** for just a clock with laps), set an optional time cap and fail limit, then Go. Mark each obstacle **Pass**, **Fail** or **Skip** with the big keys, or the keyboard (P or Space, F, S, U to undo, Esc to end). The run ends on the last obstacle, at the cap (the screen turns gold ten seconds before), at the fail limit, or when stopped. The clock shows pace against the member's best clean run on that course.

The result screen lets the coach correct any obstacle before saving. Saved runs are attempts in the same store and shape as Review's, so member progress and personal bests include them. With **Film the run** on, the camera records from Go to the end and the run saves as a take whose attempt and course-map timestamps are already filled in; it opens in Review ready to coach. Sound cues use Web Audio; vibration works where the browser supports it (not iPhone Safari); the screen stays awake where Wake Lock is supported. Each saved course remembers the rules it was last run with.

**Timer on the video** (on by default when filming) puts the clock, the obstacle and a flash for each mark over the live camera picture and burns the same overlay into the recording: each camera frame is drawn onto a canvas with the timer, and the canvas is what's recorded. The recording runs a second past the finish so it ends on the result card (half a second without the overlay, so the encoder can flush the last frames). Browsers that can't record a canvas record the plain camera. Portfolio clips get a clock and obstacle labels drawn on by the service with ffmpeg (`server/overlay.js`), except for takes whose timer is already in the picture. Labels are reduced to safe characters before they reach ffmpeg. `npm run e2e:overlay` checks the live overlay, pulls frames out of the saved recording to confirm the burned-in timer and result card, checks the plain recording, and checks a rendered portfolio clip.

Verification: `npm run e2e:run` drives the countdown, tap and keyboard marks, corrections, time cap, fail limit, pace, a filmed run with Chrome's fake camera through to Review, and quick runs, at phone and desktop sizes. `src/runs.test.js` covers the run rules.

## Side by side

Review's **Side by side** section plays the open take (A) with another take (B). The suggestion is the member's fastest clean run of the same course; any take can be picked, and a run by another member is marked **Head to head**. Runs of the same course line up at any obstacle both attempts timed (the first one by default), otherwise at each clip's start. One transport drives both: play, a shared scrubber, ±0.1s steps and ¼×/½×/1× speed. B is kept within about two frames of where A says it should be and holds its first or last frame outside its own video. **Nudge B** shifts it in tenths when a split was tapped late. **Ghost** lays B over A at an adjustable opacity. The obstacle-time table shows A minus B per obstacle and for the whole run, in words ("0.7s slower"). **Save as key frame** stores both frames side by side, captioned, as a key frame on A, so it can go to the portfolio. Earlier attempts in Course attempt have a **Side by side** button that opens that take here.

Verification: `npm run e2e:compare` checks the suggestion, alignment, measured sync during playback, alignment changes, nudge, steps, the table, ghost mode, the saved still, head to head, the history shortcut and the empty state at phone, tablet and desktop sizes. `src/compare.test.js` covers the alignment math.

## Shared runs, leaderboards, team runs and messages

These use the local service (`npm run service`), so they work across devices once a coach is connected.

- **Shared runs.** Every saved attempt with a roster member (a timed run or a scored video) is sent to the service. If the service is down the attempt stays on the device, marked unsynced, and is sent the next time the roster connects. The service works out whether a run was clean itself.
- **Leaderboard** (Run tab). Each member's best clean run on a course, this week, this month or all time, refreshed every 10 seconds; the member picked for the next run is marked. Families see the same board in the LAB app's Training block with their own kid by name and every other kid as "LAB ninja" and a time: the service leaves the names out.
- **Team runs** (Run tab, *Team run*). Pick athletes in running order, a course and the rules, then run each athlete through the live screen. The live screen reports the runner, the marks and the start (in service time, so every clock agrees) as it goes; saved runs join the standings, best clean run first. **Copy spectator link** gives `?team=CODE`, a full screen view for a TV or tablet with the runner on course, the live clock, a dot per obstacle, and the standings, updated every second. Families with a kid in the team can read it, with other kids unnamed; other families can't.
- **Messages** (Messages tab). One thread per member, between any coach and that member's family. A coach can attach a shared run (**Send to family** on a recent run opens the thread with it attached). Families read and reply on the LAB app's Portfolio page; kids read only. Unread counts show in the tab bar. Authors can delete their own messages; coaches can delete any. Names come from the roster, never from what a client sends.

Service routes (all need a session): `POST/GET /runs`, `DELETE /runs/:id`, `GET /courses`, `GET /leaderboard?course=&period=week|month|all`, `POST/GET /teams`, `GET /teams/:idOrCode`, `POST /teams/:id/live|result|close`, `GET /threads`, `GET/POST /threads/:member`, `DELETE /threads/:member/:messageId`. Writes to runs and teams are coach-only; every read is scoped to the account's members. Rules live in `server/runs.js`, `server/teams.js` and `server/messages.js`, each with tests.

Verification: `npm run e2e:leaderboard` (two coach devices and a parent, live updates, an offline save shared on reconnect, name hiding), `npm run e2e:team` (a coach tablet running three athletes while a desktop and a phone watch the spectator link; live clock, marks, discard, fail limit, run again, access), `npm run e2e:messages` (Replay on a phone and the LAB app on a desktop: send a run with a note, reply, unread count, kid view, delete, another family).

## Course attempts
Each take can hold one coach-scored attempt: ordered course obstacles, named skills, pass/fail/skip, and optional source-video timing. Save attempt explicitly; corrections replace the take's existing record. Member progress compares the same ordered labels, skills and map positions, and only fully passed attempts qualify for best time. Attempt drafts and history live in IndexedDB on this device; published snapshots travel through the shared service to the family's LAB portfolio. No attempt action starts AI processing. Changing member, clip or course after saving requires updating the attempt before preparing output.

Verification: `npm run e2e:attempt` covers validation, persistence, corrections and responsive layouts; `npm run e2e:portfolio` covers the rendered, published attempt in the family app and access isolation.
