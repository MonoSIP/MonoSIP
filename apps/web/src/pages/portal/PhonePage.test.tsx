import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PhonePage harness.
 *
 * `Softphone` is replaced with a controllable double so the page can be driven
 * without sip.js or an audio stack. The instance is kept on the class so a test
 * can fire `onStatus` / `onSession` and assert the UI follows the softphone.
 */

const { SoftphoneMock } = vi.hoisted(() => {
  class SoftphoneMock {
    static instances: SoftphoneMock[] = [];
    static requestNotifyPermission = vi.fn(async () => "default");

    status = "idle";
    onStatus?: (s: string, d?: string) => void;
    onSession?: (s: unknown) => void;
    onCallPhase?: (phase: string, info?: { seconds?: number }) => void;
    onMediaWarning?: (code: string) => void;

    connect = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    dial = vi.fn(async () => {});
    answer = vi.fn(async () => {});
    hangup = vi.fn(async () => {});
    transfer = vi.fn(async () => {});
    startConsult = vi.fn(async () => {});
    completeConsultTransfer = vi.fn(async () => {});
    cancelConsult = vi.fn(async () => {});
    setMute = vi.fn(async () => {});
    setHold = vi.fn(async () => {});
    playDtmfTone = vi.fn();
    sendDtmf = vi.fn(async () => {});
    loadPreferredDevices = vi.fn(async () => {});

    constructor() {
      SoftphoneMock.instances.push(this);
    }
    /** Latest constructed instance — the page keeps one in a ref. */
    static get last() {
      return SoftphoneMock.instances[SoftphoneMock.instances.length - 1]!;
    }
  }
  return { SoftphoneMock };
});

vi.mock("../../lib/softphone", () => ({ Softphone: SoftphoneMock }));

const get = vi.fn();
const put = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

const toastMessage = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

import { PhonePage } from "./PhonePage";

function renderPage(entry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{<PhonePage />}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedApi(dnd = false) {
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/me") return { dnd, number: "101", name: "Ali" };
    if (path === "/api/v1/me/sip-credentials") {
      return { extension: "101", password: "pw", domain: "sip.example", displayName: "Ali" };
    }
    if (path === "/api/v1/me/calls") return [];
    if (path === "/api/v1/health") {
      return { ok: true, media: { rtpPortsPublished: true, warnings: [] } };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  SoftphoneMock.instances = [];
  seedApi();
});

describe("PhonePage softphone lifecycle", () => {
  it("connects with the fetched SIP credentials on mount", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "nav.phone" })).toBeInTheDocument();
    await waitFor(() => expect(SoftphoneMock.last.connect).toHaveBeenCalled());
    expect(SoftphoneMock.last.connect).toHaveBeenCalledWith({
      extension: "101",
      password: "pw",
      domain: "sip.example",
      displayName: "Ali",
    });
    expect(SoftphoneMock.last.loadPreferredDevices).toHaveBeenCalled();
  });

  it("disconnects on unmount", async () => {
    const { unmount } = renderPage();
    await waitFor(() => expect(SoftphoneMock.last.connect).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(SoftphoneMock.last.disconnect).toHaveBeenCalledWith(true));
  });

  it("reports an error status when the credentials request fails", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/sip-credentials") throw new Error("no creds");
      if (path === "/api/v1/me") return { dnd: false, number: "101", name: "Ali" };
      return [];
    });

    renderPage();

    // The page catches and surfaces it rather than leaving an unhandled rejection.
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("no creds"));
    // The status line shows the generic fallback: the handler sets status but
    // not `detail`, so the server message only reaches the toast.
    expect(await screen.findByText("Error")).toBeInTheDocument();
  });

  it("follows the softphone status callback", async () => {
    renderPage();
    await waitFor(() => expect(SoftphoneMock.last.connect).toHaveBeenCalled());

    await waitFor(() => expect(SoftphoneMock.last.onStatus).toBeTypeOf("function"));
    SoftphoneMock.last.onStatus!("registered");

    expect(await screen.findByText("portal.registered")).toBeInTheDocument();
  });
});

