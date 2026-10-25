// Jump from the transcript to the thing on the table: select it and move the camera over it.

import type { Citation } from "@terms-room/shared";
import { useStore } from "../state/store";
import { TABLE, exhibitPosition, slotPosition, slipPosition } from "../scene/layout";

export function focusCard(cardId: string, select = true) {
  const s = useStore.getState();
  const pc = s.table.cards.find((c) => c.card.id === cardId);
  if (!pc) return;
  const [x, z] = slotPosition(pc.card.side, pc.slot);
  if (select) s.select({ kind: "card", id: cardId });
  s.flyTo([x, TABLE.top + 0.42, z + 0.3], [x, TABLE.top, z]);
}

export function focusCitation(c: Citation) {
  const s = useStore.getState();
  const pc = s.table.cards.find((x) => x.card.citations.some((k) => k.callId === c.callId && k.field === c.field));
  if (pc) focusCard(pc.card.id);
}

export function focusOffer(index: number) {
  const s = useStore.getState();
  const po = s.table.offers.find((o) => o.index === index);
  if (!po) return;
  const [x, , z] = slipPosition(po.index, po.offer.from, po.rejected);
  s.select({ kind: "offer", index });
  s.flyTo([x, TABLE.top + 0.42, z + 0.3], [x, TABLE.top, z]);
}

export function focusExhibit(id: string) {
  const s = useStore.getState();
  const px = s.table.exhibits.find((e) => e.exhibit.id === id);
  if (!px) return;
  s.select({ kind: "exhibit", id });
  if (px.exhibit.kind === "statement") return;
  const [x, , z] = exhibitPosition(px.index - 1);
  s.flyTo([x, TABLE.top + 0.45, z + 0.32], [x, TABLE.top, z]);
}
