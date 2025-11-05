## scraper pjud

### RESUMEN DEL README

**Inicio Rápido**

1. Instalar dependencias:
   `pnpm install`
   `pnpm exec playwright install chromium`

2. Ejecutar:
   `pnpm start`

3. Los resultados estarán en:
   - `data/cases/` → JSON con metadata
   - `data/downloads/` → PDFs descargados

**Objetivo**

Se busca optimizar el scrapeo mediante un aarquitectura híbrida de scrapeo por cliente y servidor, además de aprovechar el SSR de PHP para ejecutar funciones para interacción en vez de forzarla desde el navegador.

### Objetivo

El opbjetivo principal es optimizar el scrapeo de data del p. jud.m, para eso opte por una "arquitectura" (?) híbrida de scrapeo del lado del cliente y servidor, para distribuir estrés y aprovechar más las features que nos ofrece ambos metodos.

Además de optar por una arquitectura híbrida también se hizo un sondeo a la página para ver si se podía aprovechar de APIs expuestas y demás, lo malo es que esta hecho con PHP y eso es todo SSR; y lo bueno de ésto es que al ser SSR trae todo ya pintado y encrustado desde el servidor al cliente, entonces podemos aprovecharnos de funciones, peticiones, etc para poder agilizar mucho el flujo.

Y eso fue lo que se hizo, aprovechando que en la página no se ven scripts de trazabilidad como datadog y demás, su unica fuente de si hay un bot scrapeando podría ser: user agent o cantidad enorme de peticiones

La navegación se hizo aprovechando sus funciones que tienen y aprovechando eso también se secuestró el token de sesión anonima que viene desde PHP, para agilizar interacciones a futuro con modales, botones, etc., de modo que abrir modales, acceder a archivos, entender si hay paginacion o mas libros, solo sean peticiones o CSS selectors básicos, sumando también la navegacion entre cuadernos y páginas.

En resumen, el scraper aprovecha a full estas "features" de la web yel SSR.

### Timings, Optimización y Problemas

Los tiempos que se demora en scrapear data se van a incluir en cada release.

Actualmente hay un cuello de botella en el crawler, los archivos demoran 90~92% del tiempo que dura el scrapeo.

### Herramientas

- NodeJS
- playwright (scraping del lado del cliente)
- cheerio (scraping del lado del servidor)
- pLimit (para limitar concurrencia)
- pino (para logs, se puede prescidnir)

### Instalación y cómo usarlo

- se necesita cualquier versión de NodeJS, la que usé yo fue la v23.11.0, pero cualquiera LTS o superior a v20 esta bien
- se necesita pnpm v10.17.0 o superior

Una vez esas dos dependencias listas, se pueden instalar las del proyecto como tal con los siguientes comandos:

- `pnpm install`: para instalar dependencias de node
- `pnpm exec playwright install chromium`: para instalar dependencias de playwright (navegadores drivers etc)

y posteriormente ejecutarlo con `pnpm start`

### Configuración personalizable

Existen valores constantes en `src/config/index.js` que determinan la concurrencia limite de forma asíncrona en la que se pueden ejecutar las atareas para evitar problemas de bloqueo o overflow.
`DOWNLOAD_LIMIT`: Valor base: **6**; es el límite de descargas de archivos de forma asíncrona
`CONCURRENT_CASES`: Valor base: **8**; es el límite de casos a scrapear de forma asíncrona
`API_LIMITE`: Valor base: **4**; es el límite de API Calls a Pjud para evitar sobrecarga.

**¿Por qué existen estos valores?**
Cómo se explica en el archivo, básicamente existen para humanizar el comportamiento del scraper y evitar sobrecarga o overflow del servidor pjud como el cliente nuestro.

**¿Cómo y cuando modificar estos valores?**
Cuando quieras probar o intentar mejorar el rendimiento del scraper como tal. Ten en cuenta que si es una única causa a scrapear es bien despreciable la mejora, esto funciona mucho mejor cuando son muchos casos con, probablemente, muchos sub-procesos (o actualizaciones del caso), archivos y anexos.

Los valores que están actualmente están respaldado por los **timings** que se mostraron antes

### Estructura de salida:

```sh
data/
  cases/
    {uuid}.json          # Datos del caso
  downloads/
    {uuid}/              # ID del caso
      {file-id}.pdf      # Archivos descargados
```

> esto podría ser despreciable si es que no se busca guardar nada local.

### Robustez

Para volver el scraper aún más robusto se hizo un extenso error handling para evitar cualquier tropezón en el scrapeo. Se listará a continuyación:

**Medidas de robustez y madurez del scraper**:

- Sistema de Retry: Puedes llamar a la funcion `retry` para instruir al sistema que debe de reintentar X cantidad de veces (por defecto **3**) con N segundos (por defecto **2**) de intervalo entre cada intento. Esto funciona de maravillas cuando un archivo no se descargó porque el servidor aun no renderiza o conecta la URL con el archivo y el token. De todas formas es **totalmente configurable** puedes modificar la cantidad de intentos y de segundos de intervalo.
- Logs: De momento los Logs son bien básicos con `pino`, básicamente hacen un logging de todo loq ue pasa por el scrapper, desde casos de éxito, warns, retrys y errores.

### Observaciones de PJUD

1. Toda su infraestructura está basada en PHP y JQuery. Por ende, todo el contenido que se ve y renderiza es del lado del servidor (SSR) mediante peticiones.
2. La web en si, tiene muchas funciones delicadas expuestas y malas integraciones de servicios (como el de captcha) que nos permiten saltarnos interacciones con la UI, llenados de forms, obtención de data y omision de protocolos de seguridad.
3. El pilar del scraper, que es con el cual se pueden enviar formularios es un token de sesión (anónima en nuestro caso) generado por PHP. Se puede secuestrar fácilmente ya que está embedido en una función.
4. Los archivos son generados de forma dinámica y tienen un token de duración de 60~80 minutos. La mayoría de archivos son accesibles mediante peticiones o streaming sin problema alguno, pero hay otras que se deben de hacer con un navegador porque requieren de una sesión (sesión dictada por local storage que es un `loggedIn: 1`).
