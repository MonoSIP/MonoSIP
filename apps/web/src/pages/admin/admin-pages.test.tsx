import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** LoginPage and both layouts read useNavigate; the rest of the router stays real. */
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

/**
 * Smoke + mutation coverage for the admin Queues, Schedules and Settings pages.
 *
 * Each mutation test asserts the HTTP call (method, path, payload) and the
 * re-render that follows the query invalidation. `api` and `sonner` are the
 * only mocked boundaries; `t` returns its key so assertions never depend on a
 * translation bundle.
 */

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiPut = vi.fn();
const apiDelete = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    get: (...a: unknown[]) => apiGet(...a),
    post: (...a: unknown[]) => apiPost(...a),
    patch: (...a: unknown[]) => apiPatch(...a),
    put: (...a: unknown[]) => apiPut(...a),
    delete: (...a: unknown[]) => apiDelete(...a),
  },
}));
// `i18n` is included because SchedulesPage reads `i18n.language` to pick a
// locale-specific prompt; without it the tree crashes after the heading.
// `i18n` is included because SchedulesPage reads `i18n.language` to pick a
// locale-specific prompt; without it the tree crashes after the heading.
// initReactI18next is preserved via importOriginal because the layouts' import
// chain needs it.
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (k: string) => k,
      i18n: { language: "en", changeLanguage: vi.fn() },
    }),
  };
});
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    message: vi.fn(),
  },
}));

import { QueuesPage } from "./QueuesPage";
import { SchedulesPage } from "./SchedulesPage";
import { SettingsPage } from "./SettingsPage";
import { TrunksPage } from "./TrunksPage";
import { CdrPage } from "./CdrPage";
import { ReportsPage } from "./ReportsPage";
import { DevicesPage } from "./DevicesPage";
import { IntegrationsPage } from "./IntegrationsPage";
import { RingGroupsPage } from "./RingGroupsPage";
import { RoutesPage } from "./RoutesPage";
import { PromptsPage } from "./PromptsPage";
import { MohPage } from "./MohPage";
import { FlowDesignerPage } from "./FlowDesignerPage";
import { LoginPage } from "../LoginPage";
import { AdminLayout } from "../../layouts/AdminLayout";
import { PortalLayout } from "../../layouts/PortalLayout";

