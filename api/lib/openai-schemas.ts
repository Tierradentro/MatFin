/**
 * JSON Schemas for OpenAI Responses API structured outputs.
 * These schemas enforce the exact shape of the model's response,
 * eliminating the need for manual JSON parsing and validation.
 *
 * IMPORTANT: When session=2, the prompt instructs the model to use USD values.
 * The schema descriptions must be neutral about currency to allow per-session flexibility.
 */

export const OperationalOptionsSchema = {
  name: "operational_options",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      options: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "Unique identifier for this option" },
            category: {
              type: "string" as const,
              description: "Category code. S1: maquinaria/tecnologia/materia_prima/recursos/inmobiliario. S2: importacion_insumos/importacion_servicios/logistica_internacional/comercializacion_exportacion/financiamiento_exterior. S3: energia_renovable/gestion_residuos/biodiversidad/huella_carbono/gobernanza_esg",
            },
            name: { type: "string" as const, description: 'Short name. Format: "[Description] Estandar" for baseline, "[Description] Avanzada" for premium' },
            description: { type: "string" as const, description: "Brief description including sector context" },
            initialCost: {
              type: "number" as const,
              description: "Initial cost in millions. Use COP for S1/S3, USD (smaller values) for S2",
            },
            revenueImpact: {
              type: "number" as const,
              description: "Revenue impact as decimal percentage (e.g. 0.15 for 15%)",
            },
            costImpact: {
              type: "number" as const,
              description: "Cost impact as decimal percentage (e.g. 0.10 for 10%)",
            },
            esgImpact: {
              type: "number" as const,
              description: "ESG impact score between -0.05 and 0.05",
            },
            riskLevel: {
              type: "string" as const,
              enum: ["bajo", "medio", "alto"],
            },
          },
          required: ["id", "category", "name", "description", "initialCost", "revenueImpact", "costImpact", "esgImpact", "riskLevel"],
          additionalProperties: false,
        },
      },
    },
    required: ["options"],
    additionalProperties: false,
  },
};

export const SimulationDataSchema = {
  name: "simulation_data",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      periods: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            period: { type: "integer" as const, description: "Period number (1 to 5)" },
            ingresosVentas: { type: "number" as const, description: "Sales revenue" },
            ingresosServicios: { type: "number" as const, description: "Service revenue" },
            costosPersonal: { type: "number" as const, description: "Personnel costs" },
            costosInsumos: { type: "number" as const, description: "Input/material costs" },
            costosArriendos: { type: "number" as const, description: "Rental/lease costs" },
            costosOtros: { type: "number" as const, description: "Other operational costs" },
            costosFinancieros: { type: "number" as const, description: "Financial costs (interest)" },
            costosESG: { type: "number" as const, description: "ESG-related costs" },
          },
          required: ["period", "ingresosVentas", "ingresosServicios", "costosPersonal", "costosInsumos", "costosArriendos", "costosOtros", "costosFinancieros", "costosESG"],
          additionalProperties: false,
        },
      },
    },
    required: ["periods"],
    additionalProperties: false,
  },
};

export const FeedbackSchema = {
  name: "academic_feedback",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      evaluacion_general: {
        type: "string" as const,
        description: "Overall academic evaluation of the student's financial analysis. Consider the student's comment quality when scoring.",
      },
      aciertos: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "List of correct decisions and calculations. Reduce this list if the student's comment demonstrates deep understanding.",
      },
      errores_probables: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "List of probable errors. Only include errors NOT already explained correctly in the student's comment.",
      },
      recomendaciones: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Recommendations for improvement",
      },
      advertencias: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Warnings about risks or overlooked factors. Reduce if comment is thorough.",
      },
      puntaje: {
        type: "number" as const,
        description: "Score from 0 to 10. Higher for good comments with acceptable results.",
        minimum: 0,
        maximum: 10,
      },
      siguiente_accion: {
        type: "string" as const,
        description: "Suggested next action for the student",
      },
    },
    required: ["evaluacion_general", "aciertos", "errores_probables", "recomendaciones", "advertencias", "puntaje", "siguiente_accion"],
    additionalProperties: false,
  },
};

