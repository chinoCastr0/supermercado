# Sistema de inventario y precios para supermercado

Aplicación web para administrar el catálogo de un supermercado, importar listas
de precios sin degradar información existente, generar carteles de góndola y
exportar el catálogo al formato binario `PRESUR1.DAT` utilizado por la caja.

Este repositorio contiene una SPA React instalable como PWA, una API FastAPI y
persistencia PostgreSQL. El proyecto pone especial énfasis en que un precio tenga
el mismo valor al ingresarse, persistirse, mostrarse, imprimirse y exportarse.

> **Regla crítica del negocio:** una importación sólo puede aumentar el precio de
> un producto existente. Para un barcode ya registrado no puede modificar nombre,
> estado, peso, unidad ni fechas con datos del archivo. Una fila completa sólo se
> carga cuando el barcode es nuevo.

## Qué resuelve

- Alta, consulta, edición y eliminación de productos.
- Búsqueda manual o mediante cámara por código de barras.
- Filtros por estado activo y estado de impresión.
- Importación masiva desde `.xlsx` y `.csv`.
- Comparación segura de precios durante una importación.
- Historial auditable de altas y cambios de precio.
- Protección frente a ediciones simultáneas y datos desactualizados.
- Generación de carteles PDF A4, 24 por página (3 columnas por 8 filas).
- Reimpresión determinista desde una copia inmutable del lote original.
- Confirmación segura de carteles impresos.
- Exportación de productos activos a `PRESUR1.DAT`.
- Interfaz responsive e instalable como PWA.

## Reglas que no deben romperse

Estas reglas son parte del dominio, no detalles de interfaz.

### 1. El dinero es decimal exacto

- PostgreSQL guarda `products.price` como `NUMERIC(12, 2)`.
- Python usa `Decimal`; no se usa `float` para cálculos monetarios internos.
- El frontend mantiene el precio como texto y compara centavos enteros; no lo
  convierte a `Number`.
- La API acepta formatos como `1234.56`, `1234,56`, `1.234,56` y `1,234.56`.
- Se rechazan valores ambiguos, no finitos o con más de dos decimales.
- La API serializa el precio como string decimal, por ejemplo `"1234.56"`.

La implementación canónica está en:

- Backend: `backend/app/money.py`.
- Frontend: `src/utils/money.ts`.

### 2. Una importación nunca reduce un precio

Para cada barcode del archivo se consulta y bloquea el registro correspondiente
antes de decidir. Todos los cambios se confirman juntos en una única transacción.

| Situación | Resultado |
| --- | --- |
| El barcode no existe | Se crea el producto con todos los campos válidos del archivo. |
| Precio importado mayor | Se actualiza únicamente `price`. |
| Precio importado igual | No se modifica el producto. |
| Precio importado menor | No se modifica el producto y el barcode se informa como preservado. |

Ejemplo:

```text
Guardado 5300 + importado 7000 -> queda 7000
Guardado 7000 + importado 6000 -> queda 7000
Guardado 7000 + importado 7000 -> queda 7000 sin escritura
```

En productos existentes, los valores importados de `name`, `active`, `weight`,
`weight_unit` y `last_updated` se ignoran siempre. Al aumentar el precio sólo
cambian además metadatos internos necesarios para auditoría, concurrencia y
estado del cartel.

La política se aplica en el backend (`backend/app/api/products.py`), por lo que
no depende de una casilla del frontend ni puede eludirse agregando parámetros a
la petición HTTP.

### 3. Las ediciones manuales detectan conflictos

Cada producto tiene un número `revision`. Un `PUT /products/{id}` debe enviar
`expected_revision`. El servidor bloquea la fila y devuelve HTTP `409` si otra
operación la modificó desde que el usuario abrió el formulario. El usuario debe
recargar y revisar el valor vigente antes de volver a guardar.

Una edición manual sí puede bajar deliberadamente un precio. Esta posibilidad es
distinta de la importación automática y requiere trabajar sobre la revisión
vigente.

### 4. Cada cambio de precio deja historial

`product_price_changes` registra:

- producto y barcode;
- precio anterior y precio nuevo;
- origen (`manual_create`, `manual_update`, `import_create` o `import_update`);
- fecha del servidor.

El historial se consulta con `GET /products/{id}/price-history`. Es prospectivo:
no intenta reconstruir cambios ocurridos antes de que existiera esta tabla.

### 5. Un lote de carteles conserva lo que se imprimió

