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
import { useStore } from "../../store";
import { MyVoicemailPage } from "./MyVoicemailPage";

function renderPage(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The three forwarding selects, scoped to the forwarding card. */
function fwdSelects() {
  const card = screen.getByRole("heading", { name: "Call forwarding" }).closest("section") as HTMLElement;
  return within(card).getAllByRole("combobox");
}

async function chooseOption(combobox: HTMLElement, name: string) {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole("option", { name }));
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

describe("voicemail greeting", () => {
  beforeEach(() => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me") {
        return {
          dnd: false,
          mobileForwardAllowed: false,
          voicemailGreeting: "Merhaba",
          voicemailGreetingVoice: "female",
          voicemailGreetingLang: "tr",
        };
      }
      if (path === "/api/v1/me/voicemails") return [];
      if (path === "/api/v1/me/forwarding") return [];
      return {};
    });
  });

  it("saves the greeting text and voice", async () => {
    renderPage(<MySettingsPage />);

    const box = await screen.findByLabelText("portal.greetingText");
    await waitFor(() => expect(box).toHaveValue("Merhaba"));
    await userEvent.clear(box);
    await userEvent.type(box, "Birakin");
    await chooseOption(screen.getByLabelText("portal.greetingVoice"), "portal.voiceMale");

    const card = screen.getByRole("heading", { name: "portal.voicemailGreeting" }).closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "common.save" }));

    expect(put).toHaveBeenCalledWith("/api/v1/me/voicemail-greeting", {
      text: "Birakin",
      voice: "male",
      language: "tr",
    });
  });

  it("does not offer do-not-disturb on the settings page", async () => {
    renderPage(<MySettingsPage />);
    await screen.findByLabelText("portal.greetingText");
    expect(screen.queryByRole("button", { name: /portal\.dnd/ })).not.toBeInTheDocument();
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

    await chooseOption(selects[0]!, "Extension");

    expect(await screen.findByPlaceholderText("Extension number")).toBeInTheDocument();
  });

  it("puts the edited row alongside the untouched defaults", async () => {
    renderPage(<MySettingsPage />);

    const selects = fwdSelects();
    await chooseOption(selects[0]!, "Extension");
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
    await chooseOption(fwdSelects()[0]!, "Voicemail");
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
    const card = screen.getByRole("heading", { name: "auth.password" }).closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "common.save" }));

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
    const card = screen.getByRole("heading", { name: "auth.password" }).closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("OK"));
    expect(input).toHaveValue("");
  });

  it("switches language and dark mode from the settings page", async () => {
    seedSettings();
    useStore.setState({ theme: "dark" });
    document.documentElement.classList.remove("light");
    renderPage(<MySettingsPage />);

    const langCard = screen.getByRole("heading", { name: "common.language" }).closest("section")!;
    await userEvent.click(within(langCard).getByRole("button", { name: "Türkçe" }));
    expect(localStorage.getItem("monosip_locale")).toBe("tr");
    expect(within(langCard).getByRole("button", { name: "Türkçe" }).className).toContain("rt-variant-solid");

    await userEvent.click(screen.getByRole("button", { name: "portal.darkMode: common.enabled" }));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(screen.getByRole("button", { name: "portal.darkMode: common.disabled" })).toBeInTheDocument();
  });

  it("keeps the Save button disabled below the 8-character minimum", async () => {
    seedSettings();
    renderPage(<MySettingsPage />);

    const input = await screen.findByLabelText("auth.password");
    const card = screen.getByRole("heading", { name: "auth.password" }).closest("section")!;
    const save = within(card).getByRole("button", { name: "common.save" });
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

  it("puts play beside the wave, and a click on the row starts from the beginning", async () => {
    seed();

    renderPage(<MyVoicemailPage />);

    expect(await screen.findByText("1/1")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "nav.voicemail" })).toHaveLength(1);
    const caller = await screen.findByText("4444");
    const item = caller.closest("li")!;
    const wave = item.querySelector(".vm-wave")!;
    const play = within(item).getByRole("button", { name: "portal.play" });
    const remove = within(item).getByRole("button", { name: "portal.delete" });
    expect(play.compareDocumentPosition(wave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wave.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(waveLast.current?.url).toBe("/api/v1/me/voicemails/v1/stream"));
    expect(waveLast.current?.fetchParams).toEqual({ credentials: "include" });

    await userEvent.click(wave);
    expect(waveLast.current?.time).toBeUndefined();
    await userEvent.click(play);
    expect(waveLast.current?.time).toBe(0);
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