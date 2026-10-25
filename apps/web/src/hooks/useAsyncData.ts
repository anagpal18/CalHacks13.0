import { useEffect, useState } from "react";

/** Event the shell listens for, so a failed live call shows a banner instead of an endless skeleton. */
export const DATA_ERROR_EVENT = "bill-passport:data-error";

/** Loads data from a dataSource function and re-loads when `dependencies` change. */
export function useAsyncData<Value>(load: () => Promise<Value>, dependencies: unknown[]): Value | undefined {
  const [value, setValue] = useState<Value>();
  useEffect(() => {
    let cancelled = false;
    load()
      .then((loaded) => {
        if (!cancelled) setValue(loaded);
      })
      .catch((error: Error) => {
        if (!cancelled) window.dispatchEvent(new CustomEvent(DATA_ERROR_EVENT, { detail: error.message }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return value;
}
