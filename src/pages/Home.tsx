import { useState } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GraduationCap, Settings, Lock, ArrowLeft } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')

  const verifyPassword = trpc.admin.verifyPassword.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        navigate('/admin')
      } else {
        setAdminError('Clave incorrecta. Intenta de nuevo.')
      }
    },
    onError: () => {
      setAdminError('Error al verificar la clave.')
    },
  })

  const handleAdminLogin = () => {
    setAdminError('')
    verifyPassword.mutate({ password: adminPassword })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            Simulador de Decisiones Financieras
          </h1>
          <p className="text-lg text-slate-600">Colombia — Evaluacion de Proyectos con VPN, TIR, B/C y ESG</p>
        </div>

        {showAdminLogin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-600" />
                Acceso Administrador
              </CardTitle>
              <CardDescription>Ingresa la clave de acceso al panel de administracion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Clave de acceso</Label>
                <Input
                  type="password"
                  placeholder="Ingresa la clave..."
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
              </div>
              {adminError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{adminError}</p>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setShowAdminLogin(false); setAdminError(''); setAdminPassword('') }} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Volver
                </Button>
                <Button
                  onClick={handleAdminLogin}
                  disabled={verifyPassword.isPending || !adminPassword.trim()}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Lock className="h-4 w-4" />
                  {verifyPassword.isPending ? 'Verificando...' : 'Ingresar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/student')}>
              <CardHeader className="flex flex-col items-center text-center">
                <GraduationCap className="h-12 w-12 text-emerald-600 mb-2" />
                <CardTitle className="text-xl">Estudiante</CardTitle>
                <CardDescription>Ingresa tu numero de grupo y comienza la simulacion</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-6">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">Iniciar Simulacion</Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setShowAdminLogin(true)}>
              <CardHeader className="flex flex-col items-center text-center">
                <Settings className="h-12 w-12 text-blue-600 mb-2" />
                <CardTitle className="text-xl">Administrador</CardTitle>
                <CardDescription>Configura proyectos, variables y sesiones</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-6">
                <Button size="lg" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">Panel Admin</Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
