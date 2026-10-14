import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accountFor, canRead, validateReview } from "./access.js";
import { boardFor, courseList, leaderboard, validateRun } from "./runs.js";
import {
  addResult,
  applyLive,
  closeTeam,
  createTeam,
  teamView,
} from "./teams.js";
import { familySeenAt, threads, validateMessage } from "./messages.js";
import { viewSummary } from "./views.js";
import { findFont, timerFilters } from "./overlay.js";
import { validateHere } from "./here.js";
import * as angles from "./angles.js";
const root = path.dirname(fileURLToPath(import.meta.url)),
  data = path.resolve(
    process.env.REPLAY_DATA_DIR || path.join(root, "../data"),
  );
await mkdir(data, { recursive: true });
const roster = JSON.parse(
  await readFile(path.join(root, "roster.json"), "utf8"),
);
const db = new DatabaseSync(path.join(data, "replay.sqlite"));
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,owner TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,member TEXT NOT NULL,owner TEXT NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS here(date TEXT NOT NULL,member TEXT NOT NULL,by TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(date,member)); CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,member TEXT NOT NULL,created TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reads(account TEXT NOT NULL,member TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(account,member)); CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,code TEXT NOT NULL,status TEXT NOT NULL,updated INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,member TEXT NOT NULL,owner TEXT NOT NULL,course_key TEXT NOT NULL,created TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS angles(id TEXT PRIMARY KEY,code TEXT NOT NULL,status TEXT NOT NULL,updated INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS views(review TEXT NOT NULL,account TEXT NOT NULL,name TEXT NOT NULL,first TEXT NOT NULL,last TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(review,account));`,
);
// A family member played a published clip. Guardians of one family share
// an account, so each is counted by their own name within it.
const markViewed = (review, account) => {
  const at = new Date().toISOString();
  const name = account.name ?? "Family";
  db.prepare(
    "INSERT INTO views VALUES(?,?,?,?,?,1) ON CONFLICT(review,account) DO UPDATE SET last=excluded.last,count=count+1",
  ).run(review, `${reader(account)}:${name}`, name, at, at);
};
const viewsOf = (review) =>
  viewSummary(db.prepare("SELECT * FROM views WHERE review=?").all(review));
const getAngles = (key) => {
  const row = db
    .prepare(
      "SELECT body FROM angles WHERE (id=? OR code=?) ORDER BY updated DESC",
    )
    .get(key, String(key).toUpperCase());
  return row && JSON.parse(row.body);
};
const saveAngles = (s) =>
  db
    .prepare(
      "INSERT INTO angles VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated=excluded.updated,body=excluded.body",
    )
    .run(s.id, s.code, s.status, s.updated, JSON.stringify(s));
const clipFile = (id) => path.join(data, `angle-${id}.media`);
// Streams a request body to a new file, up to `limit` bytes; returns its size.
async function receive(req, target, limit = 250e6) {
  let bytes = 0;
  try {
    await pipeline(
      req,
      new Transform({
        transform(c, e, cb) {
          bytes += c.length;
          cb(
            bytes > limit
              ? Error(`Maximum video size is ${limit / 1e6} MB.`)
              : null,
            c,
          );
        },
      }),
      createWriteStream(target, { flags: "wx" }),
    );
    if (!bytes) throw Error("Empty recording.");
    return bytes;
  } catch (e) {
    await unlink(target).catch(() => {});
    throw e;
  }
}
const readRows = () => db.prepare("SELECT account,member,at FROM reads").all();
db.exec(`UPDATE reviews SET status='failed' WHERE status='rendering'`);
const sessions = new Map();
const allMessages = () =>
  db
    .prepare("SELECT body FROM messages ORDER BY created")
    .all()
    .map((r) => JSON.parse(r.body));
const reader = (account) => `${account.kind}:${account.id}`;
const readsOf = (account) =>
  Object.fromEntries(
    db
      .prepare("SELECT member,at FROM reads WHERE account=?")
      .all(reader(account))
      .map((r) => [r.member, r.at]),
  );
const markRead = (account, member) =>
  db
    .prepare(
      "INSERT INTO reads VALUES(?,?,?) ON CONFLICT(account,member) DO UPDATE SET at=excluded.at",
    )
    .run(reader(account), member, new Date().toISOString());
const getTeam = (key) => {
  const row = db
    .prepare("SELECT body FROM teams WHERE id=? OR code=?")
    .get(key, String(key).toUpperCase());
  return row && JSON.parse(row.body);
};
const saveTeam = (t) =>
  db
    .prepare(
      "INSERT INTO teams VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated=excluded.updated,body=excluded.body",
    )
    .run(t.id, t.code, t.status, t.updated, JSON.stringify(t));
const allRuns = () =>
  db
    .prepare("SELECT body FROM runs ORDER BY created DESC")
    .all()
    .map((r) => JSON.parse(r.body));
let rendering = false;
const VOICE_MAX = 600; // seconds of voice-over a review keeps
const list = () =>
  db.prepare("SELECT * FROM reviews ORDER BY rowid DESC").all();
const get = (id) => db.prepare("SELECT * FROM reviews WHERE id=?").get(id);
const result = (row) => ({
  ...JSON.parse(row.body),
  id: row.id,
  status: row.status,
});
// A review as a coach sees it: with who in the family has watched it.
const staffResult = (row, account) =>
  account.kind === "staff"
    ? { ...result(row), views: viewsOf(row.id) }
    : result(row);
const send = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function json(req) {
  let bytes = 0,
    parts = [];
  for await (const c of req) {
    bytes += c.length;
    if (bytes > 8e6) throw Error("Request too large.");
    parts.push(c);
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
async function command(binary, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, { windowsHide: true });
    let out = "",
      err = "";
    const timer = setTimeout(() => p.kill(), 180000);
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => {
      err = (err + c).slice(-3000);
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(
            Error(`Video processing failed (${code}). ${err.slice(-500)}`),
          );
    });
  });
}
const probe = async (file) =>
  Number(
    await command("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]),
  );
// The coach's voice-over, as an H.264/AAC MP4 at the portfolio clip's size.
// MediaRecorder files often carry no duration, so it's measured afterwards.
async function renderVoice(id, assetId) {
  const out = path.join(data, `${id}-voice.mp4`);
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    path.join(data, `${assetId}.source`),
    "-t",
    String(VOICE_MAX),
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    out,
  ]);
  const duration = await probe(out);
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error("The voice-over has no picture or sound to share.");
  return { duration: Math.round(duration * 10) / 10 };
}
async function render(id, assetId, body) {
  rendering = true;
  try {
    const source = path.join(data, `${assetId}.source`);
    const duration = await probe(source);
    if (!Number.isFinite(duration) || body.end > duration + 0.05)
      throw Error("Clip extends beyond the recording.");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.courseImage))
      throw Error("Course image must be PNG.");
    await writeFile(
      path.join(data, `${id}.png`),
      Buffer.from(body.courseImage.split(",")[1], "base64"),
    );
    // The clock and obstacle labels, unless the timer is already filmed in.
    const timer = timerFilters(body, findFont());
    await command("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(body.start),
      "-t",
      String(body.end - body.start),
      "-i",
      source,
      "-loop",
      "1",
      "-i",
      path.join(data, `${id}.png`),
      "-filter_complex",
      `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[1:v]scale=220:-2[map];[base][map]overlay=W-w-20:H-h-20:shortest=1${timer.length ? `[ov];[ov]${timer.join(",")}` : ""}[out]`,
      "-map",
      "[out]",
      "-an",
      "-t",
      String(body.end - body.start),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(data, `${id}.mp4`),
    ]);
    const done = body.voiceoverAssetId
      ? { ...body, voiceover: await renderVoice(id, body.voiceoverAssetId) }
      : body;
    db.prepare("UPDATE reviews SET status=?,body=? WHERE id=?").run(
      "ready",
      JSON.stringify(done),
      id,
    );
  } catch (e) {
    db.prepare("UPDATE reviews SET status=?,body=? WHERE id=?").run(
      "failed",
      JSON.stringify({ ...body, error: e.message }),
      id,
    );
  } finally {
    rendering = false;
    for (const a of [assetId, body.voiceoverAssetId].filter(Boolean)) {
      await unlink(path.join(data, `${a}.source`)).catch(() => {});
      db.prepare("DELETE FROM assets WHERE id=?").run(a);
    }
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"),
      route = url.pathname.replace(/^\/replay-api/, "");
    if (route === "/health")
      return send(res, 200, { mode: "local-demo", roster: "synthetic" });
    if (route === "/session" && req.method === "POST") {
      const { phone } = await json(req);
      const account = accountFor(roster, phone);
      if (!account) return send(res, 403, { error: "Unknown demo account." });
      const token = randomUUID();
      sessions.set(token, { ...account, expires: Date.now() + 8 * 3600000 });
      return send(res, 200, { token, account, mode: "local-demo" });
    }
    const account = sessions.get(
      req.headers.authorization?.replace(/^Bearer /, ""),
    );
    if (!account || account.expires < Date.now())
      return send(res, 401, {
        error: "Connect a demo account to the local Replay service.",
      });
    // Course runs: coaches send them; families read their own kids'.
    if (route === "/runs" && req.method === "POST") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      const run = {
        ...validateRun(await json(req), roster.members),
        coach: account.name,
      };
      db.prepare(
        "INSERT INTO runs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET member=excluded.member,course_key=excluded.course_key,created=excluded.created,body=excluded.body",
      ).run(
        run.id,
        run.memberId,
        account.id,
        run.courseKey,
        run.createdAt,
        JSON.stringify(run),
      );
      return send(res, 201, run);
    }
    if (route === "/runs" && req.method === "GET") {
      const member = url.searchParams.get("member");
      const course = url.searchParams.get("course");
      return send(
        res,
        200,
        allRuns().filter(
          (r) =>
            canRead(account, r.memberId) &&
            (!member || r.memberId === member) &&
            (!course || r.courseKey === course),
        ),
      );
    }
    const runMatch = route.match(/^\/runs\/([\w-]{1,80})$/);
    if (runMatch && req.method === "DELETE") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      db.prepare("DELETE FROM runs WHERE id=?").run(runMatch[1]);
      return send(res, 200, { deleted: runMatch[1] });
    }
    if (route === "/courses" && req.method === "GET")
      return send(res, 200, courseList(allRuns()));
    if (route === "/leaderboard" && req.method === "GET") {
      const course = url.searchParams.get("course");
      if (!course) throw Error("Choose a course.");
      const period = url.searchParams.get("period") ?? "all";
      return send(
        res,
        200,
        boardFor(account, leaderboard(allRuns(), course, period)),
      );
    }
    // Who's in the gym today, shared by every coach's phone.
    if (route === "/here") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      if (req.method === "GET") {
        const date = url.searchParams.get("date") ?? "";
        return send(
          res,
          200,
          db
            .prepare("SELECT member,by,at FROM here WHERE date=? ORDER BY at")
            .all(date)
            .map((r) => ({ memberId: r.member, by: r.by, at: r.at })),
        );
      }
      if (req.method === "POST") {
        const h = validateHere(await json(req), roster.members);
        if (h.here)
          db.prepare(
            "INSERT INTO here VALUES(?,?,?,?) ON CONFLICT(date,member) DO NOTHING",
          ).run(h.date, h.memberId, account.name, new Date().toISOString());
        else
          db.prepare("DELETE FROM here WHERE date=? AND member=?").run(
            h.date,
            h.memberId,
          );
        return send(res, 200, h);
      }
    }
    // Messages: one thread per kid, between coaches and that kid's family.
    if (route === "/threads" && req.method === "GET")
      return send(
        res,
        200,
        threads(account, roster.members, allMessages(), readsOf(account)),
      );
    const threadMatch = route.match(/^\/threads\/([\w-]{1,80})$/);
    if (threadMatch) {
      const member = roster.members.find((m) => m.id === threadMatch[1]);
      if (!member || !canRead(account, member.id))
        return send(res, 404, { error: "No thread for that member." });
      if (req.method === "GET") {
        markRead(account, member.id);
        return send(res, 200, {
          memberId: member.id,
          name: member.name,
          messages: allMessages().filter((m) => m.memberId === member.id),
          // Coaches see when the family last opened the thread.
          ...(account.kind === "staff"
            ? {
                familySeenAt: familySeenAt(
                  readRows(),
                  roster.families,
                  member.id,
                ),
              }
            : {}),
        });
      }
      if (req.method === "POST") {
        const message = validateMessage(
          await json(req),
          account,
          member,
          allRuns(),
        );
        db.prepare("INSERT INTO messages VALUES(?,?,?,?)").run(
          message.id,
          member.id,
          message.createdAt,
          JSON.stringify(message),
        );
        markRead(account, member.id);
        return send(res, 201, message);
      }
    }
    // Deleting a message: its author, or any coach.
    const messageMatch = route.match(
      /^\/threads\/([\w-]{1,80})\/([\w-]{1,80})$/,
    );
    if (messageMatch && req.method === "DELETE") {
      const row = db
        .prepare("SELECT body FROM messages WHERE id=? AND member=?")
        .get(messageMatch[2], messageMatch[1]);
      const message = row && JSON.parse(row.body);
      if (!message || !canRead(account, message.memberId))
        return send(res, 404, { error: "No such message." });
      const own =
        message.author.kind === account.kind &&
        message.author.id === account.id;
      if (!own && account.kind !== "staff")
        return send(res, 403, {
          error: "You can only delete your own messages.",
        });
      db.prepare("DELETE FROM messages WHERE id=?").run(message.id);
      return send(res, 200, { deleted: message.id });
    }
    // Team runs: coaches create and drive them; anyone with access watches.
    if (route === "/teams" && req.method === "POST") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      const team = createTeam(await json(req), roster.members, account);
      saveTeam(team);
      return send(res, 201, teamView(account, team, allRuns()));
    }
    if (route === "/teams" && req.method === "GET") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      return send(
        res,
        200,
        db
          .prepare(
            "SELECT body FROM teams WHERE status='open' ORDER BY updated DESC",
          )
          .all()
          .map((r) => JSON.parse(r.body))
          .map((t) => ({
            id: t.id,
            code: t.code,
            course: t.course.name,
            athletes: t.athletes.length,
            done: new Set(t.results.map((r) => r.memberId)).size,
            coach: t.coach,
            createdAt: t.createdAt,
          })),
      );
    }
    const teamMatch = route.match(
      /^\/teams\/([\w-]{1,80})(?:\/(live|result|close))?$/,
    );
    if (teamMatch) {
      const team = getTeam(teamMatch[1]);
      if (!team)
        return send(res, 404, { error: "No team run with that code." });
      if (!teamMatch[2] && req.method === "GET") {
        try {
          return send(res, 200, teamView(account, team, allRuns()));
        } catch {
          return send(res, 403, { error: "No access to this team run." });
        }
      }
      if (req.method === "POST" && teamMatch[2]) {
        if (account.kind !== "staff")
          return send(res, 403, { error: "Coach access required." });
        const body = teamMatch[2] === "close" ? {} : await json(req);
        let next;
        if (teamMatch[2] === "live") next = applyLive(team, body);
        else if (teamMatch[2] === "close") next = closeTeam(team);
        else {
          const run = allRuns().find((r) => r.id === body.runId);
          if (!run || run.memberId !== body.memberId)
            throw Error("Share the run before adding it to the team.");
          next = addResult(team, body);
        }
        saveTeam(next);
        return send(res, 200, teamView(account, next, allRuns()));
      }
    }
    // Camera angles: other phones film the same run as the host phone.
    if (route.startsWith("/angles")) {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      if (route === "/angles" && req.method === "POST") {
        let s = angles.createSession(account);
        while (getAngles(s.code)?.status === "open")
          s = angles.createSession(account);
        saveAngles(s);
        return send(res, 201, angles.view(s));
      }
      const m = route.match(
        /^\/angles\/([\w-]{1,80})(?:\/(join|leave|start|stop|discard|close|clips)(?:\/([\w-]{1,80}))?)?$/,
      );
      const s = m && getAngles(m[1]);
      if (!s)
        return send(res, 404, { error: "No camera session with that code." });
      const [, , action, clipId] = m;
      const put = (next, status = 200, extra = {}) => {
        saveAngles(next);
        return send(res, status, { ...angles.view(next), ...extra });
      };
      if (!action && req.method === "GET") {
        const camera = url.searchParams.get("camera");
        if (camera && s.cameras.some((c) => c.id === camera)) {
          const next = angles.seen(s, camera);
          saveAngles(next);
          return send(res, 200, angles.view(next));
        }
        return send(res, 200, angles.view(s));
      }
      if (action === "clips" && req.method === "GET" && !clipId)
        return send(
          res,
          200,
          s.clips.filter(
            (c) =>
              !url.searchParams.get("recording") ||
              c.recordingId === url.searchParams.get("recording"),
          ),
        );
      if (action === "clips" && clipId) {
        const clip = s.clips.find((c) => c.id === clipId);
        if (!clip) return send(res, 404, { error: "No such clip." });
        if (req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": clip.type,
            "Cache-Control": "no-store",
          });
          createReadStream(clipFile(clip.id))
            .on("error", () => res.destroy())
            .pipe(res);
          return;
        }
        if (req.method === "DELETE") {
          if (s.host.id !== account.id)
            return send(res, 403, {
              error: "Only the host phone takes clips.",
            });
          await unlink(clipFile(clip.id)).catch(() => {});
          return put(angles.dropClip(s, clip.id));
        }
      }
      if (action === "clips" && req.method === "POST") {
        const query = Object.fromEntries(url.searchParams);
        angles.clipFor(s, query, 1); // check before taking the upload
        const id = randomUUID();
        const size = await receive(req, clipFile(id));
        try {
          // Checked again: the host may have discarded it meanwhile.
          const fresh = getAngles(s.id);
          const clip = { ...angles.clipFor(fresh, query, size), id };
          return put(angles.addClip(fresh, clip), 201, { clip });
        } catch (e) {
          await unlink(clipFile(id)).catch(() => {});
          throw e;
        }
      }
      if (req.method === "POST" && action) {
        const body = await json(req).catch(() => ({}));
        if (action === "join") {
          const { session, camera } = angles.join(s, account, body);
          return put(session, 200, { camera });
        }
        if (action === "leave") return put(angles.leave(s, body.camera));
        if (action === "start") return put(angles.start(s, account, body));
        if (action === "stop") return put(angles.stop(s, account, body));
        if (action === "discard") {
          const next = angles.discard(s, account, body.recordingId);
          for (const c of s.clips.filter(
            (c) => c.recordingId === body.recordingId,
          ))
            await unlink(clipFile(c.id)).catch(() => {});
          return put(next);
        }
        if (action === "close") {
          for (const c of s.clips) await unlink(clipFile(c.id)).catch(() => {});
          return put({ ...angles.close(s, account), clips: [] });
        }
      }
    }
    if (route === "/members" && req.method === "GET")
      return send(
        res,
        200,
        roster.members.filter((m) => canRead(account, m.id)),
      );
    if (route === "/reviews" && req.method === "GET")
      return send(
        res,
        200,
        list()
          .filter(
            (r) =>
              canRead(account, r.member) &&
              (account.kind === "staff" || r.status === "published") &&
              (!url.searchParams.get("member") ||
                r.member === url.searchParams.get("member")),
          )
          .map(result),
      );
    if (route === "/assets" && req.method === "POST") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      const id = randomUUID();
      await receive(req, path.join(data, `${id}.source`));
      db.prepare("INSERT INTO assets VALUES(?,?)").run(id, account.id);
      return send(res, 201, { id });
    }
    if (route === "/reviews" && req.method === "POST") {
      if (account.kind !== "staff")
        return send(res, 403, { error: "Coach access required." });
      const body = await json(req);
      validateReview(body, roster.members);
      const prior = list().find(
        (r) =>
          r.owner === account.id &&
          JSON.parse(r.body).submissionId === body.submissionId,
      );
      if (prior) return send(res, 200, result(prior));
      if (rendering)
        return send(res, 409, {
          error: "Another clip is rendering. Try again when it finishes.",
        });
      if (!body.submissionId || typeof body.submissionId !== "string")
        throw Error("Missing submission ID.");
      const asset = db
        .prepare("SELECT * FROM assets WHERE id=?")
        .get(body.assetId);
      if (!asset || asset.owner !== account.id)
        return send(res, 403, {
          error: "Recording is not available to this coach.",
        });
      if (body.voiceoverAssetId != null) {
        const voice = db
          .prepare("SELECT * FROM assets WHERE id=?")
          .get(body.voiceoverAssetId);
        if (
          !voice ||
          voice.owner !== account.id ||
          body.voiceoverAssetId === body.assetId
        )
          return send(res, 403, {
            error: "The voice-over is not available to this coach.",
          });
      }
      const id = randomUUID();
      const record = {
        ...body,
        createdAt: new Date().toISOString(),
        coach: account.name,
      };
      db.prepare("INSERT INTO reviews VALUES(?,?,?,?,?)").run(
        id,
        body.memberId,
        account.id,
        "rendering",
        JSON.stringify(record),
      );
      void render(id, body.assetId, record);
      return send(res, 202, result(get(id)));
    }
    const match = route.match(
      /^\/reviews\/([a-f0-9-]+)(?:\/(publish|video|voiceover|withdraw))?$/,
    );
    if (match) {
      const row = get(match[1]);
      if (
        !row ||
        !canRead(account, row.member) ||
        (account.kind !== "staff" && row.status !== "published")
      )
        return send(res, 404, { error: "Review unavailable." });
      if (
        (match[2] === "video" || match[2] === "voiceover") &&
        req.method === "GET"
      ) {
        if (!["ready", "published", "withdrawn"].includes(row.status))
          return send(res, 409, { error: "Video is not ready." });
        const voice = match[2] === "voiceover";
        if (voice && !JSON.parse(row.body).voiceover)
          return send(res, 404, { error: "This review has no voice-over." });
        if (!voice && account.kind === "guardian") markViewed(row.id, account);
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Cache-Control": "no-store",
        });
        createReadStream(
          path.join(data, `${row.id}${voice ? "-voice" : ""}.mp4`),
        )
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      if (req.method === "POST" && ["publish", "withdraw"].includes(match[2])) {
        if (account.kind !== "staff")
          return send(res, 403, { error: "Coach access required." });
        if (
          match[2] === "publish" &&
          !["ready", "published"].includes(row.status)
        )
          return send(res, 409, {
            error: "Prepare and review the output first.",
          });
        if (match[2] === "withdraw" && row.status !== "published")
          return send(res, 409, {
            error: "Only published reviews can be withdrawn.",
          });
        const status = match[2] === "publish" ? "published" : "withdrawn";
        const body = {
          ...JSON.parse(row.body),
          ...(status === "published"
            ? { publishedAt: new Date().toISOString() }
            : {}),
        };
        db.prepare("UPDATE reviews SET status=?,body=? WHERE id=?").run(
          status,
          JSON.stringify(body),
          row.id,
        );
        return send(res, 200, staffResult(get(row.id), account));
      }
      if (req.method === "GET")
        return send(res, 200, staffResult(row, account));
    }
    return send(res, 404, { error: "Not found." });
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message });
    else res.destroy();
  }
});
server.listen(Number(process.env.REPLAY_PORT || 5182), "127.0.0.1", () =>
  console.log(
    "Replay local demo service: http://127.0.0.1:" +
      (process.env.REPLAY_PORT || 5182),
  ),
);
