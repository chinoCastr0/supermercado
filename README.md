# Gestión de inventario para supermercado

Aplicación web para administrar el catálogo de un supermercado, importar listas
de precios, generar carteles de góndola y exportar productos al formato binario
de la caja registradora. Incluye un frontend React instalable como PWA, una API
FastAPI y persistencia en PostgreSQL.

## Funcionalidades

- Alta, edición, consulta y eliminación de productos.
- Búsqueda por nombre o código de barras.
- Filtros por estado activo y estado de impresión.
- Orden por nombre, precio o última actualización.
- Importación masiva desde Excel o CSV.
- Exportación de productos activos a `PRESUR1.DAT`.
- Generación de carteles en PDF A4, 24 por página (matriz 3 × 8).
- Seguimiento de carteles pendientes e impresos mediante versiones.
- Confirmación segura de lotes: un producto modificado después de generar el PDF
  no se marca por error como impreso.
- Escaneo con cámara de códigos EAN-13, EAN-8, UPC-A, UPC-E y Code 128.
- Interfaz responsive e instalable como PWA.
- Shell básico disponible sin conexión; los datos requieren acceso a la API.

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8, React Compiler |
| Escáner | ZXing Browser |
| Backend | Python 3.13, FastAPI, SQLAlchemy, Pydantic |
| Datos | PostgreSQL 17 |
| Archivos | pandas, openpyxl, ReportLab, PyMuPDF |
| Calidad | pytest, ESLint, TypeScript |
| Infraestructura | Docker Compose local y Heroku para producción |

## Arquitectura

```text
src/
├── api/          Cliente HTTP del frontend
├── components/   Componentes visuales y modales
├── hooks/        Estado y operaciones del inventario
├── types/        Contratos TypeScript
└── utils/        Formateadores y utilidades

backend/
├── app/
│   ├── api/      Endpoints de productos y carteles
│   ├── models/   Modelos SQLAlchemy
│   ├── schemas/  Validación de entrada y salida
│   └── services/ Importación, PDF, etiquetas y exportación PRESUR
├── migrations/   SQL de referencia para instalaciones existentes
├── scripts/      Herramientas de desarrollo para PDFs
└── tests/        Pruebas automatizadas
```

El frontend consume `/api` durante el desarrollo. Vite redirige esas solicitudes
a `http://127.0.0.1:8000` y elimina el prefijo. En producción,
`VITE_API_URL` apunta directamente a la URL HTTPS de FastAPI.

## Requisitos

- Node.js 24 y npm.
- Python 3.13.
- Docker con soporte para Compose, o una instancia PostgreSQL 17 accesible.
- PowerShell para los comandos de esta guía en Windows.

## Instalación local en Windows

### 1. Instalar el frontend

Desde la raíz del repositorio:

```powershell
npm ci
```

### 2. Crear el entorno de Python

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

### 3. Configurar las variables locales

```powershell
Copy-Item backend\.env.example backend\.env
```

La configuración incluida usa PostgreSQL en `localhost:5433`, base
`supermercado`, usuario `admin` y contraseña de desarrollo `desarrollo`. El
archivo `backend/.env` es local y está ignorado por Git.

### 4. Levantar PostgreSQL

```powershell
docker compose up -d database
```

El volumen `postgres_data` conserva la información cuando el contenedor se
reinicia o recrea.

### 5. Iniciar la API

En una terminal:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Se puede agregar `--reload` durante el desarrollo si el recargador funciona de
manera estable en el entorno local.

### 6. Iniciar el frontend

En otra terminal, desde la raíz:

```powershell
npm run dev
```

Abrir `http://localhost:5173`.

## URLs locales

| Recurso | URL |
| --- | --- |
| Aplicación | `http://localhost:5173` |
| API | `http://127.0.0.1:8000` |
| Documentación Swagger | `http://127.0.0.1:8000/docs` |
| Esquema OpenAPI | `http://127.0.0.1:8000/openapi.json` |
| Health check | `http://127.0.0.1:8000/health` |
| PostgreSQL | `localhost:5433` |

## Variables de entorno

| Variable | Servicio | Descripción | Valor local predeterminado |
| --- | --- | --- | --- |
| `DATABASE_URL` | Backend | URL completa de conexión PostgreSQL | `postgresql://admin:desarrollo@localhost:5433/supermercado` |
| `ALLOWED_ORIGINS` | Backend | Orígenes CORS separados por comas | `http://localhost:5173,http://127.0.0.1:5173` |
| `VITE_API_URL` | Frontend | URL pública de la API usada durante el build | `/api` cuando no se define |

