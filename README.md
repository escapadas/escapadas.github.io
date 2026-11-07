# Edimburgo · mapa interactivo de la guía

Web estática (HTML + CSS + JavaScript, sin backend) con el plan del viaje a Edimburgo del 19 al 22 de noviembre de 2026. Se abre con un enlace en el navegador del móvil (Safari en iPhone, Chrome en Android). No se instala nada: no hay manifest, service worker ni APK.

## Estructura

```
index.html          Página única
css/styles.css      Estilos (paleta y tipografías de la guía en PDF)
js/app.js           Lógica: mapa, selector de día, panel, fichas, enlaces directos
js/tiempo.js        El tiempo: botón con el tiempo actual y previsión de 7 días
data/guia.json      Única fuente de datos (textos, horas, precios, coordenadas, créditos)
img/                Fotos optimizadas: <nombre>.webp/.jpg (máx. 1200 px) y <nombre>_t.webp/_t.jpg (miniaturas)
vendor/leaflet/     Leaflet 1.9.4 (copia local, sin CDN)
```

Mapa: Leaflet con teselas de OpenStreetMap (sin claves de API). Fuentes: Google Fonts (Cormorant Garamond e Inter).

## El tiempo

El botón con el icono y la temperatura (arriba a la derecha del mapa) muestra el tiempo actual en Edimburgo. Al pulsarlo se abre la previsión de 7 días con probabilidad de lluvia, temperatura máxima y mínima, y viento con sus rachas. Los días del viaje (19–22 nov) salen marcados. Los datos son de [Open-Meteo](https://open-meteo.com/) (gratis, sin clave, licencia CC BY 4.0), se actualizan cada 30 minutos y, si no hay conexión, se muestran los últimos guardados.

## Verlo en local

Hace falta un servidor sencillo, porque el navegador no deja leer `data/guia.json` abriendo el archivo con doble clic.

Desde esta carpeta:

```bash
python -m http.server 8000
```

y abrid http://localhost:8000 en el navegador.

Para probarlo en el móvil dentro de la misma wifi, usad la IP del ordenador (por ejemplo `http://192.168.1.20:8000`). El botón «Dónde estoy» solo funciona con https o en `localhost`, así que para probarlo en el móvil lo mejor es publicarlo primero.

## Publicar gratis en GitHub Pages

1. Cread una cuenta en https://github.com si no tenéis.
2. Pulsad **New repository**, ponedle un nombre (por ejemplo `edimburgo`) y marcadlo como **Public**.
3. Subid **el contenido de esta carpeta** (`index.html`, `css/`, `js/`, `data/`, `img/`, `vendor/`, `.nojekyll`, `README.md`):
   - Desde la web: **Add file → Upload files**, arrastrad todo y pulsad **Commit changes**.
   - O con git:
     ```bash
     git init
     git add .
     git commit -m "Mapa de Edimburgo"
     git branch -M main
     git remote add origin https://github.com/VUESTRO_USUARIO/edimburgo.git
     git push -u origin main
     ```
4. En el repositorio, id a **Settings → Pages**. En *Build and deployment*, elegid **Deploy from a branch**, rama **main** y carpeta **/ (root)**, y pulsad **Save**.
5. En uno o dos minutos aparecerá arriba el enlace, del tipo `https://VUESTRO_USUARIO.github.io/edimburgo/`. Ese es el enlace para compartir por WhatsApp.

La web usa rutas relativas, así que funciona dentro de una subcarpeta como `/edimburgo/` sin tocar nada.

### Alternativa: Netlify

Entrad en https://app.netlify.com/drop y arrastrad esta carpeta. Os da un enlace https al momento.

## Enlaces directos a un día o una parada

La dirección guarda lo que tenéis abierto, así que podéis copiarla y mandarla tal cual:

- `…/#todo` todo el viaje
- `…/#sabado` el plan del sábado
- `…/#sabado/7` la ficha de la parada 7 del sábado (St Giles’ Cathedral)
- `…/#viernes/2` la excursión del viernes
- `…/#jueves/1` el alojamiento

Los días son `jueves`, `viernes`, `sabado` y `domingo`. Las paradas se numeran por orden horario dentro de cada día.

## Cambiar datos

Todo el contenido sale de `data/guia.json`. Si cambia una hora, un precio o un texto, editad solo ese archivo y volved a subirlo. No hace falta tocar el código.

## Créditos

Las fotos son de Wikimedia Commons y se usan con sus licencias (CC BY, CC BY-SA, CC0…). Los créditos completos (autor, licencia y enlace) están en el botón **Información** de la web y son obligatorios: no los quitéis. Mapa © colaboradores de OpenStreetMap.