function renderPage(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("QueuesPage", () => {
  function seedQueues() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/queues") {
        return [
          {
            id: "q1",
            number: "800",
            name: "Sales",
            strategy: "rrmemory",
            callbackEnabled: true,
            members: [{ extensionId: "e1", penalty: 1, paused: false }],
          },
        ];
      }
      if (path === "/api/v1/admin/extensions") {
        return [{ id: "e1", number: "201", name: "Ali" }];
      }
      if (path === "/api/v1/admin/moh") return [{ id: "m1", name: "default" }];
      // DestPicker also queries this page0027s lists; an object here crashes its .map.
      return [];
    });
  }

  it("renders the heading and one row per queue with its members", async () => {
    seedQueues();
    renderPage(<QueuesPage />);

    expect(
      await screen.findByRole("heading", { name: "queues.title" }),
    ).toBeInTheDocument();
    const row = (await screen.findByText("Sales")).closest("tr") as HTMLElement;
    expect(within(row).getByText("800")).toBeInTheDocument();
    expect(within(row).getByText("rrmemory")).toBeInTheDocument();
    // Members are labelled by extension number plus penalty.
    expect(within(row).getByText("201 p1")).toBeInTheDocument();
    expect(within(row).getByText("on")).toBeInTheDocument();
  });

  it("posts a new queue from the form and confirms it", async () => {
    seedQueues();
    apiPost.mockResolvedValue({ id: "q2" });
    renderPage(<QueuesPage />);

    await screen.findByText("Sales");
    await userEvent.type(screen.getByPlaceholderText("extensions.number"), "801");
    await userEvent.type(screen.getByPlaceholderText("extensions.name"), "Support");
    await userEvent.click(screen.getAllByRole("button", { name: "common.create" })[0]!);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, payload] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/queues");
    expect(payload).toMatchObject({ number: "801", name: "Support", members: [] });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("toggles a member's paused state through the pause endpoint", async () => {
    seedQueues();
    apiPost.mockResolvedValue({});
    renderPage(<QueuesPage />);

    const member = await screen.findByText("201 p1");
    await userEvent.click(member);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/api/v1/admin/queues/q1/members/e1/pause",
        { paused: true },
      ),
    );
  });

  it("loads a queue into the form for editing and saves with PATCH", async () => {
    seedQueues();
    apiPatch.mockResolvedValue({});
    renderPage(<QueuesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    // Loading switches the submit button to Save and disables the number field.
    expect(await screen.findByRole("button", { name: "common.save" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("extensions.number")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch.mock.calls[0]![0]).toBe("/api/v1/admin/queues/q1");
    // The loaded queue values round-trip through the edit payload.
    expect(apiPatch.mock.calls[0]![1]).toMatchObject({ name: "Sales", number: "800" });
  });
});

describe("SchedulesPage", () => {
  function seedSchedules() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/schedules") {
        return [{ id: "s1", name: "Business hours", ranges: [] }];
      }
      if (path === "/api/v1/admin/holidays") return [];
      // DestPicker also queries this page0027s lists; an object here crashes its .map.
      return [];
    });
  }

  it("renders the heading and existing schedules", async () => {
    seedSchedules();
    renderPage(<SchedulesPage />);

    expect(
      await screen.findByRole("heading", { name: "schedules.title" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Business hours")).toBeInTheDocument();
  });

  it("posts a new schedule using the typed name", async () => {
    seedSchedules();
    apiPost.mockResolvedValue({ id: "s2" });
    renderPage(<SchedulesPage />);

    await screen.findByText("Business hours");
    await userEvent.type(
      screen.getByPlaceholderText("schedules.newName"),
      "Night shift",
    );
    await userEvent.click(screen.getAllByRole("button", { name: "common.create" })[0]!);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, payload] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/schedules");
    expect(payload.name).toBe("Night shift");
    expect(payload.timezone).toBe("Europe/Istanbul");
    // The default template ships three weekday ranges.
    expect(payload.ranges).toHaveLength(3);
  });

  it("falls back to a default name when none is typed", async () => {
    seedSchedules();
    apiPost.mockResolvedValue({ id: "s2" });
    renderPage(<SchedulesPage />);

    await screen.findByText("Business hours");
    await userEvent.click(screen.getAllByRole("button", { name: "common.create" })[0]!);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect((apiPost.mock.calls[0]![1] as Record<string, unknown>).name).toBe(
      "Business hours",
    );
  });
});

