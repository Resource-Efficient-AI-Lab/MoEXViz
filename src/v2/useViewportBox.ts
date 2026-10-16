import { useLayoutEffect, useRef, useState } from 'react';

interface ViewportBox {
  width: number;
  height: number;
  chrome: number;
  inset: number;
}

/** Available plot space below the current controls. Laptop layouts keep their natural sizes. */
export function useViewportBox<T extends HTMLElement>(enabled = true, parentWidth = false) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<ViewportBox | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        if (window.innerHeight <= 900) {
          setBox(null);
          return;
        }
        const rect = element.getBoundingClientRect();
        const svg = element.querySelector('svg')?.getBoundingClientRect();
        // Page bottom padding (24), panel margin (8), and panel padding/border (10).
        const next = {
          width: parentWidth ? element.parentElement!.clientWidth : element.clientWidth,
          height: Math.max(0, window.innerHeight - rect.top - window.scrollY - 42),
          chrome: svg ? rect.height - svg.height : 0,
          inset: svg ? rect.width - svg.width : 0,
        };
        setBox(previous => previous && Object.keys(next).every(key =>
          Math.abs(previous[key as keyof ViewportBox] - next[key as keyof ViewportBox]) < 0.5
        ) ? previous : next);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(element.closest('.moe-wrap') ?? element.parentElement!);
    window.addEventListener('resize', measure);
    document.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, parentWidth]);

  return [ref, box] as const;
}
