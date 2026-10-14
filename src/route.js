// Screens live in the URL hash, so the phone's back button goes back:
// #/floor, #/takes, #/take/<id>/<tab>, #/board, #/messages, #/capture.
import { useEffect, useRef, useState } from "react";

export function parse(hash) {
  const [screen = "floor", id = null, tab = null] = hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean);
  return { screen, id, tab };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (path, { replace = false } = {}) => {
    const hash = `#/${path}`;
    if (replace) {
      history.replaceState(history.state, "", hash);
      setRoute(parse(hash));
    } else location.hash = hash;
  };
  return { route, go };
}

// A full-screen layer over a screen (the frame editor, the voice-over
// recorder) takes one history entry, so the phone's back button closes it
// instead of leaving the take. Close it with the returned dismiss, which
// goes back; onClose runs when that entry is left either way.
export function useLayer(onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    history.pushState({ layer: true }, "");
    let open = true;
    const on = () => {
      open = false;
      close.current();
    };
    addEventListener("popstate", on);
    return () => {
      removeEventListener("popstate", on);
      // Unmounted some other way (a route change): drop the entry quietly.
      if (open && history.state?.layer) history.back();
    };
  }, []);
  return () => history.back();
}
