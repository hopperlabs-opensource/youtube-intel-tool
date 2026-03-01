# @yt/sdk

Typed SDK client for the YouTube Intel Tool local API.

## Install

```bash
npm install @yt/sdk @yt/contracts
```

## Usage

```ts
import { createYitClient } from "@yt/sdk";

const api = createYitClient({ baseUrl: "http://localhost:3333" });
const health = await api.health();
console.log(health.ok);
```

## Saved policy example

```ts
const { policy } = await api.createPolicy({
  name: "daily-rag",
  search_payload: { query: "retrieval quality", mode: "hybrid", limit: 20, language: "en" },
  priority_config: {
    weights: { recency: 0.3, relevance: 0.6, channel_boost: 0.1 },
    thresholds: { high: 0.85, medium: 0.55 },
  },
});

await api.runPolicy(policy.id, { triggered_by: "cli" });
const feed = await api.getPolicyFeedJson(policy.id, policy.feed_token);
console.log(feed.items.length);
```
