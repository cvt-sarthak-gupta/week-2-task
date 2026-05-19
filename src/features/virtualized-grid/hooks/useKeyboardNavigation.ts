import { useCallback, useRef } from 'react';

interface KeyboardNavOptions {
  rowCount: number;
  onExpand: (index: number) => void;
  onSelect: (index: number) => void;
  scrollToIndex: (index: number) => void;
}

export function useKeyboardNavigation({ rowCount, onExpand, onSelect, scrollToIndex }: KeyboardNavOptions) {
  const focusedIndexRef = useRef(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const current = focusedIndexRef.current;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusedIndexRef.current = Math.min(current + 1, rowCount - 1);
          scrollToIndex(focusedIndexRef.current);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusedIndexRef.current = Math.max(current - 1, 0);
          scrollToIndex(focusedIndexRef.current);
          break;
        case 'PageDown':
          e.preventDefault();
          focusedIndexRef.current = Math.min(current + 20, rowCount - 1);
          scrollToIndex(focusedIndexRef.current);
          break;
        case 'PageUp':
          e.preventDefault();
          focusedIndexRef.current = Math.max(current - 20, 0);
          scrollToIndex(focusedIndexRef.current);
          break;
        case 'Home':
          e.preventDefault();
          focusedIndexRef.current = 0;
          scrollToIndex(0);
          break;
        case 'End':
          e.preventDefault();
          focusedIndexRef.current = rowCount - 1;
          scrollToIndex(rowCount - 1);
          break;
        case 'Enter':
          e.preventDefault();
          onExpand(current);
          break;
        case ' ':
          e.preventDefault();
          onSelect(current);
          break;
        default:
          break;
      }
    },
    [rowCount, onExpand, onSelect, scrollToIndex],
  );

  return { handleKeyDown, focusedIndexRef };
}
