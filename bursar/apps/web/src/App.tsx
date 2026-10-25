import { useEffect } from "react";
import { Scene } from "./scene/Scene";
import { Panel } from "./ui/Panel";
import { Inspector } from "./ui/Inspector";
import { ErrorBanner, HoverLabel, Hud, TitleBlock } from "./ui/Hud";
import { useStore } from "./state/store";
import { Loading } from "./ui/Loading";
import { Start } from "./ui/Start";
import { UploadCard } from "./ui/Upload";
import { Feed } from "./ui/Feed";

export function App() {
  useEffect(() => {
    // No playback buttons on screen: Space pauses and resumes, the right arrow plays one step.
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === "Escape") s.select(null);
      if (s.screen !== "room" || (e.target as HTMLElement)?.closest?.("input, textarea, select, button")) return;
      if (e.key === " ") { e.preventDefault(); s.togglePlay(); }
      if (e.key === "ArrowRight") s.step();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const sceneReady = useStore((s) => s.sceneReady);
  const screen = useStore((s) => s.screen);
  // The room mounts behind the start page so its shaders compile while the rules are being set.
  return (
    <>
      <div className="stage"><Scene /></div>
      {screen === "start" ? <Start /> : (
        <>
          {!sceneReady && <Loading />}
          <TitleBlock />
          <ErrorBanner />
          <Panel />
          <Hud />
          <Feed />
          <HoverLabel />
          <Inspector />
          <UploadCard />
        </>
      )}
    </>
  );
}
