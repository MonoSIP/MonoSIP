import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for the shared API client.
 *
 * The wrapper is what every page depends on for auth cookies, the Fastify
 * "empty JSON body is rejected" workaround, the TOTP challenge flag and the
 * JSON-vs-text response split, so each of those is pinned here. `fetch` is the
 * only mocked boundary.
 */

import { api } from "./api.js";

function jsonRes(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function textRes(body: string, contentType = "text/plain", init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
    ...init,
  });
}

function respond(res: Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The init object handed to fetch for call #0. */
function call(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("response decoding", () => {
  it("parses a JSON response", async () => {
    respond(jsonRes({ id: "c1", ok: true }));

    await expect(api.get("/api/v1/me/calls")).resolves.toEqual({ id: "c1", ok: true });
  });

  it("parses JSON when the content-type carries a charset", async () => {
    respond(
      new Response(JSON.stringify({ a: 1 }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await expect(api.get("/api/v1/me")).resolves.toEqual({ a: 1 });
  });

  it("returns text for a non-JSON content-type", async () => {
    // CDR export answers with CSV, so this branch is load-bearing.
    respond(textRes("id,direction\nc1,inbound\n", "text/csv"));

    await expect(api.get("/api/v1/admin/cdr/export")).resolves.toBe(
      "id,direction\nc1,inbound\n",
    );
  });

  it("returns an empty string when the response has no content-type", async () => {
    respond(new Response(null, { status: 204 }));

    await expect(api.delete("/api/v1/me/x")).resolves.toBe("");
  });
});

describe("request shaping", () => {
  it("always sends cookies", async () => {
    const fetchMock = respond(jsonRes({}));

    await api.get("/api/v1/me");

    expect(call(fetchMock).init.credentials).toBe("include");
  });

  it("omits content-type on a GET with no body", async () => {
    const fetchMock = respond(jsonRes({}));

    await api.get("/api/v1/me");

    expect(call(fetchMock).headers.has("content-type")).toBe(false);
  });

  it("sends a JSON body and content-type on POST", async () => {
    const fetchMock = respond(jsonRes({}));

    await api.post("/api/v1/me/x", { a: 1 });

    const { init, headers } = call(fetchMock);
    expect(init.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it.each(["post", "patch", "put"] as const)(
    "sends {} for %s with no body so Fastify does not reject an empty payload",
    async (method) => {
      const fetchMock = respond(jsonRes({}));

      await api[method]("/api/v1/me/x");

      const { init, headers } = call(fetchMock);
      // "{}" is a non-empty body, so content-type is set and the request is legal.
      expect(init.body).toBe("{}");
      expect(headers.get("content-type")).toBe("application/json");
    },
  );

  it("omits content-type on DELETE", async () => {
    const fetchMock = respond(jsonRes({}));

    await api.delete("/api/v1/me/x");

    const { init, headers } = call(fetchMock);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(headers.has("content-type")).toBe(false);
  });

  // `request` is private and no public method forwards caller headers, so its
  // "do not overwrite a supplied content-type" guard is unreachable from here
  // and is deliberately not asserted.
});

describe("error shape", () => {
  it("throws the server's error message", async () => {
    respond(jsonRes({ error: "Invalid credentials" }, { status: 401 }));

    await expect(api.post("/api/v1/auth/login")).rejects.toThrow("Invalid credentials");
  });

  it("falls back to a generic message when the body has no error field", async () => {
    respond(jsonRes({ detail: "nope" }, { status: 400 }));

    await expect(api.post("/api/v1/auth/login")).rejects.toThrow("Request failed");
  });

  it("passes the needTotp challenge flag through", async () => {
    respond(jsonRes({ error: "TOTP required", needTotp: true }, { status: 401 }));

    await expect(api.post("/api/v1/admin/auth/login")).rejects.toMatchObject({
      message: "TOTP required",
      needTotp: true,
    });
  });

  it("leaves needTotp undefined on an ordinary failure", async () => {
    respond(jsonRes({ error: "nope" }, { status: 403 }));

    await expect(api.get("/api/v1/me")).rejects.toMatchObject({ needTotp: undefined });
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    respond(new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway" }));

    // res.json() rejects, so the wrapper must not propagate that parse error.
    await expect(api.get("/api/v1/me")).rejects.toThrow("Bad Gateway");
  });

  it("throws an Error instance, not a bare rejection value", async () => {
    respond(jsonRes({ error: "boom" }, { status: 500 }));

    await expect(api.get("/api/v1/me")).rejects.toBeInstanceOf(Error);
  });
});