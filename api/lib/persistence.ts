import fs from "fs/promises";
import path from "path";

/**
 * DATA_DIR resolution:
 * 1. process.env.DATA_DIR overrides everything (for Railway/custom paths)
 * 2. Try process.cwd() + "/data" (production, WORKDIR=/app)
 * 3. Try "/app/data" (fallback for Railway or other containers)
 * 4. Create and use process.cwd() + "/data" as last resort
 */
function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  const candidates = [
    path.resolve(process.cwd(), "data"),
    "/app/data",
    path.resolve(import.meta.dirname || "", "../data"),
  ];
  for (const p of candidates) {
    if (p) return p;
  }
  return path.resolve(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
console.log(`[persistence] DATA_DIR resolved to: ${DATA_DIR}`);

/**
 * Ensure a file exists with a default value. Creates parent directories if needed.
 */
export async function ensureFile<T>(filename: string, defaultValue: T): Promise<void> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    await fs.access(filePath);
  } catch {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
      console.log(`[persistence] Created default file: ${filePath}`);
    } catch (err: any) {
      console.error(`[persistence] Failed to create ${filePath}: ${err.message}`);
    }
  }
}

/**
 * Read a JSON file. If it does not exist, returns the provided defaultValue
 * and writes the default file to disk. This prevents []-as-object crashes.
 */
export async function readJsonFile<T>(filename: string, defaultValue?: T): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File does not exist
      if (defaultValue !== undefined) {
        // Write default and return it
        try {
          await fs.mkdir(DATA_DIR, { recursive: true });
          await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
          console.log(`[persistence] Created default file: ${filePath}`);
        } catch (writeErr: any) {
          console.error(`[persistence] Failed to create default ${filePath}: ${writeErr.message}`);
        }
        return defaultValue;
      }
      // Legacy fallback: return [] (maintains backward compat for array types)
      return [] as unknown as T;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  const filePath = path.join(DATA_DIR, filename);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function readCsvFile(filename: string): Promise<string[][]> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(","));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeCsvFile(filename: string, rows: string[][]): Promise<void> {
  const filePath = path.join(DATA_DIR, filename);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const content = rows.map((row) => row.join(",")).join("\n") + "\n";
  await fs.writeFile(filePath, content, "utf-8");
}
