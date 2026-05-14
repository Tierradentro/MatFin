# Simulador de Decisiones Financieras – Colombia

Aplicacion web educativa para que estudiantes simulen la evaluacion financiera de proyectos usando VPN, TIR, B/C, inflacion, devaluacion, DTF, IBR, SOFR, Prime Rate, UVR, amortizacion, reestructuracion y criterios ESG.

## Stack Tecnico

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Hono + tRPC 11.x + TypeScript
- **Persistencia:** Archivos JSON y CSV (sin base de datos)
- **IA:** OpenAI Chat Completions API con salida estructurada JSON Schema
- **Modo Demo:** Generador local de datos cuando OpenAI no es accesible

## Arquitectura

```
/data/                  ← Archivos de persistencia local
/api/                   ← Backend Hono + tRPC
/src/pages/             ← Frontend React
  Home.tsx              ← Landing + login admin
  AdminPage.tsx         ← Panel administrador (7 tabs)
  StudentPage.tsx       ← Wizard estudiante (6 pasos)
```

## Flujo de Estudiante

1. Ingresar numero de grupo
2. Decisiones Operativas (minimo 2 selecciones)
3. Financiacion (tasa base + spread, el estudiante calcula la tasa total)
4. Estimacion de Ingresos y Costos (5 periodos calculados segun decisiones)
5. Ingreso de Resultados (VPN, TIR, B/C)
6. Retroalimentacion IA + Resultados Finales

## Clave de Administrador

**`CESA2026`** — Usar en la landing page para acceder al panel admin.

## Instrucciones de Instalacion

```bash
# 1. Clonar repositorio
git clone <url-del-repo>
cd simulador-decisiones-financieras

# 2. Instalar dependencias
npm install

# 3. (Opcional) Configurar variables de entorno en .env
# Por defecto funciona sin archivo .env

# 4. Iniciar en desarrollo
npm run dev

# 5. Compilar para produccion
npm run build
```

## Archivos de Configuracion Inicial

| Archivo | Accion Requerida |
|---|---|
| `data/projects.csv` | Cargar CSV con proyectos asignados a grupos |
| `data/environment.json` | Ajustar tasas DTF, IBR, SOFR, Prime, UVR por sesion |
| `data/admin-settings.json` | Opcional: desactivar demoMode, configurar API key OpenAI |

### Formato CSV de Proyectos

```csv
nombre_proyecto,descripcion,sector,numero_grupo
Edificio Torre Norte,Construccion de torre residencial,inmobiliario,101
Planta de Reciclaje,Reciclaje de plastico industrial,industrial,102
```

## Opciones de Hosting

### Opcion 1: Railway (Recomendado)

**Ideal** para Node.js con backend. Soporta Hono + tRPC nativamente.

1. Crear cuenta en [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Seleccionar el repositorio
4. Railway detecta automaticamente `package.json` y el script `start`
5. Variables de entorno: no requeridas (todo en archivos locales)
6. **Persistencia:** Los archivos `/data/*` se guardan en el filesystem del contenedor (Railway usa volatiles, para produccion usar Volumes o Railway Disk)
7. URL generada automaticamente

### Opcion 2: Render

1. Crear cuenta en [render.com](https://render.com)
2. New Web Service → Connect GitHub
3. Seleccionar repositorio
4. Configuracion:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. **Disk:** Crear un Disk mount en `/data` para persistencia

### Opcion 3: Vercel (Frontend Only)

⚠️ Vercel es **serverless** y no mantiene archivos locales entre invocaciones. Para este proyecto se recomienda Railway o Render. Si se usa Vercel, se requiere adaptar la persistencia a una base de datos externa (Supabase, PlanetScale, etc.)

### Opcion 4: Servidor VPS Propio (DigitalOcean, AWS, Linode)

1. Provisionar VPS con Ubuntu 22.04
2. Instalar Node.js 20+
3. Clonar repo
4. `npm install && npm run build`
5. `npm start` (o usar PM2: `pm2 start npm --name simulador -- start`)
6. Configurar Nginx como reverse proxy
7. Los archivos `/data/*` se persisten en el filesystem del VPS

## Despliegue con Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t simulador-financiero .
docker run -p 3000:3000 -v simulador-data:/app/data simulador-financiero
```

## Estructura de Directorios

```
simulador-decisiones-financieras/
├── api/                  ← Backend tRPC + Hono
│   ├── lib/
│   │   ├── openai.ts         ← Cliente OpenAI con demo mode
│   │   ├── openai-demo.ts    ← Generador local
│   │   ├── openai-schemas.ts ← Schemas JSON estrictos
│   │   └── persistence.ts    ← Utilidades JSON/CSV
│   ├── admin-router.ts       ← Endpoints administrador
│   ├── student-router.ts     ← Endpoints estudiante
│   └── middleware.ts         ← tRPC middleware
├── contracts/            ← Tipos compartidos frontend/backend
├── data/                 ← Archivos de persistencia
├── src/
│   └── pages/
│       ├── Home.tsx          ← Landing page
│       ├── AdminPage.tsx     ← Panel admin (7 tabs)
│       └── StudentPage.tsx   ← Wizard estudiante
├── db/                   ← Drizzle ORM (no usado)
├── dist/                 ← Build de produccion
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Notas Importantes para Produccion

1. **Persistencia de archivos:** En hosting serverless (Vercel, Netlify) los archivos `/data/*` se pierden entre deploys. Usar Railway, Render con Disk, o VPS propio.

2. **Modo Demo:** Por defecto esta activo (`demoMode: true`). Las respuestas de IA se generan localmente sin consumir tokens. Para usar OpenAI real:
   - Panel Admin → Configuracion IA → desactivar Modo Demo
   - Ingresar API key de OpenAI
   - Guardar configuracion

3. **Múltiples grupos:** La aplicacion soporta múltiples grupos simultaneos sin conflicto. Cada grupo tiene estado independiente en `simulation-state.json`.

4. **3 Rondas máximo por sesion:** Configurable en el panel admin. El estudiante puede enviar resultados finales una sola vez por grupo.

## Licencia

Proyecto educativo – Universidad / Curso de Finanzas.
