"use client";

import { useEffect, useRef, useState } from "react";

export default function usePortalData(serverValue) {
  const latest = useRef(serverValue);
  const [value, setValue] = useState(serverValue);
  useEffect(() => {
    latest.current = serverValue;
  }, [serverValue]);
  useEffect(() => {
    const sync = () => setValue(latest.current);
    window.addEventListener("portal:data-refreshed", sync);
    return () => window.removeEventListener("portal:data-refreshed", sync);
  }, []);
  return [value, setValue];
}
