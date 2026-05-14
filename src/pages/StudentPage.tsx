import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Trophy, CheckCircle, ArrowRight } from 'lucide-react'
import type { Project, OperationalOption, FinancingOption, SimulationPeriod, AIFeedback } from '@contracts/types'

export default function StudentPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [step, setStep] = useState(0)
  const [groupNumber, setGroupNumber] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [operationalDecisions, setOperationalDecisions] = useState<Record<string, string>>({})
  const [operationalOptions, setOperationalOptions] = useState<OperationalOption[]>([])
  const [operationalCurrency, setOperationalCurrency] = useState<string>('COP')
  const [financingOptions, setFinancingOptions] = useState<FinancingOption[]>([])
  const [selectedFinancing, setSelectedFinancing] = useState<string>('')
  const [financingError, setFinancingError] = useState('')
  const [operationalError, setOperationalError] = useState('')
  const [simulationData, setSimulationData] = useState<SimulationPeriod[]>([])
  const [simulationMeta, setSimulationMeta] = useState<any>(null)
  const [results, setResults] = useState({ vpn: '', tir: '', bc: '', comment: '' })
  const [feedback, setFeedback] = useState<AIFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [isFinalMarked, setIsFinalMarked] = useState(false)
  const [marketRates, setMarketRates] = useState<{ DTF: number; IBR: number; TRM: number; discountRate: number; inflation: number; devaluation: number } | null>(null)
  const [hasFinalResult, setHasFinalResult] = useState(false)

  const findProject = trpc.student.findProject.useQuery({ groupNumber }, { enabled: false })
  const getStatus = trpc.student.getGroupStatus.useQuery({ groupNumber }, { enabled: false })
  const submitResults = trpc.student.submitResults.useMutation()
  const generateFeedback = trpc.student.generateFeedback.useMutation()
  const markFinal = trpc.student.markFinal.useMutation()
  const advanceRound = trpc.student.advanceRound.useMutation()

  const steps = [
    'Proyecto',
    'Operacion',
    'Financiacion',
    'Estimacion',
    'Resultados',
    'Retroalimentacion'
  ]

  /* ---------------------------------------------------------------- */
  /*  STEP 0 → 1 : search project                                     */
  /* ---------------------------------------------------------------- */
  const handleSearchProject = async () => {
    if (!groupNumber.trim()) return
    setLoading(true)
    console.log('[AUDIT] handleSearchProject: groupNumber=', groupNumber)
    const res = await findProject.refetch()
    console.log('[AUDIT] findProject result:', res.data ? 'FOUND' : 'NOT FOUND', res.error?.message || '')
    if (res.data) {
      setProject(res.data)
      const st = await getStatus.refetch()
      console.log('[AUDIT] getStatus result:', st.data)
      setStatus(st.data)
      setStep(1)
      localStorage.setItem('student_group', groupNumber)
      localStorage.setItem('student_project', JSON.stringify(res.data))
    } else {
      alert('Grupo no encontrado. Verifica el numero.')
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  STEP 1 → 2 : load operational options                           */
  /* ---------------------------------------------------------------- */
  const loadOperational = async (explicitProject?: Project, explicitStatus?: any) => {
    const proj = explicitProject || project
    const st = explicitStatus || status

    console.log('[AUDIT] loadOperational called. project=', proj?.nombre_proyecto, 'status=', st ? `S${st.session}` : 'null')

    if (!proj || !st) {
      const msg = 'Error: No hay proyecto o sesion activa. Vuelve al inicio.'
      console.log('[AUDIT] loadOperational aborted:', msg)
      setOperationalError(msg)
      return
    }
    setLoading(true)
    setOperationalError('')
    try {
      console.log('[AUDIT] Calling getOperationalNeeds.query() with:', {
        groupNumber, projectName: proj.nombre_proyecto, sector: proj.sector, session: st.session
      })
      const data = await utils.client.student.getOperationalNeeds.query({
        groupNumber,
        projectName: proj.nombre_proyecto,
        sector: proj.sector,
        session: st.session,
      })
      console.log('[AUDIT] getOperationalNeeds returned', data?.length || 0, 'options')
      if (data && data.length > 0) {
        setOperationalOptions(data)
        // Currency is USD for S2, COP for S1/S3
        const session = explicitStatus?.session || status?.session || 1
        setOperationalCurrency(session === 2 ? 'USD' : 'COP')
        setOperationalDecisions({})
        setOperationalError('')
      } else {
        setOperationalError('No se recibieron opciones operativas del servidor. Intenta nuevamente.')
        setOperationalOptions([])
      }
    } catch (err: any) {
      console.error('[AUDIT] getOperationalNeeds ERROR:', err)
      const msg = err?.message || 'Error desconocido al cargar opciones operativas'
      setOperationalError(`[Error IA] ${msg}. Reintenta o contacta al administrador.`)
      setOperationalOptions([])
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  STEP 2 → 3 : load financing options                             */
  /* ---------------------------------------------------------------- */
  const loadFinancing = async () => {
    if (!project || !status) {
      setFinancingError('Error: No hay proyecto o sesion activa. Vuelve al inicio.')
      return
    }
    setLoading(true)
    setFinancingError('')
    const hasInmobiliario = Object.keys(operationalDecisions).includes('inmobiliario')
    try {
      const data = await utils.client.student.getFinancingOptions.query({
        sector: project.sector,
        session: status.session,
        selectedInmobiliario: hasInmobiliario,
      })
      setFinancingOptions(data)
      if (data.length > 0 && !selectedFinancing) {
        setSelectedFinancing(data[0].id)
      }
    } catch (e: any) {
      console.error('Error cargando financiacion:', e)
      setFinancingError(e?.message || 'Error al cargar opciones de financiacion. Verifica la conexion.')
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                           */
  /* ---------------------------------------------------------------- */
  const getSelectedOperationalOptions = (): OperationalOption[] => {
    return Object.values(operationalDecisions)
      .map((id) => operationalOptions.find((o) => o.id === id))
      .filter((o): o is OperationalOption => !!o)
  }

  const getSelectedFinancingOption = (): FinancingOption | undefined => {
    return financingOptions.find((f) => f.id === selectedFinancing)
  }

  const getTotalInitialCost = (): number => {
    return getSelectedOperationalOptions().reduce((sum, o) => sum + o.initialCost, 0)
  }

  // Currency shown only in table headers (USD for S2, no label for S1/S3)
  // All monetary values outside the estimation table display without currency suffix

  const getOwnCapital = (): number => {
    // 65% of the minimum-cost (baseline) option per category
    const categories = Array.from(new Set(operationalOptions.map((o) => o.category)))
    let baselineTotal = 0
    for (const cat of categories) {
      const catOptions = operationalOptions.filter((o) => o.category === cat)
      if (catOptions.length > 0) {
        const cheapest = catOptions.reduce((min, o) => (o.initialCost < min.initialCost ? o : min))
        baselineTotal += cheapest.initialCost
      }
    }
    return Math.round(baselineTotal * 0.65)
  }

  /* ---------------------------------------------------------------- */
  /*  STEP 3 → 4 : load simulation                                    */
  /* ---------------------------------------------------------------- */
  const loadSimulation = async () => {
    setLoading(true)
    const selectedOps = getSelectedOperationalOptions()
    const selectedFin = getSelectedFinancingOption()
    try {
      const [data, rates] = await Promise.all([
        utils.client.student.getSimulationData.query({
          groupNumber,
          projectName: project?.nombre_proyecto || '',
          sector: project?.sector || '',
          session: status?.session || 1,
          selectedOperationalOptions: selectedOps.map((o) => ({
            id: o.id,
            category: o.category,
            name: o.name,
            revenueImpact: o.revenueImpact,
            costImpact: o.costImpact,
            esgImpact: o.esgImpact,
            initialCost: o.initialCost,
          })),
          selectedFinancingOption: selectedFin ? {
            id: selectedFin.id,
            totalRate: selectedFin.totalRate,
            currency: selectedFin.currency,
            termYears: selectedFin.termYears,
          } : {
            id: 'none',
            totalRate: 0,
            currency: 'COP',
            termYears: 5,
          },
        }),
        utils.client.student.getMarketRates.query({ session: status?.session || 1 }),
      ])
      setSimulationData(data.periods)
      setSimulationMeta(data.meta)
      setMarketRates(rates)
    } catch (e: any) {
      console.error('Error cargando simulacion:', e)
      alert('Error al calcular la estimacion: ' + (e?.message || 'Error desconocido'))
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  STEP 5 : submit results                                         */
  /* ---------------------------------------------------------------- */
  const handleSubmit = async () => {
    if (!project || !status) return
    setLoading(true)
    const res = await submitResults.mutateAsync({
      groupNumber,
      session: status.session,
      round: status.round,
      vpn: parseFloat(results.vpn),
      tir: parseFloat(results.tir),
      bc: parseFloat(results.bc),
      comment: results.comment,
      operationalDecisions,
      financingOptionId: selectedFinancing,
    })
    if (res.success) {
      const fb = await generateFeedback.mutateAsync({ resultId: res.id })
      setFeedback(fb)
      const finalCheck = await utils.client.student.hasFinalResult.query({ groupNumber, session: status?.session })
      setHasFinalResult(finalCheck.hasFinal)
      setStep(6)
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  Advance round                                                   */
  /* ---------------------------------------------------------------- */
  const advance = async () => {
    if (!groupNumber) return
    setLoading(true)
    try {
      const res = await advanceRound.mutateAsync({ groupNumber })
      const st = await getStatus.refetch()
      setStatus(st.data)
      if (st.data) {
        localStorage.setItem('student_session', String(st.data.session))
        localStorage.setItem('student_round', String(st.data.round))
      }
      // Reset final result check for the new session/round
      setHasFinalResult(false)
      setIsFinalMarked(false)
      // If advancing to a new session (e.g., S1->S2), reset everything
      if (res.session !== status?.session) {
        setOperationalDecisions({})
        setOperationalOptions([])
        setFinancingOptions([])
        setSelectedFinancing('')
        setSimulationData([])
        setSimulationMeta(null)
        setResults({ vpn: '', tir: '', bc: '', comment: '' })
        setFeedback(null)
      }
      setStep(2)
    } catch (e: any) {
      alert('Error al avanzar: ' + (e?.message || 'Error desconocido'))
    }
    setLoading(false)
  }

  /* ---------------------------------------------------------------- */
  /*  Effects                                                         */
  /* ---------------------------------------------------------------- */

  // Restore from localStorage on mount
  useEffect(() => {
    const savedGroup = localStorage.getItem('student_group')
    if (savedGroup && !project) {
      setGroupNumber(savedGroup)
      const savedProject = localStorage.getItem('student_project')
      if (savedProject) {
        try { setProject(JSON.parse(savedProject)) } catch { /* ignore */ }
      }
      getStatus.refetch().then((st) => {
        if (st.data) setStatus(st.data)
      })
    }
  }, [])

  // Auto-load data when step changes
  useEffect(() => {
    console.log('[AUDIT] useEffect fired. step=', step, 'project?', !!project, 'status?', !!status, 'opCount=', operationalOptions.length)
    if (step === 2 && project && status && operationalOptions.length === 0) {
      console.log('[AUDIT] Triggering loadOperational()')
      loadOperational()
    }
    if (step === 3 && project && status && financingOptions.length === 0) {
      loadFinancing()
    }
    if (step === 4 && project && status && simulationData.length === 0) {
      const timer = setTimeout(() => loadSimulation(), 50)
      return () => clearTimeout(timer)
    }
    if (step === 6 && groupNumber && status) {
      utils.client.student.hasFinalResult.query({ groupNumber, session: status.session }).then((res) => {
        setHasFinalResult(res.hasFinal)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, project, status])

  /* ---------------------------------------------------------------- */
  /*  STEP 1 → 2 : explicit continue with load                        */
  /* ---------------------------------------------------------------- */
  const handleContinueToOperational = async () => {
    console.log('[AUDIT] handleContinueToOperational called')
    setStep(2)
    // Explicitly load operational options right away (don't wait for useEffect)
    console.log('[AUDIT] Calling loadOperational explicitly from handleContinueToOperational')
    // Small delay to ensure step=2 state is committed before loadOperational reads it
    setTimeout(() => loadOperational(), 0)
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Simulacion Estudiante</h1>
              {status && (
                <div className="flex gap-3 text-sm text-slate-600 mt-1">
                  <span>Sesion: <strong>{status.session}</strong></span>
                  <span>Ronda: <strong>{status.round}/{status.maxRounds}</strong></span>
                  <span>Puntaje: <strong>{status.accumulatedScore}</strong></span>
                </div>
              )}
            </div>
          </div>
          {project && (
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{project.nombre_proyecto}</p>
              <p className="text-xs text-slate-500">{project.sector} — Grupo {project.numero_grupo}</p>
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        {step > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
            {steps.map((s, i) => (
              <span key={s} className={i === step ? 'font-bold text-slate-800' : ''}>
                {i === step ? `${i}. ${s}` : `${i}`}
                {i < steps.length - 1 && ' > '}
              </span>
            ))}
          </div>
        )}



        {/* ====== STEP 0 : Login ====== */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bienvenido al Simulador</CardTitle>
              <CardDescription>Ingresa tu numero de grupo para comenzar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Numero de Grupo</Label>
                <Input placeholder="Ej: 101" value={groupNumber} onChange={(e) => setGroupNumber(e.target.value)} />
              </div>
              <Button onClick={handleSearchProject} disabled={loading} className="gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Buscar Proyecto
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 1 : Project ====== */}
        {step === 1 && project && (
          <Card>
            <CardHeader>
              <CardTitle>Tu Proyecto</CardTitle>
              <CardDescription>Revisa la informacion de tu proyecto asignado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white border rounded-lg p-4 space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">{project.nombre_proyecto}</h3>
                <p className="text-sm text-slate-600">{project.descripcion}</p>
                <div className="flex gap-4 text-sm">
                  <span className="bg-slate-100 px-2 py-1 rounded">Sector: {project.sector}</span>
                  <span className="bg-slate-100 px-2 py-1 rounded">Grupo: {project.numero_grupo}</span>
                </div>
              </div>
              <Button onClick={handleContinueToOperational}>Continuar a Decisiones Operativas</Button>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 2 : Operational Decisions ====== */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Decisiones Operativas</CardTitle>
              <CardDescription>Selecciona las opciones que consideres necesarias para tu proyecto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Loading state */}
              {loading && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando opciones operativas con IA...
                </div>
              )}

              {/* Error state */}
              {operationalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 space-y-2">
                  <p><strong>Error al cargar decisiones operativas:</strong></p>
                  <p>{operationalError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadOperational()} disabled={loading} className="gap-2 mt-1">
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Reintentar carga de opciones
                  </Button>
                </div>
              )}

              {/* No options yet — show load button */}
              {!loading && !operationalError && operationalOptions.length === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 space-y-2">
                  <p>Las opciones operativas se generan con IA segun tu proyecto y sector.</p>
                  <Button size="sm" onClick={() => loadOperational()} disabled={loading} className="gap-2">
                    <Loader2 className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    Cargar opciones operativas
                  </Button>
                </div>
              )}

              {/* Capital propio */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-amber-900 text-sm">Capital inicial estimado de recursos propios</h3>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm text-amber-800">Capital propio disponible:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-amber-900 font-mono">${getOwnCapital()}M {operationalCurrency === 'USD' ? '(USD)' : 'COP'}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                      disabled={loading}
                      onClick={async () => {
                        if (operationalOptions.length === 0) {
                          await loadOperational()
                        } else {
                          // Force re-render of capital calculation
                          setOperationalDecisions({ ...operationalDecisions })
                        }
                      }}
                    >
                      {loading ? (
                        <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Cargando...</>
                      ) : operationalOptions.length === 0 ? 'Cargar opciones' : 'Recalcular'}
                    </Button>
                  </div>
                </div>
                {getSelectedOperationalOptions().length > 0 && (
                  <>
                    <div className="border-t border-amber-200 pt-2 flex justify-between text-sm">
                      <span className="text-amber-800">Costo de tus selecciones:</span>
                      <span className="font-mono text-amber-900">${getTotalInitialCost()}M</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className={getTotalInitialCost() > getOwnCapital() ? 'text-red-700' : 'text-emerald-700'}>
                        {getTotalInitialCost() > getOwnCapital() ? 'Deficit a financiar:' : 'Excedente:'}
                      </span>
                      <span className={`font-mono ${getTotalInitialCost() > getOwnCapital() ? 'text-red-700' : 'text-emerald-700'}`}>
                        ${Math.abs(getTotalInitialCost() - getOwnCapital())}M
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Options by category */}
              {operationalOptions.length > 0 && Array.from(new Set(operationalOptions.map(o => o.category))).map(cat => (
                <div key={cat} className="space-y-3">
                  <h3 className="font-semibold text-slate-800 capitalize">{cat.replace('_', ' ')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {operationalOptions.filter(o => o.category === cat).map(opt => (
                      <div
                        key={opt.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${operationalDecisions[cat] === opt.id ? 'border-emerald-500 bg-emerald-50' : 'hover:bg-slate-50'}`}
                        onClick={() => {
                          if (operationalDecisions[cat] === opt.id) {
                            const { [cat]: _, ...rest } = operationalDecisions
                            setOperationalDecisions(rest)
                          } else {
                            setOperationalDecisions(prev => ({ ...prev, [cat]: opt.id }))
                          }
                        }}
                      >
                        <h4 className="font-medium text-slate-900">{opt.name}</h4>
                        <p className="text-xs text-slate-600 mt-1">{opt.description}</p>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                          <span className="text-slate-500">Costo: ${opt.initialCost}M {operationalCurrency === 'USD' ? '(USD)' : 'COP'}</span>
                          <span className="text-slate-500">Ingreso: {(opt.revenueImpact * 100).toFixed(1)}%</span>
                          <span className="text-slate-500">Costo Op: {(opt.costImpact * 100).toFixed(1)}%</span>
                          <span className="text-slate-500">ESG: {opt.esgImpact > 0 ? '+' : ''}{opt.esgImpact}</span>
                          <span className="text-slate-500 col-span-2">Riesgo: {opt.riskLevel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Continue button */}
              <Button onClick={() => setStep(3)} disabled={Object.keys(operationalDecisions).length < 2}>
                Continuar a Financiacion (minimo 2 selecciones)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 3 : Financing ====== */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Opciones de Financiacion (Informativo)</CardTitle>
              <CardDescription>Estas opciones son de referencia. Puedes consultarlas para tu analisis, pero no es obligatorio seleccionar una para continuar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando opciones...</div>}
              {financingError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-2">
                  <p><strong>Error:</strong> {financingError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadFinancing()} className="gap-2">
                    <Loader2 className="h-3 w-3" /> Reintentar
                  </Button>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-blue-900 text-sm">Resumen de necesidades de financiacion</h3>
                <div className="space-y-1">
                  {getSelectedOperationalOptions().map(op => (
                    <div key={op.id} className="flex justify-between text-xs text-blue-800">
                      <span>{op.name} ({op.category})</span>
                      <span className="font-mono">${op.initialCost}M</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-blue-200 pt-2 flex justify-between text-sm font-bold text-blue-900">
                  <span>Capital inicial requerido:</span>
                  <span className="font-mono">${getTotalInitialCost()}M</span>
                </div>
                {getTotalInitialCost() > getOwnCapital() && (
                  <div className="flex justify-between text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-2">
                    <span>Deuda requerida (deficit):</span>
                    <span className="font-mono">${getTotalInitialCost() - getOwnCapital()}M</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {financingOptions.map(opt => (
                  <div
                    key={opt.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedFinancing === opt.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedFinancing(opt.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-slate-900">{opt.name}</h4>
                        <p className="text-sm font-semibold text-blue-700 mt-0.5">{opt.bank}</p>
                        <p className="text-xs text-slate-600 mt-1">{opt.amortizationType} — {opt.currency}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-500">
                      <span>Tasa base: {(opt.baseRate * 100).toFixed(2)}%</span>
                      <span>Spread: {(opt.spread * 100).toFixed(2)}%</span>
                      <span>Plazo: {opt.termYears} años</span>
                      <span>Gracia: {opt.gracePeriodMonths} meses</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Volver a Operativas
                </Button>
                <Button onClick={() => setStep(4)} className="gap-2">
                  Continuar a Estimacion <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 4 : Simulation ====== */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Estimacion de Ingresos y Costos {simulationMeta?.currency && `(${simulationMeta.currency})`}</CardTitle>
              <CardDescription>
                {simulationMeta?.isSession2
                  ? 'Sesion 2 — Flujos en USD. Los resultados (VPN, TIR, B/C) se ingresan en COP.'
                  : 'Los datos se calculan a partir de tus decisiones operativas y financiacion elegida.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Calculando estimacion...</div>}

              {!loading && simulationData.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-slate-500 text-sm">No hay datos de estimacion disponibles.</p>
                  <Button variant="outline" onClick={() => loadSimulation()} className="mt-3 gap-2">
                    <Loader2 className="h-4 w-4" /> Recalcular Estimacion
                  </Button>
                </div>
              )}

              {simulationData.length > 0 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold text-emerald-900 text-sm">Inversion Total</h3>
                          <p className="text-xs text-emerald-700">Suma de las decisiones operativas seleccionadas</p>
                        </div>
                        <span className="text-xl font-bold text-emerald-800 font-mono">${getTotalInitialCost()}M</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {getSelectedOperationalOptions().map(op => (
                          <div key={op.id} className="flex justify-between text-xs text-emerald-700">
                            <span>{op.name}</span>
                            <span className="font-mono">${op.initialCost}M</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {marketRates && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 text-sm">Tasa de descuento de mercado</h3>
                        <p className="text-xs text-blue-700">Utiliza esta tasa para calcular el VPN</p>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-sm text-blue-800">DTF (Tasa de descuento):</span>
                          <span className="text-xl font-bold text-blue-900 font-mono">{(marketRates.discountRate * 100).toFixed(2)}%</span>
                        </div>
                        <div className="mt-2 flex justify-between items-center border-t border-blue-200 pt-2">
                          <span className="text-sm text-blue-800">TRM (COP/USD):</span>
                          <span className="text-lg font-bold text-blue-900 font-mono">${marketRates.TRM?.toLocaleString('es-CO') || 'N/A'}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-blue-700">
                          <span>Inflacion: {(marketRates.inflation * 100).toFixed(2)}%</span>
                          <span>Devaluacion: {(marketRates.devaluation * 100).toFixed(2)}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold" rowSpan={2}>Periodo</th>
                          {(simulationMeta?.hasVentas || simulationMeta?.hasServicios) && (
                            <th className="px-3 py-2 text-center bg-emerald-50 text-emerald-800" colSpan={(simulationMeta?.hasVentas ? 1 : 0) + (simulationMeta?.hasServicios ? 1 : 0)}>
                              INGRESOS {simulationMeta?.isSession2 ? '(USD)' : ''}
                            </th>
                          )}
                          <th className="px-3 py-2 text-center bg-red-50 text-red-800" colSpan={(simulationMeta?.hasPersonal ? 1 : 0) + (simulationMeta?.hasInsumos ? 1 : 0) + (simulationMeta?.hasArriendos ? 1 : 0) + (simulationMeta?.hasOtros ? 1 : 0)}>
                            COSTOS {simulationMeta?.isSession2 ? '(USD)' : ''}
                          </th>
                          {simulationMeta?.hasFinanciacion && (
                            <th className="px-3 py-2 text-center bg-amber-50 text-amber-800" rowSpan={2}>Financ.</th>
                          )}
                        </tr>
                        <tr>
                          {simulationMeta?.hasVentas && (
                            <th className="px-3 py-2 text-right text-xs bg-emerald-50">Ventas</th>
                          )}
                          {simulationMeta?.hasServicios && (
                            <th className="px-3 py-2 text-right text-xs bg-emerald-50">Servicios</th>
                          )}
                          {simulationMeta?.hasPersonal && (
                            <th className="px-3 py-2 text-right text-xs bg-red-50">Personal</th>
                          )}
                          {simulationMeta?.hasInsumos && (
                            <th className="px-3 py-2 text-right text-xs bg-red-50">Insumos</th>
                          )}
                          {simulationMeta?.hasArriendos && (
                            <th className="px-3 py-2 text-right text-xs bg-red-50">Arriendos</th>
                          )}
                          {simulationMeta?.hasOtros && (
                            <th className="px-3 py-2 text-right text-xs bg-red-50">Otros</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {simulationData.map((p) => (
                          <tr key={p.period} className="border-t">
                            <td className="px-3 py-2 font-medium">{p.period}</td>
                            {simulationMeta?.hasVentas && (
                              <td className="px-3 py-2 text-right font-mono">{p.ingresosVentas.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasServicios && (
                              <td className="px-3 py-2 text-right font-mono">{p.ingresosServicios.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasPersonal && (
                              <td className="px-3 py-2 text-right font-mono">{p.costosPersonal.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasInsumos && (
                              <td className="px-3 py-2 text-right font-mono">{p.costosInsumos.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasArriendos && (
                              <td className="px-3 py-2 text-right font-mono">{p.costosArriendos.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasOtros && (
                              <td className="px-3 py-2 text-right font-mono">{p.costosOtros.toLocaleString('en-US')}</td>
                            )}
                            {simulationMeta?.hasFinanciacion && (
                              <td className="px-3 py-2 text-right font-mono text-amber-700">{p.costosFinancieros.toLocaleString('en-US')}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {simulationMeta?.isSession2 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800 space-y-1">
                      <p><strong>Sesion 2 — Comercio internacional:</strong></p>
                      <p>Los flujos estan en <strong>miles de USD</strong>. Han pasado 2 años desde la Sesion 1.</p>
                      <p>Los ingresos provienen de ventas/comercializacion en dolares.</p>
                      <p>Los costos incluyen compra de insumos/servicios en el extranjero.</p>
                      <p>Inflacion acumulada aplicada: {(simulationMeta?.appliedInflation * 100).toFixed(2)}% | Devaluacion (TRM): {(simulationMeta?.appliedDevaluation * 100).toFixed(2)}%</p>
                    </div>
                  )}

                  {simulationMeta?.isSession3 && simulationMeta?.esgIndicators && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm space-y-2">
                      <p className="font-semibold text-emerald-900"><strong>Sesion 3 — Indicadores ESG:</strong></p>
                      <p className="text-emerald-800">Han pasado 3 años desde el inicio. Los flujos estan en <strong>millones de COP</strong> con ajuste por inflacion.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div className="bg-white border border-emerald-200 rounded p-2">
                          <p className="font-medium text-emerald-800 text-xs mb-1">Impactos Positivos (incentivos)</p>
                          {simulationMeta.esgIndicators.positivos.map((ind: string, i: number) => (
                            <p key={i} className="text-emerald-700 text-xs">+ {ind}</p>
                          ))}
                        </div>
                        <div className="bg-white border border-red-200 rounded p-2">
                          <p className="font-medium text-red-800 text-xs mb-1">Impactos Negativos (riesgos)</p>
                          {simulationMeta.esgIndicators.negativos.map((ind: string, i: number) => (
                            <p key={i} className="text-red-700 text-xs">- {ind}</p>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-emerald-700 mt-1">Considera estos factores ESG al calcular los flujos netos.</p>
                    </div>
                  )}

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
                    <p><strong>Para tener en cuenta:</strong></p>
                    <p>1. Suma los ingresos y costos de cada periodo para obtener el flujo neto.</p>
                    {!simulationMeta?.hasFinanciacion && (
                      <p>2. No seleccionaste financiacion. Los costos financieros son 0.</p>
                    )}
                    {simulationMeta?.hasFinanciacion && (
                      <p>2. Considera los <strong>costos financieros</strong> y <strong>costos ESG</strong> mostrados en la tabla.</p>
                    )}
                    <p>3. Con los flujos netos calcula manualmente: <strong>VPN, TIR y B/C</strong>.</p>
                    {simulationMeta?.isSession2 && (
                      <p>4. El ingreso de resultados (VPN, TIR, B/C) se especifica en <strong>millones de COP</strong>.</p>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Volver a Financiacion
                </Button>
                <Button onClick={() => setStep(5)} disabled={simulationData.length === 0} className="gap-2">
                  Continuar a Resultados <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 5 : Results ====== */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Ingreso de Resultados</CardTitle>
              <CardDescription>Ingresa los indicadores financieros calculados por tu grupo. Usa punto (.) como separador decimal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>VPN (Millones COP)</Label>
                  <Input type="text" inputMode="decimal" lang="en" placeholder="Ej: 125.50" value={results.vpn}
                    onChange={(e) => { const val = e.target.value.replace(/,/g, '.'); if (val === '' || /^-?\d*\.?\d*$/.test(val)) setResults({ ...results, vpn: val }) }} />
                </div>
                <div className="space-y-2">
                  <Label>TIR (%)</Label>
                  <Input type="text" inputMode="decimal" lang="en" placeholder="Ej: 18.25" value={results.tir}
                    onChange={(e) => { const val = e.target.value.replace(/,/g, '.'); if (val === '' || /^-?\d*\.?\d*$/.test(val)) setResults({ ...results, tir: val }) }} />
                </div>
                <div className="space-y-2">
                  <Label>B/C</Label>
                  <Input type="text" inputMode="decimal" lang="en" placeholder="Ej: 1.45" value={results.bc}
                    onChange={(e) => { const val = e.target.value.replace(/,/g, '.'); if (val === '' || /^-?\d*\.?\d*$/.test(val)) setResults({ ...results, bc: val }) }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Comentario del Grupo</Label>
                <textarea className="w-full border rounded-md p-3 text-sm min-h-[100px]" placeholder="Explica tu metodologia, supuestos y conclusiones..."
                  value={results.comment} onChange={(e) => setResults({ ...results, comment: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(4)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Volver a Estimacion
                </Button>
                <Button onClick={handleSubmit} disabled={loading || !results.vpn || !results.tir || !results.bc || isNaN(parseFloat(results.vpn)) || isNaN(parseFloat(results.tir)) || isNaN(parseFloat(results.bc))} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar Resultados
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 6 : Feedback ====== */}
        {step === 6 && feedback && (
          <Card>
            <CardHeader>
              <CardTitle>Retroalimentacion del Evaluador IA</CardTitle>
              <CardDescription>Sesion {feedback.session} — Ronda {feedback.round} — Puntaje: {feedback.puntaje.toFixed(1)}/10</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-slate-100 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-2">Evaluacion General</h4>
                <p className="text-sm text-slate-700">{feedback.evaluacion_general}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <h4 className="font-semibold text-emerald-800 mb-2">Aciertos</h4>
                  <ul className="list-disc list-inside text-sm text-emerald-700 space-y-1">{feedback.aciertos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-800 mb-2">Errores Probables</h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">{feedback.errores_probables.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">Recomendaciones</h4>
                  <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">{feedback.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 mb-2">Advertencias</h4>
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">{feedback.advertencias.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h4 className="font-semibold text-indigo-800 mb-1">Siguiente Accion Sugerida</h4>
                <p className="text-sm text-indigo-700">{feedback.siguiente_accion}</p>
              </div>
              <div className="border-t pt-4">
                {hasFinalResult ? (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <CheckCircle className="h-5 w-5" />
                    <div>
                      <span className="text-sm font-medium">Ya enviaste resultados para este grupo y sesion {status?.session}.</span>
                      <p className="text-xs text-amber-600 mt-0.5">No puedes enviar mas resultados para esta sesion. Avanza a la siguiente.</p>
                    </div>
                  </div>
                ) : !isFinalMarked ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">Si estos son tus <strong>resultados definitivos</strong>, presiona el boton a continuacion.</p>
                    <Button variant="default" className="gap-2 bg-amber-600 hover:bg-amber-700" disabled={markFinal.isPending}
                      onClick={async () => { if (feedback?.id) { await markFinal.mutateAsync({ resultId: feedback.id }); setIsFinalMarked(true); setHasFinalResult(true) } }}>
                      {markFinal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                      Resultados Finales
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <CheckCircle className="h-5 w-5" />
                    <div>
                      <span className="text-sm font-medium">Resultados finales enviados exitosamente.</span>
                      <p className="text-xs text-emerald-600 mt-0.5">Tu entrega ha sido registrada. Puedes avanzar a la siguiente ronda o sesion.</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {!hasFinalResult && (
                  <Button onClick={advance} className="gap-2">
                    {status && status.round >= status.maxRounds ? 'Avanzar a Sesion ' + (status.session + 1) : 'Avanzar a Siguiente Ronda'}
                  </Button>
                )}
                <Button variant="outline" onClick={() => navigate('/')}>Volver al Inicio</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
