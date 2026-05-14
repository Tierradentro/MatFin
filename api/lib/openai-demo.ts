import type { OperationalOption, SimulationPeriod, AIFeedback } from "@contracts/types";

/**
 * Local mock generator for Demo/Offline mode.
 * Produces valid structured JSON responses without calling OpenAI.
 * Useful when api.openai.com is unreachable (firewall, no internet, etc.)
 */

export function generateMockOperationalOptions(
  _projectName: string,
  sector: string,
  session: number,
): OperationalOption[] {
  // S1: local operations (COP), S2: international (USD), S3: ESG focus (COP)
  const isSession2 = session === 2;
  const isSession3 = session === 3;

  let categories: readonly string[];
  let baseCosts: Record<string, number>;

  if (isSession2) {
    categories = ["importacion_insumos", "importacion_servicios", "logistica_internacional", "comercializacion_exportacion", "financiamiento_exterior"];
    baseCosts = { importacion_insumos: 1.2, importacion_servicios: 0.8, logistica_internacional: 1.5, comercializacion_exportacion: 0.6, financiamiento_exterior: 0.9 };
  } else if (isSession3) {
    categories = ["energia_renovable", "gestion_residuos", "biodiversidad", "huella_carbono", "gobernanza_esg"];
    baseCosts = { energia_renovable: 180, gestion_residuos: 120, biodiversidad: 150, huella_carbono: 200, gobernanza_esg: 100 };
  } else {
    categories = ["maquinaria", "tecnologia", "materia_prima", "recursos", "inmobiliario"];
    baseCosts = { maquinaria: 250, tecnologia: 180, materia_prima: 120, recursos: 90, inmobiliario: 300 };
  }

  const options: OperationalOption[] = [];

  categories.forEach((cat, ci) => {
    for (let i = 1; i <= 2; i++) {
      const costMultiplier = session === 1 ? 1 : session === 2 ? 1.15 : 1.3;
      const riskLevels = ["bajo", "medio", "alto"] as const;
      const baseCost = baseCosts[cat] || (isSession2 ? 0.5 : 200);
      const displayName = isSession2
        ? `${cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} ${i === 1 ? "Estandar" : "Avanzada"}`
        : `${cat.charAt(0).toUpperCase() + cat.slice(1).replace("_", " ")} ${i === 1 ? "Estandar" : "Avanzada"} - S${session}`;
      options.push({
        id: `${cat}-${session}-${i}`,
        category: cat,
        name: displayName,
        description: isSession2
          ? `Opcion ${i === 1 ? "estandar" : "premium"} de ${cat.replace(/_/g, " ")} para comercio internacional (${sector})`
          : isSession3
            ? `Opcion ${i === 1 ? "estandar" : "premium"} de ${cat.replace(/_/g, " ")} para cumplimiento ESG (${sector})`
            : `Opcion ${i === 1 ? "estandar" : "premium"} de ${cat.replace("_", " ")} para ${_projectName} (${sector})`,
        initialCost: Math.round(baseCost * costMultiplier * (i === 1 ? 1 : 1.4) * 100) / 100,
        revenueImpact: i === 1 ? 0.10 : 0.20,
        costImpact: i === 1 ? 0.07 : 0.04,
        esgImpact: (ci + i) % 3 === 0 ? -0.02 : (ci + i) % 3 === 1 ? 0.01 : 0.03,
        riskLevel: riskLevels[(ci + i) % 3],
      });
    }
  });

  return options;
}

export function generateMockSimulationData(
  _projectName: string,
  sector: string,
  session: number,
): SimulationPeriod[] {
  const periods: SimulationPeriod[] = [];
  const isSession2 = session === 2;
  const isSession3 = session === 3;
  // S2: USD base revenue (smaller numbers), S1/S3: COP
  const baseRevenue = sector === "inmobiliario" ? 800
    : sector === "tecnologia" ? 600
    : sector === "industrial" ? 700
    : sector === "moda" ? 600 : 500;
  const growthRate = 1 + (session === 1 ? 0.05 : session === 2 ? 0.08 : 0.12);
  // S1: periods 1-5, S2: periods 3-5, S3: periods 4-5 (3 years since start)
  const startPeriod = isSession2 ? 3 : isSession3 ? 4 : 1;
  const endPeriod = 5;

  for (let p = startPeriod; p <= endPeriod; p++) {
    const factor = Math.pow(growthRate, p - 1);
    periods.push({
      period: p,
      ingresosVentas: Math.round(baseRevenue * factor * 0.7),
      ingresosServicios: Math.round(baseRevenue * factor * 0.3),
      costosPersonal: Math.round(baseRevenue * factor * 0.25),
      costosInsumos: Math.round(baseRevenue * factor * 0.2),
      costosArriendos: Math.round(baseRevenue * factor * 0.08),
      costosOtros: Math.round(baseRevenue * factor * 0.04),
      costosFinancieros: Math.round(baseRevenue * factor * 0.12),
      costosESG: Math.round(baseRevenue * factor * 0.05),
    });
  }

  return periods;
}

export function generateMockFeedback(
  vpn: number,
  tir: number,
  bc: number,
  _comment: string,
  session: number,
  round: number,
): AIFeedback {
  const isGood = bc >= 1.2 && vpn > 0 && tir > 0.12;
  const isMedium = bc >= 1.0 && vpn > 0;

  return {
    id: "demo",
    groupNumber: "demo",
    session,
    round,
    evaluacion_general: isGood
      ? `Excelente analisis financiero para la sesion ${session}. Los indicadores muestran viabilidad del proyecto.`
      : isMedium
        ? `Analisis aceptable para sesion ${session}. El proyecto es marginalmente viable pero requiere ajustes.`
        : `Analisis deficiente para sesion ${session}. Los indicadores sugieren que el proyecto no es viable con los parametros actuales.`,
    aciertos: [
      "Uso correcto de la tasa de descuento del entorno colombiano",
      "Identificacion de componentes de costos e ingresos",
      "Consideracion de variables macroeconomicas (inflacion, devaluacion)",
    ],
    errores_probables: isGood
      ? ["Podria fortalecer el analisis de sensibilidad a cambios en tasas"]
      : [
          "Posible omision del efecto devaluacion en costos USD",
          "TIR podria no considerar reinversion de flujos",
          "B/C puede estar sesgado si no se incluyeron costos ESG completos",
        ],
    recomendaciones: [
      "Revisar el spread del sector contra DTF e IBR",
      "Incluir escenario pesimista con subida de tasas",
      "Verificar amortizacion de la financiacion elegida",
    ],
    advertencias: [
      "El entorno macroeconomico de sesion 3 puede deteriorar los indicadores",
      "Riesgo ESG no cuantificado completamente en los costos",
    ],
    puntaje: isGood ? Math.min(10, 7.5 + round * 0.5) : isMedium ? Math.min(7, 5 + round * 0.5) : Math.min(5, 3 + round * 0.3),
    siguiente_accion: session < 3
      ? "Avanza a la siguiente sesion y ajusta las decisiones operativas segun las recomendaciones."
      : "Revisa el consolidado de las 3 sesiones y prepara la presentacion final.",
    createdAt: new Date().toISOString(),
  };
}
