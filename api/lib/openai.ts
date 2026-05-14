import axios, { AxiosError } from "axios";
import { readJsonFile, writeJsonFile } from "./persistence";
import type { AdminSettings } from "@contracts/types";
import type { SchemaName } from "./openai-schemas";
import { Schemas } from "./openai-schemas";
import {
  generateMockOperationalOptions,
  generateMockSimulationData,
  generateMockFeedback,
} from "./openai-demo";

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  apiKey: "",
  model: "gpt-4o",
  systemPrompt: "",
  baseUrl: "https://api.openai.com/v1",
  demoMode: true,
};

export class OpenAIError extends Error {
  code: string;
  status?: number;
  retryAfter?: number;

  constructor(message: string, code: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = "OpenAIError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface SaveRawResponseOptions {
  groupNumber: string;
  session: number;
  round: number;
  schemaName: SchemaName;
  prompt: string;
  rawResponse: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  isDemo?: boolean;
}

export interface RawResponseEntry {
  id: string;
  groupNumber: string;
  session: number;
  round: number;
  schemaName: string;
  prompt: string;
  rawResponse: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  isDemo?: boolean;
  timestamp: string;
}

/**
 * Save every raw AI response to a local JSON file for admin review.
 */
export async function saveRawResponse(opts: SaveRawResponseOptions): Promise<void> {
  const entries = await readJsonFile<RawResponseEntry[]>("ai-raw-responses.json");
  entries.push({
    id: `${opts.groupNumber}-${opts.session}-${opts.round}-${Date.now()}`,
    groupNumber: opts.groupNumber,
    session: opts.session,
    round: opts.round,
    schemaName: opts.schemaName,
    prompt: opts.prompt,
    rawResponse: opts.rawResponse,
    success: opts.success,
    errorCode: opts.errorCode,
    errorMessage: opts.errorMessage,
    isDemo: opts.isDemo,
    timestamp: new Date().toISOString(),
  });
  await writeJsonFile("ai-raw-responses.json", entries);
}

/**
 * Build axios client for OpenAI Chat Completions API.
 */
function buildClient(config: AdminSettings) {
  const baseURL = (config.baseUrl || "https://api.openai.com/v1").replace(/\/v1\/?$/, "");
  return axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Call OpenAI Chat Completions API with structured JSON Schema output via axios.
 * If demoMode is enabled, uses local mock generator instead.
 */
export async function callOpenAIResponse<T = unknown>(
  input: ChatMessage[],
  schemaName: SchemaName,
  saveMeta?: { groupNumber: string; session: number; round: number; prompt: string },
): Promise<T> {
  const config = await readJsonFile<AdminSettings>("admin-settings.json", DEFAULT_ADMIN_SETTINGS);

  // --- DEMO MODE: bypass OpenAI entirely ---
  if (config.demoMode) {
    let mockData: unknown;

    if (schemaName === "operational_options") {
      // Extract project/sector/session from prompt heuristics
      const projectMatch = saveMeta?.prompt.match(/proyecto "([^"]+)"/);
      const sectorMatch = saveMeta?.prompt.match(/del sector "([^"]+)"/);
      mockData = {
        options: generateMockOperationalOptions(
          projectMatch?.[1] || "Proyecto Demo",
          (sectorMatch?.[1] || "industrial").trim(),
          saveMeta?.session || 1,
        ),
      };
    } else if (schemaName === "simulation_data") {
      const projectMatch = saveMeta?.prompt.match(/proyecto "([^"]+)"/);
      const sectorMatch = saveMeta?.prompt.match(/del sector "([^"]+)"/);
      mockData = {
        periods: generateMockSimulationData(
          projectMatch?.[1] || "Proyecto Demo",
          (sectorMatch?.[1] || "industrial").trim(),
          saveMeta?.session || 1,
        ),
      };
    } else if (schemaName === "academic_feedback") {
      // Extract values from prompt
      const vpnMatch = saveMeta?.prompt.match(/VPN: ([\d.-]+)/);
      const tirMatch = saveMeta?.prompt.match(/TIR: ([\d.-]+)/);
      const bcMatch = saveMeta?.prompt.match(/B\/C: ([\d.-]+)/);
      mockData = generateMockFeedback(
        parseFloat(vpnMatch?.[1] || "0"),
        parseFloat(tirMatch?.[1] || "0"),
        parseFloat(bcMatch?.[1] || "0"),
        "",
        saveMeta?.session || 1,
        saveMeta?.round || 1,
      );
    } else {
      mockData = {};
    }

    const rawText = JSON.stringify(mockData);
    if (saveMeta) {
      await saveRawResponse({ ...saveMeta, schemaName, rawResponse: rawText, success: true, isDemo: true });
    }
    return mockData as T;
  }

  // --- Pre-flight validations ---
  if (!config.apiKey || config.apiKey.trim() === "") {
    const err = new OpenAIError("OpenAI API key not configured. Go to Admin > Configuracion IA.", "MISSING_API_KEY", 401);
    if (saveMeta) {
      await saveRawResponse({ ...saveMeta, schemaName, rawResponse: "", success: false, errorCode: err.code, errorMessage: err.message });
    }
    throw err;
  }

  const model = config.model?.trim() || "gpt-4o";
  const systemPrompt = config.systemPrompt?.trim() || "Eres un asistente experto.";

  if (model.length === 0 || model.includes(" ")) {
    const err = new OpenAIError(`Invalid model name: "${model}". Check Admin > Configuracion IA.`, "INVALID_MODEL", 400);
    if (saveMeta) {
      await saveRawResponse({ ...saveMeta, schemaName, rawResponse: "", success: false, errorCode: err.code, errorMessage: err.message });
    }
    throw err;
  }

  // Inject system prompt as first system message if not present
  const finalInput: ChatMessage[] =
    input[0]?.role === "system"
      ? input
      : [{ role: "system", content: systemPrompt }, ...input];

  if (finalInput[0]?.role === "system" && (!finalInput[0].content || finalInput[0].content.trim() === "")) {
    finalInput[0] = { role: "system", content: systemPrompt };
  }

  // Use statically imported schemas (works in both dev and production)
  const schemaDef = (Schemas as Record<string, { name: string; strict: boolean; schema: Record<string, unknown> }>)[schemaName];
  if (!schemaDef) {
    const err = new OpenAIError(`Schema "${schemaName}" not found.`, "SCHEMA_NOT_FOUND", 500);
    if (saveMeta) {
      await saveRawResponse({ ...saveMeta, schemaName, rawResponse: "", success: false, errorCode: err.code, errorMessage: err.message });
    }
    throw err;
  }

  const client = buildClient(config);

  let lastError: OpenAIError | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.post("/v1/chat/completions", {
        model,
        messages: finalInput,
        temperature: 0.7,
        max_tokens: 4000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaDef.name,
            strict: true,
            schema: schemaDef.schema,
          },
        },
      });

      const rawText = response.data?.choices?.[0]?.message?.content;
      if (!rawText || rawText.trim() === "") {
        throw new OpenAIError("Empty response from model", "EMPTY_RESPONSE", 500);
      }

      let parsed: T;
      try {
        parsed = JSON.parse(rawText) as T;
      } catch {
        throw new OpenAIError(
          "Model returned invalid JSON. Check the system prompt or model compatibility.",
          "INVALID_JSON",
          500,
        );
      }

      if (saveMeta) {
        await saveRawResponse({ ...saveMeta, schemaName, rawResponse: rawText, success: true });
      }

      return parsed;
    } catch (err: any) {
      const classified = classifyAxiosError(err, attempt);
      lastError = classified;

      // Never retry on auth (401), bad request (400), model not found (404)
      if (classified.status === 401 || classified.status === 400 || classified.status === 404) {
        if (saveMeta) {
          await saveRawResponse({
            ...saveMeta,
            schemaName,
            rawResponse: "",
            success: false,
            errorCode: classified.code,
            errorMessage: classified.message,
          });
        }
        throw classified;
      }

      // Retry on rate limit (429) and server errors (5xx)
      if ((classified.status === 429 || (classified.status && classified.status >= 500)) && attempt < maxRetries) {
        const delay = classified.retryAfter
          ? classified.retryAfter * 1000
          : Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await sleep(delay);
        continue;
      }

      // All retries exhausted or non-retryable
      if (saveMeta) {
        await saveRawResponse({
          ...saveMeta,
          schemaName,
          rawResponse: "",
          success: false,
          errorCode: classified.code,
          errorMessage: classified.message,
        });
      }
      throw classified;
    }
  }

  throw lastError || new OpenAIError("Unknown error after retries", "UNKNOWN", 500);
}