No se deben guardar credenciales reales en el repositorio. En Heroku, estas
variables deben configurarse como Config Vars de las aplicaciones.

## Modelo de producto

| Campo | Descripción |
| --- | --- |
| `barcode` | Código único. Para la caja admite hasta 15 bytes CP1252. |
| `name` | Nombre. Para la caja admite hasta 18 bytes CP1252. |
| `price` | Precio mayor que cero. |
| `weight` | Contenido opcional, mayor que cero. |
| `weight_unit` | `g`, `kg`, `ml`, `l` o `u`; debe acompañar a `weight`. |
| `active` | Determina si el producto se exporta a la caja. |
| `last_updated` | Fecha del servidor o tomada de una importación. |
| `label_version` | Versión de los datos visibles en el cartel. |
| `printed` | Indica si la versión vigente fue confirmada como impresa. |

Cambiar código, nombre, precio, peso o unidad incrementa la versión visible y
devuelve el cartel al estado pendiente.

## Importación de productos

La interfaz procesa archivos `.xlsx` y `.csv`. Los archivos `.xls` antiguos
deben convertirse primero a `.xlsx`. Las columnas de nombre y precio son
obligatorias.

| Dato | Encabezados reconocidos |
| --- | --- |
| Código | `barcode`, `codigo`, `codigo de barras`, `codigobarras` |
| Nombre | `name`, `nombre`, `producto`, `descripcion` |
| Precio | `price`, `precio`, `valor`, `importe` |
| Peso | `weight`, `peso`, `contenido`, `cantidad` |
| Unidad | `weightunit`, `unidad`, `unidadmedida`, `unidadpeso` |
| Actualización | `lastupdated`, `fecha`, `ultimaactualizacion` |

Ejemplo CSV:

```csv
codigo,nombre,precio,peso,unidad,fecha
7790001000011,Arroz largo fino,1850.50,1,kg,28/08/2026
7790001000028,Gaseosa cola,2400,1.5,l,28/08/2026
7790001000035,Jabón blanco,950,200,g,28/08/2026
```

Reglas relevantes:

- Las filas sin nombre o con precio inválido se omiten.
- Las filas sin código se informan como omitidas y no se guardan.
- Si un código ya existe, el producto se actualiza.
- Si el archivo repite un código, prevalece la última fila.
- Un peso puede escribirse como `500 g`, `1,5 l` o separarse en dos columnas.
- Los códigos numéricos se conservan sin agregar `.0`.

## Carteles de precios

Los carteles se generan en PDF A4 vertical, en una matriz fija de 3 columnas por
8 filas. Cada cartel puede incluir nombre, precio, presentación, precio
comparable y código de barras.

Flujo recomendado:

1. Filtrar o seleccionar productos pendientes.
2. Elegir **Generar carteles**.
3. Revisar la vista previa del PDF.
4. Imprimir el documento.
5. Confirmar el lote sólo después de imprimirlo.

La confirmación compara la versión incluida en el PDF con la versión actual del
producto. Los productos modificados o eliminados después de generar el lote no
se marcan como impresos. Los códigos no representables se omiten y se muestran
como advertencias.

## Exportación a la caja

**Exportar caja** descarga `PRESUR1.DAT` con los productos activos. El formato
contiene 20.000 registros binarios de 58 bytes y asigna una posición PLU a cada
producto.

Restricciones principales:

- Máximo de 20.000 productos activos.
- Código de hasta 15 bytes y nombre de hasta 18 bytes en CP1252.
- Precio finito y mayor que cero.
- No se admiten caracteres de control.
- El peso se usa en carteles, pero no forma parte de `PRESUR1.DAT`.

La exportación se rechaza con un mensaje explícito si un producto activo no
puede representarse sin corromper el archivo.

## Escáner y PWA

El botón **Escanear** abre la cámara. Si el código existe, abre el producto para
editarlo; si no existe, permite crearlo con el código precargado.

Los navegadores sólo habilitan la cámara en contextos seguros:

- `http://localhost` funciona para pruebas en la misma computadora.
- Una IP local mediante HTTP permite abrir la aplicación, pero no usar la cámara.
- En celulares se debe usar un dominio HTTPS o un túnel HTTPS temporal.