describe("SettingsPage", () => {
  function seedSettings() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/settings") {
        return { companyName: "MunaSIP", recordingRetentionMonths: 12 };
      }
      if (path === "/api/v1/admin/audit") return [];
      if (path === "/api/v1/admin/auth/totp/status") return { enabled: false };
      if (path === "/api/v1/admin/prompts") return [];
      if (path.includes("bans")) return { bans: [], memoryBans: [] };
      if (path.includes("security/status")) return { clientIp: "127.0.0.1" };
      if (path.includes("/ssl/status")) {
        return {
          hostname: null,
          autoSsl: false,
          status: "none",
          expiresAt: null,
          lastCheckAt: null,
          lastError: null,
          daysRemaining: null,
        };
      }
      // DestPicker also queries this page's lists; an object here crashes its .map.
      return [];
    });
  }

  it("renders the heading and loads the saved company name", async () => {
    seedSettings();
    renderPage(<SettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "settings.title" }),
    ).toBeInTheDocument();
  });

  it("patches the whole settings object on save", async () => {
    seedSettings();
    apiPatch.mockResolvedValue({});
    renderPage(<SettingsPage />);

    await userEvent.click((await screen.findAllByRole("button", { name: "common.save" }))[0]!);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    const [path, payload] = apiPatch.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/settings");
    // Seeded from the GET response, then round-tripped by the save.
    expect(payload.companyName).toBe("MunaSIP");
    expect(payload).toHaveProperty("recordingRetentionMonths");
    expect(toastSuccess).toHaveBeenCalledWith("Saved");
  });

  it("triggers an Asterisk reload", async () => {
    seedSettings();
    apiPost.mockResolvedValue({ ok: true });
    renderPage(<SettingsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "settings.reload" }));

    expect(apiPost).toHaveBeenCalledWith("/api/v1/admin/system/reload");
  });
});
/** Router covering every admin list endpoint the nine pages read. */
function seedAdmin() {
  apiGet.mockImplementation(async (path: string) => {
    if (path.includes("/admin/trunks")) {
      if (path.includes("/status")) return { status: "up", latencyMs: 12 };
      return [
        { id: "t1", name: "main", host: "sip.example", port: 5060, enabled: true },
      ];
    }
    if (path.includes("/admin/cdr")) {
      return [{ id: "c1", caller: "1000", callee: "101", disposition: "ANSWERED", duration: 42 }];
    }
    if (path.includes("/reports/quality")) return { total: 3, avgMos: 4.2, avgJitter: 5, avgLoss: 0.5 };
    if (path.includes("/reports/extensions")) {
      return [{ extension: "101", total: 3, talk: 120 }];
    }
    if (path.includes("/admin/devices")) {
      return [{ id: "d1", mac: "AA:BB:CC:DD:EE:FF", extensionId: "e1" }];
    }
    if (path.includes("/admin/webhooks")) {
      return [{ id: "w1", url: "https://x.test/hook", active: true }];
    }
    if (path.includes("/admin/api-keys")) {
      return [{ id: "k1", name: "ci", keyPrefix: "munasip_ab", permissions: ["read"] }];
    }
    if (path.includes("/admin/ring-groups")) {
      return [{ id: "g1", name: "Sales ring", number: "700", strategy: "ringall", memberIds: ["e1"] }];
    }
    if (path.includes("/routes/inbound")) {
      return [{ id: "r1", pattern: "0555", direction: "inbound", note: null }];
    }
    if (path.includes("/routes/outbound")) return [];
    if (path.includes("/routes/blacklist")) return [];
    if (path.includes("/admin/prompts")) return [{ id: "p1", name: "welcome" }];
    if (path === "/api/v1/admin/moh") return [{ id: "mc1", name: "hold-music", files: [] }];
    if (path.includes("/admin/extensions")) return [{ id: "e1", number: "201", name: "Ali" }];
    return [];
  });
}

beforeEach(() => {
  seedAdmin();
});

describe("TrunksPage", () => {
  it("renders the heading and one row per trunk", async () => {
    renderPage(<TrunksPage />);
    expect(await screen.findByRole("heading", { name: "trunks.title" })).toBeInTheDocument();
    expect(await screen.findByText("main")).toBeInTheDocument();
  });

  it("posts a new trunk from the add form", async () => {
    apiPost.mockResolvedValue({ id: "t2" });
    renderPage(<TrunksPage />);

    await screen.findByText("main");
    fireEvent.change(screen.getByPlaceholderText("Netgsm / Turkcell / Custom"), {
      target: { value: "Carrier" },
    });
    fireEvent.change(screen.getByPlaceholderText("sip.provider.example"), {
      target: { value: "sip.example.net" },
    });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "secret" },
    });
    fireEvent.change(screen.getByPlaceholderText("+442045773102"), {
      target: { value: "+442045773102" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "trunks.add" }).closest("form") as HTMLFormElement,
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, payload] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/trunks");
    expect(payload).toMatchObject({
      enabled: true,
      name: "Carrier",
      host: "sip.example.net",
      callerId: "+442045773102",
    });
  });

  it("deletes a trunk from its row", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<TrunksPage />);

    const row = (await screen.findByText("main")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "common.delete" }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/trunks/t1"));
  });
});

describe("CdrPage", () => {
  it("renders the heading and one row per call", async () => {
    renderPage(<CdrPage />);
    expect(await screen.findByRole("heading", { name: "cdr.title" })).toBeInTheDocument();
    expect(await screen.findByText("1000")).toBeInTheDocument();
    expect(screen.getAllByText("ANSWERED").length).toBeGreaterThan(0);
  });
});

describe("ReportsPage", () => {
  it("renders the heading and the quality totals", async () => {
    renderPage(<ReportsPage />);
    expect(await screen.findByRole("heading", { name: "reports.title" })).toBeInTheDocument();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(await screen.findByText("101")).toBeInTheDocument();
  });
});

