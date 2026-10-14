# LAB Replay — local pilot

Standalone app in its own repository. Shares a local portfolio API with the LAB member app. The service roster is a snapshot of the other app's synthetic member IDs, families and coaches.

```
npm install
npm run dev            # app on 5180
npm run service        # local portfolio service on 5182
npm test               # domain, workflow, runs, access and design-system guards
npm run build          # checks design drift first
npm run format         # Prettier, same config as the member app
npm run design:sync    # copy design-system files from the member app
```

The UI is built from the member app's design system; see DESIGN.md. The code before this rebuild is kept in `design-v1-backup/`.

Open http://127.0.0.1:5180. On phones, use a trusted HTTPS host for direct camera access; plain LAN HTTP cannot provide camera permission. Importing a phone-recorded video is also supported. Actual iOS hardware testing is still required.

Run `npm run dev` and `npm run service` in separate terminals. The service requires Node 24 (SQLite), ffmpeg and ffprobe on PATH. Both apps proxy `/replay-api` to port 5182. The service binds to loopback and is a local demonstration, not a production authentication system. In the other LAB app, sign in with a demo family and choose **Portfolio**.

## A coach's day

1. **Who's coaching.** The app opens on a list of coaches. The choice is kept on the device until **Switch coach** in the account menu. With the service running, picking a coach connects the roster and the shared features; without it, the bundled demo roster (`src/demo-roster.json`) is used and everything stays on the device.
2. **Floor.** The home screen. **In the gym** at the top holds today's kids (Add kids / Edit opens a searchable sheet). With the service, the list is shared by every coach for the day (`/here`); without it, it's kept on the device per day. Tap a kid to make them up next; tap again to clear. Below: **Record** (named for the kid up next), **Timed course**, a banner when takes are waiting for a kid, and today's takes.
3. **Camera.** Record and Timed course open a full-screen camera. The top bar has Close, the kid (tap to change, or record with no kid), and Capture settings. Record mode films until Stop. Timed course needs a kid and a saved course and runs the live timer (below). After a recording: **Keep** or **Retake**. Keep saves the take and shows **Saved** with the next kids in the gym as one-tap chips, **Record another**, **Open take** and **Done**. The camera stays open between recordings. The phone's back button closes it.
4. **Takes.** Every recording, filtered **To assign**, **To check**, **Analyzed** or **All**. A take with no kid has an **Assign** button that opens the kid picker.
5. **A take** has four tabs: **Watch** (player, clip, the analysis card, key frames, side by side), **Course** (course name, course map, scored attempt, member progress), **Coach** (assessment, what went well, next cue) and **Share** (portfolio clip, message the family, files). A header shows the kid, the course and five stages: Kid, Checked, Analyzed, Coached, Shared. Edits stay in a draft until **Save** on the save bar.

## Checking before analysis

A new take is a **Raw recording**. To send it for analysis the coach trims the clip and ticks three boxes (trimmed to the run; the kid in frame start to finish; steady and close enough to judge form), then **Mark as checked**. Moving the clip afterwards makes it raw again. **Send for analysis…** opens a confirmation that shows the clip length, how many clips this device sent in the last 7 days, and where it runs, with **Send the N.Ns clip** and **Not now**. A kid must be assigned first. Browser jobs run one at a time; a sent clip can be cancelled while it waits or runs.

## Course-to-portfolio workflow

1. On the Course tab, name the course and trace numbered points on the gym layout. Label obstacles, link points to playhead timestamps and save reusable courses. Imported replacement layouts also work. The map is attached to the take as a versioned snapshot.
2. Score the attempt on the Course tab, check and send the clip for analysis on Watch, and write the assessment and cue on Coach.
3. **Prepare portfolio clip** (Share tab) uploads the original and asks the local CPU renderer to encode only the selected interval into H.264 MP4 with a course-map inset. Output is silent. Originals are deleted after the render attempt; prepared MP4s and snapshots persist in `data/`. Prepare stays disabled until the checks above it pass.
4. Preview the clip, then **Publish to member portfolio**. The LAB app reads published reviews through the service, scoped by member ID and family membership. Reviews include the clip, course route, coach assessment, cue and selected key frames.
5. **Withdraw from portfolio** blocks later member reads. Already downloaded copies cannot be recalled. Preparing updated output creates a new snapshot rather than changing a published review.

`server/roster.json` contains synthetic data exported from the other app. Demo sessions are issued by known demo phone number without verification, mirroring the existing app's demo boundary. Production needs a shared verified identity provider, real roster synchronization, HTTPS routing, resumable private storage, retention controls and deployed workers before real member use. No cloud services or GPUs are provisioned.

## Working features

