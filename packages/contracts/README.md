# @yt/contracts

Zod request/response schemas and shared types for YouTube Intel Tool.

## Install

```bash
npm install @yt/contracts
```

## Usage

```ts
import { ResolveVideoRequestSchema } from "@yt/contracts";

const parsed = ResolveVideoRequestSchema.parse({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
```
