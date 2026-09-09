# Auditoría del código — 7 de septiembre de 2026

El proyecto tiene una base aprovechable: dinero decimal, auditoría transaccional
de precios, revisiones en edición, snapshots de carteles y pruebas de formatos.
La prioridad es cerrar brechas de integridad y recuperación antes de agregar
funcionalidades. Recomiendo evolucionar a un **monolito modular con casos de uso
y adaptadores**, conservando React, FastAPI, SQLAlchemy y PostgreSQL.

## Alcance y evidencia

Se revisaron los fuentes actuales de `src`, `public/service-worker.js`,
`backend/app`, todos los tests y scripts, las dos migraciones, configuración de
build, dependencias declaradas, Compose y documentación. El inventario detallado
está en [MAPA_CODIGO.md](MAPA_CODIGO.md). Se conservaron cambios que ya estaban
presentes en el directorio de trabajo.

Esta entrega incorpora comentarios/docstrings y herramientas de diagnóstico;
las correcciones funcionales siguientes son **propuestas pendientes**, no
funcionalidades implementadas. No se migró ni modificó la base del negocio.
Los comentarios explican contratos, decisiones y límites por módulo, función
y bloque relevante; las pruebas conservan nombres descriptivos de escenarios.
JSON estricto, lockfiles y binarios se documentan en el mapa, sin insertar
comentarios que invaliden sus formatos.

Revisión estática no equivale a ausencia de errores. No se probaron concurrencia
real en PostgreSQL, despliegue, restauración, hardware de caja/cámara ni rendimiento
con datos productivos. Tampoco se realizó un análisis completo de vulnerabilidades
de dependencias, secretos históricos o contenido de `backend/app.zip` y `.pyc`.
No se decompilaron binarios ni se consideraron fuente vigente del sistema.

**Verificación:** 61 pruebas backend y 9 frontend aprobadas antes y después de
documentar; ESLint y build de producción correctos. También pasó la comprobación
exploratoria de TypeScript con `--strict`, aunque esa opción sigue pendiente de
activarse en configuración. La suite backend usa SQLite, no demuestra bloqueos de filas
ni todas las restricciones de PostgreSQL. El diagnóstico adicional se ejecutó
con [audit_edge_cases.py](../backend/scripts/audit_edge_cases.py), enteramente
con datos sintéticos y SQLite en memoria.

La inserción de docstrings Python se contrastó por AST sin docstrings; los
comentarios TS/JS se contrastaron con la salida del emisor TypeScript sin
comentarios. Esas comparaciones verificaron que las anotaciones no modificaban
la lógica de los archivos procesados. `git diff --check` no detectó errores de
espacios. Python requirió ejecución fuera del sandbox por permisos del intérprete;
ESLint también, por directorios temporales de pytest inaccesibles al sandbox.

## Prioridades

| ID | Prioridad | Problema | Evidencia |
| --- | --- | --- | --- |
| A01 | Crítica si la red es accesible a terceros | Escrituras y borrados sin autenticación | Rutas y configuración |
| A02 | Alta | Identidad inventada y descarte silencioso al importar | Reproducido |
| A03 | Alta | Medidas que se redondean o quedan inconsistentes | Reproducido |
| A04 | Alta | Borrado definitivo sin revisión ni recuperación completa | Código y pruebas actuales |
| A05 | Alta | Sin respaldo/restauración automatizados en el repositorio | Configuración disponible |
| A06 | Alta | Migraciones al importar la aplicación y verificación posterior al commit | Código |
| A07 | Alta | Carreras y orden de bloqueos inconsistente | Análisis de intercalados; falta prueba PostgreSQL |
| A08 | Alta | Excepción decimal no controlada y null en campos obligatorios | Reproducido |
| A09 | Alta | Alta e importación aplican contratos diferentes | Reproducido |
| A10 | Media/alta según volumen | Descarga total, OFFSET y solicitudes obsoletas | Código |
| A11 | Media | Búsqueda costosa y relevancia descartada | Código; falta EXPLAIN |
| A12 | Media/alta según lote | PDF bajo bloqueo y advertencias en headers sin límite | Código |
| A13 | Alta si PLU identifica artículos en caja | PLU variable y asignación cuadrática | Algoritmo |
| A14 | Media | Actualizaciones de PWA no atómicas | Código; falta prueba de navegador |
| A15 | Media | Indicadores engañosos, cierre durante guardado y selección oculta | Código |
| A16 | Media | Artefactos compilados versionados y entorno poco reproducible | Git y configuración |
| A17 | Media | Cobertura insuficiente de HTTP, concurrencia y recuperación | Suite revisada |
| A18 | Alta para trazabilidad | Historial y snapshots modificables; actor ausente | Modelos y permisos declarados |
| A19 | Media | Fechas del negocio mezcladas con metadatos de impresión | Código y pruebas |

