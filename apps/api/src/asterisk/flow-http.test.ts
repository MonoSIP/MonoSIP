import { describe, expect, it } from "vitest";
import { buildFlowApiRequest } from "./flow-http.js";

const secret = async (id: string) => (id === "s1" ? "tok" : null);

describe("buildFlowApiRequest", () => {
  it("adds the secret as a custom header and expands templates", async () => {
    const req = await buildFlowApiRequest(
      {
        url: "https://crm.example.com/c?n=$caller",
        method: "post",
        headers: { "x-did": "{{did}}" },
        body: '{"n":"$caller"}',
        authType: "header",
        authHeader: "authorization",
        secretId: "s1",
      },
      { caller: "05321234567", did: "902243222120" },
      secret,
    );
    expect(req.url).toBe("https://crm.example.com/c?n=05321234567");
    expect(req.method).toBe("POST");
    expect(req.headers).toEqual({ "x-did": "902243222120", authorization: "tok" });
    expect(req.body).toBe('{"n":"05321234567"}');
  });

  it("supports bearer and basic, and drops a GET body", async () => {
    const bearer = await buildFlowApiRequest(
      { url: "https://a", authType: "bearer", secretId: "s1", body: "x" },
      {},
      secret,
    );
    expect(bearer.headers).toEqual({ Authorization: "Bearer tok" });
    expect(bearer.body).toBeUndefined();
    const basic = await buildFlowApiRequest({ url: "https://a", authType: "basic", secretId: "s1" }, {}, secret);
    expect(basic.headers).toEqual({ Authorization: "Basic tok" });
  });

  it("sends no auth when the secret is missing or auth is none", async () => {
    expect((await buildFlowApiRequest({ url: "https://a", authType: "bearer", secretId: "zz" }, {}, secret)).headers).toEqual({});
    expect((await buildFlowApiRequest({ url: "https://a", authType: "none", secretId: "s1" }, {}, secret)).headers).toEqual({});
  });
});
