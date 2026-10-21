import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "./motion";

/**
 * Blur the page until its first data has arrived. Counts queries that have no
 * data yet and are fetching — background refetches of loaded data don't blur.
 * A short delay keeps fast loads from flashing.
 */
export function PageVeil({ children }: { children: ReactNode }) {
  const initialLoads = useIsFetching({ predicate: (q) => q.state.status === "pending" });
  const [veiled, setVeiled] = useState(false);
  useEffect(() => {
    if (initialLoads === 0) {
      setVeiled(false);
      return;
    }
    const t = window.setTimeout(() => setVeiled(true), 150);
    return () => window.clearTimeout(t);
  }, [initialLoads]);

  return (
    <div className={`page-veil${veiled ? " is-loading" : ""}`} aria-busy={veiled || undefined}>
      <div className="page-veil-content">{children}</div>
      {veiled && (
        <div className="page-veil-spinner" role="status">
          <Spinner size={30} />
        </div>
      )}
    </div>
  );
}
