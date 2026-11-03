# TrackSIM Cloud Analytics

Aplicación web para consultar y analizar evaluaciones de conducción en simulador, dar seguimiento al desempeño de operadores y observar indicadores consolidados por flota o empresa.

## Funciones de la plataforma

### Dashboard

Presenta una vista ejecutiva de las evaluaciones disponibles y permite, según los permisos de la cuenta:

- Aplicar el filtro global de empresa desde el badge de administrador; la selección se comparte con Evolución, Métricas y Directorio.
- Consultar el número de reportes y operadores, la calificación promedio, la tasa de aprobación y los incidentes registrados.
- Revisar los incidentes desglosados en colisiones, fatalidades y salidas de vía.
- Visualizar la distribución de resultados y comparar el desempeño por empresa o por ciudad/sede.
- Consultar evaluaciones recientes. Los administradores pueden abrir su detalle o ir al directorio completo e iniciar la ingesta de un nuevo PDF.

### Evolución

Incluye dos vistas de seguimiento:

- **Conductor individual:** permite seleccionar operadores con al menos dos sesiones y revisar su resumen, la curva histórica de calificaciones, los incidentes por sesión y el historial cronológico. El radar interactivo muestra cinco dimensiones de competencia y se puede ampliar para consultar puntajes, incidencias y el desglose de errores detectados. Desde el historial se abre el reporte de cada sesión.
- **Flota/empresa:** sigue el filtro global para consultar el resumen ejecutivo, la evolución anual de calificaciones, los siniestros anuales o su tasa por operador, el desempeño por ejercicio y el desglose anual consolidado.

### Métricas

Consolida el análisis de la empresa seleccionada en el filtro global o, cuando se seleccionan todas, de las empresas permitidas por el rol. Incluye:

- Indicadores ejecutivos de la flota y sus sedes.
- Calificaciones promedio por ejercicio.
- Ranking de operadores.
- Tasa de accidentes por conductor.
- Tabla de operadores con búsqueda, ordenamiento y paginación; permite revisar ejercicios realizados, consultar la evolución individual y abrir reportes.
- Opciones de impresión y vistas optimizadas para generar un resumen en PDF desde el navegador.

### Directorio de evaluaciones — administradores

Permite explorar y administrar los registros de evaluación:

- Buscar por operador, folio o instructor y filtrar por año, sede y dictamen; la empresa se controla desde el filtro global del badge de administrador.
- Ordenar y paginar resultados; revisar métricas del conjunto visible y abrir reportes individuales.
- Editar evaluaciones individuales o seleccionar varias para cambios masivos y eliminación.
- Importar y exportar CSV, con exportación de los registros filtrados o de un respaldo.
- Eliminar todos los registros mediante el flujo de confirmación restringido configurado para esa acción.

Las operaciones de edición y eliminación cambian datos en Firestore. Revisa los filtros y la selección antes de aplicarlas.

### Ingesta de reportes PDF — administradores

La ingesta V2 procesa expedientes individuales PDF exportados desde TrackSIM-ZERO y presenta los datos detectados en una bandeja de revisión antes de guardarlos. Como el expediente no incluye la empresa, se debe asignar a cada archivo (o a todo el lote) antes de confirmar el guardado en Firestore. V2 extrae las calificaciones de Destreza (sobre 7) y Eco Driving (sobre 3), mientras que V1 conserva sus métricas de Habilidades de manejo y Práctica en simulador. La tasa de siniestros V2 cuenta solo errores clasificados como colisiones, salidas de vía o fatalidades; los demás puntos débiles no se suman como siniestros. Los incidentes se desglosan desde las repeticiones de “Puntos débiles”: atropellos de peatones y vuelcos cuentan como fatalidades, salirse de la vía como fuera de vía (o fatalidad si es crítico), y colisiones con objetos, vehículos, piedras o animales como colisiones. El conteo global de accidentes críticos se conserva aparte. La ingesta PDF Legacy V1 permanece disponible para compatibilidad con los reportes anteriores.

### Usuarios y permisos — administradores

Permite registrar cuentas con rol de administrador o lector, asignar la empresa permitida, editar o eliminar perfiles y vincular dominios corporativos con empresas. Los lectores consultan únicamente las empresas autorizadas para su cuenta; las secciones administrativas no están disponibles para ellos.

### Acceso y preferencias

- Inicio de sesión y registro con correo y contraseña, o acceso con Google.
- Tema claro/oscuro, disponible también desde la pantalla de acceso.
- El acceso, los roles y los datos de la plataforma se gestionan con Firebase.

## Requisitos

- Node.js compatible con Vite 8
- npm

## Instalación y desarrollo

```bash
npm install
npm run dev
```

Vite muestra en la terminal la dirección local para abrir la aplicación. La configuración de Firebase está en `src/services/firebaseApp.ts`; los valores pueden proporcionarse mediante variables `VITE_FIREBASE_*`.

## Modo demostración

Agrega `?demo=1` a la URL para entrar al modo de demostración, por ejemplo:

```text
http://localhost:5173/?demo=1
```

El modo demo presenta datos ficticios y bloquea operaciones de escritura, importación y administración. No representa telemetría en tiempo real ni información de clientes.

## Grabar el recorrido de demostración

El proyecto incluye una captura automatizada con Playwright. Instala las dependencias y el navegador de Playwright una vez:

```bash
npm install
npx playwright install chromium
```

Ejecuta la grabación:

```bash
npm run capture:demo
```

El script inicia Vite en el puerto `5174`, abre la aplicación en modo demo con tema claro y graba el recorrido de Dashboard, evolución individual y de flota, métricas corporativas y reporte. Guarda el video WebM en `videos/`, una carpeta ignorada por Git. La grabación es de pantalla y **no incluye voz en off**.

Variables opcionales:

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `DEMO_PORT` | Puerto local de Vite para la captura | `5174` |
| `DEMO_URL` | URL de una instancia disponible; se agrega `demo=1` | Inicia Vite local |
| `DEMO_VIDEO_OUTPUT` | Ruta de salida del WebM, relativa a la raíz del proyecto o absoluta | `videos/demo-lanzamiento-<fecha>.webm` |

Ejemplo en PowerShell:

```powershell
$env:DEMO_VIDEO_OUTPUT = "videos\lanzamiento.webm"
npm run capture:demo
```

La ruta de salida debe ser nueva: el script no sobrescribe videos existentes.

### Voz en off

La captura no incluye narración; se agrega en una etapa de edición posterior. Algunas alternativas:

- **Grabar una voz propia:** permite un tono personal; se puede limpiar el audio con Audacity o editarlo junto con el video en DaVinci Resolve.
- **Usar voz sintética:** servicios como ElevenLabs, Azure AI Speech y Google Cloud Text-to-Speech generan narración en español. Verifica las condiciones de uso comercial y prueba la pronunciación antes de producir la pista completa.
- **Usar texto a voz del editor:** herramientas como CapCut permiten generar y sincronizar la narración en el mismo proyecto.
- **Contratar un locutor:** conviene enviar el guion dividido por escenas para facilitar la sincronización.

La captura actual dura aproximadamente 1 minuto y 47 segundos. Ajusta el ritmo o los silencios de la locución en edición para sincronizarla con las escenas.

## Comandos

```bash
npm run dev       # Servidor local de desarrollo
npm run lint      # Linter
npm run typecheck # Verificación de TypeScript
npm run build     # Validación y build de producción
npm test          # Pruebas con emulador de Firestore
```
