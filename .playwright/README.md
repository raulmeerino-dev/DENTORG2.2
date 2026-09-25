# Navegador de revisión de DentCore

La configuración de Playwright CLI usa `viewport: null` para que el área de la
aplicación siga el tamaño real de la ventana, también al maximizarla. Un viewport
fijo de automatización puede dejar una franja gris fuera del documento al ampliar
la ventana, aunque `html`, `body`, `#root` y el shell ocupen el 100 % de su viewport.

Para revisar manualmente, abrir una sesión desde la raíz del repositorio con esta
configuración. Si una sesión ya se abrió con un viewport fijo, abrir una nueva:
la configuración se aplica al crear el contexto del navegador.

Las pruebas de resoluciones concretas pueden seguir usando un viewport fijo en
otra sesión. No dejar esa sesión como navegador de prueba manual. Los tests E2E
de `frontend/playwright.config.ts` conservan sus tamaños reproducibles.

Al validar el ancho, comprobar tanto los límites del documento y del shell como
el redimensionado de la ventana nativa. Mantener los límites internos razonables
de formularios, diálogos y documentos; no compensar la emulación con CSS `100vw`
ni cambios de zoom.
