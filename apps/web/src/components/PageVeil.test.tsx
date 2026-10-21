import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageVeil } from "./PageVeil";

function Page({ load }: { load: () => Promise<string> }) {
  const q = useQuery({ queryKey: ["x"], queryFn: load });
  return <div>{q.data ?? "…"}</div>;
}

function setup(load: () => Promise<string>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <PageVeil>
        <Page load={load} />
      </PageVeil>
    </QueryClientProvider>,
  );
  return { qc, veil: () => view.container.querySelector(".page-veil")! };
}

describe("PageVeil", () => {
  it("blurs while the first data loads and clears when it arrives", async () => {
    vi.useFakeTimers();
    let resolve!: (v: string) => void;
    const { veil } = setup(() => new Promise<string>((r) => (resolve = r)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(veil()).toHaveClass("is-loading");
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      resolve("ready");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(veil()).not.toHaveClass("is-loading");
    vi.useRealTimers();
  });

  it("does not flash for fast loads", async () => {
    vi.useFakeTimers();
    const { veil } = setup(async () => "fast");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(veil()).not.toHaveClass("is-loading");
    vi.useRealTimers();
  });
});