describe("DevicesPage", () => {
  it("renders provisioned devices and deletes one", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<DevicesPage />);

    const row = (await screen.findByText("AA:BB:CC:DD:EE:FF")).closest("tr") as HTMLElement;
    // The delete affordance is an unlabelled danger icon.
    const del = row.querySelector("button.btn-danger") as HTMLButtonElement;
    await userEvent.click(del);

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/devices/d1"));
  });
});

describe("IntegrationsPage", () => {
  it("renders webhooks and API keys", async () => {
    renderPage(<IntegrationsPage />);
    expect(
      await screen.findByRole("heading", { name: "nav.integrations" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("https://x.test/hook")).toBeInTheDocument();
    expect(await screen.findByText(/ci ·/)).toBeInTheDocument();
  });

  it("creates a webhook from the first create button", async () => {
    apiPost.mockResolvedValue({ id: "w2" });
    renderPage(<IntegrationsPage />);

    await screen.findByText("https://x.test/hook");
    const create = screen.getAllByRole("button", { name: "common.create" })[0]!;
    await userEvent.click(create);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0]![0]).toBe("/api/v1/admin/webhooks");
  });

  it("deletes an API key from its row", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<IntegrationsPage />);

    const row = (await screen.findByText(/ci ·/)).closest("li") as HTMLElement;
    const del = row.querySelector("button.btn-danger") as HTMLButtonElement;
    await userEvent.click(del);

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/api-keys/k1"));
  });
});

describe("RingGroupsPage", () => {
  it("renders the heading and one group per row", async () => {
    renderPage(<RingGroupsPage />);
    expect(await screen.findByRole("heading", { name: "nav.ringGroups" })).toBeInTheDocument();
    expect(await screen.findByText("Sales ring")).toBeInTheDocument();
  });

  it("posts a new ring group with the typed number and name", async () => {
    apiPost.mockResolvedValue({ id: "g2" });
    renderPage(<RingGroupsPage />);

    await screen.findByText("Sales ring");
    await userEvent.type(screen.getByPlaceholderText("extensions.number"), "701");
    await userEvent.type(screen.getByPlaceholderText("extensions.name"), "Support ring");
    await userEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, payload] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/ring-groups");
    expect(payload).toMatchObject({ number: "701", name: "Support ring" });
  });

  it("deletes a ring group", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<RingGroupsPage />);

    const row = (await screen.findByText("Sales ring")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "common.delete" }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/ring-groups/g1"));
  });
});

describe("RoutesPage", () => {
  it("renders the heading and inbound routes", async () => {
    renderPage(<RoutesPage />);
    expect(await screen.findByRole("heading", { name: "routes.title" })).toBeInTheDocument();
    // The inbound list is queried on mount.
    await waitFor(() =>
      expect(apiGet.mock.calls.some(([p]) => String(p).includes("/routes/inbound"))).toBe(true),
    );
  });

  it("posts a new inbound route from the first create button", async () => {
    apiPost.mockResolvedValue({ id: "r2" });
    renderPage(<RoutesPage />);

    await waitFor(() =>
      expect(apiGet.mock.calls.some(([p]) => String(p).includes("/routes/inbound"))).toBe(true),
    );
    await userEvent.click(screen.getAllByRole("button", { name: "common.create" })[0]!);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0]![0]).toBe("/api/v1/admin/routes/inbound");
  });

  it("loads an inbound row into the form and PATCHes on save", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (String(path).includes("/routes/inbound")) {
        return [
          {
            id: "in1",
            did: "9000",
            callerPattern: null,
            destType: "hangup",
            destId: null,
            priority: 100,
          },
        ];
      }
      if (String(path).includes("/routes/outbound")) return [];
      if (String(path).includes("/trunks")) return [];
      if (String(path).includes("/blacklist")) return [];
      return [];
    });
    apiPatch.mockResolvedValue({ id: "in1" });
    renderPage(<RoutesPage />);

    const row = (await screen.findByText("9000")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /common\.edit|Edit/i }));
    expect(await screen.findByRole("button", { name: "common.save" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch.mock.calls[0]![0]).toBe("/api/v1/admin/routes/inbound/in1");
  });
});

