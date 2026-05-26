# Design Race Lab

MVP web estatico para estudiantes de Diseño Industrial que prueban autitos de coleccion.

## Ejecutar local

Abrir `index.html` en el navegador.

Opcional, con servidor local:

```bash
python -m http.server 5180
```

Luego abrir `http://127.0.0.1:5180`.

## Build

```bash
npm run build
```

El build deja todo listo en `dist/`.

## Subir a Netlify

El repo ya incluye `netlify.toml`. En Netlify usar:

- Build command: `npm run build`
- Publish directory: `dist`

## Datos

La version actual puede usar Google Sheets compartido mediante Apps Script. Ver `GOOGLE_SHEETS_SETUP.md`.

Si `config.js` no tiene URL de Apps Script, la app usa `LocalStorage` como respaldo local.

## Assets reemplazables

Ver `assets/README.md`.

Resumen:

- Logo provisorio: `assets/logos/f1-placeholder.png`
- Autos: `assets/cars/car-01.png` hasta `assets/cars/car-30.png`
- Pista/calles: `assets/calles/pista-base.png`, `assets/calles/asfalto-recta.png` y `assets/calles/meta-ajedrezada.png`
- Audio: `assets/audio/f1-theme.mp3`