Al generar un PDF, cada elemento del lote guarda una copia de su posición,
barcode, nombre, precio, peso y unidad. `GET /labels/batches/{id}/pdf` reconstruye
el PDF desde esa copia, aunque el producto actual haya cambiado.

Los lotes históricos creados antes de incorporar snapshots se rechazan con HTTP
`409`, porque no es posible garantizar cuál era su contenido original.

## Flujo funcional de punta a punta

```text
Formulario / Excel / CSV
          |
          v
Validación de texto, barcode y Decimal
          |
          v
Reglas de creación, edición o importación
          |
          v
Transacción SQLAlchemy -> PostgreSQL NUMERIC(12,2)
          |
          +--> historial de precios
          +--> nueva versión de cartel pendiente
          |
          v
Respuesta API con precio decimal como string
          |
          +--> inventario React
          +--> snapshot y PDF de carteles
          +--> validación y exportación PRESUR1.DAT
```

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8, React Compiler |
| Escáner | ZXing Browser |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Persistencia | PostgreSQL 17 |
| Importación | pandas y openpyxl |
| Documentos | ReportLab, pypdf y PyMuPDF |
| Calidad | pytest, Node Test Runner, ESLint y TypeScript |
| Desarrollo local | Docker Compose para PostgreSQL |

## Estructura del repositorio

```text
supermercado/
|-- src/
|   |-- api/                 cliente HTTP y descargas
|   |-- components/          tabla, filtros, modales, preview y escáner
|   |-- hooks/               estado y operaciones de inventario
|   |-- types/               contratos TypeScript
|   `-- utils/               dinero, formato y descripción de PRESUR
|-- public/                  manifest, service worker e iconos PWA
|-- tests/                   pruebas unitarias del frontend
|-- backend/
|   |-- app/
|   |   |-- api/             controladores de productos y carteles
|   |   |-- models/          modelos SQLAlchemy
|   |   |-- schemas/         DTO y validación Pydantic
|   |   |-- services/        importación, PDF, estado y PRESUR
|   |   |-- database.py      engine, sesiones e inicialización del esquema
|   |   |-- main.py          composition root de FastAPI
|   |   `-- money.py         parser monetario canónico
|   |-- migrations/          SQL aditivo para instalaciones existentes
|   |-- scripts/             auditorías y verificaciones operativas
|   `-- tests/               pruebas backend e integración con SQLite
|-- output/pdf/              PDFs de muestra y trazabilidad
|-- docker-compose.yml       PostgreSQL local
`-- vite.config.ts           build y proxy `/api`
```

## Modelo de datos

### `products`

| Campo | Función |
| --- | --- |
| `id` | Identidad interna y candidato a PLU. |
| `barcode` | Identificador único del producto. |
| `name` | Nombre visible y exportable. |
| `price` | `NUMERIC(12,2)`, positivo y exacto. |
| `weight`, `weight_unit` | Presentación opcional: `g`, `kg`, `ml`, `l` o `u`. |
| `active` | Determina si se exporta a la caja. |
| `revision` | Control optimista para evitar escrituras obsoletas. |
| `label_version` | Versión vigente de los datos visibles en el cartel. |
| `printed_label_version` | Versión confirmada como impresa. |
| `printed_at` | Fecha de confirmación del cartel vigente. |
| `last_updated` | Fecha administrada por el servidor. |

`printed` no es una columna: es verdadero cuando existe `printed_at` y
`printed_label_version == label_version`.

### `product_price_changes`

Historial append-only de precios. Conserva el barcode además del `product_id`
para que el evento siga siendo interpretable si el producto se elimina.

### `print_batches` y `print_batch_items`

Representan una generación de carteles y los productos incluidos. Cada item
guarda la versión visible y el snapshot inmutable usado para crear el PDF.

## Instalación local

### Requisitos

- Node.js compatible con Vite 8; el proyecto fue validado con Node.js 24.
- Python 3.13.
- Docker con Compose, o PostgreSQL accesible por una URL de conexión.
- PowerShell para ejecutar los ejemplos de Windows.

### 1. Instalar el frontend

Desde la raíz:

```powershell
npm ci
```

### 2. Crear el entorno del backend

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

### 3. Configurar variables

```powershell
Copy-Item backend\.env.example backend\.env
```

El ejemplo usa PostgreSQL en `localhost:5433`, base `supermercado`, usuario
`admin` y contraseña local `desarrollo`. `backend/.env` no debe versionarse ni
contener credenciales de producción.

### 4. Levantar PostgreSQL

```powershell
docker compose up -d database
docker compose ps
```