describe("PhonePage DND guard", () => {
  it("sends dnd:true and marks the button active on success", async () => {
    put.mockResolvedValue({});
    renderPage();

    const button = await screen.findByRole("button", { name: "portal.dnd" });
    expect(button).not.toHaveClass("btn-primary");

    await userEvent.click(button);

    expect(put).toHaveBeenCalledWith("/api/v1/me/dnd", { dnd: true });
    // setDnd runs only after the awaited put resolves.
    await waitFor(() => expect(button).toHaveClass("btn-primary"));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("surfaces the error and leaves the button inactive when the save fails", async () => {
    put.mockRejectedValue(new Error("dnd failed"));
    renderPage();

    const button = await screen.findByRole("button", { name: "portal.dnd" });
    await userEvent.click(button);

    expect(put).toHaveBeenCalledWith("/api/v1/me/dnd", { dnd: true });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("dnd failed"));
    // The guard keeps showing the server's truth instead of flipping optimistically.
    expect(button).not.toHaveClass("btn-primary");
  });
});
/** Drive the page into a live call the way sip.js would. */
async function enterCall(phase: "active" | "ringing" = "active") {
  renderPage();
  await waitFor(() => expect(SoftphoneMock.last.onSession).toBeTypeOf("function"));
  act(() => {
    SoftphoneMock.last.onSession!({ id: "s-1" });
    SoftphoneMock.last.onCallPhase?.(phase, { seconds: 0 });
  });
  await screen.findByRole("button", { name: "portal.mute" });
}

describe("PhonePage in-call controls", () => {
  it("swaps the dial controls for the in-call ones", async () => {
    await enterCall();

    expect(screen.queryByRole("button", { name: "portal.dial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "portal.answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "portal.mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "portal.hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "portal.transfer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "portal.hangup" })).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("answers the ringing call", async () => {
    await enterCall("ringing");
    await userEvent.click(screen.getByRole("button", { name: "portal.answer" }));
    expect(SoftphoneMock.last.answer).toHaveBeenCalled();
  });

  it("shows ended feedback when the softphone reports call end", async () => {
    await enterCall();
    act(() => {
      SoftphoneMock.last.onCallPhase?.("ended", { seconds: 12 });
      SoftphoneMock.last.onSession!(null);
    });
    expect(await screen.findByText(/portal\.ended/)).toBeInTheDocument();
    await waitFor(() =>
      expect(toastMessage).toHaveBeenCalledWith("portal.callEnded"),
    );
  });

  it("toggles mute both ways", async () => {
    await enterCall();
    const mute = screen.getByRole("button", { name: "portal.mute" });
    expect(mute).not.toHaveClass("btn-primary");

    await userEvent.click(mute);
    expect(SoftphoneMock.last.setMute).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(mute).toHaveClass("btn-primary"));

    await userEvent.click(mute);
    expect(SoftphoneMock.last.setMute).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(mute).not.toHaveClass("btn-primary"));
  });

  it("toggles hold and marks the button", async () => {
    await enterCall();
    const hold = screen.getByRole("button", { name: "portal.hold" });

    await userEvent.click(hold);
    expect(SoftphoneMock.last.setHold).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(hold).toHaveClass("btn-primary"));

    await userEvent.click(hold);
    expect(SoftphoneMock.last.setHold).toHaveBeenLastCalledWith(false);
  });

  it("hangs up the call", async () => {
    await enterCall();
    await userEvent.click(screen.getByRole("button", { name: "portal.hangup" }));
    expect(SoftphoneMock.last.hangup).toHaveBeenCalled();
  });

  it("returns to the idle layout and clears mute/hold when the session ends", async () => {
    await enterCall();
    await userEvent.click(screen.getByRole("button", { name: "portal.mute" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "portal.mute" })).toHaveClass("btn-primary"));

    act(() => {
      SoftphoneMock.last.onCallPhase?.("idle");
      SoftphoneMock.last.onSession!(null);
    });

    // Back to the not-in-call layout, and the transient flags were reset.
    expect(await screen.findByRole("button", { name: "portal.dial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "portal.mute" })).not.toBeInTheDocument();
  });
});

describe("PhonePage transfer panel", () => {
  async function openPanel() {
    await enterCall();
    await userEvent.click(screen.getByRole("button", { name: "portal.transfer" }));
    return screen.findByPlaceholderText("Transfer to extension…");
  }

  it("keeps Blind and Consult disabled until a target is entered", async () => {
    const input = await openPanel();

    expect(screen.getByRole("button", { name: "Blind" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consult" })).toBeDisabled();

    await userEvent.type(input, "205");

    expect(input).toHaveValue("205");
    expect(screen.getByRole("button", { name: "Blind" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Consult" })).toBeEnabled();
  });

  it("strips characters that are not dialable", async () => {
    const input = await openPanel();
    await userEvent.type(input, "a1b2*#c");
    expect(input).toHaveValue("12*#");
  });

  it("performs a blind transfer, then leaves the call", async () => {
    const input = await openPanel();
    await userEvent.type(input, "205");

    await userEvent.click(screen.getByRole("button", { name: "Blind" }));

    expect(SoftphoneMock.last.transfer).toHaveBeenCalledWith("205", "sip.example");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Transferred to 205"));
    // Panel closed and the page dropped back to the not-in-call layout.
    expect(screen.queryByPlaceholderText("Transfer to extension…")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "portal.dial" })).toBeInTheDocument();
  });

  it("keeps the panel open and reports a failed blind transfer", async () => {
    const input = await openPanel();
    await userEvent.type(input, "205");
    SoftphoneMock.last.transfer.mockRejectedValueOnce(new Error("transfer refused"));

    await userEvent.click(screen.getByRole("button", { name: "Blind" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("transfer refused"));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Transfer to extension…")).toBeInTheDocument();
  });

  it("starts a consult and keeps the call up", async () => {
    const input = await openPanel();
    await userEvent.type(input, "205");

    await userEvent.click(screen.getByRole("button", { name: "Consult" }));

    expect(SoftphoneMock.last.startConsult).toHaveBeenCalledWith("205", "sip.example");
    await waitFor(() =>
      expect(toastMessage).toHaveBeenCalledWith("Consult ringing — Complete when answered"),
    );
    // A consult is mid-call, so the in-call layout stays.
    expect(screen.getByRole("button", { name: "portal.mute" })).toBeInTheDocument();
  });

  it("reports a failed consult", async () => {
    const input = await openPanel();
    await userEvent.type(input, "205");
    SoftphoneMock.last.startConsult.mockRejectedValueOnce(new Error("no answer"));

    await userEvent.click(screen.getByRole("button", { name: "Consult" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("no answer"));
  });

  it("completes an attended transfer and leaves the call", async () => {
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));

    expect(SoftphoneMock.last.completeConsultTransfer).toHaveBeenCalled();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Attended transfer done"));
    expect(screen.queryByPlaceholderText("Transfer to extension…")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "portal.dial" })).toBeInTheDocument();
  });

  it("cancels a consult and clears hold", async () => {
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "portal.hold" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "portal.hold" })).toHaveClass("btn-primary"));

    await userEvent.click(screen.getByRole("button", { name: "Cancel consult" }));

    expect(SoftphoneMock.last.cancelConsult).toHaveBeenCalled();
    await waitFor(() => expect(toastMessage).toHaveBeenCalledWith("Consult cancelled"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "portal.hold" })).not.toHaveClass("btn-primary"),
    );
    // Cancelling does not end the call.
    expect(screen.getByRole("button", { name: "portal.mute" })).toBeInTheDocument();
  });
});

/** Render, wait for the softphone effect, and mark the line as registered. */
async function renderRegistered(entry = "/") {
  renderPage(entry);
  await waitFor(() => expect(SoftphoneMock.last.onStatus).toBeTypeOf("function"));
  act(() => {
    SoftphoneMock.last.onStatus!("registered");
  });
  await screen.findByText("portal.registered");
  return screen.getByLabelText("portal.enterNumber");
}

describe("PhonePage keypad", () => {
  it("appends a digit and plays its tone", async () => {
    const input = await renderRegistered();

    await userEvent.click(screen.getByRole("button", { name: "2" }));

    expect(SoftphoneMock.last.playDtmfTone).toHaveBeenCalledWith("2");
    expect(input).toHaveValue("2");
  });

  it("appends several digits in order, including * and #", async () => {
    const input = await renderRegistered();

    for (const d of ["1", "2", "*", "#"]) {
      await userEvent.click(screen.getByRole("button", { name: d }));
    }

    expect(input).toHaveValue("12*#");
  });

  it("clears the entry with the keypad backspace", async () => {
    const input = await renderRegistered();
    await userEvent.type(input, "100");

    const clear = screen.getByRole("button", { name: "portal.clear" });
    expect(clear).toBeEnabled();
    await userEvent.click(clear);

    expect(input).toHaveValue("");
    expect(clear).toBeDisabled();
  });

  it("sends DTMF instead of appending while a call is up", async () => {
    await enterCall();

    await userEvent.click(screen.getByRole("button", { name: "5" }));

    expect(SoftphoneMock.last.sendDtmf).toHaveBeenCalledWith("5");
    expect(SoftphoneMock.last.playDtmfTone).toHaveBeenCalledWith("5");
  });
});

describe("PhonePage keyboard dialing", () => {
  it("types digits from the keyboard", async () => {
    const input = await renderRegistered();

    await userEvent.keyboard("405");

    expect(SoftphoneMock.last.playDtmfTone).toHaveBeenCalledWith("4");
    expect(input).toHaveValue("405");
  });

  it("clears the entry with Escape", async () => {
    const input = await renderRegistered();
    await userEvent.keyboard("100");

    await userEvent.keyboard("{Escape}");

    expect(input).toHaveValue("");
  });

  it("removes the last digit with Backspace", async () => {
    const input = await renderRegistered();
    await userEvent.keyboard("100");

    await userEvent.keyboard("{Backspace}");

    expect(input).toHaveValue("10");
  });

  it("ignores typing while focus sits in a text input", async () => {
    const input = await renderRegistered();
    input.focus();

    // The handler bails out for INPUT/TEXTAREA targets so the field can be
    // edited without the keypad stealing keystrokes.
    await userEvent.keyboard("9");

    expect(SoftphoneMock.last.playDtmfTone).not.toHaveBeenCalled();
    expect(input).toHaveValue("9");
  });

  it("dials on Enter once registered with digits present", async () => {
    await renderRegistered();
    await userEvent.keyboard("100");

    await userEvent.keyboard("{Enter}");

    expect(SoftphoneMock.last.dial).toHaveBeenCalledWith("100", "sip.example");
  });

  it("does not dial on Enter while not registered", async () => {
    renderPage();
    await waitFor(() => expect(SoftphoneMock.last.onStatus).toBeTypeOf("function"));
    await userEvent.keyboard("100");

    await userEvent.keyboard("{Enter}");

    expect(SoftphoneMock.last.dial).not.toHaveBeenCalled();
  });

  it("does not dial on Enter with an empty entry", async () => {
    await renderRegistered();

    await userEvent.keyboard("{Enter}");

    expect(SoftphoneMock.last.dial).not.toHaveBeenCalled();
  });

  it("surfaces a failed dial", async () => {
    await renderRegistered();
    await userEvent.keyboard("100");
    SoftphoneMock.last.dial.mockRejectedValueOnce(new Error("no route"));

    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Error: no route"));
  });
});

describe("PhonePage ?dial= prefill", () => {
  it("prefills the entry from the search param", async () => {
    const input = await renderRegistered("/?dial=4444");

    await waitFor(() => expect(input).toHaveValue("4444"));
  });

  it("enables the dial button once a number is prefilled", async () => {
    await renderRegistered("/?dial=4444");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "portal.dial" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "portal.dial" }));
    expect(SoftphoneMock.last.dial).toHaveBeenCalledWith("4444", "sip.example");
  });

  it("leaves the entry empty with no dial param", async () => {
    const input = await renderRegistered();
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "portal.dial" })).toBeDisabled();
  });
});

