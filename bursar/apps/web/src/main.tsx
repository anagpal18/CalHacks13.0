import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-400-italic.css";
import "@fontsource/source-serif-4/latin-600.css";
import "@fontsource/caveat/latin-500.css";
import "@fontsource/caveat/latin-700.css";
import "./styles.css";
import { App } from "./App";
import { Loading } from "./ui/Loading";

// Every card, slip and sign is drawn on a canvas, so the faces have to be loaded before the first texture.
const FACES = ["400 20px Archivo", "500 20px Archivo", "600 20px Archivo", "700 20px Archivo", "800 20px Archivo",
  "400 20px 'IBM Plex Mono'", "500 20px 'IBM Plex Mono'", "400 20px 'Source Serif 4'", "italic 400 20px 'Source Serif 4'",
  "600 20px 'Source Serif 4'", "500 20px Caveat", "700 20px Caveat"];

function Boot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timeout = new Promise((r) => setTimeout(r, 4000));
    void Promise.race([Promise.all(FACES.map((f) => document.fonts.load(f))), timeout]).then(() => setReady(true));
  }, []);
  return ready ? <App /> : <Loading />;
}

// No StrictMode: its dev-only double mount runs each texture's dispose-on-unmount cleanup right after
// the first mount. It's off so that never has to be reasoned about; production builds don't double mount.
createRoot(document.getElementById("root")!).render(<Boot />);
