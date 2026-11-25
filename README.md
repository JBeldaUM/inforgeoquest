# InforGeoQuest

Aplicación web multijugador de cuestionarios interactivos en directo generada a partir de ficheros Excel (`quizzes/`).

## Despliegue gratuito en Render (URL fija en Internet)

1. Sube el contenido de esta carpeta a un repositorio en **GitHub** (por ejemplo `inforgeoquest`).
2. Entra en [render.com](https://render.com) e inicia sesión con tu cuenta de GitHub.
3. Pulsa **New + → Blueprint** (o **Web Service**) y selecciona tu repositorio.
   - Si usas **Blueprint**, Render leerá automáticamente `render.yaml`.
   - Si usas **Web Service**, deja:
     - **Name:** `inforgeoquest`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** `Free`
4. Pulsa **Deploy**. En ~2 minutos tendrás tu URL fija HTTPS (`https://inforgeoquest.onrender.com`).

## Ejecución en local

```bash
npm install
npm start
```

Abre `http://localhost:3000`.
