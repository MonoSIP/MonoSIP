import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke tests for the portal pages: each page mounts with its real providers
 * and renders its heading plus loaded rows. Data comes from a mocked `api`,
 * never the network, and `useNavigate` is asserted rather than executed.
 */

const get = vi.fn();
const navigate = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
// Return the key so assertions do not depend on a loaded translation bundle.
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// jsdom has no Media/Audio stack that WaveSurfer needs.
vi.mock("wavesurfer.js", () => ({ default: class { destroy() {} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DirectoryPage } from "./DirectoryPage";
import { MyCallsPage } from "./MyCallsPage";
import { MyRecordingsPage } from "./MyRecordingsPage";
import { MySettingsPage } from "./MySettingsPage";
import { MyVoicemailPage } from "./MyVoicemailPage";

function renderPage(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("portal smoke tests", () => {
  it("MyCallsPage renders its heading and one row per call", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/missed-calls") return [];
      return [
        { id: "c1", startedAt: "2026-01-01T10:00:00Z", direction: "inbound", caller: "1000", callee: "101", disposition: "ANSWERED" },
        { id: "c2", startedAt: "2026-01-01T11:00:00Z", direction: "outbound", caller: "101", callee: "1000", disposition: "NOANSWER" },
      ];
    });

    renderPage(<MyCallsPage />);

    expect(await screen.findByRole("heading", { name: "nav.myCalls" })).toBeInTheDocument();
    // "1000" legitimately appears as both a caller and a callee.
    await waitFor(() => expect(screen.getAllByText("1000")).toHaveLength(2));
    expect(screen.getByText("cdr.caller")).toBeInTheDocument();
  });

  it("MyCallsPage filters the table when a tab is selected", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/missed-calls") return [];
      return [
        { id: "c1", startedAt: "2026-01-01T10:00:00Z", direction: "inbound", caller: "1111", callee: "101", disposition: "ANSWERED" },
        { id: "c2", startedAt: "2026-01-01T11:00:00Z", direction: "outbound", caller: "101", callee: "2222", disposition: "NOANSWER" },
      ];
    });

    renderPage(<MyCallsPage />);
    await screen.findByRole("heading", { name: "nav.myCalls" });
    await waitFor(() => expect(screen.getByText("1111")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Outbound" }));

    // The inbound peer is gone once the outbound tab filters it out.
    await waitFor(() => expect(screen.queryByText("1111")).not.toBeInTheDocument());
    expect(screen.getByText("2222")).toBeInTheDocument();
  });

  it("MyCallsPage shows the pending-missed table only on the Missed tab", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/missed-calls") {
        return [{ id: "m1", at: "2026-01-01T09:00:00Z", number: "3333", status: "pending" }];
      }
      return [];
    });

    renderPage(<MyCallsPage />);
    await screen.findByRole("heading", { name: "nav.myCalls" });
    expect(screen.queryByText("Pending missed")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Missed" }));
    expect(await screen.findByText("Pending missed")).toBeInTheDocument();
    expect(screen.getByText("3333")).toBeInTheDocument();
  });

  it("DirectoryPage lists peers and dials one", async () => {
    get.mockResolvedValue([
      { id: "p1", number: "101", name: "Ali", state: "online", dnd: false },
      { id: "p2", number: "102", name: "Veli", state: "dnd", dnd: true },
    ]);

    renderPage(<DirectoryPage />);

    expect(await screen.findByRole("heading", { name: "nav.directory" })).toBeInTheDocument();
    const ali = (await screen.findByText("Ali")).closest("div.rounded-md") as HTMLElement;
    await userEvent.click(within(ali).getByRole("button", { name: "portal.dial" }));
    expect(navigate).toHaveBeenCalledWith("/?dial=101");
  });

  it("DirectoryPage disables the dial button for a DND peer", async () => {
    get.mockResolvedValue([
      { id: "p2", number: "102", name: "Veli", state: "dnd", dnd: true },
    ]);

    renderPage(<DirectoryPage />);

    await screen.findByText("Veli");
    const card = screen.getByText("Veli").closest("div.rounded-md") as HTMLElement;
    expect(within(card).getByRole("button", { name: "portal.dial" })).toBeDisabled();
  });

  it("MyRecordingsPage renders recordings with a play control each", async () => {
    get.mockResolvedValue([
      { id: "r1", callId: "c1", duration: 12, createdAt: "2026-01-01T10:00:00Z" },
      { id: "r2", callId: "c2", duration: 30, createdAt: "2026-01-01T11:00:00Z" },
    ]);

    renderPage(<MyRecordingsPage />);

    expect(
      await screen.findByRole("heading", { name: "nav.myRecordings" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
  });

  it("MyVoicemailPage lists messages left for this extension", async () => {
    get.mockResolvedValue([
      { id: "v1", caller: "90555", at: "2026-01-01T10:00:00Z", read: false },
    ]);

    renderPage(<MyVoicemailPage />);

    expect((await screen.findAllByRole("heading", { name: "nav.voicemail" })).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /90555/ })).toBeInTheDocument();
  });

  it("MySettingsPage mounts and shows its forwarding controls", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/forwarding") return [];
      if (path === "/api/v1/me") return { dnd: false, mobileForwardAllowed: false };
      return {};
    });

    renderPage(<MySettingsPage />);

    // Named, not a bare `heading` role: this page also renders <h2> section
    // headings, which would make the query ambiguous.
    expect(
      await screen.findByRole("heading", { name: "nav.mySettings" }),
    ).toBeInTheDocument();
    // Mounting without a crash is the smoke guarantee; the page renders
    // several form controls once its settings queries resolve.
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
  });
});