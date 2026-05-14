export interface AdminSettings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  baseUrl: string;
  demoMode: boolean;
}

export interface EnvironmentVariables {
  DTF: number;
  IBR: number;
  SOFR: number;
  PrimeRate: number;
  UVR: number;
  TRM: number; // Tasa Representativa del Mercado (COP/USD)
  inflation: number;
  devaluation: number;
  sectorSpreads: Record<string, number>;
  esgRisk: number;
  esgIncentive: number;
  esgPenalty: number;
}

export interface SimulationState {
  currentSession: number;
  currentRound: number;
  maxRoundsPerSession: number;
  activeGroups: ActiveGroupState[];
}

export interface ActiveGroupState {
  groupNumber: string;
  currentSession: number;
  currentRound: number;
  accumulatedScore: number;
  lastActionAt: string;
}

export interface Project {
  nombre_proyecto: string;
  descripcion: string;
  sector: string;
  numero_grupo: string;
}

export interface OperationalOption {
  id: string;
  category: string;
  name: string;
  description: string;
  initialCost: number;
  revenueImpact: number;
  costImpact: number;
  esgImpact: number;
  riskLevel: string;
}

export interface FinancingOption {
  id: string;
  name: string;
  bank: string;
  baseRate: number;
  spread: number;
  totalRate: number;
  currency: string;
  termYears: number;
  gracePeriodMonths: number;
  amortizationType: string;
}

export interface SimulationPeriod {
  period: number;
  // Ingresos — se muestran segun el sector del proyecto
  ingresosVentas: number;
  ingresosServicios: number;
  // Costos operativos — se muestran segun el sector
  costosPersonal: number;
  costosInsumos: number;
  costosArriendos: number;
  costosOtros: number;
  // Costos financieros — se muestran SOLO si hay financiacion seleccionada
  costosFinancieros: number;
  // Costos ESG
  costosESG: number;
}

export interface SimulationMeta {
  // Qué columnas de ingresos mostrar (>0 significa que aplica)
  hasVentas: boolean;
  hasServicios: boolean;
  // Qué columnas de costos mostrar
  hasPersonal: boolean;
  hasInsumos: boolean;
  hasArriendos: boolean;
  hasOtros: boolean;
  // Financiacion
  hasFinanciacion: boolean;
  // Moneda de los flujos (COP para S1, USD para S2)
  currency: string;
  // Numero de periodos (5 para S1, 3 para S2)
  numPeriods: number;
  // Indicador de sesion
  isSession2: boolean;
  // Tasas aplicadas (para mostrar en UI)
  appliedInflation: number;
  appliedDevaluation: number;
}

export interface StudentResults {
  id: string;
  groupNumber: string;
  session: number;
  round: number;
  vpn: number;
  tir: number;
  bc: number;
  comment: string;
  operationalDecisions: Record<string, string>;
  financingOptionId: string;
  submittedAt: string;
  isFinal?: boolean;
}

export interface GroupFinalResult {
  groupNumber: string;
  projectName: string;
  sector: string;
  session: number;
  round: number;
  vpn: number;
  tir: number;
  bc: number;
  comment: string;
  puntajeIA: number;
  submittedAt: string;
}

export interface AIFeedback {
  id: string;
  groupNumber: string;
  session: number;
  round: number;
  evaluacion_general: string;
  aciertos: string[];
  errores_probables: string[];
  recomendaciones: string[];
  advertencias: string[];
  puntaje: number;
  siguiente_accion: string;
  createdAt: string;
}

export interface AuditLogEntry {
  action: string;
  details: string;
  timestamp: string;
}

export interface SessionStatus {
  session: number;
  round: number;
  maxRounds: number;
  accumulatedScore: number;
  isSessionComplete: boolean;
}
