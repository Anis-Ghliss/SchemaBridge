import { useEffect } from "react";
import { useAppStore } from "../store";

export function useUnsavedChange(id: string, active: boolean, message = "You have unsaved changes. Leave this screen and discard them?"): void {
  const setUnsavedChange = useAppStore((state) => state.setUnsavedChange);

  useEffect(() => {
    if (!active) {
      const current = useAppStore.getState().unsavedChange;
      if (current?.id === id) setUnsavedChange(undefined);
      return;
    }
    setUnsavedChange({ id, message });
    return () => {
      const current = useAppStore.getState().unsavedChange;
      if (current?.id === id) setUnsavedChange(undefined);
    };
  }, [active, id, message, setUnsavedChange]);
}