## Hallazgos y soluciones

### A01 — Control de acceso ausente

[main.py](../backend/app/main.py) registra ambos routers sin autenticación ni
autorización. Cualquier cliente con acceso al servicio puede importar precios,
editar o borrar productos. CORS limita navegadores, no clientes HTTP arbitrarios.
Además, Vite/preview escuchan en `0.0.0.0` y publican un proxy hacia la API;
Compose publica PostgreSQL con `5433:5432` y credenciales de desarrollo conocidas.
La exposición efectiva depende de red y firewall, que no se verificaron.

**Propuesta:** para desarrollo, enlazar puertos a loopback. Para uso compartido,
autenticar en backend y autorizar por capacidad: consulta, precio, importación,
impresión, borrado y administración. Separar usuario de migraciones del usuario
runtime, HTTPS y secretos externos al repositorio. Registrar actor y request ID.
**Aceptación:** solicitudes anónimas no escriben; cada rol se prueba por HTTP;
ningún despliegue público acepta las credenciales del ejemplo.

### A02 — El importador puede fabricar un barcode y ocultar filas fallidas

En [parse_excel_rows](../backend/app/services/excel_import.py), `row.iloc[0]`
se usa como alternativa cuando no hay barcode. `name,price\nArroz,100` produce
un producto cuyo código es `Arroz`. Si la primera columna es el nombre y el
barcode está vacío, ocurre lo mismo. Además, `continue` descarta precios inválidos
y nombres vacíos antes de que el controlador pueda contarlos. Un archivo con
una fila de precio `incorrecto` devuelve cero filas y puede aparentar éxito.

**Propuesta:** exigir columna de código o mapeo explícito de columnas; conservar
el código faltante como error de fila, nunca inferirlo del nombre. Devolver un
`ImportReport` con número de fila, resultado y motivo, separando recibidos,
válidos, duplicados, omitidos y aplicados. Validar todo antes de persistir;
si se admite importación parcial, mostrarla explícitamente como tal. Conservar
la política actual de última fila duplicada y sólo aumento de precios hasta
que se decida otra regla de negocio.
**Aceptación:** el archivo sin barcode no crea identidades; todas las filas
quedan contabilizadas y las inválidas tienen motivos consultables.

### A03 — Peso y unidad pueden perder consistencia

[WeightFields](../backend/app/schemas/product.py) sólo limita `weight > 0`,
mientras la columna es `Numeric(10,2)`. El alta con `weight=0.001` fue aceptada
y devuelta por persistencia como `0.00`. Esto afecta precios comparables y puede
invalidar la respuesta Pydantic después de confirmar la escritura.
Un `ProductUpdate(expected_revision=..., weight=None)` sobre `500 g` pasa la
validación del DTO y deja `weight=None, weight_unit='g'`: el controlador aplica
sólo campos enviados, pero el validador evaluó defaults del DTO.

**Propuesta:** definir precisión y rango de la medida en dominio y DTO; rechazar
exceso de decimales antes del commit. Para cambios parciales, validar el estado
final fusionado con la entidad o exigir ambos campos cuando aparezca cualquiera.
Agregar CHECK de positividad y presencia conjunta tras auditar los datos existentes.
**Aceptación:** 0.001 y valores fuera de rango no persisten; ninguna actualización
deja una medida incompleta; respuestas siempre representan un estado válido.

### A04 — El borrado no preserva el registro completo ni detecta vistas obsoletas

[delete_product y bulk_delete_products](../backend/app/api/products.py) realizan
borrado físico. El lote valida existencia, pero no `expected_revision`; puede
borrar productos que otro operador acaba de editar. Historial de precio y
snapshots sobreviven, como prueban los tests, pero no contienen necesariamente
todo el estado actual ni un evento de borrado que permita restaurarlo.

