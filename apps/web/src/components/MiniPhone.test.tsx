import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { SoftphoneMock } = vi.hoisted(() => {
  class SoftphoneMock {
    static instances: SoftphoneMock[] = [];
    static requestNotifyPermission = vi.fn(async () => "default");
    status = "idle";
    onStatus?: (s: string, d?: string) => void;
    onSession?: (s: unknown) => void;
    onCallPhase?: (phase: string, info?: { seconds?: number; peer?: string }) => void;
    onMediaWarning?: (code: string) => void;
    connect = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    answer = vi.fn(async () => {});
    hangup = vi.fn(async () => {});
    setMute = vi.fn();
    loadPreferredDevices = vi.fn(async () => {});
    constructor() {
      SoftphoneMock.instances.push(this);
    }
    static get last() {
      return SoftphoneMock.instances[SoftphoneMock.instances.length - 1]!;
    }
  }
  return { SoftphoneMock };
});

vi.mock("../lib/softphone", () => ({ Softphone: SoftphoneMock }));
vi.mock("../lib/api", () => ({
  api: {
    get: vi.fn(async () => ({ extension: "101", password: "pw", domain: "sip.example", displayName: "Ali" })),
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));

import { MiniPhone } from "./MiniPhone";
import { PhoneProvider } from "../lib/phone-context";

/** A tiny portal: the phone page at "/", another page with the mini phone. */
function renderPortal() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <PhoneProvider>
          <Routes>
            <Route path="/" element={<Link to="/directory">go directory</Link>} />
            <Route
              path="/directory"
              element={
                <>
                  <p>directory page</p>
                  <MiniPhone />
                </>
              }
            />
          </Routes>
        </PhoneProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  SoftphoneMock.instances = [];
});

describe("portal softphone across pages", () => {
  it("keeps one registered phone when the user changes page", async () => {
    renderPortal();
    await waitFor(() => expect(SoftphoneMock.last.connect).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByText("go directory"));
    expect(await screen.findByText("directory page")).toBeInTheDocument();
    expect(SoftphoneMock.instances).toHaveLength(1);
    expect(SoftphoneMock.last.disconnect).not.toHaveBeenCalled();
    expect(SoftphoneMock.last.connect).toHaveBeenCalledTimes(1);
  });

  it("answers and declines an incoming call from the mini phone", async () => {
    renderPortal();
    await userEvent.click(screen.getByText("go directory"));
    await waitFor(() => expect(SoftphoneMock.last.onCallPhase).toBeTypeOf("function"));
    act(() => SoftphoneMock.last.onCallPhase!("ringing", { seconds: 0, peer: "0532" }));
    expect(screen.getByText("portal.incoming")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "portal.answer" }));
    expect(SoftphoneMock.last.answer).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "portal.decline" }));
    expect(SoftphoneMock.last.hangup).toHaveBeenCalled();
  });

  it("shows the active call with a timer, mutes and hangs up", async () => {
    renderPortal();
    await userEvent.click(screen.getByText("go directory"));
    await waitFor(() => expect(SoftphoneMock.last.onCallPhase).toBeTypeOf("function"));
    act(() => {
      SoftphoneMock.last.onSession!({});
      SoftphoneMock.last.onCallPhase!("active", { seconds: 65, peer: "102" });
    });
    expect(screen.getByText("portal.onCall")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "portal.mute" }));
    expect(SoftphoneMock.last.setMute).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "portal.unmute" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "portal.hangup" }));
    expect(SoftphoneMock.last.hangup).toHaveBeenCalled();
  });
});
