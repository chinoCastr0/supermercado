# Rediseño de UI — 16 de octubre de 2026

## Sistema visual

Inter como única familia de UI, neutros zinc de 50 a 950 y acento índigo. Tokens
en `src/index.css`: colores semánticos y superficies por tema, tipografía,
espaciado de 4 px, radios, sombras y transiciones de 150–180 ms.

El tema inicial sigue `prefers-color-scheme`. El control recorre sistema,
claro y oscuro; la preferencia se guarda dentro de try/catch. El HTML aplica
la preferencia antes de montar React. Clerk hereda los tokens mediante
`ClerkProvider.appearance`, incluidos autenticación, organización y usuario.

`src/App.css` se organiza por navegación, controles, indicadores, tablas,
faltantes, diálogos, cámara y breakpoints. Se eliminaron estilos anteriores
sin uso; no se agregaron dependencias.

## Cambios de experiencia

- Marca «Supermercado» consistente, importación separada en escritorio y
  navegación inferior móvil. Se quitó la afirmación estática de conexión.
- Campos y botones consistentes, iconos SVG, indicadores de carga, skeletons,
  alertas, estados vacíos y precios con cifras tabulares.
- Encabezados de tabla sticky; tarjetas en pantallas de hasta 1000 px para
  evitar comprimir columnas; controles táctiles de al menos 44 px en móvil.
- Modales con encabezado y acciones sticky, fondo inerte, bloqueo de scroll,
  retención/restauración del foco y Escape. Bottom sheet hasta 760 px.
- Atajo Enter documentado para los códigos numéricos del buscador.
- KPI rotulado como resultados de la vista, sin afirmar que sea el total global.

## Verificaciones ejecutadas

- `npm.cmd run lint`: aprobado.
- `npm.cmd run build`: aprobado.
- `npm.cmd run test:frontend`: 59/59 aprobados.
- `git diff --check`: aprobado.
- Comparación AST de los callbacks JSX existentes: sin cambios en los 17
  archivos revisados, excluyendo Modal por sus cambios de accesibilidad.
- Sin cambios en `src/hooks`, `src/api`, `src/types`, `src/utils` ni dependencias.
- Cálculo de contraste de 16 pares de tokens de texto/fondo en claro y oscuro:
  mínimo 5,62:1. Esto no sustituye una auditoría de contraste de la UI renderizada.

## Verificación visual pendiente

El navegador integrado respondió «Browser is not available: iab» y el inventario
de herramientas devolvió cero navegadores conectados. No se pudieron obtener
capturas del antes/después ni revisar etapas en un navegador.

| Ancho | Claro | Oscuro |
| --- | --- | --- |
| 375 px | Pendiente | Pendiente |
| 768 px | Pendiente | Pendiente |
| 1440 px | Pendiente | Pendiente |

Revisar en cada combinación Productos, Faltantes, Equipo, cargas y vacíos,
formularios de alta/edición, importación, cambio masivo, oferta, PDF y escáner.
Probar Tab/Shift+Tab, Escape, restauración del foco, teclado virtual móvil,
scroll del modal, preferencia de movimiento reducido y menús reales de Clerk.
No se verificaron cámara física, lector USB/Bluetooth, impresión, funcionamiento
offline ni cambios de organización con una sesión real.

Referencia usada para la integración visual:
[variables de apariencia de Clerk](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables).

## Ajuste responsive posterior

Se revisaron las reglas de 470, 760, 1000 y 1200 px y se agregó un corte de
navegación a 900 px para no comprimir la cabecera en tablets estrechas.
La cabecera compacta tiene dos filas explícitas: marca y acciones arriba,
organización abajo. El nombre de la organización se trunca cuando no cabe.
La navegación inferior usa columnas iguales con dos o tres opciones según
el rol, y respeta el área segura del dispositivo.

También se ajustaron las acciones de página a dos columnas, la paginación
a una fila de estado y otra de botones, y los mínimos de las columnas de
formularios, KPI y confirmaciones masivas. Hasta 470 px, peso y unidad se apilan.

Lint, build y los 59 tests siguen pasando. La revisión de estas reglas fue
estática: el inventario de navegadores volvió a estar vacío. Sigue pendiente
validar visualmente 320, 375, 470/471, 760/761, 768, 900/901, 1000/1001,
1200/1201 y 1440 px, en claro y oscuro y con nombres de organización largos.
