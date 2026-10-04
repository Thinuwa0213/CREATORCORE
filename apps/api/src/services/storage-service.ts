import path from "node:path";
import fs from "node:fs/promises";
import type { Logger } from "@creatorcore/logger";

export interface StorageService {
  saveFile(relativePath: string, buffer: Buffer): Promise<string>;
  deleteFile(relativePath: string): Promise<boolean>;
  readFile(relativePath: string): Promise<Buffer | null>;
  getAbsoluteFilePath(relativePath: string): string;
}

export class LocalStorageService implements StorageService {
  private readonly baseDir: string;
  private readonly logger: Logger;

  constructor(options?: { baseDir?: string; logger?: Logger }) {
    this.baseDir = options?.baseDir
      ? path.resolve(options.baseDir)
      : path.resolve(process.cwd(), "storage");
    this.logger = options?.logger ?? console;
  }

  public getAbsoluteFilePath(relativePath: string): string {
    const sanitized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.baseDir, sanitized);
  }

  public async saveFile(relativePath: string, buffer: Buffer): Promise<string> {
    const targetPath = this.getAbsoluteFilePath(relativePath);
    const parentDir = path.dirname(targetPath);

    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(targetPath, buffer);
    this.logger.info?.("storage.file_saved", { targetPath, size: buffer.length });

    return relativePath.replace(/\\/g, "/");
  }

  public async readFile(relativePath: string): Promise<Buffer | null> {
    const targetPath = this.getAbsoluteFilePath(relativePath);
    try {
      return await fs.readFile(targetPath);
    } catch {
      return null;
    }
  }

  public async deleteFile(relativePath: string): Promise<boolean> {
    const targetPath = this.getAbsoluteFilePath(relativePath);
    try {
      await fs.unlink(targetPath);
      this.logger.info?.("storage.file_deleted", { targetPath });
      return true;
    } catch (err) {
      // File might already be gone
      return false;
    }
  }
}