export const EnvironmentVariablesSchema = {
  name: "environment_variables",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      session1: {
        type: "object" as const,
        properties: {
          DTF: { type: "number" as const },
          IBR: { type: "number" as const },
          SOFR: { type: "number" as const },
          PrimeRate: { type: "number" as const },
          UVR: { type: "number" as const },
          TRM: { type: "number" as const, description: "Tasa Representativa del Mercado (COP/USD), e.g. 4200" },
          inflation: { type: "number" as const },
          devaluation: { type: "number" as const },
          sectorSpreads: {
            type: "object" as const,
            properties: {
              agricola: { type: "number" as const },
              industrial: { type: "number" as const },
              tecnologia: { type: "number" as const },
              inmobiliario: { type: "number" as const },
            },
            required: ["agricola", "industrial", "tecnologia", "inmobiliario"],
            additionalProperties: false,
          },
          esgRisk: { type: "number" as const },
          esgIncentive: { type: "number" as const },
          esgPenalty: { type: "number" as const },
        },
        required: ["DTF", "IBR", "SOFR", "PrimeRate", "UVR", "TRM", "inflation", "devaluation", "sectorSpreads", "esgRisk", "esgIncentive", "esgPenalty"],
        additionalProperties: false,
      },
      session2: {
        type: "object" as const,
        properties: {
          DTF: { type: "number" as const },
          IBR: { type: "number" as const },
          SOFR: { type: "number" as const },
          PrimeRate: { type: "number" as const },
          UVR: { type: "number" as const },
          TRM: { type: "number" as const, description: "Tasa Representativa del Mercado (COP/USD), e.g. 4500" },
          inflation: { type: "number" as const },
          devaluation: { type: "number" as const },
          sectorSpreads: {
            type: "object" as const,
            properties: {
              agricola: { type: "number" as const },
              industrial: { type: "number" as const },
              tecnologia: { type: "number" as const },
              inmobiliario: { type: "number" as const },
            },
            required: ["agricola", "industrial", "tecnologia", "inmobiliario"],
            additionalProperties: false,
          },
          esgRisk: { type: "number" as const },
          esgIncentive: { type: "number" as const },
          esgPenalty: { type: "number" as const },
        },
        required: ["DTF", "IBR", "SOFR", "PrimeRate", "UVR", "TRM", "inflation", "devaluation", "sectorSpreads", "esgRisk", "esgIncentive", "esgPenalty"],
        additionalProperties: false,
      },
      session3: {
        type: "object" as const,
        properties: {
          DTF: { type: "number" as const },
          IBR: { type: "number" as const },
          SOFR: { type: "number" as const },
          PrimeRate: { type: "number" as const },
          UVR: { type: "number" as const },
          TRM: { type: "number" as const, description: "Tasa Representativa del Mercado (COP/USD), e.g. 4800" },
          inflation: { type: "number" as const },
          devaluation: { type: "number" as const },
          sectorSpreads: {
            type: "object" as const,
            properties: {
              agricola: { type: "number" as const },
              industrial: { type: "number" as const },
              tecnologia: { type: "number" as const },
              inmobiliario: { type: "number" as const },
            },
            required: ["agricola", "industrial", "tecnologia", "inmobiliario"],
            additionalProperties: false,
          },
          esgRisk: { type: "number" as const },
          esgIncentive: { type: "number" as const },
          esgPenalty: { type: "number" as const },
        },
        required: ["DTF", "IBR", "SOFR", "PrimeRate", "UVR", "TRM", "inflation", "devaluation", "sectorSpreads", "esgRisk", "esgIncentive", "esgPenalty"],
        additionalProperties: false,
      },
    },
    required: ["session1", "session2", "session3"],
    additionalProperties: false,
  },
};

export type SchemaName = "operational_options" | "simulation_data" | "academic_feedback" | "environment_variables";

export const Schemas: Record<SchemaName, { name: string; strict: boolean; schema: Record<string, unknown> }> = {
  operational_options: OperationalOptionsSchema as any,
  simulation_data: SimulationDataSchema as any,
  academic_feedback: FeedbackSchema as any,
  environment_variables: EnvironmentVariablesSchema as any,
};
