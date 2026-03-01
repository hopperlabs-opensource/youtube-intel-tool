import { createYitClient } from "@yt/sdk";

const BASE = process.env.YIT_BASE_URL ?? "http://localhost:48333";
const VID = process.env.VIDEO_ID ?? "7370eef9-52f8-47c7-bef4-da8475af943f";

const client = createYitClient({ baseUrl: BASE });

let pass = 0;
let fail = 0;

async function check(label: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`  OK   ${label}`);
    pass++;
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  FAIL ${label}`);
    console.log(`       ${msg.slice(0, 120)}`);
    fail++;
    return null;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  console.log("=== SDK Live Verification (with content validation) ===");
  console.log(`  Video: ${VID}`);
  console.log(`  Base:  ${BASE}`);
  console.log("");

  await check("health", async () => {
    const result = await client.health();
    assert(result !== null && result !== undefined, "health returns a response");
    return result;
  });

  await check("getVideo", async () => {
    const result = await client.getVideo(VID);
    assert((result as any).video.id === VID, "video ID matches");
    assert((result as any).video.title.length > 0, "video has title");
    return result;
  });

  await check("listTranscripts", async () => {
    const result = await client.listTranscripts(VID);
    assert(Array.isArray((result as any).transcripts), "transcripts is an array");
    return result;
  });

  await check("searchVideo (keyword)", async () => {
    const result = await client.searchVideo(VID, { query: "zoo", mode: "keyword" });
    assert((result as any).results !== undefined, "search returns results");
    return result;
  });

  await check("listEntities", async () => {
    const result = await client.listEntities(VID);
    assert(Array.isArray((result as any).entities), "entities is an array");
    return result;
  });

  await check("listVideoTags", async () => {
    const result = await client.listVideoTags(VID);
    assert(Array.isArray((result as any).tags), "tags is an array");
    return result;
  });

  await check("listVideoChapters", async () => {
    const result = await client.listVideoChapters(VID);
    assert(Array.isArray((result as any).chapters), "chapters is an array");
    return result;
  });

  await check("listVideoSpeakers", async () => {
    const result = await client.listVideoSpeakers(VID);
    assert(Array.isArray((result as any).speakers), "speakers is an array");
    return result;
  });

  await check("getActionTranscript", async () => {
    const result = await client.getActionTranscript(VID);
    assert((result as any).transcript !== undefined, "action transcript present");
    return result;
  });

  await check("getVisualStatus", async () => {
    const result = await client.getVisualStatus(VID);
    assert((result as any).status !== undefined, "visual status present");
    return result;
  });

  await check("listFrames", async () => {
    const result = await client.listFrames(VID);
    assert(Array.isArray((result as any).frames), "frames is an array");
    return result;
  });

  await check("getFrameChunks", async () => {
    const result = await client.getFrameChunks(VID);
    assert(Array.isArray((result as any).chunks), "chunks is an array");
    return result;
  });

  await check("getDenseTranscript", async () => {
    const result = await client.getDenseTranscript(VID);
    assert((result as any).transcript !== undefined, "dense transcript present");
    const cues = (result as any).transcript?.cues;
    if (Array.isArray(cues) && cues.length > 0) {
      assert(
        cues[0].description && cues[0].description.length > 10,
        "dense transcript cues have real descriptions (not empty/stub)",
      );
    }
    return result;
  });

  await check("getAutoChapters", async () => {
    const result = await client.getAutoChapters(VID);
    assert((result as any).chapters !== undefined, "auto chapters present");
    return result;
  });

  await check("listSignificantMarks", async () => {
    const result = await client.listSignificantMarks(VID);
    assert(Array.isArray((result as any).marks), "marks is an array");
    return result;
  });

  await check("listFaceIdentities", async () => {
    const result = await client.listFaceIdentities(VID);
    assert(Array.isArray((result as any).faces), "faces is an array");
    return result;
  });

  await check("listGlobalSpeakers", async () => {
    const result = await client.listGlobalSpeakers();
    assert(Array.isArray((result as any).speakers), "global speakers is an array");
    return result;
  });

  await check("listPolicies", async () => {
    const result = await client.listPolicies();
    assert(Array.isArray((result as any).policies), "policies is an array");
    return result;
  });

  await check("ingestFaces (queue)", async () => {
    const result = await client.ingestFaces(VID);
    assert((result as any).job !== undefined, "ingestFaces returns a job");
    return result;
  });

  await check("ingestVoice (queue)", async () => {
    const result = await client.ingestVoice(VID);
    assert((result as any).job !== undefined, "ingestVoice returns a job");
    return result;
  });

  console.log("");
  console.log("=== Results ===");
  console.log(`  passed: ${pass}`);
  console.log(`  failed: ${fail}`);
  if (fail > 0) process.exit(1);
  console.log("ALL PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
