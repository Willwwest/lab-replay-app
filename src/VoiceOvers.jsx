// A take's voice-overs on its Watch tab: each one to play, download or
// delete, and the button that opens the recorder.
import React, { useEffect, useState } from "react";
import { Download, Mic, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Section, Tag } from "./ds/index.jsx";
import { day, download, stamp, videoExtension } from "./format.js";

function Voice({ v, onDelete }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(v.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [v.blob]);
  const when = new Date(v.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Card as="li" pad="sm" className="rp-voice-item">
      <video
        src={url || undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={`Voice-over from ${day(v.createdAt)} ${when}`}
      />
      <header>
        <div>
          <b>{stamp(v.duration)}</b>
          <p className="ds-note">
            {day(v.createdAt)}, {when}
            {v.coach ? ` · ${v.coach}` : ""}
          </p>
        </div>
        <div className="rp-actions">
          {v.camera && <Tag tone="info">Camera</Tag>}
          <IconButton
            label="Download the voice-over"
            icon={Download}
            onClick={() =>
              download(v.blob, `lab-voice-over.${videoExtension(v.blob)}`)
            }
          />
          <IconButton
            label="Delete the voice-over"
            icon={Trash2}
            tone="danger"
            onClick={onDelete}
          />
        </div>
      </header>
    </Card>
  );
}

export default function VoiceOvers({ voices, onRecord }) {
  return (
    <Section
      title="Voice-overs"
      note="Talk the kid through the clip as it plays, and draw as you go. Choose one to go with the portfolio clip on Share."
      actions={
        <Button variant="secondary" size="sm" icon={Mic} onClick={onRecord}>
          Record a voice-over
        </Button>
      }
    >
      {voices.list.length === 0 ? (
        <p className="rp-inline">None yet.</p>
      ) : (
        <ul className="rp-voices" aria-label="Voice-overs">
          {voices.list.map((v) => (
            <Voice
              key={v.id}
              v={v}
              onDelete={() =>
                confirm("Delete this voice-over from this device?") &&
                voices.drop(v.id)
              }
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