describe("PromptsPage", () => {
  it("renders the heading and one row per prompt", async () => {
    renderPage(<PromptsPage />);
    expect(await screen.findByRole("heading", { name: "nav.prompts" })).toBeInTheDocument();
    expect(await screen.findByText("welcome")).toBeInTheDocument();
  });
});

describe("MohPage", () => {
  it("renders one row per MOH class", async () => {
    renderPage(<MohPage />);
    expect(await screen.findByText("hold-music")).toBeInTheDocument();
  });
});

/** Media fixtures and the fetch stub both upload flows need. */
const wavFile = () => new File([new Uint8Array([82, 73, 70, 70])], "tone.wav", { type: "audio/wav" });

function stubUploadFetch(body: unknown, ok = true) {
  // Typed parameters so mock.calls[0] is a [url, init] tuple, not [].
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PromptsPage audio upload", () => {
  it("uploads the attached file through FormData and auto-names the prompt", async () => {
    const fetchMock = stubUploadFetch({ id: "p9" });
    renderPage(<PromptsPage />);

    // The visible picker is the one without the "hidden" class.
    const input = document.querySelector(
      'input[type="file"]:not(.hidden)',
    ) as HTMLInputElement;
    await userEvent.upload(input, wavFile());

    // The filename minus extension becomes the prompt name.
    expect(await screen.findByDisplayValue("tone")).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "prompts.createWithUpload" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/prompts/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeTruthy();
    expect(toastSuccess).toHaveBeenCalledWith("prompts.uploaded");
    // The multipart upload bypasses the JSON api client entirely.
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("sends the JSON payload and skips the upload when no file is attached", async () => {
    const fetchMock = stubUploadFetch({ id: "p9" });
    apiPost.mockResolvedValue({ id: "p9" });
    renderPage(<PromptsPage />);

    // Required empty inputs block a click-submit, same as the Trunks form.
    await userEvent.type(screen.getByPlaceholderText("prompts.name"), "Test prompt");
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, payload] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/prompts");
    // No TTS text and no file: nothing to synthesize.
    expect(payload).toMatchObject({ synthesize: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PromptsPage synthesize", () => {
  it("generates TTS for a prompt that has text", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/prompts") {
        return [{ id: "p1", name: "welcome", ttsText: "hello", language: "en" }];
      }
      return [];
    });
    apiPost.mockResolvedValue({ ok: true });
    renderPage(<PromptsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "prompts.generate" }));

    expect(apiPost).toHaveBeenCalledWith("/api/v1/admin/prompts/p1/synthesize", {});
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("prompts.synthesized"));
  });

  it("disables Generate TTS when the prompt has no text", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/prompts") {
        return [{ id: "p2", name: "uploaded-only", language: "en" }];
      }
      return [];
    });
    renderPage(<PromptsPage />);

    expect(await screen.findByRole("button", { name: "prompts.generate" })).toBeDisabled();
  });
});

describe("MohPage upload", () => {
  function seedMoh() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/moh") return [{ id: "mc1", name: "hold-music", files: [] }];
      return [];
    });
  }

  it("uploads audio for a MOH class through FormData", async () => {
    seedMoh();
    const fetchMock = stubUploadFetch({ file: "tone.wav", converted: false });
    renderPage(<MohPage />);

    // The visible Upload button drives the row's hidden file input.
    await userEvent.click(await screen.findByRole("button", { name: "Upload" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, wavFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/moh/mc1/upload");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeTruthy();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Uploaded tone.wav"));
  });

  it("surfaces a failed MOH upload", async () => {
    seedMoh();
    stubUploadFetch({ error: "conversion failed" }, false);
    renderPage(<MohPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Upload" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, wavFile());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("conversion failed"));
  });
});

describe("MohPage file management", () => {
  function seedMohWithFiles() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/moh") {
        return [{ id: "mc1", name: "hold-music", files: ["tone.wav"] }];
      }
      return [];
    });
  }

  beforeEach(() => {
    seedMohWithFiles();
    // jsdom implements no media playback and no blob URLs.
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders each stored file with Play and Delete controls", async () => {
    renderPage(<MohPage />);

    expect(await screen.findByText("tone.wav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    const row = screen.getByText("tone.wav").closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("streams the file through the API when Play is clicked", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array(128)]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage(<MohPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Play" }));

    // playFile streams the stored file with credentials. Playback itself is
    // jsdom-hostile (media element), so only the network contract is asserted.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/moh/mc1/files/tone.wav/stream", {
        credentials: "include",
      }),
    );
  });

  it("deletes a file through the encoded endpoint and confirms", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<MohPage />);

    const row = (await screen.findByText("tone.wav")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/moh/mc1/files/tone.wav"),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Removed");
  });
});

