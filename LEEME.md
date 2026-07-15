# Control Pediátrico — Guía rápida

## Qué es
Una app web (PWA) para llevar el control de tus pacientes pediátricos: datos generales,
tutores, obra social, alergias, calendario de vacunación e historia clínica acumulativa
con dictado por voz. Todo se guarda **en el propio dispositivo** (no hay servidor ni
base de datos externa). La sincronización entre dispositivos es manual, vía un archivo
que subís/bajás de tu Google Drive.

## Cómo instalarla en tu celular (recomendado: alojarla gratis en GitHub Pages)
El dictado por voz y la instalación como app (ícono en pantalla de inicio) requieren que
la página se sirva por HTTPS — abrirla como archivo local (doble clic) funciona para
cargar datos, pero el micrófono puede no habilitarse en algunos Android. Por eso conviene
alojarla gratis:

1. Creá una cuenta en GitHub (gratis) si no tenés.
2. Creá un repositorio nuevo, por ejemplo `control-pediatrico`.
3. Subí estos 6 archivos a la raíz del repositorio: `index.html`, `styles.css`, `app.js`,
   `manifest.json`, `sw.js`, `icon.svg`.
4. En el repositorio: Settings → Pages → Source: elegí la rama principal (`main`) y
   carpeta `/ (root)`. Guardá.
5. GitHub te da una URL tipo `https://tu-usuario.github.io/control-pediatrico/`. Abrila
   desde Chrome en tu Android.
6. Chrome va a ofrecer "Agregar a pantalla de inicio" o "Instalar app" — aceptá, y te
   queda como una app más, con ícono propio, funcionando offline.

## Cómo sincronizar entre dispositivos (sin pagar servidor)
1. En el dispositivo con los datos más actualizados: tocá el ícono ⇅ arriba a la derecha
   → **Exportar copia**. Se descarga un archivo `control-pediatrico-FECHA.json`.
2. Subilo a tu Google Drive: desde el selector de "compartir" de Android elegí Drive,
   o abrí la app de Drive y usá "Subir archivo".
3. En el otro dispositivo: abrí Drive, descargá ese archivo al celular.
4. En la app, tocá ⇅ → **Importar archivo** → elegí el archivo descargado.
5. La app agrega los pacientes nuevos y actualiza los que cambiaron, sin borrar nada
   que ya tengas cargado en ese dispositivo (fusiona por fecha de última modificación).

Repetí este export/import cada vez que quieras llevar los cambios de un dispositivo a
otro. Como es historia clínica, te recomiendo mantener el archivo exportado solo en tu
Drive personal (no compartido) y activar verificación en dos pasos en tu cuenta de Google.

## Estructura de los datos
- **Paciente**: nombre, apellido, fecha de nacimiento, tutor/es (nombre + teléfono),
  obra social, grupo sanguíneo, alergias, antecedentes de nacimiento (parto, peso),
  calendario de vacunación.
- **Historia clínica**: entradas con fecha, tipo (control / enfermedad / tratamiento /
  urgencia), texto (con dictado por voz), peso y talla opcionales.

## Ideas para más adelante (no incluidas todavía)
- Gráfico de curva de crecimiento (peso/talla en el tiempo).
- Recordatorios de próximas dosis de vacunas vencidas.
- Exportar la ficha de un paciente en PDF.
