import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, Upload, Save, RotateCcw, Zap, AlertTriangle, FileText, Database, Search, Filter, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, Trophy, Sparkles } from 'lucide-react'

export default function AdminPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('ia')

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Panel de Administracion</h1>
              <p className="text-sm text-slate-600">Configuracion del simulador financiero</p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <ScrollArea className="w-full">
            <TabsList className="flex w-full h-auto min-w-[800px] overflow-x-auto">
              <TabsTrigger value="ia" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Config. IA</TabsTrigger>
              <TabsTrigger value="csv" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Proyectos CSV</TabsTrigger>
              <TabsTrigger value="env" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Variables</TabsTrigger>
              <TabsTrigger value="sessions" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Sesiones</TabsTrigger>
              <TabsTrigger value="results" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Resultados</TabsTrigger>
              <TabsTrigger value="responses" className="text-xs py-2 px-3 flex-1 min-w-[100px]">AI Responses</TabsTrigger>
              <TabsTrigger value="reset" className="text-xs py-2 px-3 flex-1 min-w-[100px]">Reiniciar</TabsTrigger>
            </TabsList>
          </ScrollArea>

          <div className="mt-4">
            <TabsContent value="ia">
              <AIConfigTab />
            </TabsContent>
            <TabsContent value="csv">
              <CSVTab />
            </TabsContent>
            <TabsContent value="env">
              <EnvironmentTab />
            </TabsContent>
            <TabsContent value="sessions">
              <SessionsTab />
            </TabsContent>
            <TabsContent value="results">
              <FinalResultsTab />
            </TabsContent>
            <TabsContent value="responses">
              <RawResponsesTab />
            </TabsContent>
            <TabsContent value="reset">
              <ResetTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