El volumen `postgres_data` conserva la base al reiniciar o recrear el contenedor.

### 5. Iniciar FastAPI

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Para desarrollo puede agregarse `--reload`.

### 6. Iniciar React

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
| Swagger | `http://127.0.0.1:8000/docs` |
| OpenAPI | `http://127.0.0.1:8000/openapi.json` |
| Health check | `http://127.0.0.1:8000/health` |
| PostgreSQL | `localhost:5433` |

Vite recibe `/api/*`, lo redirige a `http://127.0.0.1:8000/*` y elimina el
prefijo. En un build desplegado, `VITE_API_URL` debe apuntar a la API pública; si
no se define, el frontend utiliza `/api`.

## Variables de entorno

| Variable | Servicio | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Backend | URL SQLAlchemy completa. Es obligatoria. |
| `ALLOWED_ORIGINS` | Backend | Lista CORS separada por comas. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Referencia local | Alternativa documentada en `.env.example`; el código actual requiere `DATABASE_URL`. |
| `VITE_API_URL` | Frontend/build | URL base de FastAPI; valor implícito `/api`. |

No hay autenticación ni autorización implementadas en el código fuente actual.
CORS no reemplaza esos controles. No debe exponerse la aplicación públicamente
sin agregar autenticación, HTTPS, gestión de secretos y una política de acceso.

## Importación de productos

La interfaz admite `.xlsx` y `.csv`. Los `.xls` antiguos deben convertirse a
`.xlsx`. `name` y `price` son columnas obligatorias para validar una fila; una
fila sin barcode se informa como omitida.

| Dato | Encabezados reconocidos |
| --- | --- |
| Barcode | `barcode`, `codigo`, `codigo de barras`, `codigobarras` |
| Nombre | `name`, `nombre`, `producto`, `descripcion` |
| Precio | `price`, `precio`, `valor`, `importe` |
| Peso | `weight`, `peso`, `contenido`, `cantidad` |
| Unidad | `weightunit`, `unidad`, `unidadmedida`, `unidadpeso` |
| Fecha | `lastupdated`, `fecha`, `ultimaactualizacion` |

Ejemplo:

```csv
codigo,nombre,precio,peso,unidad,fecha
7790001000011,Arroz largo fino,"1.850,50",1,kg,04/09/2026
7790001000028,Gaseosa cola,2400,1.5,l,04/09/2026
7790001000035,Jabón blanco,950,200,g,04/09/2026
```

Detalles relevantes:

- Si el archivo repite un barcode, prevalece la última fila de ese archivo.
- Los barcodes numéricos se normalizan sin agregar `.0`.
- El peso puede escribirse como `500 g`, `1,5 l` o en columnas separadas.
- Para un producto nuevo se validan y cargan todos los campos disponibles.
- Para uno existente sólo se evalúa si el precio es mayor; ningún otro dato del
  archivo se copia.
- La selección de existentes se realiza con bloqueo de fila para evitar carreras
  entre importaciones concurrentes.
- La respuesta informa nuevos, existentes encontrados, precios aumentados,
  barcodes cuyo precio menor fue preservado y filas omitidas sin barcode.

## Edición manual

El frontend abre un producto con su `revision` actual. Al guardar, incluye esa
revisión como `expected_revision`. Un conflicto HTTP `409` significa que el
producto cambió entretanto y que debe recargarse antes de decidir qué valor
conservar.

Modificar barcode, nombre, precio, peso o unidad incrementa `label_version` y
devuelve el cartel al estado pendiente. Cambiar el precio agrega además una fila
al historial.

## Carteles de precios

El PDF usa A4 vertical y una matriz fija de 3 × 8. Puede mostrar nombre, precio,
presentación, precio comparable y código de barras EAN-13, EAN-8, UPC-A, UPC-E o
Code 128 cuando el valor es representable.

Flujo operativo recomendado:

1. Seleccionar productos pendientes.
2. Generar el PDF.
3. Revisar visualmente el documento.
4. Imprimir.
5. Confirmar el lote sólo después de que la impresión física termine.

La generación bloquea los productos, toma snapshots y persiste el lote. La
confirmación compara `label_version` contra la versión capturada: los productos
modificados o eliminados posteriormente se informan y no se marcan por error
como impresos.

## Exportación `PRESUR1.DAT`

Se exportan únicamente productos activos. El archivo contiene exactamente
20.000 registros de 58 bytes (`1.160.000` bytes en total).

Restricciones:

