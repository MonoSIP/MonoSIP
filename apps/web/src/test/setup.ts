import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest runs with `globals: false`, so Testing Library's automatic cleanup
// (which relies on a global afterEach) never registers. Unmount explicitly,
// otherwise DOM from one test leaks into the next.
afterEach(() => {
  cleanup();
});