/**
 * Test connection using a minimal chat completion request.
 * Returns detailed diagnostics including whether demoMode is recommended.
 */
export async function testOpenAIConnection(): Promise<{
  success: boolean;
  message: string;
  baseUrl: string;
  demoRecommended: boolean;
}> {
  const config = await readJsonFile<AdminSettings>("admin-settings.json", DEFAULT_ADMIN_SETTINGS);
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";

  if (config.demoMode) {
    return {
      success: true,
      message: "Demo mode is active. Responses are generated locally without calling OpenAI.",
      baseUrl,
      demoRecommended: false,
    };
  }

  if (!config.apiKey || config.apiKey.trim() === "") {
    return {
      success: false,
      message: "API key not configured.",
      baseUrl,
      demoRecommended: true,
    };
  }

  const model = config.model?.trim() || "gpt-4o";
  if (model.length === 0 || model.includes(" ")) {
    return {
      success: false,
      message: `Invalid model name: "${model}"`,
      baseUrl,
      demoRecommended: true,
    };
  }

  const client = buildClient(config);

  try {
    await client.post("/v1/chat/completions", {
      model,
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5,
    });
    return {
      success: true,
      message: `Connection successful to ${baseUrl} using model "${model}"`,
      baseUrl,
      demoRecommended: false,
    };
  } catch (err: any) {
    const classified = classifyAxiosError(err, 0);
    const isNetworkBlock = classified.code === "TIMEOUT" || classified.code === "NETWORK_ERROR";
    return {
      success: false,
      message: `[${classified.code}] ${classified.message}`,
      baseUrl,
      demoRecommended: isNetworkBlock,
    };
  }
}

