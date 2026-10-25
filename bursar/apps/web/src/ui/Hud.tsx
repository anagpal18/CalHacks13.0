// Camera views, bottom left. The hover label names whatever is under the pointer.
// Playback has no buttons: the story plays by itself. Space pauses, the right arrow steps (see App).

import { useStore } from "../state/store";
import { VIEWS, type ViewId } from "../scene/layout";
import { LiveBadge } from "./Start";

const ORDER: ViewId[] = ["overview", "cards", "room", "wall"];

export function Hud() {
  const view = useStore((s) => s.view);
  const st = useStore.getState;
  return (
    <div className="hud">
      <div className="group" role="group" aria-label="Camera">
        {ORDER.map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => st().setView(v)}>{VIEWS[v].label}</button>
        ))}
      </div>
    </div>
  );
}

export function HoverLabel() {
  const hover = useStore((s) => s.hover);
  return hover ? <div className="hover-label" role="status">{hover}</div> : null;
}

export function TitleBlock() {
  const sub = useStore((s) => s.table.sub);
  return (
    <header className="titleblock">
      <h1>Bursar</h1>
      <p>{sub ? <><span className="vs">Keystone Bay Builders</span> and <span className="vs">{sub.business}</span> negotiate vendor terms. CRS cross-examines every claim.</> : "Two agents negotiate a vendor's terms. Every claim is cross-examined against CRS."}</p>
      <p>Drag to look around · scroll to lean in · click anything on the table</p>
      <p className="legend"><LiveBadge /> people data from the CRS sandbox</p>
    </header>
  );
}

export function ErrorBanner() {
  const error = useStore((s) => s.error);
  return error ? <div className="banner-error" role="alert">{error}</div> : null;
}
