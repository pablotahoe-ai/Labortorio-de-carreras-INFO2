# Google Sheets compartido

Esta opcion permite que Design Race Lab guarde pilotos, autos, boxes y marcas en una planilla compartida usando Google Apps Script.

## 1. Crear la planilla

1. Crear una Google Sheet nueva.
2. Ponerle nombre, por ejemplo: `Design Race Lab DB`.
3. Ir a `Extensiones > Apps Script`.

## 2. Pegar el script

1. En Apps Script, abrir `Code.gs`.
2. Borrar el contenido.
3. Pegar todo el contenido de `google-apps-script/Code.gs`.
4. Guardar.

## 3. Publicar como Web App

1. Tocar `Implementar > Nueva implementación`.
2. Tipo: `Aplicación web`.
3. Ejecutar como: `Yo`.
4. Quién tiene acceso: `Cualquier persona`.
5. Tocar `Implementar`.
6. Autorizar permisos.
7. Copiar la URL de la aplicación web.

La URL suele verse parecida a:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## 4. Conectar la app

Abrir `config.js` y pegar la URL:

```js
window.DESIGN_RACE_API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

Luego subir a GitHub:

- `config.js`
- `app.js`
- `index.html`
- `google-apps-script/Code.gs`
- el resto del proyecto

Netlify va a redeployar. Desde ese momento los datos dejan de depender de cada computadora y pasan a sincronizarse con Google Sheets.

## Importante

Si `config.js` queda vacio, la app usa LocalStorage como respaldo local.
