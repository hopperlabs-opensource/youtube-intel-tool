import test from "node:test";
import assert from "node:assert/strict";
import { createYitClient, YitApiError } from "../src/client";

test("sdk preserves structured API errors when envelope matches contract", async () => {
  const api = createYitClient({
    baseUrl: "http://example.test",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "video_not_found",
            message: "Video not found",
            details: { videoId: "missing-video" },
          },
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  await assert.rejects(
    async () => {
      await api.getVideo("missing-video");
    },
    (err: unknown) => {
      assert.ok(err instanceof YitApiError);
      assert.equal(err.code, "video_not_found");
      assert.equal(err.status, 404);
      assert.deepEqual(err.details, { videoId: "missing-video" });
      return true;
    },
  );
});

test("sdk falls back to http_error when response body is not in API envelope format", async () => {
  const api = createYitClient({
    baseUrl: "http://example.test",
    fetch: async () =>
      new Response("upstream unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
  });

  await assert.rejects(
    async () => {
      await api.getVideo("anything");
    },
    (err: unknown) => {
      assert.ok(err instanceof YitApiError);
      assert.equal(err.code, "http_error");
      assert.equal(err.status, 503);
      assert.equal(err.message, "upstream unavailable");
      return true;
    },
  );
});
