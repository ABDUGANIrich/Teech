"use client";
import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("teech-storage", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("teech-storage", notify);
  };
};
const empty = () => "";
const yes = () => true;
const no = () => false;
const noop = () => () => {};
export function useBrowserReady() {
  return useSyncExternalStore(noop, yes, no);
}
export function useLocalSnapshot(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) || "";
      } catch {
        return "";
      }
    },
    empty,
  );
}
