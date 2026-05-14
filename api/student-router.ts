import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { readJsonFile, writeJsonFile, readCsvFile } from "./lib/persistence";
import { callOpenAIResponse, OpenAIError } from "./lib/openai";
import type {
  Project,
  SimulationState,
  StudentResults,
  AIFeedback,
  EnvironmentVariables,
  OperationalOption,
  FinancingOption,
  SimulationPeriod,
  GroupFinalResult,
  AdminSettings,
} from "@contracts/types";

// Default values for file-based persistence — prevent []-as-object crashes
const DEFAULT_SIMULATION_STATE: SimulationState = {
  currentSession: 1,
  currentRound: 1,
  maxRoundsPerSession: 3,
  activeGroups: [],
};

const DEFAULT_ENVIRONMENT: Record<string, EnvironmentVariables> = {};

function handleAIError(err: unknown): never {
  if (err instanceof OpenAIError) {
    throw new Error(`[${err.code}] ${err.message}`);
  }
  if (err instanceof Error) {
    const safeMsg = err.message.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]");
    throw new Error(`AI Service Error: ${safeMsg}`);
  }
  throw new Error("AI Service Error: An unexpected error occurred. Please try again.");
}

export const studentRouter = createRouter({
  debug: publicQuery
    .query(async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const dataDir = path.resolve(process.cwd(), "data");
      let files: string[] = [];
      try { files = await fs.readdir(dataDir); } catch { /* ignore */ }
      const fileDetails: Record<string, { exists: boolean; size?: number; isArray?: boolean; hasActiveGroups?: boolean }> = {};
      for (const f of files) {
        try {
          const stat = await fs.stat(path.join(dataDir, f));
          const content = await fs.readFile(path.join(dataDir, f), "utf-8");
          let parsed: any;
          try { parsed = JSON.parse(content); } catch { parsed = null; }
          fileDetails[f] = {
            exists: true,
            size: stat.size,
            isArray: Array.isArray(parsed),
            hasActiveGroups: parsed?.activeGroups !== undefined,
          };
        } catch { fileDetails[f] = { exists: true }; }
      }
      // Check critical files individually
      const simState = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
      const adminConfig = await readJsonFile<AdminSettings>("admin-settings.json", { apiKey: "", model: "", systemPrompt: "", baseUrl: "", demoMode: true });
      return {
        dataDir,
        cwd: process.cwd(),
        env_DATA_DIR: process.env.DATA_DIR || null,
        filesFound: files,
        fileDetails,
        simulationStateOk: !!simState?.activeGroups,
        adminConfigOk: typeof adminConfig?.demoMode === "boolean",
        demoMode: adminConfig?.demoMode,
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
      };
    }),

  findProject: publicQuery
    .input(z.object({ groupNumber: z.string() }))
    .query(async ({ input }) => {
      const rows = await readCsvFile("projects.csv");
      if (rows.length <= 1) return null;
      const headers = rows[0];
      const idx = headers.indexOf("numero_grupo");
      const row = rows.slice(1).find((r) => r[idx] === input.groupNumber);
      if (!row) return null;
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = row[i] || ""));
      return obj as unknown as Project;
    }),

  getGroupStatus: publicQuery
    .input(z.object({ groupNumber: z.string() }))
    .query(async ({ input }) => {
      try {
        console.log(`[getGroupStatus] groupNumber=${input.groupNumber}`);
        const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
        console.log(`[getGroupStatus] state loaded: sessions=${state.currentSession}, round=${state.currentRound}, groups=${state.activeGroups?.length || 0}`);
        const group = state.activeGroups?.find((g) => g.groupNumber === input.groupNumber);
        if (!group) {
          return {
            session: state.currentSession,
            round: state.currentRound,
            maxRounds: state.maxRoundsPerSession,
            accumulatedScore: 0,
            isSessionComplete: false,
          };
        }
        return {
          session: group.currentSession,
          round: group.currentRound,
          maxRounds: state.maxRoundsPerSession,
          accumulatedScore: group.accumulatedScore,
          isSessionComplete: group.currentRound > state.maxRoundsPerSession,
        };
      } catch (err: any) {
        console.error(`[getGroupStatus] CRITICAL ERROR: ${err?.message || err}`);
        console.error(err?.stack || '');
        // Return safe default so the UI doesn't crash
        return {
          session: 1,
          round: 1,
          maxRounds: 3,
          accumulatedScore: 0,
          isSessionComplete: false,
          _error: `Backend error: ${err?.message || 'Unknown'}`,
        };
      }
    }),

  getOperationalNeeds: publicQuery
    .input(z.object({ groupNumber: z.string(), projectName: z.string(), sector: z.string(), session: z.number() }))
    .query(async ({ input }) => {
      try {
        let prompt: string;
        if (input.session === 2) {
          // Session 2: international procurement focus
          prompt = `Genera opciones de necesidades operativas para la SESION 2 del proyecto "${input.projectName}" del sector "${input.sector}" en Colombia.
La Sesion 2 se enfoca en COMPRA DE INSUMOS Y SERVICIOS EN EL EXTRANJERO y VENTA/COMERCIALIZACION EN DOLARES.
Categorias: importacion_insumos, importacion_servicios, logistica_internacional, comercializacion_exportacion, financiamiento_exterior.
Para cada categoria genera exactamente 2 opciones (total 10 opciones).
Nombra la primera opcion de cada categoria "[Descripcion] Estandar" (menor costo, impacto moderado) y la segunda "[Descripcion] Avanzada" (mayor costo, mayor impacto).
Los costos deben estar en miles de USD. Considera riesgo cambiario, costos de importacion, aranceles, y logistica internacional.
Impacto ESG entre -0.05 y 0.05. Nivel de riesgo (bajo/medio/alto).
Responde SOLO en el formato JSON Schema solicitado.`;
        } else if (input.session === 3) {
          // Session 3: ESG focus
          prompt = `Genera opciones de necesidades operativas para la SESION 3 del proyecto "${input.projectName}" del sector "${input.sector}" en Colombia.
La Sesion 3 se enfoca en INDICADORES ESG: energia renovable, gestion de residuos, biodiversidad, huella de carbono, gobernanza corporativa.
Categorias: energia_renovable, gestion_residuos, biodiversidad, huella_carbono, gobernanza_esg.
Para cada categoria genera exactamente 2 opciones (total 10 opciones).
Nombra la primera opcion de cada categoria "[Descripcion] Estandar" (menor costo, impacto moderado) y la segunda "[Descripcion] Avanzada" (mayor costo, mayor impacto).
Los costos deben estar en millones de COP. Considera beneficios e incentivos fiscales por cumplimiento ESG, asi como penalizaciones por incumplimiento.
Impacto ESG entre -0.10 y 0.10 (mayor rango que sesiones anteriores). Nivel de riesgo (bajo/medio/alto).
Responde SOLO en el formato JSON Schema solicitado.`;
        } else {
          prompt = `Genera opciones de necesidades operativas para el proyecto "${input.projectName}" del sector "${input.sector}" en Colombia, sesion ${input.session}.
Categorias: maquinaria, tecnologia, materia_prima, recursos, inmobiliario.
Para cada categoria genera exactamente 2 opciones (total 10 opciones).
Nombra la primera opcion de cada categoria "[Descripcion] Estandar" (menor costo, impacto moderado) y la segunda "[Descripcion] Avanzada" (mayor costo, mayor impacto).
Cada opcion debe tener costo inicial realista en COP millones, impacto en ingresos y costos como porcentaje decimal, impacto ESG entre -0.05 y 0.05, y nivel de riesgo (bajo/medio/alto).
Responde SOLO en el formato JSON Schema solicitado.`;
        }

        const result = await callOpenAIResponse<{ options: OperationalOption[] }>(
          [{ role: "user", content: prompt }],
          "operational_options",
          {
            groupNumber: input.groupNumber,
            session: input.session,
            round: 1,
            prompt,
          },
        );

        // Validate count
        if (!result.options || result.options.length < 8) {
          throw new Error("La IA no genero el numero minimo de opciones (8). Intente nuevamente.");
        }
        return result.options;
      } catch (err) {
        handleAIError(err);
      }
    }),

  getFinancingOptions: publicQuery
    .input(z.object({ sector: z.string(), session: z.number(), selectedInmobiliario: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const env = await readJsonFile<Record<string, EnvironmentVariables>>("environment.json", DEFAULT_ENVIRONMENT);
      const key = `session${input.session}`;
      const vars = env[key];
      if (!vars) throw new Error("Environment not configured for this session");
      const spread = vars.sectorSpreads[input.sector.toLowerCase()] || 0.02;
      const options: FinancingOption[] = [
        { id: "dtf-spread", name: "DTF + Spread", bank: "Bancolombia", baseRate: vars.DTF, spread, totalRate: vars.DTF + spread, currency: "COP", termYears: 5, gracePeriodMonths: 6, amortizationType: "cuota fija" },
        { id: "ibr-spread", name: "IBR + Spread", bank: "Banco de Bogota", baseRate: vars.IBR, spread, totalRate: vars.IBR + spread, currency: "COP", termYears: 5, gracePeriodMonths: 6, amortizationType: "amortizacion constante" },
        { id: "sofr-spread", name: "SOFR + Spread", bank: "JPMorgan Chase", baseRate: vars.SOFR, spread: spread * 0.8, totalRate: vars.SOFR + spread * 0.8, currency: "USD", termYears: 5, gracePeriodMonths: 12, amortizationType: "cuota fija" },
        { id: "prime-spread", name: "Prime Rate + Spread", bank: "Bank of America", baseRate: vars.PrimeRate, spread: spread * 0.9, totalRate: vars.PrimeRate + spread * 0.9, currency: "USD", termYears: 5, gracePeriodMonths: 6, amortizationType: "bullet" },
      ];
      // Davivienda (colombiano) offers UVR credit — only when student selected inmobiliario
      if (input.selectedInmobiliario) {
        options.splice(2, 0, { id: "uvr-credit", name: "Credito en UVR", bank: "Davivienda", baseRate: vars.UVR, spread: 0.01, totalRate: vars.UVR + 0.01, currency: "UVR", termYears: 10, gracePeriodMonths: 12, amortizationType: "cuota fija" });
      }
      return options;
    }),

  getSimulationData: publicQuery
    .input(
      z.object({
        groupNumber: z.string(),
        projectName: z.string(),
        sector: z.string(),
        session: z.number(),
        selectedOperationalOptions: z.array(
          z.object({
            id: z.string(),
            category: z.string(),
            name: z.string(),
            revenueImpact: z.number(),
            costImpact: z.number(),
            esgImpact: z.number(),
            initialCost: z.number(),
          }),
        ),
        selectedFinancingOption: z.object({
          id: z.string(),
          totalRate: z.number(),
          currency: z.string(),
          termYears: z.number(),
        }),
      }),
    )
    .query(async ({ input }) => {
      const env = await readJsonFile<Record<string, EnvironmentVariables>>("environment.json", DEFAULT_ENVIRONMENT);
      const vars = env[`session${input.session}`];
      if (!vars) throw new Error("Environment not configured for this session");

      const isSession2 = input.session === 2;
      const isSession3 = input.session === 3;
      // S1: 5 periods, S2: periods 3-5 (3 periods), S3: periods 4-5 (2 periods)
      const numPeriods = isSession2 ? 3 : isSession3 ? 2 : 5;
      // S2: flujos en miles de USD; S1/S3: flujos en millones COP
      const currency = isSession2 ? "miles USD" : "millones COP";

      // Base revenue by sector (millions COP for S1/S3, USD-equivalent for S2)
      const sectorBase: Record<string, number> = {
        inmobiliario: 900,
        tecnologia: 650,
        industrial: 750,
        agricola: 500,
        servicios: 550,
        moda: 600,
      };
      let baseRevenue = sectorBase[input.sector.toLowerCase()] || 600;

      // Session 2: ajustar base revenue a USD (aproximado usando devaluacion acumulada de 2 años)
      const twoYearDevaluationFactor = Math.pow(1 + vars.devaluation, 2);
      if (isSession2) {
        baseRevenue = Math.round(baseRevenue / twoYearDevaluationFactor);
      }

      // Determine revenue/cost structure based on sector
      const sector = input.sector.toLowerCase();
      const hasVentas = !["servicios", "tecnologia"].includes(sector);
      const hasServicios = !["industrial", "agricola", "inmobiliario"].includes(sector) || sector === "moda";
      const hasArriendos = ["inmobiliario", "moda", "servicios"].includes(sector);
      const hasOtros = ["tecnologia", "servicios"].includes(sector);

      // Sum impacts from selected operational decisions
      let totalRevenueImpact = 0;
      let totalCostImpact = 0;
      let totalInitialCost = 0;
      for (const opt of input.selectedOperationalOptions) {
        totalRevenueImpact += opt.revenueImpact;
        totalCostImpact += opt.costImpact;
        totalInitialCost += opt.initialCost;
      }

      // Financing parameters
      const hasFinancing = input.selectedFinancingOption.id !== "none";
      const financingRate = input.selectedFinancingOption.totalRate;
      const loanAmount = totalInitialCost * 0.8; // 80% financed

      // Build periods
      // S1: periods 1-5, S2: periods 3-5, S3: periods 4-5
      const startPeriod = isSession2 ? 3 : isSession3 ? 4 : 1;
      const periods: SimulationPeriod[] = [];
      for (let p = startPeriod; p < startPeriod + numPeriods; p++) {
        // S2: 2 years passed, S3: 3 years passed since start
        const yearsPassed = isSession2 ? 2 : isSession3 ? 3 : 0;
        const inflationYears = yearsPassed + (p - startPeriod);
        const inflationFactor = Math.pow(1 + vars.inflation, inflationYears);
        // S2: always affects devaluation (USD sales); S3: COP only
        const devaluationFactor = isSession2
          ? Math.pow(1 + vars.devaluation, inflationYears)
          : (input.selectedFinancingOption.currency === "USD" ? Math.pow(1 + vars.devaluation, p - 1) : 1);

        // Revenue split by sector type
        const ventasWeight = hasVentas ? (hasServicios ? 0.7 : 1.0) : 0;
        const serviciosWeight = hasServicios ? (hasVentas ? 0.3 : 1.0) : 0;

        const ingresosVentas = Math.round(baseRevenue * ventasWeight * (1 + totalRevenueImpact) * inflationFactor);
        const ingresosServicios = Math.round(baseRevenue * serviciosWeight * (1 + totalRevenueImpact) * inflationFactor);

        // Costs split by sector type
        const personalWeight = 0.22;
        const insumosWeight = ["industrial", "agricola", "moda"].includes(sector) ? 0.25 : 0.15;
        const arriendosWeight = hasArriendos ? 0.12 : 0;
        const otrosWeight = hasOtros ? 0.08 : 0;

        const costosPersonal = Math.round(baseRevenue * personalWeight * (1 + totalCostImpact) * inflationFactor);
        const costosInsumos = Math.round(baseRevenue * insumosWeight * (1 + totalCostImpact) * inflationFactor * devaluationFactor);
        const costosArriendos = Math.round(baseRevenue * arriendosWeight * (1 + totalCostImpact) * inflationFactor);
        const costosOtros = Math.round(baseRevenue * otrosWeight * (1 + totalCostImpact) * inflationFactor);

        // Financing costs only if financing selected
        const costosFinancieros = hasFinancing
          ? Math.round(loanAmount * financingRate / numPeriods * devaluationFactor)
          : 0;

        const costosESG = Math.round(baseRevenue * 0.04 * (1 + vars.esgRisk) * inflationFactor);

        periods.push({
          period: p,
          ingresosVentas,
          ingresosServicios,
          costosPersonal,
          costosInsumos,
          costosArriendos,
          costosOtros,
          costosFinancieros,
          costosESG,
        });
      }

      // ESG indicators for Session 3
      const esgIndicators = isSession3 ? {
        positivos: [
          `Incentivo ESG aplicado: +${(vars.esgIncentive * 100).toFixed(2)}% sobre ingresos por cumplimiento ambiental`,
          `Reduccion de costos por eficiencia energetica: -${(vars.esgIncentive * 0.5 * 100).toFixed(2)}%`,
          `Bonificacion por gobernanza corporativa: +${(vars.esgIncentive * 0.3 * 100).toFixed(2)}%`,
        ],
        negativos: [
          `Riesgo ESG aplicado: +${(vars.esgRisk * 100).toFixed(2)}% sobre costos por incumplimiento`,
          `Penalizacion regulatoria: -${(vars.esgPenalty * 100).toFixed(2)}% sobre ingresos`,
          `Costo de huella de carbono: +${(vars.esgRisk * 0.7 * 100).toFixed(2)}%`,
        ],
      } : null;

      // Build metadata for UI to know which columns to show
      const meta = {
        hasVentas,
        hasServicios,
        hasPersonal: true,
        hasInsumos: true,
        hasArriendos,
        hasOtros,
        hasFinanciacion: hasFinancing,
        currency,
        numPeriods,
        isSession2,
        isSession3,
        session: input.session,
        appliedInflation: vars.inflation,
        appliedDevaluation: vars.devaluation,
        esgIndicators,
      };

      return { periods, meta };
    }),

  submitResults: publicQuery
    .input(
      z.object({
        groupNumber: z.string(),
        session: z.number(),
        round: z.number(),
        vpn: z.number(),
        tir: z.number(),
        bc: z.number(),
        comment: z.string(),
        operationalDecisions: z.record(z.string(), z.string()),
        financingOptionId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const results = await readJsonFile<StudentResults[]>("student-results.json");
      const entry: StudentResults = {
        id: `${input.groupNumber}-${input.session}-${input.round}-${Date.now()}`,
        ...input,
        submittedAt: new Date().toISOString(),
      };
      results.push(entry);
      await writeJsonFile("student-results.json", results);

      const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
      let group = state.activeGroups.find((g) => g.groupNumber === input.groupNumber);
      if (!group) {
        group = { groupNumber: input.groupNumber, currentSession: input.session, currentRound: input.round, accumulatedScore: 0, lastActionAt: new Date().toISOString() };
        state.activeGroups.push(group);
      }
      group.lastActionAt = new Date().toISOString();
      await writeJsonFile("simulation-state.json", state);
      return { success: true, id: entry.id };
    }),

  getFeedback: publicQuery
    .input(z.object({ resultId: z.string() }))
    .query(async ({ input }) => {
      const feedbacks = await readJsonFile<AIFeedback[]>("ai-feedback.json");
      const fb = feedbacks.find((f) => f.id === input.resultId);
      return fb || null;
    }),

  generateFeedback: publicQuery
    .input(z.object({ resultId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const results = await readJsonFile<StudentResults[]>("student-results.json");
        const result = results.find((r) => r.id === input.resultId);
        if (!result) throw new Error("Result not found");

        const env = await readJsonFile<Record<string, EnvironmentVariables>>("environment.json");
        const vars = env[`session${result.session}`];

        const project = await readCsvFile("projects.csv");
        let projectInfo: Record<string, string> = {};
        if (project.length > 1) {
          const headers = project[0];
          const idx = headers.indexOf("numero_grupo");
          const row = project.slice(1).find((r) => r[idx] === result.groupNumber);
          if (row) {
            headers.forEach((h, i) => (projectInfo[h] = row[i] || ""));
          }
        }

        const previousResults = results.filter((r) => r.groupNumber === result.groupNumber && r.id !== result.id);

        const prompt = `Evalua los siguientes resultados financieros de un estudiante colombiano:
Proyecto: ${projectInfo["nombre_proyecto"] || "N/A"}
Descripcion: ${projectInfo["descripcion"] || "N/A"}
Sector: ${projectInfo["sector"] || "N/A"}
Grupo: ${result.groupNumber}
Sesion: ${result.session}, Ronda: ${result.round}

Variables del entorno economico:
- DTF: ${vars?.DTF} | IBR: ${vars?.IBR} | SOFR: ${vars?.SOFR} | Prime Rate: ${vars?.PrimeRate} | UVR: ${vars?.UVR} | TRM: ${vars?.TRM}
- Inflacion: ${vars?.inflation} | Devaluacion: ${vars?.devaluation}
- Riesgo ESG: ${vars?.esgRisk} | Incentivo ESG: ${vars?.esgIncentive} | Penalizacion ESG: ${vars?.esgPenalty}

Decisiones operativas tomadas: ${JSON.stringify(result.operationalDecisions)}
Financiacion seleccionada: ${result.financingOptionId}

Resultados ingresados por el estudiante:
- VPN: ${result.vpn} millones COP
- TIR: ${result.tir}%
- B/C: ${result.bc}
- Comentario del grupo: ${result.comment}
Historial previo: ${previousResults.length} entregas anteriores.

Eres un evaluador academico experto en matematicas financieras colombianas.
INSTRUCCIONES IMPORTANTES SOBRE EL COMENTARIO DEL GRUPO:
- Lee cuidadosamente el comentario del grupo. Si el comentario demuestra comprension profunda, metodologia clara y justificacion solida, REDUCE los errores_probables y advertencias, y AUMENTA el puntaje.
- Si el comentario es superficial, vago o incompleto, INCLUYE mas errores_probables y advertencias relevantes.
- El puntaje (0-10) debe reflejar la calidad del comentario: un buen comentario con resultados aceptables puede recibir 8-10; un mal comentario baja el puntaje significativamente.
- En evaluacion_general, menciona especificamente si el comentario ayudo o perjudico la calificacion.
- No repitas en errores_probables o advertencias lo que el grupo ya explico correctamente en su comentario.

No resuelvas los calculos completamente. Detecta errores probables, explica riesgos y recomienda ajustes.
El puntaje debe ser un numero entre 0 y 10 considerando: precision financiera, coherencia de decisiones, manejo de financiacion, uso de DTF/IBR/SOFR/Prime/UVR/TRM, integracion de inflacion/devaluacion, criterios ESG, y calidad del comentario.
Responde SOLO en el formato JSON Schema solicitado.`;

        const resultAI = await callOpenAIResponse<{
          evaluacion_general: string;
          aciertos: string[];
          errores_probables: string[];
          recomendaciones: string[];
          advertencias: string[];
          puntaje: number;
          siguiente_accion: string;
        }>(
          [{ role: "user", content: prompt }],
          "academic_feedback",
          {
            groupNumber: result.groupNumber,
            session: result.session,
            round: result.round,
            prompt,
          },
        );

        const feedback: AIFeedback = {
          id: result.id,
          groupNumber: result.groupNumber,
          session: result.session,
          round: result.round,
          evaluacion_general: resultAI.evaluacion_general || "",
          aciertos: resultAI.aciertos || [],
          errores_probables: resultAI.errores_probables || [],
          recomendaciones: resultAI.recomendaciones || [],
          advertencias: resultAI.advertencias || [],
          puntaje: typeof resultAI.puntaje === "number" ? Math.max(0, Math.min(10, resultAI.puntaje)) : 0,
          siguiente_accion: resultAI.siguiente_accion || "",
          createdAt: new Date().toISOString(),
        };

        const feedbacks = await readJsonFile<AIFeedback[]>("ai-feedback.json");
        const existingIndex = feedbacks.findIndex((f) => f.id === feedback.id);
        if (existingIndex >= 0) {
          feedbacks[existingIndex] = feedback;
        } else {
          feedbacks.push(feedback);
        }
        await writeJsonFile("ai-feedback.json", feedbacks);

        // Update accumulated score
        const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
        const group = state.activeGroups.find((g) => g.groupNumber === result.groupNumber);
        if (group) {
          const groupFeedbacks = feedbacks.filter((f) => f.groupNumber === result.groupNumber);
          const avgScore = groupFeedbacks.reduce((sum, f) => sum + f.puntaje, 0) / (groupFeedbacks.length || 1);
          group.accumulatedScore = Math.round(avgScore * 100) / 100;
          await writeJsonFile("simulation-state.json", state);
        }

        return feedback;
      } catch (err) {
        handleAIError(err);
      }
    }),

  getHistory: publicQuery
    .input(z.object({ groupNumber: z.string() }))
    .query(async ({ input }) => {
      const results = await readJsonFile<StudentResults[]>("student-results.json");
      const feedbacks = await readJsonFile<AIFeedback[]>("ai-feedback.json");
      const groupResults = results.filter((r) => r.groupNumber === input.groupNumber);
      const groupFeedbacks = feedbacks.filter((f) => f.groupNumber === input.groupNumber);
      return { results: groupResults, feedbacks: groupFeedbacks };
    }),

  hasFinalResult: publicQuery
    .input(z.object({ groupNumber: z.string(), session: z.number().optional() }))
    .query(async ({ input }) => {
      const results = await readJsonFile<StudentResults[]>("student-results.json");
      // Filter by session if provided, otherwise check any session
      const finalResult = results.find((r) => {
        const matchGroup = r.groupNumber === input.groupNumber;
        const matchFinal = r.isFinal === true;
        const matchSession = input.session ? r.session === input.session : true;
        return matchGroup && matchFinal && matchSession;
      });
      return { hasFinal: !!finalResult, resultId: finalResult?.id || null };
    }),

  advanceRound: publicQuery
    .input(z.object({ groupNumber: z.string() }))
    .mutation(async ({ input }) => {
      const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
      let group = state.activeGroups.find((g) => g.groupNumber === input.groupNumber);
      if (!group) {
        group = { groupNumber: input.groupNumber, currentSession: state.currentSession, currentRound: state.currentRound, accumulatedScore: 0, lastActionAt: new Date().toISOString() };
        state.activeGroups.push(group);
      }
      if (group.currentRound < state.maxRoundsPerSession) {
        group.currentRound += 1;
      } else if (group.currentSession < 3) {
        group.currentSession += 1;
        group.currentRound = 1;
      }
      await writeJsonFile("simulation-state.json", state);
      return { session: group.currentSession, round: group.currentRound };
    }),

  markFinal: publicQuery
    .input(z.object({ resultId: z.string() }))
    .mutation(async ({ input }) => {
      const results = await readJsonFile<StudentResults[]>("student-results.json");
      const result = results.find((r) => r.id === input.resultId);
      if (!result) throw new Error("Result not found");
      result.isFinal = true;
      await writeJsonFile("student-results.json", results);

      // Advance group to next session (e.g., S1 -> S2)
      const state = await readJsonFile<SimulationState>("simulation-state.json", DEFAULT_SIMULATION_STATE);
      const group = state.activeGroups.find((g) => g.groupNumber === result.groupNumber);
      if (group && group.currentSession < 3) {
        group.currentSession += 1;
        group.currentRound = 1;
        await writeJsonFile("simulation-state.json", state);
        console.log(`[markFinal] Advanced group ${result.groupNumber} to session ${group.currentSession}`);
      }

      return { success: true, newSession: group ? group.currentSession : null };
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
    // Sort by group then session then round
    finalResults.sort((a, b) => {
      const g = a.groupNumber.localeCompare(b.groupNumber);
      if (g !== 0) return g;
      return a.session - b.session || a.round - b.round;
    });
    return finalResults;
  }),

  getMarketRates: publicQuery
    .input(z.object({ session: z.number() }))
    .query(async ({ input }) => {
      const env = await readJsonFile<Record<string, EnvironmentVariables>>("environment.json", DEFAULT_ENVIRONMENT);
      const vars = env[`session${input.session}`];
      if (!vars) throw new Error("Environment not configured for this session");
      return {
        DTF: vars.DTF,
        IBR: vars.IBR,
        SOFR: vars.SOFR,
        PrimeRate: vars.PrimeRate,
        UVR: vars.UVR,
        TRM: vars.TRM,
        inflation: vars.inflation,
        devaluation: vars.devaluation,
        discountRate: vars.DTF, // tasa de descuento = DTF por defecto
      };
    }),
});
