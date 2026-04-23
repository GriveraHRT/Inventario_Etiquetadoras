# Inventario Etiquetadoras HRT

Web App mobile-first para inventario y hoja de vida de etiquetadoras del Hospital Regional de Talca.

## Estructura

- `index.html`, `styles.css`, `app.js`: frontend para GitHub Pages.
- `Código.gs`, `appsscript.json`: backend en Google Apps Script.

## 1) Backend con clasp

1. Instalar clasp global:
   - `npm install -g @google/clasp`
2. Iniciar sesión:
   - `clasp login`
3. Enlazar carpeta al proyecto Apps Script:
   - `clasp create --type standalone --title "Inventario Etiquetadoras HRT"`  
     o si ya existe proyecto:
   - `clasp clone <SCRIPT_ID>`
4. Subir código:
   - `clasp push`
5. Desplegar Web App:
   - `clasp deploy --description "Inventario v1"`

Luego copia la URL de despliegue y pégala en `API_BASE_URL` dentro de `app.js`.

## 2) Inicializar Google Sheets

1. Abrir el proyecto Apps Script.
2. Vincularlo a una hoja de cálculo (si no está ligado).
3. Ejecutar una vez:
   - `doGet?action=initDatabase`  
   o crear una función temporal que llame `initDatabase_()`.
4. En hoja `Config`, completar `driveFolderId` con ID de carpeta Drive para fotos.

## 3) Publicar frontend en GitHub Pages

1. Inicializar repo local (si aún no existe):
   - `git init`
   - `git add .`
   - `git commit -m "Initial inventory web app"`
2. Conectar remoto:
   - `git remote add origin <URL_REPO>`
3. Subir:
   - `git branch -M main`
   - `git push -u origin main`
4. Activar Pages en GitHub (`main` / root).

## Notas

- Clave admin actual: `HRT123`.
- Las fechas de bitácora se estampan automáticamente en Apps Script.
- El backend guarda imagen base64 en Drive y actualiza `fotoUrl` del equipo.