- Máximo de 20.000 productos activos.
- Barcode de hasta 15 bytes CP1252.
- Nombre validado para la caja y campo binario de 18 bytes CP1252.
- Sin caracteres de control ni caracteres incompatibles con CP1252.
- Precio positivo y representable como `float32` sin alterar sus centavos.
- IDs entre `0` y `19999` se usan como PLU si están libres; los demás reciben un
  hueco disponible.
- El peso se utiliza en carteles, pero no forma parte de este formato.

La exportación falla completa y explícitamente si algún producto activo no puede
representarse sin pérdida. No se genera un archivo parcialmente corrupto.

## Escáner y PWA

El escáner busca EAN-13, EAN-8, UPC-A, UPC-E y Code 128. Si encuentra el barcode,
abre el producto; si no existe, abre el alta con el código precargado.

La cámara requiere un contexto seguro:

- `http://localhost` funciona en la misma computadora.
- Una IP local servida por HTTP normalmente no habilita la cámara.
- En teléfonos debe utilizarse HTTPS.

Para regenerar los iconos:

```powershell
.\scripts\generate-pwa-icons.ps1
```

El service worker ofrece el shell básico sin conexión. Los datos del inventario
siguen requiriendo acceso a la API y a PostgreSQL.

## API HTTP

Las rutas de FastAPI no llevan `/api`; ese prefijo sólo pertenece al proxy de
Vite.

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/health` | Disponibilidad del backend. |
| `GET` | `/products` | Lista paginada; acepta `skip`, `limit` y `print_status`. |
| `POST` | `/products` | Crea un producto y su primer evento de precio. |
| `GET` | `/products/by-barcode?barcode=...` | Busca el barcode textual exacto. |
| `GET` | `/products/{id}` | Obtiene un producto. |
| `GET` | `/products/{id}/price-history` | Devuelve el historial de precios. |
| `PUT` | `/products/{id}` | Edición manual con `expected_revision`. |
| `DELETE` | `/products/{id}` | Elimina un producto. |
| `POST` | `/products/import` | Importa Excel o CSV con política increase-only. |
| `GET` | `/products/export/register` | Descarga `PRESUR1.DAT`. |
| `GET` | `/labels/pending-count` | Cuenta carteles pendientes. |
| `PUT` | `/labels/status` | Marca productos impresos o pendientes. |
| `POST` | `/labels/generate` | Genera PDF y lote inmutable. |
| `GET` | `/labels/batches/{id}/pdf` | Reimprime desde el snapshot. |
| `POST` | `/labels/batches/{id}/confirm` | Confirma las versiones aún vigentes. |

Los contratos ejecutables y ejemplos están en `/docs` y `/openapi.json`.

## Base de datos y migraciones

Al importar `app.main`, `initialize_database()` crea tablas faltantes y agrega de
forma idempotente columnas necesarias para instalaciones anteriores. Esta
estrategia facilita una instalación única; no sustituye un sistema de migraciones
coordinadas cuando existen varios servidores desplegando en paralelo.

Migraciones de referencia:

- `backend/migrations/20260827_add_label_printing.sql`: versiones y lotes.
- `backend/migrations/20260904_price_integrity.sql`: revisión, snapshots e
  historial de precios.

Para aplicar y verificar el esquema de integridad sin modificar precios:

```powershell
cd backend
$env:PYTHONPATH="."
.\.venv\Scripts\python.exe scripts\apply_price_integrity_schema.py
```

El script toma antes y después la cantidad, suma y fingerprint de los precios y
falla si alguno cambia.

Antes de cualquier cambio masivo o despliegue:

1. Crear un backup de PostgreSQL.
2. Verificar que el backup pueda restaurarse.
3. Ejecutar la migración en un entorno de prueba.
4. Ejecutar las suites automatizadas.
5. Recién entonces desplegar.

## Pruebas y calidad

Frontend, desde la raíz:

```powershell
npm run lint
npm run build
npm run test:frontend
```

Backend:

```powershell
cd backend
$env:PYTHONPATH="."
.\.venv\Scripts\python.exe -m pytest tests -q
```

La línea base al documentar este estado es de 51 pruebas backend y 3 pruebas
frontend. Se cubren dinero decimal, importación, preservación de campos,
concurrencia, historial, barcode, PDFs, snapshots, confirmación de lotes y
exportación binaria.

## Scripts de diagnóstico

Ejecutar desde `backend` con `PYTHONPATH=.`:

| Script | Propósito | ¿Escribe datos? |
| --- | --- | --- |
| `scripts/audit_price_database.py` | Inspecciona tipo de columna, tablas, vistas, triggers y rules. | No. |
| `scripts/apply_price_integrity_schema.py` | Aplica esquema aditivo y comprueba que ningún precio cambie. | Sólo esquema. |
| `scripts/trace_price_transaction.py` | Traza un decimal por API y DB. | Inserta temporalmente y revierte. |
| `scripts/verify_business_price_flow.py` | Verifica 5300 → 7000 y rechazo de 6000, campos intactos y reimpresión. | Inserta temporalmente y revierte. |
| `scripts/generate_sample_labels.py` | Genera un PDF de muestra. | Sólo archivo de salida. |
| `scripts/render_pdf_pages.py` | Renderiza un PDF a PNG para inspección visual. | Sólo archivos de salida. |
| `scripts/generate_price_trace_pdf.py` | Genera casos visuales de precisión monetaria. | Sólo archivo de salida. |

## Solución de problemas

### El inventario queda cargando

1. Ejecutar `Invoke-WebRequest http://127.0.0.1:8000/health`.
2. Confirmar que `backend/.env` contiene una `DATABASE_URL` correcta.
3. Ejecutar `docker compose ps` y revisar PostgreSQL.
4. Verificar que los puertos `5173`, `8000` y `5433` estén libres.
5. Revisar la consola del backend antes de reiniciar procesos.

