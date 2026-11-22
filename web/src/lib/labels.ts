"use client";

import { useCallback, useEffect, useState } from "react";
import { short } from "./format";

/**
 * Names the owner gives to mandates and sellers ("Research agent", "Price API"). They are not on the
 * blockchain: they live in this browser only, so other people see addresses and numbers instead.
 */
const KEY = "agentmeter:labels";
type Store = Record<string, string>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();

export function setLabel(key: string, value: string) {
  const store = read();
  if (value.trim()) store[key.toLowerCase()] = value.trim();
  else delete store[key.toLowerCase()];
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage can be blocked. Names are a convenience; the app works without them.
  }
  listeners.forEach((l) => l());
}

export function useLabels() {
  const [store, setStore] = useState<Store>({});
  useEffect(() => {
    const update = () => setStore(read());
    update();
    listeners.add(update);
    window.addEventListener("storage", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const mandateName = useCallback((contract: string | undefined, id: bigint | number) => store[`m:${contract}:${id}`.toLowerCase()] ?? `Mandate ${id}`, [store]);
  const sellerName = useCallback((address: string) => store[`s:${address}`.toLowerCase()], [store]);
  const seller = useCallback((address: string) => store[`s:${address}`.toLowerCase()] ?? short(address), [store]);
  return { mandateName, sellerName, seller };
}

export const mandateKey = (contract: string, id: bigint | number) => `m:${contract}:${id}`;
export const sellerKey = (address: string) => `s:${address}`;
