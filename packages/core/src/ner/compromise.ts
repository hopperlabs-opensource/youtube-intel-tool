import nlp from "compromise";

export type NerEntity = { type: "person" | "org" | "location"; name: string; confidence: number };

// Lightweight NER with compromise. This is intentionally simple: it is fast and works without external services.
// Expect false positives; treat as "assistive" signals that can be refined later.
export function extractEntitiesFromText(text: string): NerEntity[] {
  const doc = nlp(text);

  const people = doc.people().out("array") as string[];
  const orgs = doc.organizations().out("array") as string[];
  const places = doc.places().out("array") as string[];

  const uniq = new Map<string, NerEntity>();
  const add = (type: NerEntity["type"], name: string, confidence: number) => {
    const key = `${type}:${name.toLowerCase()}`;
    if (!uniq.has(key)) uniq.set(key, { type, name, confidence });
  };

  for (const p of people) add("person", p, 0.6);
  for (const o of orgs) add("org", o, 0.55);
  for (const l of places) add("location", l, 0.55);

  return Array.from(uniq.values())
    .map((e) => ({ ...e, name: e.name.trim() }))
    .filter((e) => e.name.length >= 2);
}

