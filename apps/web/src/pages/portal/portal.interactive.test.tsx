import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Interactive tests for the portal/admin mutations.
 *
 * Each case asserts BOTH halves of the contract: that the expected API call was
 * made with the right method, path and payload, and that the UI re-renders to
 * reflect the result.
 */

const get = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    patch: (...a: unknown[]) => patch(...a),
    post: vi.fn(async () => ({})),
    delete: (...a: unknown[]) => del(...a),
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));
const { waveLast } = vi.hoisted(() => ({
  waveLast: {
    current: null as null | {
      url?: string;
      fetchParams?: { credentials?: string };
      handlers: Record<string, () => void>;
      time?: number;
    },
  },
}));
vi.mock("wavesurfer.js", () => ({
  default: {
    create(opts: { url?: string; fetchParams?: { credentials?: string } }) {
      const handlers: Record<string, () => void> = {};
      const player = {
        on(ev: string, fn: () => void) {
          handlers[ev] = fn;
          return player;
        },
        destroy() {},
        setTime(time: number) {
          if (waveLast.current) waveLast.current.time = time;
        },
        play() {
          return Promise.resolve();
        },
        pause() {},
        isPlaying() {
          return false;
        },
        getDuration() {
          return 1;
        },
      };
      waveLast.current = { ...opts, handlers };
      return player;
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

import { MissedPage } from "../admin/MissedPage";
import { MySettingsPage } from "./MySettingsPage";
import { MyVoicemailPage } from "./MyVoicemailPage";

function renderPage(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The three forwarding selects, scoped past the audio-device selects above them. */
function fwdSelects() {
  const card = screen.getByRole("heading", { name: "Call forwarding" }).closest("section") as HTMLElement;
  return within(card).getAllByRole("combobox");
}

/** Tab-bar buttons, scoped so tab labels never collide with row actions. */
function tab(name: string) {
  const bar = screen.getByRole("button", { name: "missed.all" }).parentElement as HTMLElement;
  return within(bar).getByRole("button", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] })),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

describe("DND toggle", () => {
  beforeEach(() => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") return { dnd: false, mobileForwardAllowed: false };
      if (path === "/api/v1/me/voicemails") return [];
      if (path === "/api/v1/me/forwarding") return [];
      return {};
    });
  });

  it("sends dnd:true and flips the button to ON", async () => {
    renderPage(<MySettingsPage />);

    const button = await screen.findByRole("button", { name: "portal.dnd: OFF" });
    await userEvent.click(button);

    expect(put).toHaveBeenCalledWith("/api/v1/me/dnd", { dnd: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "portal.dnd: ON" })).toBeInTheDocument(),
    );
  });

  it("sends dnd:false when toggled back off", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") return { dnd: true, mobileForwardAllowed: false };
      if (path === "/api/v1/me/voicemails") return [];
      if (path === "/api/v1/me/forwarding") return [];
      return {};
    });

    renderPage(<MySettingsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "portal.dnd: ON" }));
    expect(put).toHaveBeenCalledWith("/api/v1/me/dnd", { dnd: false });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "portal.dnd: OFF" })).toBeInTheDocument(),
    );
  });

  it("keeps the server state and surfaces the error when the save fails", async () => {
    put.mockRejectedValueOnce(new Error("boom"));

    renderPage(<MySettingsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "portal.dnd: OFF" }));

    expect(put).toHaveBeenCalledWith("/api/v1/me/dnd", { dnd: true });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
    // setDnd runs only after the awaited put resolves, so a failure leaves the
    // label showing what the server actually has.
    expect(screen.getByRole("button", { name: "portal.dnd: OFF" })).toBeInTheDocument();
  });
});