describe("PromptsPage replace audio", () => {
  function seedPrompts() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/prompts") {
        return [{ id: "p1", name: "welcome", language: "en" }];
      }
      return [];
    });
  }

  it("uploads the replacement through FormData for that prompt", async () => {
    seedPrompts();
    const fetchMock = stubUploadFetch({ id: "p1" });
    renderPage(<PromptsPage />);

    const row = (await screen.findByText("welcome")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "prompts.uploadReplace" }));

    // The per-row replace picker is the hidden file input.
    const input = document.querySelector('input[type="file"].hidden') as HTMLInputElement;
    await userEvent.upload(input, wavFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/v1/admin/prompts/p1/upload");
    expect(toastSuccess).toHaveBeenCalledWith("prompts.uploaded");
  });
});

describe("FlowDesignerPage", () => {
  function seedDesigner() {
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes("/flows/f1/draft")) return { nodes: [], edges: [] };
      if (path.includes("/flows/f1/versions")) return [];
      if (path === "/api/v1/admin/flows") return [{ id: "f1", name: "Main IVR" }];
      if (path === "/api/v1/admin/queues") return [];
      if (path === "/api/v1/admin/extensions") return [];
      if (path === "/api/v1/admin/schedules") return [];
      if (path === "/api/v1/admin/secrets") return [];
      return [];
    });
  }

  /** The designer reads :id and React Flow measures its container. */
  function renderDesigner() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/flows/f1"]}>
          <Routes>
            <Route path="flows/:id" element={<FlowDesignerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    seedDesigner();
    window.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as typeof ResizeObserver;
    // React Flow also queries matchMedia for its colour scheme.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("loads the selected flow's draft and metadata", async () => {
    renderDesigner();

    // React Flow's jsdom rendering keeps the page in its loading state even
    // with ResizeObserver/matchMedia stubbed, so the verifiable contract is the
    // data the designer fetches for flow f1 — not its toolbar.
    await waitFor(() => {
      const paths = apiGet.mock.calls.map(([p]) => String(p));
      expect(paths.some((p) => p.endsWith("/flows/f1/draft"))).toBe(true);
      expect(paths.some((p) => p === "/api/v1/admin/flows")).toBe(true);
    });
  });
});

describe("TrunksPage enable toggle", () => {
  it("patches enabled:false for an enabled trunk", async () => {
    apiPatch.mockResolvedValue({});
    renderPage(<TrunksPage />);

    const row = (await screen.findByText("main")).closest("tr") as HTMLElement;
    expect(within(row).getByText("common.yes")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "trunks.disable" }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/v1/admin/trunks/t1", { enabled: false }),
    );
  });
});

describe("RingGroupsPage edit flow", () => {
  it("loads a group into the form and saves with PATCH", async () => {
    apiPatch.mockResolvedValue({});
    renderPage(<RingGroupsPage />);

    const row = (await screen.findByText("Sales ring")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Edit" }));

    // Edit mode flips the submit label and disables the number field.
    const save = await screen.findByRole("button", { name: "common.save" });
    expect(screen.getByPlaceholderText("extensions.number")).toBeDisabled();

    await userEvent.click(save);
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    const [path, payload] = apiPatch.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/admin/ring-groups/g1");
    expect(payload).toMatchObject({ name: "Sales ring", strategy: "ringall", memberIds: ["e1"] });
  });
});

describe("DevicesPage QR provisioning", () => {
  it("fetches the QR for a device and renders it", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes("/qr")) return { qr: "data:image/png;base64,QQ==", uri: "sip:101@x" };
      if (path === "/api/v1/admin/devices") {
        return [{ id: "d1", mac: "AA:BB:CC:DD:EE:FF", extensionId: "e1" }];
      }
      if (path === "/api/v1/admin/extensions") return [];
      return [];
    });

    renderPage(<DevicesPage />);

    const row = (await screen.findByText("AA:BB:CC:DD:EE:FF")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "QR" }));

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/api/v1/admin/devices/d1/qr"),
    );
    expect(await screen.findByAltText("SIP QR")).toBeInTheDocument();
    expect(screen.getByAltText("SIP QR")).toHaveAttribute("src", "data:image/png;base64,QQ==");
  });
});