### Una importación no cambió un producto

- Confirmar que el barcode coincide exactamente.
- Si el producto ya existe, sólo cambiará cuando el precio importado sea mayor.
- El resto de los campos del archivo se ignora intencionalmente.
- Revisar `price_updated_count`, `preserved_price_barcodes` y
  `skipped_barcodes` en la respuesta.

### Una edición devuelve HTTP 409

Otra operación cambió el producto. Recargarlo, revisar especialmente el precio y
volver a guardar utilizando la nueva revisión.

### Un cartel vuelve a pendiente

Es esperado cuando cambia barcode, nombre, precio, peso o unidad. Debe generarse
y confirmarse una nueva versión.

### Un lote antiguo no puede reimprimirse

Los lotes previos a los snapshots no conservan suficiente información. El
servidor devuelve HTTP 409 en vez de generar un PDF potencialmente incorrecto.

### La exportación de caja falla

El mensaje identifica el producto que no puede representarse. Revisar longitud y
codificación de nombre/barcode, caracteres de control y representación exacta
del precio.

### La cámara no aparece

Usar `localhost` o HTTPS, conceder permiso al navegador y cerrar otras
aplicaciones que estén utilizando la cámara.

## Guía de contexto para personas y agentes de IA

La siguiente ficha resume las decisiones que deben conocerse antes de modificar
el proyecto:

```yaml
project:
  purpose: inventario, precios, carteles PDF y exportación PRESUR1
  language_ui: es-AR
  frontend: React + TypeScript + Vite
  backend: FastAPI + SQLAlchemy + Pydantic
  database: PostgreSQL

source_of_truth:
  persisted_products: PostgreSQL products
  money_parser_backend: backend/app/money.py
  money_parser_frontend: src/utils/money.ts
  import_policy: backend/app/api/products.py::import_products
  label_rendering: backend/app/services/label_pdf.py
  register_serialization: backend/app/services/register_export.py

hard_invariants:
  - prices remain exact to two decimal places end-to-end
  - an import never lowers an existing price
  - an import updates only price for an existing barcode
  - full imported rows are used only for new barcodes
  - manual updates require the current expected_revision
  - every persisted price change creates an audit event
  - generated label batches retain immutable printable snapshots
  - batch confirmation never marks a newer product version as printed
  - PRESUR export fails rather than silently losing cents or corrupting text

safe_change_protocol:
  - preserve Decimal/string money handling; do not introduce float/Number
  - enforce business rules in the backend, not only in React
  - keep imports transactional and row-locked
  - add regression tests for higher, equal and lower imported prices
  - test that non-price fields remain unchanged for existing barcodes
  - run backend tests, frontend tests, lint and build
  - use the rollback verification scripts for database-sensitive changes

known_boundaries:
  - authentication and authorization are not implemented
  - offline mode caches the UI shell, not inventory data
  - legacy print batches without snapshots cannot be faithfully reconstructed
  - price history begins when auditing was introduced
```

Cuando una modificación contradiga una regla de `hard_invariants`, debe tratarse
como un cambio explícito de política de negocio: requiere confirmación, pruebas y
actualización de este README.
