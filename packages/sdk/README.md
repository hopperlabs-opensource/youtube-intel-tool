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