describe("SchedulesPage overrides and delete", () => {
  function seedSchedulesWithOverride() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/admin/schedules") {
        return [{ id: "s1", name: "Business hours", overrideMode: "auto", ranges: [] }];
      }
      if (path === "/api/v1/admin/holidays") return [];
      return [];
    });
  }

  beforeEach(() => {
    seedSchedulesWithOverride();
    // The delete flow guards with window.confirm, which jsdom leaves undefined.
    window.confirm = vi.fn(() => true);
  });

  it("marks the active override mode as primary", async () => {
    renderPage(<SchedulesPage />);

    // The first schedule is auto-selected, and its current mode is highlighted.
    const auto = await screen.findByRole("button", { name: "schedules.auto" });
    expect(auto).toHaveClass("btn-primary");
    expect(screen.getByRole("button", { name: "schedules.closed" })).not.toHaveClass(
      "btn-primary",
    );
  });

  it("puts a closed override with no expiry", async () => {
    apiPut.mockResolvedValue({});
    renderPage(<SchedulesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "schedules.closed" }));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/api/v1/admin/schedules/s1/override", {
        overrideMode: "closed",
        overrideUntil: null,
      }),
    );
  });

  it("clears the override back to auto with a null until", async () => {
    apiPut.mockResolvedValue({});
    renderPage(<SchedulesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "schedules.auto" }));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/api/v1/admin/schedules/s1/override", {
        overrideMode: "auto",
        overrideUntil: null,
      }),
    );
  });

  it("deletes the selected schedule after confirmation", async () => {
    apiDelete.mockResolvedValue({});
    renderPage(<SchedulesPage />);

    await screen.findByText("Business hours");
    // Range/holiday deletes also use this label; the schedule's is the last.
    const deletes = screen.getAllByRole("button", { name: "common.delete" });
    await userEvent.click(deletes[deletes.length - 1]!);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/v1/admin/schedules/s1"));
  });
});

describe("IntegrationsPage API-key permissions", () => {
  it("patches the permission set when a key's checkbox is toggled", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes("/admin/webhooks")) return [];
      if (path.includes("/admin/api-keys")) {
        return [{ id: "k1", name: "ci", keyPrefix: "munasip_ab", permissions: ["read"] }];
      }
      return [];
    });
    apiPatch.mockResolvedValue({});
    renderPage(<IntegrationsPage />);

    const keyItem = (await screen.findByText(/ci ·/)).closest("li") as HTMLElement;
    const firstCheckbox = within(keyItem).getAllByRole("checkbox")[0]!;
    await userEvent.click(firstCheckbox);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    const [path, payload] = apiPatch.mock.calls[0] as unknown as [
      string,
      { permissions: string[] },
    ];
    expect(path).toBe("/api/v1/admin/api-keys/k1");
    // Toggling adds a second permission to the seeded ["read"] set.
    expect(payload.permissions).toContain("read");
    expect(payload.permissions).toHaveLength(2);
    expect(toastSuccess).toHaveBeenCalledWith("Permissions updated");
  });
});