**Propuesta:** introducir archivado separado de `active`, con `deleted_at`, actor,
motivo, revisión y restauración; definir si el barcode archivado sigue reservado.
Separar archivado de purga definitiva con retención y autorización propia.
Mientras exista borrado físico, exigir revisiones y auditar snapshot completo
en la misma transacción. Es un cambio de política que debe acordarse antes de
modificar endpoints y textos actuales de borrado permanente.
**Aceptación:** una selección obsoleta no borra nada; se recuperan identidad,
atributos e historial sin reutilizar IDs.

### A05 — Persistencia no equivale a recuperación

[docker-compose.yml](../docker-compose.yml) declara un volumen persistente, pero
no hay jobs de backup ni simulacros de restauración versionados. No se puede
concluir que no existan respaldos externos: no fueron inspeccionados. El volumen
y `app.zip` no prueban recuperación ante borrado, corrupción o pérdida del equipo.

**Propuesta:** aplicar el [plan de mantenimiento](MANTENIMIENTO.md): dumps,
copias externas, pruebas de restauración y, si se requiere poca pérdida de datos,
backup base más WAL/PITR. Un dump consistente y PITR son mecanismos diferentes.
[Documentación PostgreSQL de dumps](https://www.postgresql.org/docs/17/backup-dump.html)
y [PITR](https://www.postgresql.org/docs/17/continuous-archiving.html).
**Aceptación:** restaurar en un entorno aislado, medir pérdida máxima y tiempo
de recuperación y comprobar catálogo, historial, lotes y secuencias.

### A06 — DDL automático y migración que no revierte si falla la comprobación

[main.py](../backend/app/main.py) llama `initialize_database()` al importarse.
[database.py](../backend/app/database.py) inspecciona columnas y ejecuta ALTER
sin historial de revisiones. Dos procesos pueden decidir agregar la misma columna.
`create_all` no transforma tipos o restricciones de tablas existentes.
En [apply_price_integrity_schema.py](../backend/scripts/apply_price_integrity_schema.py),
la comparación de huellas ocurre después de confirmar DDL: lanzar una excepción
no revierte lo hecho. Escrituras concurrentes pueden cambiar la huella sin que
la migración haya modificado precios.

**Propuesta:** configurar Alembic (ya figura como dependencia), migraciones
versionadas y ejecutor único previo al despliegue. Separar preparación del esquema
del arranque HTTP; usar lifespan para recursos y readiness para dependencia de DB.
Hacer comprobaciones bajo una ventana/isolation controlada y fallar antes del
commit cuando sea posible. Ensayar primero sobre restauraciones.
**Aceptación:** actualizar una base antigua dos veces es seguro, arrancar varios
workers no ejecuta DDL y cada release identifica su revisión de esquema.

### A07 — La protección de concurrencia no alcanza a todos los flujos

[labels.py](../backend/app/api/labels.py) lee sin bloqueo al marcar estado manual
y confirmar lotes. La comparación de versiones evita confirmar secuencialmente
un lote obsoleto, pero entre lectura y commit puede haber cambios. Una confirmación
vieja puede sobrescribir campos de impresión escritos por una confirmación nueva;
`printed` compara versiones y evita considerar vigente esa versión vieja, pero
puede perderse una confirmación válida y el resultado informado quedar obsoleto.
El marcado manual además no recibe la versión que vio el cliente, por lo que
puede confirmar una versión nueva que el operador nunca imprimió.

Importación adquiere bloqueos por bloques según el orden del archivo, sin orden
SQL explícito; generación tampoco ordena el bloqueo. Operaciones masivas de
precio/borrado sí ordenan por ID. Lotes solapados pueden formar ciclos de espera.
Son riesgos deducidos del código, no deadlocks observados en producción.

**Propuesta:** `UPDATE ... WHERE id=:id AND label_version=:expected` y conteo
de filas afectadas, o bloqueo ordenado más lectura vigente. Para confirmación,
serializar también la transición del lote y definir idempotencia. Unificar un
orden global de adquisición entre todos los flujos; no basta ordenar dentro de
cada bloque si el orden entre bloques difiere. Traducir deadlocks a reintentos
acotados del caso de uso completo, sólo si es seguro repetirlo.
**Aceptación:** tests con dos conexiones PostgreSQL y barreras controladas,
incluyendo confirmaciones vieja/nueva y lotes invertidos. PostgreSQL recomienda
orden consistente y reintento ante deadlocks en su
[documentación de bloqueo](https://www.postgresql.org/docs/17/explicit-locking.html).

### A08 — Validación monetaria puede terminar en error interno

En [money.py](../backend/app/money.py), `quantize` se ejecuta antes de verificar
el máximo de dígitos y queda fuera del `except InvalidOperation`. Un string de
40 nueves produjo `InvalidOperation`, en lugar de un error de entrada controlado.
`ProductUpdate` también acepta `price=None`, `name=None`, `barcode=None` y
`active=None`, aunque sus columnas son NOT NULL. Esos casos terminan en conflictos
de integridad con un mensaje de barcode duplicado que no describe la causa.

**Propuesta:** comprobar magnitud antes de cuantizar, convertir errores decimales
a `ValueError` y rechazar null explícito en campos obligatorios; conservar la
posibilidad de omitirlos en actualización parcial. Mapear `IntegrityError` según
constraint, sin exponer SQL. Revisar con negocio la ambigüedad de `1.234`:
actualmente significa 1234, no 1.234 decimal.
**Aceptación:** entradas extremas devuelven 422/400, nunca 500; null no llega a DB;
casos monetarios compartidos prueban ambas implementaciones Python/TypeScript.

### A09 — Caminos de escritura con distintas reglas

La importación instancia `Product(**row)` sin `ProductCreate`. Se importó un
nombre de 20 caracteres, mientras el alta manual admite 18 bytes. El exportador
recorta nombres, una conducta expresamente probada, y rechaza otros valores no
representables. Es posible importar datos que luego no se puedan editar con el
mismo contenido o bloqueen toda la exportación. Además, alta manual conserva
espacios exteriores del barcode, pero búsqueda y exportación los recortan;
`'001'` y `' 001 '` pueden coexistir como registros y colisionar en la caja.

**Propuesta:** normalización y validadores de dominio compartidos; definir nombre
descriptivo y nombre de caja por separado si la importación debe conservar textos
largos. Normalizar barcode antes de unicidad; auditar colisiones existentes antes
de migrarlas. Separar validación de filas nuevas de datos ignorados en existentes:
un peso inválido que no se va a copiar no debería decidir el precio sin una
política explícita. Agregar CHECK de precio positivo y reglas de unidad en DB;
se comprobó que una escritura ORM directa persiste precio -1.
**Aceptación:** todos los caminos preservan los mismos invariantes; ningún
recorte ni normalización produce pérdida o fusión silenciosa de productos.

### A10 — Paginación aparente y cargas innecesarias

[productsApi.listAll](../src/api/products.ts) recorre todas las páginas de 500;
[App](../src/App.tsx) ordena la colección completa y muestra diez filas. Con
20.000 coincidencias se hacen 41 requests, incluida la página vacía terminal.
Cada búsqueda/cambio y muchas mutaciones repiten el recorrido. `latestLoad`
evita publicar respuestas viejas, pero no cancela peticiones ni las páginas
siguientes. OFFSET sobre datos que cambian entre peticiones puede saltar o
repetir productos.

**Propuesta:** paginar y ordenar realmente en backend; devolver total o cursor
con desempate estable por ID. Separar estadísticas globales del listado.
Propagar AbortSignal en lecturas; no interpretar cancelar una escritura como
rollback remoto. Selección masiva por IDs explícitos o selección congelada del
servidor, para no depender de descargar todo. Actualizar/invalidate sólo queries
afectadas. Medir p50/p95, requests, bytes y memoria antes/después.
**Aceptación:** abrir una página requiere una consulta de listado acotada;
teclear rápido cancela lecturas obsoletas y el catálogo no tiene duplicados.

### A11 — Búsqueda y orden

[list_products](../backend/app/api/products.py) usa `ILIKE '%término%'`, OR y
orden calculado. Los índices declarados no aseguran un plan eficiente para esas
consultas; hace falta `EXPLAIN (ANALYZE, BUFFERS)` con datos representativos.
El frontend reordena por nombre y elimina la prioridad de barcode exacto que
calculó SQL. Términos numéricos finales también se interpretan como presentación,
lo que puede cambiar búsquedas de nombres que contienen números.

**Propuesta:** acordar semántica y único dueño del orden; conservar búsqueda
exacta indexada por barcode. Evaluar GIN/trigramas para nombres y patrones,
no agregarlos indiscriminadamente: consumen espacio y encarecen escrituras.
[PostgreSQL pg_trgm](https://www.postgresql.org/docs/17/pgtrgm.html) soporta
índices para LIKE/ILIKE. Para términos muy cortos, medir comportamiento específico.
**Aceptación:** exactos mantienen prioridad y los planes/latencias mejoran con
volúmenes y distribución realistas.

### A12 — Operaciones grandes ocupan memoria y bloquean escrituras

Importación lee todos los bytes, pandas crea un DataFrame y se materializan filas
y entidades; no hay límite aplicativo de bytes, filas ni tamaño XLSX descomprimido.
Generación permite hasta 20.000 productos, renderiza PDF y mantiene bloqueos hasta
terminar. Las advertencias completas viajan en `X-Print-Warnings`, cuyo tamaño
puede superar límites de servidor/proxy y hacer fallar una respuesta ya confirmada.

**Propuesta:** límites medidos de archivo, expansión ZIP, filas, tiempo y lote;
CSV por bloques y XLSX de lectura incremental si el volumen lo exige. Mantener
atomicidad con staging validado, no commits parciales inadvertidos. Para carteles,
guardar snapshot en transacción corta y renderizar después, con estados
pending/rendering/ready/failed e idempotencia. Devolver advertencias por JSON
paginado y descargar el artefacto por endpoint. Incorporar worker sólo si las
métricas justifican procesamiento en segundo plano.
**Aceptación:** cancelar/fallar un render no pierde el snapshot; un archivo fuera
de límite se rechaza controladamente; no se retienen bloqueos durante todo el PDF.

### A13 — PLU no estable y asignación costosa

[register_export.py](../backend/app/services/register_export.py) usa ID como PLU
si cabe; para IDs >= 20.000 busca el primer hueco desde cero en cada producto.
Muchos IDs altos generan trabajo O(n²), hasta unos 200 millones de verificaciones
para 20.000 asignaciones. Si se desactiva o elimina un producto anterior, el mismo
artículo puede recibir otro PLU en la siguiente exportación. Falta confirmar
con la caja si el PLU tiene significado durable.

**Propuesta:** si debe ser estable, persistir una asignación única por caja,
reservar bajas y definir reutilización explícita. Si es posicional, documentar
esa garantía y usar iterador de huecos para O(n). Conservar el control de
round-trip float32: no sustituirlo por redondeo silencioso.
**Aceptación:** tests para IDs altos y bajas entre exportaciones, más prueba con
hardware/especificación de caja; archivo siempre de 1.160.000 bytes.

### A14 — PWA con caché fija

[service-worker.js](../public/service-worker.js) usa una clave constante, elimina
cualquier otro caché del origen y combina HTML fresco con assets guardados.
Si sólo cambia el build, el worker puede no reinstalarse para precachear los
chunks nuevos; los lazy chunks no aparecen en el HTML inicial. Offline puede
fallar el arranque o el escáner según qué recursos se hayan visitado.

**Propuesta:** precache generado desde el build, versión de release, limpieza
limitada al prefijo propio y activación coordinada con la UI. Probar instalación,
actualización abierta y reinicio offline; evitar prometer inventario offline,
que no está implementado. Hospedar fuentes localmente si se exige disponibilidad
offline consistente. No cachear escrituras ni respuestas autenticadas por defecto.

### A15 — Legibilidad operativa y estado de interfaz

`StatsCards` describe totales de base aunque recibe resultados filtrados;
`Layout` muestra conexión fija aunque falle la API. `Modal.isBusy` sólo bloquea
Escape/backdrop: los botones de cierre/cancelación de hijos pueden cerrar durante
una escritura. No hay focus trap/restauración; los errores de edición se muestran
en el aviso de la pantalla, detrás del modal. Selecciones ocultas reaparecen al
cambiar filtros y el cálculo de generación usa `selectedIds.size` aunque la
selección efectiva esté vacía. El escáner invalida su propia sesión, pero la
consulta del padre puede abrir edición después de que el usuario cerró el lector.

**Propuesta:** distinguir totales globales/filtrados y conexión comprobada;
centralizar cierre ocupado y foco, errores dentro del formulario, política clara
de selección entre filtros y cancelación/invalidez también en el padre del
escáner. Un indicador booleano compartido `isSaving` no cuenta operaciones
concurrentes: bloquear por operación o usar contador/estado de mutaciones.
**Aceptación:** pruebas de teclado, doble clic, red lenta, cierre durante consulta
y filtro sin resultados; ningún resultado tardío reabre un flujo cerrado.

### A16 — Preservación del código y reproducibilidad

Git contiene 30 `.pyc`, incluidos módulos de autenticación sin fuente actual,
y `backend/app.zip`. Son copias potencialmente obsoletas y no demuestran que haya
autenticación vigente. `.gitignore` no excluye cachés Python ni entornos virtuales.
No se encontraron workflows CI versionados. Hay lockfile npm y pins Python,
pero faltan dependencias de test declaradas, versiones de runtime automatizadas
y hashes de dependencias Python. TypeScript no activa `strict`.

**Propuesta:** retirar artefactos del índice conservando lo que el usuario quiera
archivar; ignorar `.venv`, `__pycache__`, `.pytest_cache`, bytecode y outputs
reproducibles. Revisar el ZIP antes de archivarlo como release, sin tratarlo como
fuente de verdad. Fijar runtime, separar requisitos runtime/dev, activar strict
y lint Python progresivamente. CI con instalación limpia, tests, build y análisis
de dependencias. Mantener Git remoto, tags y copias verificadas de releases.
**Aceptación:** un checkout limpio ejecuta todas las verificaciones sin archivos
locales ocultos; no se necesitan `.pyc` ni el ZIP para iniciar el proyecto.

### A17 — Tests que pasan no cubren las garantías más fuertes

Los tests llaman mayormente funciones de controlador directamente. No cubren
resolución de rutas, serialización HTTP posterior al commit, controles de acceso,
validación real de body/query, desconexiones, carreras PostgreSQL ni restauración.
Los tests de frontend son utilidades puras, no interacciones React. `assert`
y mensajes de scripts operativos no sustituyen una verificación de despliegue.

**Propuesta:** tests HTTP de contratos, integración PostgreSQL con dos sesiones,
regresiones de A02/A03/A08/A09 y unos pocos E2E de alto valor. Agregar fixtures
monetarios comunes y pruebas generativas de importes/formatos. Pruebas de restore
y migración desde cada esquema soportado. Medir cobertura de ramas críticas,
sin perseguir un porcentaje que premie tests triviales.

### A18 — Auditoría por convención, sin inmutabilidad ni autor

[ProductPriceChange](../backend/app/models/price_change.py) y snapshots no tienen
protección contra modificación mediante el usuario de DB; `source` no identifica
persona, archivo ni operación idempotente. Cambios directos por SQL/ORM pueden
evitar el historial, la revisión y la invalidación del cartel.

**Propuesta:** un único caso de uso para escribir precios, permisos de INSERT/SELECT
en tablas históricas con usuario separado de migraciones, actor, request/import ID
y motivo. Evaluar triggers sólo si se permiten escritores fuera de la aplicación;
evitar doble auditoría. Guardar hash/origen de importación con política de retención.
Snapshots conservan datos pero no la versión del renderizador: para fidelidad a
largo plazo guardar PDF original y checksum o versionar plantilla/dependencias.
**Aceptación:** cada escritura autorizada deja un evento, no se puede reescribir
con el usuario runtime y reimprimir un lote viejo respeta su documento original.

### A19 — Semántica temporal inconsistente

El importador asigna UTC a fechas sin zona, aunque el operador puede haber escrito
hora argentina. `last_updated` usa `onupdate` para cualquier UPDATE de producto,
incluidos cambios de impresión; por eso ordenar por actualización no significa
ordenar por cambio de precio. Scripts con rollback pueden avanzar secuencias
PostgreSQL, por lo que tampoco son totalmente neutros sobre producción.

**Propuesta:** separar `price_changed_at`, `updated_at`, `printed_at` y fecha del
proveedor; acordar zona de importación y convertir una sola vez. Ejecutar scripts
de ensayo sobre restauraciones aisladas y agregar `main()`/argumentos explícitos
para evitar efectos al importar módulos CLI.

## Arquitectura y siguiente paso

El diseño concreto, las alternativas y el orden de implementación están en
[MANTENIMIENTO.md](MANTENIMIENTO.md). Primero cerrar contratos e integridad y
probar recuperación; después extraer casos de uso y optimizar con mediciones.
Conservar dinero exacto, importación sólo ascendente para existentes, revisiones
manuales, atomicidad de lotes y snapshots durante toda la transición.
