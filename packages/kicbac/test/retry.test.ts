import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Kicbac, {
  ConnectionError,
  HttpError,
  RateLimitError,
  TimeoutError,
} from "../src/index";
import { formBody, TEST_KEY } from "./helpers/gateway";

/**
 * Retry policy tests use injected fetch stubs (no msw) and Math.random
 * mocked to 0, which collapses the full-jitter backoff to 0ms — the retry
 * *decisions* are asserted via exact fetch call counts.
 */
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function rejectingFetch(code: string): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.reject(
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(code), { code }),
      }),
    ),
  );
}

function respondingFetch(body: string, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve(
      new Response(body, { status, headers: { "content-type": "text/html" } }),
    ),
  );
}

/** A fetch that hangs until the abort signal fires (honors timeouts). */
function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

const SALE = { amount: "10.00", paymentToken: "tok" } as const;

describe("transact.php (double-charge invariant)", () => {
  it("ECONNRESET (sent unknown): exactly 1 attempt, then ConnectionError", async () => {
    const fetchSpy = rejectingFetch("ECONNRESET");
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.transactions.sale(SALE)).rejects.toBeInstanceOf(ConnectionError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("res.text() failure (sent true): exactly 1 attempt", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: () => Promise.reject(new Error("hang up")),
      } as unknown as Response),
    );
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    let caught: unknown;
    try {
      await client.transactions.sale(SALE);
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("HTTP 502: exactly 1 attempt, then HttpError", async () => {
    const fetchSpy = respondingFetch("bad gateway", 502);
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.transactions.sale(SALE)).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("timeout: exactly 1 attempt, then TimeoutError", async () => {
    const fetchSpy = hangingFetch();
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never, timeoutMs: 20 });
    await expect(client.transactions.sale(SALE)).rejects.toBeInstanceOf(TimeoutError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("response_code 301 (Payment-API rate limit): exactly 1 attempt, never retried", async () => {
    const fetchSpy = respondingFetch(
      formBody({ response: "3", responsetext: "Rate limit exceeded", response_code: "301" }),
    );
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.transactions.sale(SALE)).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("HTTP 429: exactly 1 attempt on transact (non-idempotent)", async () => {
    const fetchSpy = respondingFetch("slow down", 429);
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.transactions.sale(SALE)).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ECONNREFUSED (sent false): retried up to maxRetries, 3 attempts total", async () => {
    const fetchSpy = rejectingFetch("ECONNREFUSED");
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    let caught: unknown;
    try {
      await client.transactions.sale(SALE);
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 + maxRetries(2)
  });

  it("recovers when a pre-send failure clears up", async () => {
    let calls = 0;
    const fetchSpy = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(
          Object.assign(new TypeError("fetch failed"), {
            cause: Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
          }),
        );
      }
      return Promise.resolve(
        new Response(
          formBody({ response: "1", responsetext: "SUCCESS", transactionid: "1", response_code: "100" }),
          { status: 200 },
        ),
      );
    });
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    const result = await client.transactions.sale(SALE);
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("query.php (idempotent)", () => {
  it("ECONNRESET: 3 attempts max, then throws", async () => {
    const fetchSpy = rejectingFetch("ECONNRESET");
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.query.raw({ report_type: "recurring_plans" })).rejects.toBeInstanceOf(
      ConnectionError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("timeout: retried, 3 attempts max", async () => {
    const fetchSpy = hangingFetch();
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never, timeoutMs: 15 });
    await expect(client.query.raw({})).rejects.toBeInstanceOf(TimeoutError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("HTTP 503: retried, 3 attempts max", async () => {
    const fetchSpy = respondingFetch("unavailable", 503);
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.query.raw({})).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("HTTP 429: retried with rate-limit backoff, 3 attempts max", async () => {
    const fetchSpy = respondingFetch("slow down", 429);
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.query.raw({})).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("HTTP 500 is NOT retried (only 502/503/504)", async () => {
    const fetchSpy = respondingFetch("oops", 500);
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    await expect(client.query.raw({})).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("maxRetries: 0 disables retries", async () => {
    const fetchSpy = rejectingFetch("ECONNREFUSED");
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never, maxRetries: 0 });
    await expect(client.query.raw({})).rejects.toBeInstanceOf(ConnectionError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("no retry after a user abort (reason rethrown, 1 attempt)", async () => {
    const fetchSpy = hangingFetch();
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    const reason = new Error("stop");
    const controller = new AbortController();
    const promise = client.query.raw({}, { signal: controller.signal });
    setTimeout(() => controller.abort(reason), 10);
    await expect(promise).rejects.toBe(reason);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