Ejemplo con Cloudflare Tunnel:

```powershell
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=".trycloudflare.com"
npm run dev
```

En otra terminal:

```powershell
cloudflared tunnel --url http://localhost:5173
```

El túnel expone temporalmente la aplicación a Internet. Debe cerrarse al terminar
la prueba y no sustituye autenticación ni controles de acceso.

Para regenerar los íconos de la PWA:

```powershell
.\scripts\generate-pwa-icons.ps1
```

## API HTTP

Las rutas siguientes se exponen directamente en FastAPI. El prefijo `/api` sólo
existe en el proxy local de Vite.

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Health check del servicio |
| `GET` | `/products` | Listar productos con paginación y filtro de impresión |
| `POST` | `/products` | Crear un producto |
| `GET` | `/products/by-barcode` | Buscar por código exacto |
| `GET` | `/products/{id}` | Consultar un producto |
| `PUT` | `/products/{id}` | Actualizar un producto |
| `DELETE` | `/products/{id}` | Eliminar un producto |
| `POST` | `/products/import` | Importar Excel o CSV |
| `GET` | `/products/export/register` | Descargar `PRESUR1.DAT` |
| `GET` | `/labels/pending-count` | Contar carteles pendientes |
| `PUT` | `/labels/status` | Marcar productos impresos o pendientes |
| `POST` | `/labels/generate` | Generar un lote PDF |
| `POST` | `/labels/batches/{id}/confirm` | Confirmar un lote impreso |

Los contratos completos y ejemplos interactivos están disponibles en `/docs`.

## Base de datos y esquema

Al iniciar, la API crea las tablas faltantes y adapta instalaciones anteriores
de manera idempotente mediante `initialize_database()`. El archivo
`backend/migrations/20260827_add_label_printing.sql` conserva la migración SQL de
referencia para las tablas y columnas de impresión.

Para proyectos con múltiples entornos o despliegues concurrentes conviene
convertir estas adaptaciones en migraciones Alembic versionadas antes de ampliar
el esquema.

## Pruebas y calidad

Frontend, desde la raíz:

```powershell
npm run lint
npm run build
```

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
```

La suite cubre validación, importación, códigos de barras, generación de PDFs,
estado y confirmación de lotes, y exportación para la caja.

## Herramientas de desarrollo

Generar un PDF de muestra:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\generate_sample_labels.py ..\output\pdf\carteles_muestra.pdf
```

Renderizar sus páginas como PNG:

```powershell
.\.venv\Scripts\python.exe scripts\render_pdf_pages.py ..\output\pdf\carteles_muestra.pdf ..\output\pdf\rendered
```

## Seguridad y operación

- CORS limita qué frontend puede llamar a la API desde un navegador.
- HTTPS es obligatorio en producción para proteger datos y habilitar la cámara.
- CORS no reemplaza autenticación ni autorización.
- La aplicación todavía no implementa usuarios, inicio de sesión ni roles.
- No se debe publicar para acceso irrestricto hasta agregar autenticación.
- Para producción deben configurarse y comprobarse backups periódicos.
- Antes de modificar masivamente el catálogo conviene generar un respaldo y
  verificar que pueda restaurarse.

## Solución de problemas

### El inventario queda cargando

1. Comprobar la API:

   ```powershell
   Invoke-WebRequest http://127.0.0.1:8000/health
   ```

2. Verificar que `backend/.env` exista y que `DATABASE_URL` sea correcto.
3. Confirmar que PostgreSQL esté disponible con `docker compose ps`.
4. Revisar que los puertos `5173`, `8000` y `5433` no estén ocupados por
   procesos antiguos.
5. Reiniciar la API y usar el botón de actualización del inventario.

### La cámara no aparece

- Usar `localhost` o HTTPS.
- Conceder permiso de cámara al navegador.
- Cerrar otras aplicaciones que estén usando la cámara.
- Probar con la cámara trasera en un teléfono compatible.

### La exportación de caja falla

Revisar el producto indicado por el mensaje: normalmente tiene un nombre o
código demasiado largo, un carácter incompatible con CP1252 o un precio
inválido.

### Un cartel vuelve a pendiente

Es el comportamiento esperado cuando cambia un dato visible. Se debe generar e
imprimir una nueva versión del cartel.
