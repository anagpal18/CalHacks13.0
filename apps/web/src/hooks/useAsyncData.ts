import { useEffect, useState } from "react";

/** Loads data from a dataSource function and re-loads when `dependencies` change. */
export function useAsyncData<Value>(load: () => Promise<Value>, dependencies: unknown[]): Value | undefined {
  const [value, setValue] = useState<Value>();
  useEffect(() => {
    let cancelled = false;
    load().then((loaded) => {
      if (!cancelled) setValue(loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return value;
}