function AIConfigTab() {
  const utils = trpc.useUtils()
  const { data: config } = trpc.admin.getFullConfig.useQuery()
  const { data: safeConfig } = trpc.admin.getConfig.useQuery()
  const setConfig = trpc.admin.setConfig.useMutation({
    onSuccess: () => {
      utils.admin.getFullConfig.invalidate()
      utils.admin.getConfig.invalidate()
    }
  })

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [prompt, setPrompt] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [demoMode, setDemoMode] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; baseUrl: string; demoRecommended: boolean } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    if (config) {
      setApiKey(config.apiKey || '')
      setModel(config.model || 'gpt-4o-mini')
      setPrompt(config.systemPrompt || '')
      setBaseUrl(config.baseUrl || 'https://api.openai.com/v1')
      setDemoMode(config.demoMode || false)
    }
  }, [config])

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await utils.client.admin.testConnection.mutate()
      setTestResult(result)
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Error desconocido al probar conexion',
        baseUrl: baseUrl,
        demoRecommended: true,
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <Zap className="h-5 w-5 text-amber-500" />
          Configuracion de Inteligencia Artificial
          {safeConfig && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${safeConfig.hasApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {safeConfig.hasApiKey ? 'API Key OK' : 'Sin API Key'}
            </span>
          )}
        </CardTitle>
        <CardDescription>Administra la conexion con OpenAI y el comportamiento del evaluador academico</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>Datos actuales del backend:</strong>
          <div className="mt-1 space-y-0.5 text-xs">
            <p><strong>URL Base:</strong> {safeConfig?.baseUrl || 'No configurada'}</p>
            <p><strong>Modelo:</strong> {safeConfig?.model || 'No configurado'}</p>
            <p><strong>API Key:</strong> {safeConfig?.hasApiKey ? 'Configurada' : 'No configurada'}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>URL Base de OpenAI</Label>
          <Input placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <p className="text-xs text-slate-500">Por defecto: https://api.openai.com/v1</p>
        </div>
        <div className="space-y-2">
          <Label>API Key de OpenAI</Label>
          <Input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Modelo</Label>
          <Input placeholder="gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} />
          <p className="text-xs text-slate-500">Ejemplos: gpt-4o, gpt-4o-mini, gpt-4-turbo</p>
        </div>
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <input
            id="demo-mode"
            type="checkbox"
            checked={demoMode}
            onChange={(e) => setDemoMode(e.target.checked)}
            className="h-4 w-4"
          />
          <div>
            <Label htmlFor="demo-mode" className="text-sm font-medium text-amber-900 cursor-pointer">
              Modo Demo / Offline
            </Label>
            <p className="text-xs text-amber-700">
              Cuando esta activo, las respuestas de IA se generan localmente sin llamar a OpenAI. Util para probar la aplicacion cuando api.openai.com no es accesible.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Prompt de Sistema</Label>
          <Textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => setConfig.mutate({ apiKey, model, systemPrompt: prompt, baseUrl, demoMode })} className="gap-2" disabled={setConfig.isPending}>
            {setConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Configuracion
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={isTesting} className="gap-2">
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Probar Conexion
          </Button>
        </div>

        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'} className="mt-3">
            <AlertDescription className="space-y-2">
              <div className="flex items-center gap-2">
                {testResult.success ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                <span>{testResult.message}</span>
              </div>
              <span className="block text-xs opacity-70">Endpoint: {testResult.baseUrl}</span>
              {!testResult.success && testResult.demoRecommended && (
                <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
                  <strong>Diagnostico de red:</strong> api.openai.com no responde. Esto puede deberse a firewall o falta de acceso a internet en este entorno.
                  <br />
                  <strong>Solucion:</strong> Activa el <strong>Modo Demo</strong> arriba para usar el generador local y probar toda la aplicacion sin conexion a OpenAI.
                </div>
              )}
              {testResult.success && testResult.message.includes("Demo mode") && (
                <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-800">
                  Modo Demo activo. Las respuestas se generan localmente sin consumir tokens de OpenAI.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function CSVTab() {
  const utils = trpc.useUtils()
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const upload = trpc.admin.uploadProjects.useMutation({
    onSuccess: (data) => {
      alert(`${data.count} proyectos cargados exitosamente`)
      utils.admin.getProjects.invalidate()
      setFileName(null)
      setFileContent('')
    },
    onError: (err) => alert(err.message),
  })
  const { data: projects } = trpc.admin.getProjects.useQuery()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) setFileContent(text)
    }
    reader.readAsText(file)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-emerald-600" />
          Carga de Proyectos (CSV)
        </CardTitle>
        <CardDescription>Selecciona un archivo CSV con los proyectos asignados a cada grupo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Label className="cursor-pointer inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors">
            <Upload className="h-4 w-4" />
            Seleccionar archivo CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </Label>
          {fileName && <span className="text-sm text-slate-600">{fileName}</span>}
        </div>

        {fileContent && (
          <div className="bg-slate-100 rounded-lg p-3 text-xs font-mono max-h-40 overflow-auto border">
            <pre>{fileContent.slice(0, 2000)}{fileContent.length > 2000 ? '\n...' : ''}</pre>
          </div>
        )}

        <Button onClick={() => upload.mutate({ csvContent: fileContent })} disabled={!fileContent} className="gap-2">
          <Upload className="h-4 w-4" /> Cargar CSV al Simulador
        </Button>

        {projects && projects.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Grupo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.nombre_proyecto}</TableCell>
                    <TableCell>{p.sector}</TableCell>
                    <TableCell>{p.numero_grupo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EnvironmentTab() {
  const utils = trpc.useUtils()
  const { data: env } = trpc.admin.getEnvironment.useQuery()
  const setEnv = trpc.admin.setEnvironment.useMutation({ onSuccess: () => utils.admin.getEnvironment.invalidate() })
  const generateEnv = trpc.admin.generateEnvironmentWithAI.useMutation({
    onSuccess: (data) => {
      setLocalEnv(data.data)
      utils.admin.getEnvironment.invalidate()
      alert('Variables generadas con exito. Presiona Guardar Variables para persistirlas.')
    },
    onError: (err) => {
      alert('Error al generar variables: ' + err.message)
    },
  })

  const sessions = ['session1', 'session2', 'session3'] as const
  const [localEnv, setLocalEnv] = useState<Record<string, any>>({})

  const [jsonFileName, setJsonFileName] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState('')

  useEffect(() => {
    if (env) setLocalEnv(JSON.parse(JSON.stringify(env)))
  }, [env])

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setJsonFileName(file.name)
    setJsonError('')
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)
        setLocalEnv(parsed)
      } catch {
        setJsonError('El archivo no es un JSON valido.')
      }
    }
    reader.readAsText(file)
  }

  const updateField = (session: string, field: string, value: any) => {
    setLocalEnv((prev) => ({
      ...prev,
      [session]: { ...prev[session], [field]: value },
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          Variables del Entorno
        </CardTitle>
        <CardDescription>Configura tasas, inflacion, devaluacion y parametros ESG por sesion</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Label className="cursor-pointer inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
            <Upload className="h-4 w-4" />
            Cargar variables desde JSON
            <input type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
          </Label>
          {jsonFileName && <span className="text-sm text-slate-600">{jsonFileName}</span>}

          <Button
            variant="outline"
            onClick={() => generateEnv.mutate()}
            disabled={generateEnv.isPending}
            className="gap-2 border-purple-500 text-purple-700 hover:bg-purple-50"
          >
            {generateEnv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generar con IA
          </Button>
        </div>
        {jsonError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{jsonError}</div>
        )}

        <div className="bg-slate-100 rounded-lg p-3 text-xs text-slate-600">
          <strong>Tasas predefinidas para este proyecto (base):</strong>
          <p>DTF: 12% → 12.5% → 13% | IBR: 11% → 11.5% → 12% | SOFR: 5.3% → 5.5% → 5.8%</p>
          <p>Prime: 8% → 8.2% → 8.5% | UVR: 2% → 2.2% → 2.5% | Inflacion: 4% → 4.2% → 4.5%</p>
          <p>Devaluacion: 5% → 5.2% → 5.5% | Spreads: crecientes por sesion</p>
        </div>

        {sessions.map((s) => (
          <div key={s} className="space-y-3 border rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 capitalize">{s.replace('session', 'Sesion ')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['DTF', 'IBR', 'SOFR', 'PrimeRate', 'UVR', 'TRM', 'inflation', 'devaluation', 'esgRisk', 'esgIncentive', 'esgPenalty'].map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{field}</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={localEnv[s]?.[field] ?? 0}
                    onChange={(e) => updateField(s, field, parseFloat(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={() => setEnv.mutate(localEnv)} className="gap-2">
          <Save className="h-4 w-4" /> Guardar Variables
        </Button>
      </CardContent>
    </Card>
  )
}

function CsvUploader({ title, description, expectedStructure, endpoint }: { title: string; description: string; expectedStructure: string; endpoint: (csv: string) => Promise<any> }) {
  const [csvContent, setCsvContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null)

  const handleUpload = async () => {
    if (!csvContent.trim()) return
    setUploading(true)
    setResult(null)
    try {
      const res = await endpoint(csvContent)
      const puntajeMsg = res.withPuntaje ? ` (${res.withPuntaje} con puntaje IA)` : ''
      setResult({ success: true, message: `${res.count || 0} registros cargados exitosamente.${puntajeMsg}` })
      setCsvContent('')
    } catch (e: any) {
      setResult({ success: false, message: e?.message || 'Error al cargar CSV' })
    }
    setUploading(false)
  }

  return (
    <div className="space-y-3 border rounded-lg p-4">
      <div>
        <h4 className="font-medium text-sm text-slate-800">{title}</h4>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="bg-slate-100 rounded p-3">
        <p className="text-xs font-medium text-slate-700 mb-1">Estructura esperada (CSV):</p>
        <code className="text-xs font-mono text-slate-600 block">{expectedStructure}</code>
      </div>
      <textarea
        className="w-full border rounded-md p-3 text-sm font-mono min-h-[120px]"
        placeholder="Pega aqui el contenido CSV (con headers)..."
        value={csvContent}
        onChange={(e) => setCsvContent(e.target.value)}
      />
      <Button onClick={handleUpload} disabled={uploading || !csvContent.trim()} className="gap-2">
        {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
        Cargar CSV
      </Button>
      {result && (
        <div className={`text-sm p-2 rounded ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </div>
      )}
    </div>
  )
}

function SessionsTab() {
  const utils = trpc.useUtils()
  const { data: state, isLoading } = trpc.admin.getSimulationState.useQuery()
  const uploadSessions = trpc.admin.uploadSessionsCsv.useMutation({
    onSuccess: () => utils.admin.getSimulationState.invalidate()
  })

  const groups = state?.activeGroups || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de Grupos</CardTitle>
        <CardDescription>Listado de grupos que han ingresado al simulador y su progreso actual</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CsvUploader
          title="Cargar Sesiones desde CSV"
          description="Importa el estado de sesiones y rondas de multiples grupos"
          expectedStructure="group_number,session,round,max_rounds,score"
          endpoint={(csv) => uploadSessions.mutateAsync({ csvContent: csv })}
        />

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando grupos...
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No hay grupos activos todavia.
          </div>
        )}

        {!isLoading && groups.length > 0 && (
          <>
            <p className="text-sm text-slate-600">{groups.length} grupo(s) activo(s)</p>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Sesion</TableHead>
                    <TableHead>Ronda</TableHead>
                    <TableHead>Puntaje</TableHead>
                    <TableHead>Ultima Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g: any) => (
                    <TableRow key={g.groupNumber}>
                      <TableCell className="font-medium">{g.groupNumber}</TableCell>
                      <TableCell>{g.currentSession}</TableCell>
                      <TableCell>{g.currentRound} / {state?.maxRoundsPerSession || 3}</TableCell>
                      <TableCell>{g.accumulatedScore?.toFixed(2) || '0.00'}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {g.lastActionAt ? new Date(g.lastActionAt).toLocaleString('es-CO') : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RawResponsesTab() {
  const [filterGroup, setFilterGroup] = useState('')
  const [filterSchema, setFilterSchema] = useState('')
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: responses, isLoading } = trpc.admin.getRawResponses.useQuery({
    groupNumber: filterGroup || undefined,
    schemaName: filterSchema || undefined,
    onlyErrors,
  })

  const schemaOptions = [
    { value: '', label: 'Todos los schemas' },
    { value: 'operational_options', label: 'Opciones Operativas' },
    { value: 'simulation_data', label: 'Simulacion Financiera' },
    { value: 'academic_feedback', label: 'Retroalimentacion Academica' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-violet-600" />
          Historial de Respuestas IA
        </CardTitle>
        <CardDescription>Consulta todas las respuestas raw de OpenAI por grupo, schema y estado</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Grupo</Label>
            <div className="flex items-center gap-1">
              <Search className="h-3 w-3 text-slate-400" />
              <Input placeholder="Numero de grupo" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Schema</Label>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-slate-400" />
              <select value={filterSchema} onChange={(e) => setFilterSchema(e.target.value)} className="h-8 text-sm border rounded px-2 bg-white">
                {schemaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm pb-1">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
            Solo errores
          </label>
        </div>

        {isLoading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando...</p>}

        {!isLoading && (!responses || responses.length === 0) && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No hay respuestas registradas todavia.
          </div>
        )}

        {responses && responses.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-auto">
            <p className="text-xs text-slate-500">{responses.length} respuesta(s) encontrada(s)</p>
            {responses.map((r) => (
              <div key={r.id} className={`border rounded-lg overflow-hidden ${r.success ? 'border-slate-200' : 'border-red-300 bg-red-50'}`}>
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className={`w-2 h-2 rounded-full ${r.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-slate-800">Grupo {r.groupNumber}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-600">S{r.session}-R{r.round}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{r.schemaName}</span>
                    <span className="text-xs text-slate-400">{new Date(r.timestamp).toLocaleString('es-CO')}</span>
                  </div>
                  {expandedId === r.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
                {expandedId === r.id && (
                  <div className="px-3 pb-3 space-y-2 border-t">
                    {r.errorMessage && (
                      <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700 font-mono">
                        <strong>Error:</strong> {r.errorMessage}
                        {r.errorCode && <span className="ml-2 text-red-500">[{r.errorCode}]</span>}
                      </div>
                    )}
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-slate-600 mb-1">Prompt enviado:</p>
                      <div className="bg-slate-100 rounded p-2 text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap">{r.prompt}</div>
                    </div>
                    {r.rawResponse && (
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1">Respuesta raw (JSON):</p>
                        <div className="bg-slate-100 rounded p-2 text-xs font-mono max-h-48 overflow-auto whitespace-pre-wrap">{r.rawResponse}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FinalResultsTab() {
  const utils = trpc.useUtils()
  const { data: finalResults, isLoading } = trpc.admin.getFinalResults.useQuery()
  const uploadResults = trpc.admin.uploadResultsCsv.useMutation({
    onSuccess: () => {
      utils.admin.getFinalResults.invalidate()
      utils.admin.getSimulationState.invalidate()
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Resultados Finales por Grupo
        </CardTitle>
        <CardDescription>
          Tabla con los resultados que cada grupo marco como definitivos. Solo aparecen las entregas marcadas como "Resultados Finales".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CsvUploader
          title="Cargar Resultados desde CSV"
          description="Importa resultados de multiples grupos y sesiones con puntaje IA opcional"
          expectedStructure="group_number,session,round,vpn,tir,bc,comment,is_final,puntaje_ia"
          endpoint={(csv) => uploadResults.mutateAsync({ csvContent: csv })}
        />

        {isLoading && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando resultados...
          </p>
        )}

        {!isLoading && (!finalResults || finalResults.length === 0) && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No hay resultados finales registrados todavia.
            <p className="text-xs mt-1">Los estudiantes deben presionar "Resultados Finales" en la ultima pantalla para que aparezcan aqui.</p>
          </div>
        )}

        {finalResults && finalResults.length > 0 && (
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="text-xs">Grupo</TableHead>
                  <TableHead className="text-xs">Proyecto</TableHead>
                  <TableHead className="text-xs">Sector</TableHead>
                  <TableHead className="text-xs">Sesion</TableHead>
                  <TableHead className="text-xs">Ronda</TableHead>
                  <TableHead className="text-xs text-right">VPN</TableHead>
                  <TableHead className="text-xs text-right">TIR (%)</TableHead>
                  <TableHead className="text-xs text-right">B/C</TableHead>
                  <TableHead className="text-xs text-right">Puntaje IA</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalResults.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{r.groupNumber}</TableCell>
                    <TableCell className="text-sm">{r.projectName}</TableCell>
                    <TableCell className="text-sm"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{r.sector}</span></TableCell>
                    <TableCell className="text-sm">{r.session}</TableCell>
                    <TableCell className="text-sm">{r.round}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{r.vpn.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{r.tir.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{r.bc.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      <span className={`px-2 py-0.5 rounded text-xs ${r.puntajeIA >= 7 ? 'bg-emerald-100 text-emerald-700' : r.puntajeIA >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {r.puntajeIA.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(r.submittedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResetTab() {
  const utils = trpc.useUtils()
  const reset = trpc.admin.resetSimulation.useMutation({
    onSuccess: () => {
      alert('Simulador reiniciado exitosamente')
      utils.invalidate()
    },
  })
  const [keepProjects, setKeepProjects] = useState(true)
  const [keepAdmin, setKeepAdmin] = useState(true)
  const [confirmText, setConfirmText] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <RotateCcw className="h-5 w-5" />
          Reiniciar Simulador
        </CardTitle>
        <CardDescription>Borra resultados, retroalimentaciones y reinicia sesiones. Esta accion no se puede deshacer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepProjects} onChange={(e) => setKeepProjects(e.target.checked)} />
            Mantener proyectos CSV
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepAdmin} onChange={(e) => setKeepAdmin(e.target.checked)} />
            Mantener configuracion IA
          </label>
        </div>
        <div className="space-y-2">
          <Label>Escribe "REINICIAR" para confirmar</Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </div>
        <Button
          variant="destructive"
          disabled={confirmText !== 'REINICIAR'}
          onClick={() => reset.mutate({ keepProjects, keepAdminSettings: keepAdmin })}
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" /> Limpiar Todo y Empezar de Nuevo
        </Button>
      </CardContent>
    </Card>
  )
}