- Full-screen camera (audio off): record, timed course, keep, retake; import video from the Floor.
- Local video library in IndexedDB with kid, course and a thumbnail per take.
- Video playback, speed, 0.1-second seek, selected clip looping.
- Clip boundary selection, the check gate and confirmed analysis sends.
- Persistent queue; cancel; duplicate protection; interrupted jobs become failed and need a new send.
- Browser MediaPipe inference in a worker, only within the sent interval. About 2 frames/second, at most about 600 samples. This is sparse review assistance, not high-speed movement grading.
- Tracking coverage and sampled frames; manual key frames with notes.
- Coach assessment, strengths, next cue; self-contained HTML review export and original video download.

Browser storage is not a backup and may be evicted or cleared. Export important originals and reports. Published outputs use shared disk/SQLite storage; original drafts and reusable course templates are device-local. No production identity, original-video cross-device sync, remote GPU submission, automatic course segmentation, calibrated biomechanics or automatic performance grading is implemented. A saved HTML report includes selected stills and notes, not the original video.

## Analysis assets

The model and WASM assets are served locally from public/models. WASM files come from @mediapipe/tasks-vision 0.10.32. Pose model source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task . Retain third-party notices and verify model redistribution terms before public distribution. MediaPipe source code is Apache-2.0. Work Sans is fetched from Google Fonts; self-host with its license before an offline deployment.

## Next delivery

1. Replace demo sessions and the roster snapshot with shared verified accounts and roster synchronization; deploy private storage and resumable uploads.
2. Server-enforced submission queue and job cancellation; onsite/remote worker adapter described in WORKER-CONTRACT.md.
3. Extend the course route with obstacle segments and rubric-specific grading; validate models with coach-labelled footage.
4. Drawing tools on frames and comparisons.

Browser jobs start only when a coach sends a checked clip, one at a time. Onsite/remote choices save exportable manifests only; they do not upload recordings or rent compute.

## Verification

Browser suites use Chrome's fake camera and `test-results/sample.mp4` (a four-second FFmpeg test pattern), with the apps on 5180/5173 and the service on 5182. Screenshots go to ignored `test-results/`.

| Command | Covers |
|---|---|
| `npm run e2e:coach` | The coach's day at phone and desktop sizes: the gate, the shared gym list on a second coach's phone, recording three kids without leaving the camera, a take with no kid assigned from Takes, the check gate, the send confirmation, a timed course, the back button, Switch coach. Prints each screen's height in screens. |
| `npm run e2e:pages` | Every screen at 320, 390, 820, 1024, 1280 and 1366 wide: sideways overflow, squeezed or faded blocks, console errors. |
| `npm run e2e:overlay` | The live overlay, frames pulled from the saved recording (burned-in timer and result card), a plain recording, and a rendered portfolio clip's clock. |
| `npm run e2e:compare` | Side by side at three sizes. |
| `npm run e2e:leaderboard` | Two coach devices and a parent: live updates, an offline save shared on reconnect, name hiding. |
| `npm run e2e:team` | A coach tablet running three athletes on the camera while a desktop and a phone watch the spectator link. |
| `npm run e2e:messages` | Replay on a phone and the LAB app on a desktop: send a run from a take, reply, unread count, kid view, delete, another family. |
| `npm run e2e:attempt` | Attempt validation, persistence, corrections and widths. |
| `npm run e2e:portfolio` | Import, assign, map, attempt, coaching, check and send, render, publish, family playback, isolation, withdrawal. Confirms the output MP4 is exactly two seconds. This validates plumbing, not movement grading accuracy. |
| `npm run e2e:hosted` | A hosted build (`BASE=<url>`): the gate with the bundled roster, assets from the sub-path, the device-only gym list, a recording with the burned-in timer, and pose analysis of a checked clip. |

Real iOS and representative gym footage remain required for pilot acceptance.

## Hosted copy for phones

https://willwwest.github.io/lab-replay-app/ is a public build on GitHub Pages, published from `Willwwest/lab-replay-app` by `npm run publish:pages` (it copies the app only; recorded videos in `data/`, test output and the design backup stay here) and built by `scripts/pages.yml`. It's served over HTTPS, so phones allow the camera. It has no Replay service: the coach list and kids come from the bundled demo roster, the gym list, takes, timing, analysis and side by side keep their data on the phone, and Board and Messages say they need the service.

## Live run timer

**Timed course** on the camera times a course as it happens. Capture settings hold the course, an optional time cap, the fail limit, the 3-2-1 countdown, the timer on the video, sound cues and vibration; changing a rule resets the run that's set up. Mark each obstacle **Pass** or **Fail** with the big keys, with Skip, Undo and End run below, or the keyboard (P or Space, F, S, U to undo, Esc to end). The run ends on the last obstacle, at the cap (the screen turns gold ten seconds before), at the fail limit, or when ended. The HUD shows pace against the kid's best clean run on that course.

