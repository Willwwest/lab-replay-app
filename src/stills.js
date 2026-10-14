// Key frame images: the clean still stays as it was captured; a drawn-on
// copy (`marked`) is made when the coach finishes drawing, and that is the
// one shown, exported and shared.
import { render } from "./drawing.js";

export const still = (frame) => frame.marked || frame.image;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error("Could not open this frame."));
    img.src = src;
  });
}

// The still with its marks drawn in, as a JPEG data URL. `layers` draws
// anything that goes under the marks (the body overlay).
export async function flatten(image, shapes, layers = () => {}) {
  const img = await loadImage(image);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  layers(ctx, c.width, c.height);
  render(ctx, shapes, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

// A frame as it goes to the family: the image they should see and the note.
export const shared = (frame) => ({
  id: frame.id,
  time: frame.time,
  note: frame.note,
  image: still(frame),
});
