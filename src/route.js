// Screens live in the URL hash, so the phone's back button goes back:
// #/floor, #/takes, #/take/<id>/<tab>, #/board, #/messages, #/capture.
import { useEffect, useState } from "react";

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