The done card lets the coach correct any obstacle before keeping. A kept run saves a take whose attempt and course-map timestamps are filled in, and the attempt is shared. Sound cues use Web Audio; vibration works where the browser supports it (not iPhone Safari); the screen stays awake where Wake Lock is supported.

**Timer on the video** puts the clock, the obstacle and a flash for each mark over the live camera picture and burns the same overlay into the recording: each camera frame is drawn onto a canvas with the timer, and the canvas is what's recorded. The recording runs a second past the finish so it ends on the result card (half a second without the overlay, so the encoder can flush the last frames). Browsers that can't record a canvas record the plain camera. Portfolio clips get a clock and obstacle labels drawn on by the service with ffmpeg (`server/overlay.js`), except for takes whose timer is already in the picture. Labels are reduced to safe characters before they reach ffmpeg. `src/runs.test.js` covers the run rules.

## Side by side

**Side by side** at the bottom of a take's Watch tab plays the open take (A) with another take (B). The suggestion is the kid's fastest clean run of the same course; any take can be picked, and a run by another kid is marked **Head to head**. Runs of the same course line up at any obstacle both attempts timed (the first one by default), otherwise at each clip's start. One transport drives both: play, a shared scrubber, ±0.1s steps and ¼×/½×/1× speed. B is kept within about two frames of where A says it should be and holds its first or last frame outside its own video. **Nudge B** shifts it in tenths when a split was tapped late. **Ghost** lays B over A at an adjustable opacity. The obstacle-time table shows A minus B per obstacle and for the whole run, in words ("0.7s slower"). **Save as key frame** stores both frames side by side, captioned, as a key frame on A. Earlier attempts on the Course tab have a **Side by side** button that opens that take on Watch. `src/compare.test.js` covers the alignment math.

## Shared runs, leaderboards, team runs and messages

These use the local service (`npm run service`), so they work across devices once a coach is picked.

- **Shared runs.** Every saved attempt with a roster kid (a timed run or a scored video) is sent to the service. If the service is down the attempt stays on the device, marked unsynced, and is sent the next time the roster connects. The service works out whether a run was clean itself.
- **Leaderboard** (Board tab). Each kid's best clean run on a course, this week, this month or all time, refreshed every 10 seconds; the kid up next on the Floor is marked. Families see the same board in the LAB app's Training block with their own kid by name and every other kid as "LAB ninja" and a time: the service leaves the names out.
- **Team runs** (Board tab, *Team run*). Pick a course and athletes in running order, then start each athlete's run: it opens the camera on the team's course with that kid. The camera reports the runner, the marks and the start (in service time, so every clock agrees); closing the camera takes the runner off course; kept runs join the standings, best clean run first. **Copy spectator link** gives `?team=CODE`, a full-screen view for a TV or tablet with the runner on course, the live clock, a dot per obstacle, and the standings, updated every second. Families with a kid in the team can read it, with other kids unnamed; other families can't.
- **Messages** (Messages tab). One thread per kid, between any coach and that kid's family. **Write** on a take's Share tab opens the thread with the take's run attached. Families read and reply on the LAB app's Portfolio page; kids read only. Unread counts show in the tab bar. Authors can delete their own messages; coaches can delete any. Names come from the roster, never from what a client sends.
- **Gym list.** `GET /here?date=` and `POST /here` hold who's in the gym per day, for staff only.

Service routes (all need a session): `POST/GET /runs`, `DELETE /runs/:id`, `GET /courses`, `GET /leaderboard?course=&period=week|month|all`, `POST/GET /teams`, `GET /teams/:idOrCode`, `POST /teams/:id/live|result|close`, `GET /threads`, `GET/POST /threads/:member`, `DELETE /threads/:member/:messageId`, `GET/POST /here`. Writes to runs, teams and the gym list are coach-only; every read is scoped to the account's members. Rules live in `server/runs.js`, `server/teams.js`, `server/messages.js` and `server/here.js`, each with tests.

## Course attempts

Each take can hold one coach-scored attempt: ordered course obstacles, named skills, pass/fail/skip, and optional source-video timing. Save attempt explicitly; corrections replace the take's existing record. Member progress compares the same ordered labels, skills and map positions, and only fully passed attempts count for best time. Attempt drafts and history live in IndexedDB on this device; published snapshots travel through the shared service to the family's LAB portfolio. No attempt action starts analysis. Changing kid, clip or course after saving requires updating the attempt before preparing output.