/**
 * Classify axios errors into safe, non-exposing error objects.
 */
function classifyAxiosError(err: any, attempt: number): OpenAIError {
  const axiosErr = err as AxiosError;

  // --- Timeout (ECONNABORTED) ---
  if (axiosErr.code === "ECONNABORTED" || err.code === "ECONNABORTED") {
    return new OpenAIError(
      `Request timed out after 30 seconds. This may indicate a firewall blocking api.openai.com or no internet access.`,
      "TIMEOUT",
      408,
    );
  }

  // --- Network errors (no response) ---
  if (!axiosErr.response) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "ECONNRESET") {
      return new OpenAIError(
        "Network error: Cannot connect to the API endpoint. Check internet and Base URL.",
        "NETWORK_ERROR",
        503,
      );
    }
    return new OpenAIError(
      `Network error: ${err.message || "No response from server"}`,
      "NETWORK_ERROR",
      503,
    );
  }

  const status = axiosErr.response.status;
  const data = axiosErr.response.data as any;
  const errorCode = data?.error?.code || "";
  const errorMessage = data?.error?.message || "";

  // --- 429 Rate Limit ---
  if (status === 429 || errorCode === "rate_limit_exceeded" || errorCode === "insufficient_quota") {
    const retryAfter = axiosErr.response.headers?.["retry-after"]
      ? parseInt(axiosErr.response.headers["retry-after"], 10)
      : undefined;
    return new OpenAIError(
      `Rate limit exceeded. Wait and try again. (Attempt ${attempt + 1})`,
      "RATE_LIMIT",
      429,
      retryAfter,
    );
  }

  // --- 401 Authentication ---
  if (status === 401 || errorCode === "invalid_api_key" || errorCode === "authentication_error") {
    return new OpenAIError("Invalid API key. Verify your key in Admin > Configuracion IA.", "INVALID_API_KEY", 401);
  }

  // --- 400 Bad Request ---
  if (status === 400 || errorCode === "invalid_request_error" || errorCode === "validation_error") {
    return new OpenAIError(`Invalid request: ${errorMessage || "Check model name and parameters."}`, "BAD_REQUEST", 400);
  }

  // --- 404 Model Not Found ---
  if (status === 404 || errorCode === "model_not_found") {
    return new OpenAIError("Model not found. Verify the model name in Admin > Configuracion IA.", "MODEL_NOT_FOUND", 404);
  }

  // --- 500+ Server errors ---
  if (status >= 500) {
    return new OpenAIError(
      `OpenAI server error (HTTP ${status}). Retry may succeed. (Attempt ${attempt + 1})`,
      "SERVER_ERROR",
      status,
    );
  }

  // --- Fallback ---
  const sanitized = (err.message || "Unknown error")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/[a-f0-9]{32,}/gi, "[REDACTED]");

  return new OpenAIError(sanitized, errorCode || "UNKNOWN", status || 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
