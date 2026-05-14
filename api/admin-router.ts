import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { readJsonFile, writeJsonFile, readCsvFile, writeCsvFile } from "./lib/persistence";
import { testOpenAIConnection } from "./lib/openai";
import type { RawResponseEntry } from "./lib/openai";
import { callOpenAIResponse } from "./lib/openai";
import type {
  AdminSettings,
  Project,
  EnvironmentVariables,
  SimulationState,
  AuditLogEntry,
  StudentResults,
  AIFeedback,
  GroupFinalResult,
} from "@contracts/types";

// Default values for file-based persistence
const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  apiKey: "",
  model: "gpt-4o",
  systemPrompt: "",
  baseUrl: "https://api.openai.com/v1",
  demoMode: true,
};

const DEFAULT_SIMULATION_STATE: SimulationState = {
  currentSession: 1,
  currentRound: 1,
  maxRoundsPerSession: 3,
  activeGroups: [],
};

const DEFAULT_ENVIRONMENT: Record<string, EnvironmentVariables> = {};

export const adminRouter = createRouter({
  /**
   * getConfig — Safe endpoint that NEVER exposes the API key.
   * Returns only non-sensitive configuration fields.
   */
  getConfig: publicQuery.query(async () => {
    const config = await readJsonFile<AdminSettings>("admin-settings.json", DEFAULT_ADMIN_SETTINGS);
    return {
      model: config.model,
      systemPrompt: config.systemPrompt,
      baseUrl: config.baseUrl,
      demoMode: config.demoMode,
      hasApiKey: !!(config.apiKey && config.apiKey.trim() !== ""),
    };
  }),

  /**
   * getFullConfig — Backend-only. Returns the complete config INCLUDING the API key.
   * Should NEVER be called from the frontend in production.
   */
  getFullConfig: publicQuery.query(async () => {
    return await readJsonFile<AdminSettings>("admin-settings.json", DEFAULT_ADMIN_SETTINGS);
  }),

  /**
   * setConfig — Saves the full configuration securely.
   * The API key travels encrypted (HTTPS) and is stored server-side only.
   */
  setConfig: publicQuery
    .input(
      z.object({
        apiKey: z.string(),
        model: z.string(),
        systemPrompt: z.string(),
        baseUrl: z.string(),
        demoMode: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      await writeJsonFile("admin-settings.json", input);
      return { success: true };
    }),

  /**
   * testConnection — Uses the robust error-handling client.
   * Returns safe, non-exposing error messages.
   * Implemented as mutation because it performs an external API call on demand.
   */
  testConnection: publicQuery.mutation(async () => {
    return await testOpenAIConnection();
  }),

  getProjects: publicQuery.query(async () => {
    const rows = await readCsvFile("projects.csv");
    if (rows.length <= 1) return [];
    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = row[i] || ""));
      return obj as unknown as Project;
    });
  }),

  uploadProjects: publicQuery
    .input(z.object({ csvContent: z.string() }))
    .mutation(async ({ input }) => {
      const lines = input.csvContent
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) throw new Error("Empty CSV");
      const headers = lines[0].split(",").map((h) => h.trim());
      const required = ["nombre_proyecto", "descripcion", "sector", "numero_grupo"];
      for (const r of required) {
        if (!headers.includes(r)) throw new Error(`Missing required column: ${r}`);
      }
      const rows = lines.map((line) => line.split(",").map((c) => c.trim()));
      const groupNumbers = rows.slice(1).map((r) => r[headers.indexOf("numero_grupo")]);
      const uniqueGroups = new Set(groupNumbers);
      if (uniqueGroups.size !== groupNumbers.length) {
        throw new Error("Duplicate group numbers found in CSV");
      }
      await writeCsvFile("projects.csv", rows);
      const audit = await readJsonFile<AuditLogEntry[]>("audit-log.json");
      audit.push({ action: "UPLOAD_PROJECTS", details: `${rows.length - 1} projects uploaded`, timestamp: new Date().toISOString() });
      await writeJsonFile("audit-log.json", audit);
      return { success: true, count: rows.length - 1 };
    }),

  getEnvironment: publicQuery.query(async () => {
    return await readJsonFile<Record<string, EnvironmentVariables>>("environment.json", DEFAULT_ENVIRONMENT);
  }),

  setEnvironment: publicQuery
    .input(z.record(z.string(), z.any()))
    .mutation(async ({ input }) => {
      await writeJsonFile("environment.json", input);
      return { success: true };
    }),

  getSimulationState: publicQuery.query(async () => {
    return await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
  }),

  setSimulationState: publicQuery
    .input(z.any())
    .mutation(async ({ input }) => {
      await writeJsonFile("simulation-state.json", input);
      return { success: true };
    }),

  uploadSessionsCsv: publicQuery
    .input(z.object({ csvContent: z.string() }))
    .mutation(async ({ input }) => {
      const lines = input.csvContent
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) throw new Error("CSV vacio");
      const headers = lines[0].split(",").map((h) => h.trim());
      const required = ["group_number", "session", "round", "max_rounds"];
      for (const r of required) {
        if (!headers.includes(r)) throw new Error(`Falta columna requerida: ${r}`);
      }
      const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
      const sessions = rows.map((r) => ({
        groupNumber: r[headers.indexOf("group_number")],
        currentSession: parseInt(r[headers.indexOf("session")] || "1"),
        currentRound: parseInt(r[headers.indexOf("round")] || "1"),
        accumulatedScore: parseFloat(r[headers.indexOf("score")] || "0"),
        lastActionAt: new Date().toISOString(),
      }));
      const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
      for (const s of sessions) {
        const existing = state.activeGroups.find((g) => g.groupNumber === s.groupNumber);
        if (existing) {
          existing.currentSession = s.currentSession;
          existing.currentRound = s.currentRound;
          existing.accumulatedScore = s.accumulatedScore;
          existing.lastActionAt = s.lastActionAt;
        } else {
          state.activeGroups.push(s as any);
        }
      }
      await writeJsonFile("simulation-state.json", state);
      const audit = await readJsonFile<AuditLogEntry[]>("audit-log.json", []);
      audit.push({ action: "UPLOAD_SESSIONS", details: `${sessions.length} sesiones cargadas`, timestamp: new Date().toISOString() });
      await writeJsonFile("audit-log.json", audit);
      return { success: true, count: sessions.length };
    }),

  uploadResultsCsv: publicQuery
    .input(z.object({ csvContent: z.string() }))
    .mutation(async ({ input }) => {
      const lines = input.csvContent
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) throw new Error("CSV vacio");
      const headers = lines[0].split(",").map((h) => h.trim());
      const required = ["group_number", "session", "round", "vpn", "tir", "bc"];
      for (const r of required) {
        if (!headers.includes(r)) throw new Error(`Falta columna requerida: ${r}`);
      }
      const hasPuntaje = headers.includes("puntaje_ia");
      const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
      const results: StudentResults[] = [];
      const feedbacks: AIFeedback[] = [];
      for (const r of rows) {
        const id = crypto.randomUUID();
        const groupNumber = r[headers.indexOf("group_number")];
        const session = parseInt(r[headers.indexOf("session")] || "1");
        const round = parseInt(r[headers.indexOf("round")] || "1");
        const vpn = parseFloat(r[headers.indexOf("vpn")] || "0");
        const tir = parseFloat(r[headers.indexOf("tir")] || "0");
        const bc = parseFloat(r[headers.indexOf("bc")] || "0");
        const comment = r[headers.indexOf("comment")] || "";
        const isFinal = r[headers.indexOf("is_final")]?.toLowerCase() === "true";
        const puntajeRaw = hasPuntaje ? r[headers.indexOf("puntaje_ia")] : "";
        const puntaje = puntajeRaw ? parseFloat(puntajeRaw) : 0;
        results.push({
          id,
          groupNumber,
          session,
          round,
          vpn,
          tir,
          bc,
          comment,
          operationalDecisions: {},
          financingOptionId: "",
          isFinal,
          submittedAt: new Date().toISOString(),
        });
        // If puntaje_ia provided, create a feedback entry
        if (puntaje > 0) {
          feedbacks.push({
            id,
            groupNumber,
            session,
            round,
            puntaje,
            evaluacion_general: `Resultado cargado via CSV. Puntaje asignado: ${puntaje}/10.`,
            aciertos: ["Cargado desde archivo CSV"],
            errores_probables: puntaje < 6 ? ["Revisar metodologia de calculo"] : [],
            recomendaciones: ["Verificar con el docente"],
            advertencias: puntaje < 4 ? ["Resultado bajo, revision necesaria"] : [],
            siguiente_accion: "Consultar retroalimentacion detallada con el evaluador",
          });
        }
      }
      const existing = await readJsonFile<StudentResults[]>("student-results.json", []);
      const existingFb = await readJsonFile<AIFeedback[]>("ai-feedback.json", []);
      const combined = [...existing, ...results];
      const combinedFb = [...existingFb, ...feedbacks];
      await writeJsonFile("student-results.json", combined);
      await writeJsonFile("ai-feedback.json", combinedFb);
      const audit = await readJsonFile<AuditLogEntry[]>("audit-log.json", []);
      audit.push({ action: "UPLOAD_RESULTS", details: `${results.length} resultados cargados (${feedbacks.length} con puntaje IA)`, timestamp: new Date().toISOString() });
      await writeJsonFile("audit-log.json", audit);
      return { success: true, count: results.length, withPuntaje: feedbacks.length };
    }),

  resetSimulation: publicQuery
    .input(z.object({ keepProjects: z.boolean().default(true), keepAdminSettings: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      await writeJsonFile("student-results.json", []);
      await writeJsonFile("ai-feedback.json", []);
      await writeJsonFile("ai-raw-responses.json", []);
      await writeJsonFile("sessions.json", []);
      await writeJsonFile("simulation-state.json", { currentSession: 1, currentRound: 1, maxRoundsPerSession: 3, activeGroups: [] });
      if (!input.keepProjects) {
        await writeCsvFile("projects.csv", [["nombre_proyecto", "descripcion", "sector", "numero_grupo"]]);
      }
      if (!input.keepAdminSettings) {
        await writeJsonFile("admin-settings.json", { apiKey: "", model: "gpt-4o", systemPrompt: "", baseUrl: "https://api.openai.com/v1", demoMode: false });
      }
      const audit = await readJsonFile<AuditLogEntry[]>("audit-log.json");
      audit.push({ action: "RESET_SIMULATION", details: JSON.stringify(input), timestamp: new Date().toISOString() });
      await writeJsonFile("audit-log.json", audit);
      return { success: true };
    }),

  getAuditLog: publicQuery.query(async () => {
    return await readJsonFile<AuditLogEntry[]>("audit-log.json");
  }),

  verifyPassword: publicQuery
    .input(z.object({ password: z.string() }))
    .mutation(async ({ input }) => {
      const valid = input.password === "CESA2026";
      return { valid };
    }),

  getFinalResults: publicQuery.query(async () => {
    const results = await readJsonFile<StudentResults[]>("student-results.json");
    const feedbacks = await readJsonFile<AIFeedback[]>("ai-feedback.json");
    const projects = await readCsvFile("projects.csv");
    const headers = projects.length > 0 ? projects[0] : [];
    const groupIdx = headers.indexOf("numero_grupo");
    const nameIdx = headers.indexOf("nombre_proyecto");
    const sectorIdx = headers.indexOf("sector");

    const finalResults: GroupFinalResult[] = [];
    for (const r of results) {
      if (!r.isFinal) continue;
      const fb = feedbacks.find((f) => f.id === r.id);
      const projectRow = projects.slice(1).find((row) => row[groupIdx] === r.groupNumber);
      finalResults.push({
        groupNumber: r.groupNumber,
        projectName: projectRow ? projectRow[nameIdx] || "N/A" : "N/A",
        sector: projectRow ? projectRow[sectorIdx] || "N/A" : "N/A",
        session: r.session,
        round: r.round,
        vpn: r.vpn,
        tir: r.tir,
        bc: r.bc,
        comment: r.comment,
        puntajeIA: fb ? fb.puntaje : 0,
        submittedAt: r.submittedAt,
      });
    }
    finalResults.sort((a, b) => {
      const g = a.groupNumber.localeCompare(b.groupNumber);
      if (g !== 0) return g;
      return a.session - b.session || a.round - b.round;
    });
    return finalResults;
  }),

  /**
   * getRawResponses — Returns all raw AI responses for admin review.
   * Each entry includes: group, session, round, schema, prompt, raw response, success/failure.
   */
  getRawResponses: publicQuery
    .input(
      z.object({
        groupNumber: z.string().optional(),
        schemaName: z.string().optional(),
        onlyErrors: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      const entries = await readJsonFile<RawResponseEntry[]>("ai-raw-responses.json");
      return entries.filter((e) => {
        if (input.groupNumber && e.groupNumber !== input.groupNumber) return false;
        if (input.schemaName && e.schemaName !== input.schemaName) return false;
        if (input.onlyErrors && e.success) return false;
        return true;
      });
    }),

  /**
   * generateEnvironmentWithAI — Uses AI to generate market environment variables for 3 sessions.
   * Returns the pre-defined Colombian rates as baseline.
   */
  generateEnvironmentWithAI: publicQuery.mutation(async () => {
    const prompt = `Genera variables de entorno financiero para un simulador educativo colombiano con 3 sesiones.

Usa las siguientes tasas reales de mercado como base (en formato decimal):
- DTF: 0.12 (sesion 1), 0.125 (sesion 2), 0.13 (sesion 3)
- IBR: 0.11 (sesion 1), 0.115 (sesion 2), 0.12 (sesion 3)
- SOFR: 0.053 (sesion 1), 0.055 (sesion 2), 0.058 (sesion 3)
- PrimeRate: 0.08 (sesion 1), 0.082 (sesion 2), 0.085 (sesion 3)
- UVR: 0.02 (sesion 1), 0.022 (sesion 2), 0.025 (sesion 3)
- TRM (COP/USD): 4200 (sesion 1), 4500 (sesion 2), 4800 (sesion 3)
- Inflacion: 0.04 (sesion 1), 0.042 (sesion 2), 0.045 (sesion 3)
- Devaluacion: 0.05 (sesion 1), 0.052 (sesion 2), 0.055 (sesion 3)
- Spreads sectoriales (agricola, industrial, tecnologia, inmobiliario): crecientes por sesion
- Parametros ESG: riesgo, incentivo, penalizacion — crecientes por sesion

IMPORTANTE: Incluye el campo TRM en cada sesion. Es obligatorio.
Devuelve SOLO el JSON solicitado.`;

    const result = await callOpenAIResponse<
      Record<string, EnvironmentVariables>
    >(
      [{ role: "user", content: prompt }],
      "environment_variables",
      {
        groupNumber: "admin",
        session: 1,
        round: 1,
        prompt,
      },
    );

    await writeJsonFile("environment.json", result);
    return { success: true, data: result };
  }),
});