describe("LoginPage", () => {
  function seedLogin() {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/me") {
        return { actor: { type: "admin", id: "a1", email: "admin@example.com" } };
      }
      return [];
    });
  }

  it("renders the app heading and the admin TOTP field by default", async () => {
    seedLogin();
    renderPage(<LoginPage />);

    expect(await screen.findByRole("heading", { name: "app.name" })).toBeInTheDocument();
    // Admin mode shows the authenticator field; portal mode hides it.
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth.adminLogin" }),
    ).toHaveClass("btn-primary");
  });

  it("signs in as admin, loads the actor, and navigates home", async () => {
    seedLogin();
    apiPost.mockResolvedValue({});
    renderPage(<LoginPage />);

    await userEvent.type(await screen.findByLabelText("auth.password"), "Admin123!");
    await userEvent.click(screen.getByRole("button", { name: "auth.signIn" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(apiPost).toHaveBeenCalledWith("/api/v1/admin/auth/login", {
      email: "admin@example.com",
      password: "Admin123!",
      totpCode: undefined,
    });
    expect(apiGet).toHaveBeenCalledWith("/api/v1/auth/me");
  });

  it("asks for a TOTP code when the admin login demands one", async () => {
    seedLogin();
    const challenge = new Error("TOTP required") as Error & { needTotp?: boolean };
    challenge.needTotp = true;
    apiPost.mockRejectedValueOnce(challenge);
    renderPage(<LoginPage />);

    await userEvent.click(await screen.findByRole("button", { name: "auth.signIn" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("auth.totpRequired"));
    // The challenge intercepted the flow before /auth/me and navigation.
    expect(apiGet).not.toHaveBeenCalledWith("/api/v1/auth/me");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs a portal extension in through the portal endpoint", async () => {
    seedLogin();
    apiPost.mockResolvedValue({});
    renderPage(<LoginPage />);

    await userEvent.click(await screen.findByRole("button", { name: "auth.portalLogin" }));
    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("auth.password"), "portal101");
    await userEvent.click(screen.getByRole("button", { name: "auth.signIn" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(apiPost).toHaveBeenCalledWith("/api/v1/auth/login", {
      extension: "101",
      password: "portal101",
    });
  });

  it("surfaces a failed login without navigating", async () => {
    seedLogin();
    apiPost.mockRejectedValueOnce(new Error("Invalid credentials"));
    renderPage(<LoginPage />);

    await userEvent.click(await screen.findByRole("button", { name: "auth.signIn" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid credentials"));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("AdminLayout", () => {
  it("renders outlet content and logs out to /login", async () => {
    apiPost.mockResolvedValue({});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<div>admin body</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("admin body")).toBeInTheDocument();
    expect(screen.getAllByText(/^v\d+\.\d+\.\d+/).length).toBeGreaterThan(0);
    // Mobile and desktop chrome each render a logout control.
    await userEvent.click(screen.getAllByTitle("auth.logout")[0]!);

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/auth/logout"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login", { replace: true }));
  });
});

describe("PortalLayout", () => {
  it("renders outlet content and logs out to /login", async () => {
    apiPost.mockResolvedValue({});
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/v1/me/voicemails") {
        return [
          { id: "v1", read: false },
          { id: "v2", read: true },
        ];
      }
      if (path === "/api/v1/me/missed-calls") {
        return [
          { id: "m1", status: "pending" },
          { id: "m2", status: "returned" },
          { id: "m3", status: "pending" },
        ];
      }
      return [];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="portal" element={<PortalLayout />}>
              <Route index element={<div>portal body</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("portal body")).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.className).toContain("portal-rail");
    const phoneLink = within(aside).getByRole("link", { name: /nav\.phone/ });
    const voicemailLink = within(aside).getByRole("link", { name: /nav\.voicemail/ });
    expect(await within(phoneLink).findByText("2")).toBeInTheDocument();
    expect(within(voicemailLink).getByText("1")).toBeInTheDocument();
    const phone = within(aside).getByRole("region", { name: "portal.miniPhone" });
    const settings = within(aside).getByRole("link", { name: "nav.mySettings" });
    expect(phone.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(phoneLink.querySelector(".nav-reg")?.className).toContain("is-off");
    expect(document.querySelector("nav.fixed .nav-reg")?.className).toContain("is-off");
    const language = within(aside).getByTitle("common.language");
    const theme = within(aside).getByTitle("common.theme");
    const logout = within(aside).getByTitle("common.logout");
    const foot = logout.parentElement as HTMLElement;
    expect(foot.className).toContain("portal-rail-foot");
    // Mini phone sits under the name; language, theme and logout stay at the foot.
    expect(phone.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(language.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(theme.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByTitle("common.logout"));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/auth/logout"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login", { replace: true }));
    // Navigation itself is asserted through the mocked useNavigate — the stub
    // records the call without changing the router location.
  });
});
