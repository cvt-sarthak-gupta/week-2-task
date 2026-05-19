import { useEffect, useRef, useState } from 'react';

interface LiveRegionProps {
  updateCount: number;
}

/** Announces batched row updates to screen readers without spamming. */
export function LiveRegion({ updateCount }: LiveRegionProps) {
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (updateCount === 0) return;
    accumulatedRef.current += updateCount;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMessage(`${accumulatedRef.current} patient ${accumulatedRef.current === 1 ? 'record' : 'records'} updated`);
      accumulatedRef.current = 0;
    }, 1000); // debounce announcements
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [updateCount]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{ position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
    >
      {message}
    </div>
  );
}
