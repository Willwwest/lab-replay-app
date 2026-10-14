# LAB Replay design

Replay is a coach tool, so it uses the member app's coach-floor look: the floating app bar with pill navigation (an ink tab bar on phones), the gradient masthead with the dot field and outlined LEARN ADAPT BUILD, a hero that states the take's status and its next step, pastel stat tiles, white cards and one ink card per screen. The rules are the member app's `app/DESIGN-SYSTEM.md`; this file covers what Replay adds.

## Files

| File | What it holds |
|---|---|
| `src/ds/` | Tokens, `tokens.js` and the components (`Section`, `Card`, `Field`, `Segmented`, `Tag`, `StatStrip`, `SaveBar`…). Copied byte for byte from the member app. |
| `src/DotField.jsx`, `src/dotfield.css` | The masthead's dot field. Copied from the member app. |
| `src/shell.css` | Base elements and the coach shell (app bar, nav, masthead, hero, `.button`, stat tiles, menu, toast), ported from the member app's `styles.css`, `coachapp.css` and `coach.css`. Class names match the member app. |
| `src/replay.css` | Replay's page layout. Classes start with `rp-`. |
| `src/run.css` | The run setup and the full-screen live run. |
| `src/compare.css` | Side by side. |
| `src/team.css` | Team runs: picker, panel, standings, spectator screen. |
| `src/messages.css` | Messages. |
| `src/ds.test.js` | The member app's guards, run by `npm test`. |
| `scripts/pages-e2e.mjs` | Every screen at 320, 390, 820, 1024, 1280 and 1366 wide: sideways overflow, squeezed or faded blocks, console errors, full-page shots. |

`npm run design:sync` copies the shared files from `../lab-skill-unlocks/app` (or `LAB_APP_DIR`); `npm run design:check` fails on drift and runs before every build. `shell.css` is a port, not a copy: when the member app's shell changes, port the change by hand.

## Screen

- **Hero.** The selected take as "Theo's LAB circuit.", its clip, assessment and key frames, and a glass Next step card (from `src/workflow.js`) whose button jumps to the section that needs work. Record a take and Import video sit under the copy.
- **Review**, top to bottom: session library (a sideways rail of take cards, filtered by member), stat tiles, Video and coaching (the ink player card, the clip card, take details and coach review), Key frames, Course map, Course attempt with member progress, Member portfolio.
- **Side by side** (in Review, after Key frames). One ink card holds both videos (side by side, stacked under 640px, or B as a ghost over A) with a shared scrubber and transport. Below: Line them up (alignment and nudge) and Obstacle times (a table with word tags for faster and slower).
- **Run.** Setup card (who, course, time cap, fail limit, switches) with one Start button, then recent runs. The run itself is a full-screen ink layer: the clock in display type, the current obstacle, a cyan Pass key and a red Fail key at least 96px tall, Skip and Undo below, and the splits. The cap warning turns the frame and clock gold. The hero's aside shows the personal best for the chosen member and course.
- **Leaderboard** (Run tab, under setup). Ranked rows with gold, silver and bronze place chips (the gold, gray-300 and tenure-week tokens), name, date and runs, and the time in display type.
- **Team run.** Setup swaps the member field for a roster search with chips and a numbered running order. While open, the panel shows one ink card (up next, or the runner on course with a cyan live clock and obstacle dots), the standings card, and the running order with Run now / Run again. The spectator screen (`?team=CODE`) is a full-width ink panel built for a TV.
- **Messages.** Conversations beside the open thread on wide screens, one at a time with a back arrow on phones. Coach bubbles are lavender on the right, family bubbles white on the left; an attached run is a small card with its time and a Clean tag.
- **Requests.** Stat tiles for queued, running, completed and stopped, then one card per request.
- **Account.** The coach chip at the top right connects the roster, switches coach, links to the member app and disconnects.

## Behavior

- Edits to a take (member, course, clip, assessment, notes, cue, course map, key frames) stay in a draft with a `SaveBar`. Requesting analysis, saving an attempt and preparing a portfolio clip save the draft first. Switching takes with unsaved edits asks; leaving the page warns.
- Choices of two to five use `Segmented`: playback speed, processing destination, Pass/Fail/Skip.
- The portfolio card lists what's missing and keeps Prepare disabled until the take is ready; the service still checks everything.
- Status tags carry words: Draft, Requested, Analyzed, Portfolio on takes; Queued, Running, Completed, Failed, Cancelled on requests; Not prepared, Rendering, Ready to publish, Published, Withdrawn on the portfolio clip.
- Every tap target is at least 44px. Focus rings, labels linked to fields, status and alert regions, and reduced motion are kept.