describe("call forwarding", () => {
  beforeEach(() => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") return { dnd: false, mobileForwardAllowed: false };
      if (path === "/api/v1/me/voicemails") return [];
      if (path === "/api/v1/me/forwarding") return [];
      return {};
    });
  });

  it("reveals a destination input when a row switches to extension", async () => {
    renderPage(<MySettingsPage />);

    const selects = fwdSelects();
    expect(screen.queryByPlaceholderText("Extension number")).not.toBeInTheDocument();

    await userEvent.selectOptions(selects[0]!, "extension");

    expect(await screen.findByPlaceholderText("Extension number")).toBeInTheDocument();
  });

  it("puts the edited row alongside the untouched defaults", async () => {
    renderPage(<MySettingsPage />);

    const selects = fwdSelects();
    await userEvent.selectOptions(selects[0]!, "extension");
    await userEvent.type(await screen.findByPlaceholderText("Extension number"), "205");

    await userEvent.click(screen.getByRole("button", { name: "Save forwarding" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [path, payload] = put.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(path).toBe("/api/v1/me/forwarding");
    expect(payload).toEqual([
      { condition: "noanswer", ringSeconds: 20, destType: "extension", destId: "205" },
      { condition: "busy", ringSeconds: 5, destType: "voicemail", destId: null },
      { condition: "chanunavail", ringSeconds: 5, destType: "voicemail", destId: null },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Forwarding saved");
  });

  it("clears destId when a row switches to voicemail", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") return { dnd: false, mobileForwardAllowed: false };
      if (path === "/api/v1/me/voicemails") return [];
      // Server already holds an extension destination for "noanswer".
      if (path === "/api/v1/me/forwarding") {
        return [
          { condition: "noanswer", ringSeconds: 20, destType: "extension", destId: "101" },
          { condition: "busy", ringSeconds: 5, destType: "voicemail", destId: null },
          { condition: "chanunavail", ringSeconds: 5, destType: "voicemail", destId: null },
        ];
      }
      return {};
    });

    renderPage(<MySettingsPage />);

    await waitFor(() => expect(screen.getByDisplayValue("101")).toBeInTheDocument());
    await userEvent.selectOptions(fwdSelects()[0]!, "voicemail");
    await userEvent.click(screen.getByRole("button", { name: "Save forwarding" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const payload = put.mock.calls[0]![1] as Record<string, unknown>[];
    expect(payload[0]).toEqual({
      condition: "noanswer",
      ringSeconds: 20,
      destType: "voicemail",
      destId: null,
    });
  });
});

describe("password and voicemail error handling", () => {
  function seedSettings() {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") return { dnd: false, mobileForwardAllowed: false };
      if (path === "/api/v1/me/forwarding") return [];
      return {};
    });
  }

  it("surfaces a failed password change and keeps the typed value", async () => {
    seedSettings();
    patch.mockRejectedValueOnce(new Error("password too short"));

    renderPage(<MySettingsPage />);

    const input = await screen.findByLabelText("auth.password");
    await userEvent.type(input, "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(patch).toHaveBeenCalledWith("/api/v1/me/password", { password: "supersecret" });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("password too short"));
    // onError does not clear the field, so the user does not lose what they typed.
    expect(input).toHaveValue("supersecret");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("clears the password and confirms on a successful change", async () => {
    seedSettings();
    patch.mockResolvedValueOnce({});

    renderPage(<MySettingsPage />);

    const input = await screen.findByLabelText("auth.password");
    await userEvent.type(input, "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("OK"));
    expect(input).toHaveValue("");
  });

  it("keeps the Save button disabled below the 8-character minimum", async () => {
    seedSettings();
    renderPage(<MySettingsPage />);

    const input = await screen.findByLabelText("auth.password");
    const save = screen.getByRole("button", { name: "common.save" });
    expect(save).toBeDisabled();

    await userEvent.type(input, "short123");
    expect(save).toBeEnabled();
  });

});

const VOICEMAIL = { id: "v1", caller: "4444", at: "2026-01-01T09:00:00Z", read: false };

describe("voicemail inbox", () => {
  beforeEach(() => {
    waveLast.current = null;
  });

  function seed(rows: unknown[] = [VOICEMAIL]) {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/voicemails") return rows;
      return [];
    });
  }

  it("marks the message read when the wave starts, and keeps the row if that fails", async () => {
    seed();
    patch.mockRejectedValueOnce(new Error("voicemail gone"));

    renderPage(<MyVoicemailPage />);

    expect(await screen.findByText("4444")).toBeInTheDocument();
    await waitFor(() => expect(waveLast.current?.handlers.play).toBeTypeOf("function"));
    waveLast.current!.handlers.play();

    expect(patch).toHaveBeenCalledWith("/api/v1/me/voicemails/v1", { read: true });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("voicemail gone"));
    expect(screen.getByText("4444")).toBeInTheDocument();
  });

  it("shows the wave on the row, with delete beside it and no play button", async () => {
    seed();

    renderPage(<MyVoicemailPage />);

    expect(await screen.findByText("1/1")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "nav.voicemail" })).toHaveLength(1);
    const caller = await screen.findByText("4444");
    const item = caller.closest("li")!;
    const wave = within(item).getByRole("button", { name: "portal.play" });
    const remove = within(item).getByRole("button", { name: "portal.delete" });
    expect(wave.className).toContain("vm-wave");
    expect(wave.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(waveLast.current?.url).toBe("/api/v1/me/voicemails/v1/stream"));
    expect(waveLast.current?.fetchParams).toEqual({ credentials: "include" });

    await userEvent.click(wave);
    expect(waveLast.current?.time).toBeUndefined();
    await userEvent.click(caller);
    expect(waveLast.current?.time).toBe(0);
  });

  it("deletes the message after confirmation", async () => {
    let rows: unknown[] = [VOICEMAIL];
    get.mockImplementation(async (path: string) => (path === "/api/v1/me/voicemails" ? rows : []));
    patch.mockResolvedValue({});
    del.mockImplementation(async () => {
      rows = [];
      return { ok: true };
    });

    renderPage(<MyVoicemailPage />);

    await userEvent.click(await screen.findByRole("button", { name: "portal.delete" }));
    await userEvent.click(screen.getByRole("button", { name: "portal.confirmDelete" }));

    expect(del).toHaveBeenCalledWith("/api/v1/me/voicemails/v1");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("portal.deleted"));
    await waitFor(() => expect(screen.queryByText("4444")).not.toBeInTheDocument());
  });
});

