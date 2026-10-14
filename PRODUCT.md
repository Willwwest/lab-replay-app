# LAB Replay

## Platform

Standalone browser app, separate repository and runtime from LAB milestones.

## Users and workflow

LAB coaches record members completing courses on phones mounted on stabilizers. Coaches review on phones, tablets, and computers. Members benefit from useful evidence, grading, key frames, and actionable feedback.

## Confirmed constraints

Use open source components. User authorizes considering rented GPU workers or an onsite processing machine. Processing happens only for explicitly requested clips. Failed attempts can be discarded and restarted without analysis. Each submission preserves its member, course, clip range, destination and request time.

## Pilot implementation decisions

React/Vite prototype; IndexedDB stores drafts and course templates. A shared Node/SQLite local service stores prepared/published videos and reports keyed by the existing LAB member IDs. Demo accounts enforce family scope but are not production authentication. FFmpeg clips and composites the map when explicitly requested. Browser inference is functional; remote GPU inference is not connected. Capture needs HTTPS on phones; localhost works for desktop development. Existing videos can be imported from the phone camera app. Key frame drawings, body angles, voice-overs, tags and model clips stay on the coach's device until a portfolio clip is prepared; camera angle clips pass through the local service to the host phone and are deleted there once taken. Body angles are measured on the picture and are never a grade.

## Course source

User supplied `public/gym-layout.png` on October 14, 2026. This replaces the planning grid as the default map. Preserve its proportions; do not infer physical distances from the diagram. Courses consist of ordered named normalized points, optional source-video timestamps, layout and version. Prepared reviews freeze the map and video interval.

## Product principles

Keep capture quick. Preserve evidence with feedback. Separate tracking confidence from member performance. Require a deliberate submission. Give every queued job a cancellation path.
