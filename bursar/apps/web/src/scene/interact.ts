// Pointer handlers for anything in the room you can click: hover shows its name, click opens it and moves the camera.

import { useEffect, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useStore, type Selection } from "../state/store";

type Vec3 = [number, number, number];

export function useClickable(label: string, sel: Selection | (() => void), view?: { pos: Vec3; target: Vec3 }) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => { if (hovered) document.body.style.cursor = ""; };
  }, [hovered]);
  return {
    hovered,
    handlers: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); useStore.setState({ hover: label }); },
      onPointerOut: () => { setHovered(false); useStore.setState((s) => (s.hover === label ? { hover: null } : {})); },
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (typeof sel === "function") sel();
        else useStore.getState().select(sel);
        if (view) useStore.getState().flyTo(view.pos, view.target);
      },
    },
  };
}