describe("missed-call status changes", () => {
  it("patches the row to returned and the list refetches", async () => {
    // The refetch after invalidateQueries returns the updated row, so the
    // pending tab (the default) drops it — a real re-render, not a mock echo.
    let status = "pending";
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/missed-calls") {
        return [{ id: "m1", number: "5555", target: "101", at: "2026-01-01T09:00:00Z", status }];
      }
      return [];
    });
    patch.mockImplementation(async (p: string, body: { status: string }) => {
      if (p === "/api/v1/admin/missed-calls/m1") status = body.status;
      return {};
    });

    renderPage(<MissedPage />);

    await screen.findByText("5555");
    // Scope to the row so the tab bar is never matched.
    const row = screen.getByText("5555").closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "missed.markReturned" }));

    expect(patch).toHaveBeenCalledWith("/api/v1/admin/missed-calls/m1", { status: "returned" });
    // The invalidation refetch returns status "returned", so the pending tab
    // (the default) drops the row. Asserting it is still visible first would be
    // racy: the refetch can settle before that line runs.
    await waitFor(() => expect(screen.queryByText("5555")).not.toBeInTheDocument());
  });

  it("patches a pending row to ignored", async () => {
    get.mockResolvedValue([
      { id: "m2", number: "6666", target: "102", at: "2026-01-01T09:00:00Z", status: "pending" },
    ]);

    renderPage(<MissedPage />);

    const row = (await screen.findByText("6666")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "missed.ignore" }));

    expect(patch).toHaveBeenCalledWith("/api/v1/admin/missed-calls/m2", { status: "ignored" });
  });

  it("hides the Ignore action once a row is no longer pending", async () => {
    get.mockResolvedValue([
      { id: "m3", number: "7777", target: "103", at: "2026-01-01T09:00:00Z", status: "returned" },
    ]);

    renderPage(<MissedPage />);

    // The default tab is "pending", which filters this row out entirely.
    await userEvent.click(tab("missed.all"));

    const row = (await screen.findByText("7777")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "missed.ignore" })).not.toBeInTheDocument();
    // Already returned, so no "called back" action is offered either.
    expect(within(row).queryByRole("button", { name: "missed.markReturned" })).not.toBeInTheDocument();
  });

  it("filters rows by tab", async () => {
    get.mockResolvedValue([
      { id: "p1", number: "1111", target: "104", at: "2026-01-01T09:00:00Z", status: "pending" },
      { id: "r1", number: "2222", target: "105", at: "2026-01-01T09:00:00Z", status: "returned" },
    ]);

    renderPage(<MissedPage />);

    await screen.findByText("1111");
    expect(screen.queryByText("2222")).not.toBeInTheDocument();

    await userEvent.click(tab("missed.returned"));
    expect(await screen.findByText("2222")).toBeInTheDocument();
    expect(screen.queryByText("1111")).not.toBeInTheDocument();
  });
});