describe("PhonePage recents (inside the phone)", () => {
  const now = new Date().toISOString();
  function seedCalls() {
    const base = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/calls") {
        return [
          { id: "1", caller: "101", callee: "900", startedAt: now, direction: "internal", disposition: "ANSWERED" },
          { id: "2", caller: "102", callee: "101", startedAt: now, direction: "internal", disposition: "NOANSWER" },
          { id: "3", caller: "101", callee: "900", startedAt: now, direction: "internal", disposition: "ANSWERED" },
        ];
      }
      return base(path);
    });
  }

  it("swaps the keypad for recents and dials a number on tap", async () => {
    seedCalls();
    renderPage();
    await waitFor(() => expect(SoftphoneMock.last.onStatus).toBeTypeOf("function"));
    act(() => {
      SoftphoneMock.last.onStatus!("registered");
    });

    await userEvent.click(await screen.findByRole("button", { name: "portal.recents" }));
    // keypad replaced by the list (same area), grouped by number
    expect(screen.queryByRole("button", { name: "5" })).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "portal.recents" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("900");
    expect(rows[0]).toHaveTextContent("(2)");
    expect(rows[1]).toHaveClass("is-missed");

    await userEvent.click(rows[0]!);
    expect(SoftphoneMock.last.dial).toHaveBeenCalledWith("900", "sip.example");
    // back on the keypad after dialing
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
  });

  it("toggles back to the keypad", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "portal.recents" }));
    expect(screen.getByText("portal.noRecents")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "portal.keypad" }));
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
  });
});
