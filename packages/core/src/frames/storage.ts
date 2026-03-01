import fs from "fs/promises";
import path from "path";

export interface FrameStore {
  save(videoId: string, frameIndex: number, data: Buffer): Promise<string>;
  load(filePath: string): Promise<Buffer>;
  getUrl(filePath: string): string;
  delete(videoId: string): Promise<void>;
}

export class LocalFrameStore implements FrameStore {
  constructor(private readonly baseDir: string) {}

  async save(videoId: string, frameIndex: number, data: Buffer): Promise<string> {
    const dir = path.join(this.baseDir, videoId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `frame_${String(frameIndex).padStart(6, "0")}.jpg`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async load(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  getUrl(filePath: string): string {
    return filePath;
  }

  async delete(videoId: string): Promise<void> {
    const dir = path.join(this.baseDir, videoId);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function createFrameStore(baseDir?: string): FrameStore {
  const dir = baseDir || process.env.YIT_FRAMES_DIR || path.join(process.cwd(), ".run", "frames");
  return new LocalFrameStore(dir);
}
