# LAB Replay design

Replay is a coach tool, so it uses the member app's coach-floor look: the floating app bar with pill navigation (an ink tab bar on phones), the gradient masthead with the dot field and outlined LEARN ADAPT BUILD, pastel stat tiles, white cards and one ink card per screen. The rules are the member app's `app/DESIGN-SYSTEM.md`; this file covers what Replay adds.

The app is organized around what a coach does on the gym floor: pick who's up, record, keep going. Reviewing, checking and sharing happen later, one take at a time, one tab at a time. No screen should need more than about three phone screens of scrolling.

## Files

| File | What it holds |
|---|---|
| `src/ds/` | Tokens, `tokens.js` and the components (`Section`, `Card`, `Field`, `Segmented`, `Tag`, `StatStrip`, `SaveBar`…). Copied byte for byte from the member app. |
| `src/DotField.jsx`, `src/dotfield.css` | The masthead's dot field. Copied from the member app. |
| `src/shell.css` | Base elements and the coach shell (app bar, nav, masthead, `.button`, stat tiles, menu, toast), ported from the member app's `styles.css`, `coachapp.css` and `coach.css`. Class names match the member app. |
| `src/coach.css` | The coach gate, page heads, stage chips, the Floor, In the gym, take cards, take tabs, the analysis card, sheets and kid rows. |
| `src/capture.css` | The full-screen camera: top bar, HUD, shutter, Pass/Fail keys, done and Saved cards. |
| `src/replay.css` | Player, clip, key frames, course map, attempt, portfolio. Classes start with `rp-`. |
| `src/board.css` | Leaderboard rows. |
| `src/compare.css` | Side by side. |
| `src/team.css` | Team runs: picker, panel, standings, spectator screen. |
| `src/messages.css` | Messages. |
| `src/ds.test.js` | The member app's guards, run by `npm test`. |
| `scripts/pages-e2e.mjs` | Every screen at 320, 390, 820, 1024, 1280 and 1366 wide: sideways overflow, squeezed or faded blocks, console errors, full-page shots. |
| `scripts/coach-e2e.mjs` | The coach's day, with each screen's height in phone screens. |

`npm run design:sync` copies the shared files from `../lab-skill-unlocks/app` (or `LAB_APP_DIR`); `npm run design:check` fails on drift and runs before every build. `shell.css` is a port, not a copy: when the member app's shell changes, port the change by hand.

## Screens

Routes are hash paths (`src/route.js`): `#/floor`, `#/takes`, `#/take/<id>/<tab>`, `#/board`, `#/messages`, `#/capture`. The browser's back button works throughout, and closes the camera.

- **Who's coaching** (`CoachGate.jsx`). Full-screen masthead with the logo and one large button per coach.
- **Floor** (`Floor.jsx`). The masthead greets the coach and holds the work: **In the gym** (a sideways row of kid chips, a radio group "Who's up"), the big cyan **Record** button named for the kid up next, **Timed course** beside it, and one line saying what happens with no kid picked. Under the masthead: the "takes to assign" banner and Today's takes.
- **Camera** (`CaptureScreen.jsx`). Full-screen black layer over the app. Top bar: close, the kid pill (avatar, name, course), settings. Bottom: the Record / Timed course switch, then a round shutter (salmon to start, a red square to stop). While timing, the clock and obstacle sit in a glass HUD at the top, with a cyan Pass key and a red Fail key at least 96px tall. After a recording the clip plays back on a card with Keep and Retake; after Keep, the Saved card offers the next kids as chips.
- **Sheets** (`Sheet.jsx`). Bottom sheets, up to 640px wide: the kid picker (search, In the gym, Everyone, and "No kid · assign later" when recording), the gym list editor, capture settings, the send confirmation.
- **Takes** (`Takes.jsx`). A `Segmented` filter with counts, then take cards: thumbnail, kid (or "No kid yet"), course and time, a status tag in words, and Assign when there's no kid.
- **Take** (`TakeScreen.jsx`). A short page head (back to Takes, date and length, kid, course, Change kid / Assign a kid, five stage chips with a check when done), then large tabs. Each tab is its own page.
- **Analysis card** (`AnalysisCard.jsx`, Watch tab). One card that walks the gate: Raw recording (three checkboxes, Mark as checked), Ready for analysis (Send for analysis…, Not ready after all), Analyzing or Waiting its turn (Cancel), Analyzed (results summary, open Coach). The send sheet shows the clip length, this device's count for the last 7 days and the destination, so each send is one deliberate step.
- **Board** (`Board.jsx`). Tabs for **Leaderboard** and **Team run** ("Team run · live" while one is open). Leaderboard rows have gold, silver and bronze place chips, name, date and runs, and the time in display type; the kid up next carries an Up next tag. Team setup is a course select, a roster search with chips and a numbered running order. While open, the panel shows one ink card (up next, or the runner on course), standings, and the running order with Run now / Run again. The spectator screen (`?team=CODE`) is a full-width ink panel built for a TV.
- **Messages.** Conversations beside the open thread on wide screens, one at a time with a back arrow on phones. Coach bubbles are lavender on the right, family bubbles white on the left; an attached run is a small card with its time and a Clean tag.
- **Account.** The coach chip at the top right says who's coaching and whether work is shared, retries the service, switches coach and links to the member app.

## Behavior

- Recording never asks for anything first. With no kid picked, the take saves with "No kid yet" and shows in Takes under To assign.
- Analysis is never automatic. A clip is checked, then sent from a confirmation; moving the clip after checking unchecks it.
- Edits to a take (course, clip, assessment, notes, cue, course map, key frames) stay in a draft with a `SaveBar`. Sending for analysis, saving an attempt and preparing a portfolio clip save the draft first. Switching takes with unsaved edits asks; leaving the page warns.
- Choices of two to five use `Segmented`: take tabs, Takes filters, Board tabs, capture mode, playback speed, Pass/Fail/Skip, fail limit.
- The portfolio card lists what's missing and keeps Prepare disabled until the take is ready; the service still checks everything.
- Status tags carry words: To assign, To check, Checked, Analyzing, Analyzed, Shared on takes; Not prepared, Rendering, Ready to publish, Published, Withdrawn on the portfolio clip.
- Every tap target is at least 44px. Focus rings, labels linked to fields, status and alert regions, and reduced motion are kept. Avatars are hidden from screen readers so buttons are named by the person, not their initials.
