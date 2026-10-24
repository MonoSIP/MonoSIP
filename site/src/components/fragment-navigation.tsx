"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Initial fragment scrolling may precede variable-font layout and hydration.
// Re-align after the layout settles, including on refresh and route changes.
export function FragmentNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let request = 0;
    const align = () => {
      const currentRequest = ++request;
      const fragment = window.location.hash;
      if (!fragment) return;
      let id: string;
      try {
        id = decodeURIComponent(fragment.slice(1));
      } catch {
        return;
      }
      void document.fonts.ready.then(() => {
        if (disposed || request !== currentRequest) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            if (
              disposed ||
              request !== currentRequest ||
              window.location.hash !== fragment
            )
              return;
            document
              .getElementById(id)
              ?.scrollIntoView({ block: "start", behavior: "instant" });
          });
        });
      });
    };
    align();
    window.addEventListener("hashchange", align);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", align);
    };
  }, [pathname]);
  return null;
}
