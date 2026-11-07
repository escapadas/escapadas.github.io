/* ============================================================
   El tiempo en Edimburgo · Open-Meteo (gratis, sin clave)
   Botón con el tiempo actual + panel con la previsión de 15 días
   ============================================================ */
(function () {
  'use strict';

  var LAT = 55.9533, LNG = -3.1883; // centro de Edimburgo
  var URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + LAT + '&longitude=' + LNG +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation' +
    '&hourly=precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset' +
    '&timezone=Europe%2FLondon&forecast_days=15&wind_speed_unit=kmh';
  var VIAJE = { '2026-11-19': 1, '2026-11-20': 1, '2026-11-21': 1, '2026-11-22': 1 };
  var CACHE_KEY = 'edimburgo-tiempo-v2';
  var MAX_AGE = 30 * 60 * 1000; // 30 minutos

  var btn = document.getElementById('btnTiempo');
  var panel = document.getElementById('tiempo');
  var body = document.getElementById('tiempoBody');
  var closeBtn = document.getElementById('tiempoClose');
  if (!btn || !panel) return;

  var data = null, fetchedAt = 0, loading = false, lastFocus = null;

  /* ---------- iconos (mismo trazo que el resto de la web) ---------- */
  var SUN = '<circle cx="16" cy="16" r="5.6" fill="#e9c46a" stroke="#a8844a" stroke-width="1.6"/>' +
    '<g stroke="#a8844a" stroke-width="1.9" stroke-linecap="round"><path d="M16 3.5v3M16 25.5v3M3.5 16h3M25.5 16h3M7.2 7.2l2.1 2.1M22.7 22.7l2.1 2.1M7.2 24.8l2.1-2.1M22.7 9.3l2.1-2.1"/></g>';
  var MOON = '<path d="M20.5 5.5a10.5 10.5 0 1 0 6 18.2A9 9 0 0 1 20.5 5.5z" fill="#efe6d2" stroke="#1c2b3a" stroke-width="1.7" stroke-linejoin="round"/>';
  var SMALL_SUN = '<circle cx="11" cy="11" r="4.4" fill="#e9c46a" stroke="#a8844a" stroke-width="1.5"/>' +
    '<g stroke="#a8844a" stroke-width="1.7" stroke-linecap="round"><path d="M11 2.5v2.2M2.5 11h2.2M5 5l1.6 1.6M17 5l-1.6 1.6M5 17l1.6-1.6"/></g>';
  var SMALL_MOON = '<path d="M14 3.5a7.5 7.5 0 1 0 4.4 12.8A6.3 6.3 0 0 1 14 3.5z" fill="#efe6d2" stroke="#1c2b3a" stroke-width="1.5" stroke-linejoin="round"/>';
  function cloud(y, fill) {
    y = y || 0;
    return '<path transform="translate(0 ' + y + ')" d="M9.5 24.5h14.2a5.3 5.3 0 0 0 .6-10.6 7.4 7.4 0 0 0-14.2 1.8 4.4 4.4 0 0 0-.6 8.8z" fill="' + (fill || '#ffffff') + '" stroke="#1c2b3a" stroke-width="1.8" stroke-linejoin="round"/>';
  }
  function drops(n) {
    var xs = n === 3 ? [11, 16, 21] : [12.5, 19.5];
    return '<g stroke="#3f6e9a" stroke-width="2" stroke-linecap="round">' +
      xs.map(function (x) { return '<path d="M' + x + ' 26.5l-1.4 3.2"/>'; }).join('') + '</g>';
  }
  function flakes() {
    return '<g fill="#1c2b3a">' + [11, 16, 21].map(function (x) { return '<circle cx="' + x + '" cy="28" r="1.4"/>'; }).join('') + '</g>';
  }
  function bolt() {
    return '<path d="M17 23.5l-3 4.5h3l-1.5 3.5 4.5-5.5h-3l1.8-2.5z" fill="#e9c46a" stroke="#a8844a" stroke-width="1" stroke-linejoin="round"/>';
  }
  function fog() {
    return '<g stroke="#1c2b3a" stroke-width="1.9" stroke-linecap="round"><path d="M6 12h20M4 17h24M7 22h18M10 27h12"/></g>';
  }
  function icon(code, isDay) {
    var day = isDay !== 0;
    var g;
    if (code === 0) g = day ? SUN : MOON;
    else if (code === 1 || code === 2) g = (day ? SMALL_SUN : SMALL_MOON) + cloud(code === 1 ? 2 : 0);
    else if (code === 3) g = cloud(0, '#dfe4ea');
    else if (code === 45 || code === 48) g = fog();
    else if (code >= 51 && code <= 57) g = cloud(-3) + drops(2);
    else if (code >= 61 && code <= 67) g = cloud(-3) + drops(3);
    else if (code >= 80 && code <= 82) g = (day ? SMALL_SUN : SMALL_MOON) + cloud(-1) + drops(code === 80 ? 2 : 3);
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) g = cloud(-3) + flakes();
    else if (code >= 95) g = cloud(-3, '#dfe4ea') + bolt();
    else g = cloud(0);
    return '<svg class="wx-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' + g + '</svg>';
  }
  var TEXTO = {
    0: 'Despejado', 1: 'Casi despejado', 2: 'Intervalos nubosos', 3: 'Cubierto',
    45: 'Niebla', 48: 'Niebla con escarcha',
    51: 'Llovizna débil', 53: 'Llovizna', 55: 'Llovizna intensa', 56: 'Llovizna helada', 57: 'Llovizna helada intensa',
    61: 'Lluvia débil', 63: 'Lluvia', 65: 'Lluvia fuerte', 66: 'Lluvia helada', 67: 'Lluvia helada fuerte',
    71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve fuerte', 77: 'Granizo fino',
    80: 'Chubascos débiles', 81: 'Chubascos', 82: 'Chubascos fuertes',
    85: 'Chubascos de nieve', 86: 'Chubascos de nieve fuertes',
    95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta con granizo fuerte'
  };
  function texto(code) { return TEXTO[code] || 'Tiempo variable'; }

  var ICO_DROP = '<svg class="mini" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8C6 4.6 3.8 7.2 3.8 9.9a4.2 4.2 0 0 0 8.4 0C12.2 7.2 10 4.6 8 1.8z" fill="#3f6e9a"/></svg>';
  function arrow(deg) {
    // la flecha apunta hacia donde sopla el viento
    return '<svg class="mini wind-arrow" viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(' + Math.round((deg + 180) % 360) + 'deg)"><path d="M8 1.5l4 6H9.2v7H6.8v-7H4z" fill="#1c2b3a"/></svg>';
  }
  var PUNTOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
  var PUNTOS_C = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function rumbo(deg, corto) { var i = Math.round(((deg % 360) + 360) % 360 / 45) % 8; return (corto ? PUNTOS_C : PUNTOS)[i]; }
  function r(n) { return Math.round(n); }
  function fmtTemp(n) { return r(n) + '°'; }

  /* ---------- fechas ---------- */
  function ymd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  function nombreDia(s, i) {
    if (i === 0) return 'Hoy';
    if (i === 1) return 'Mañana';
    var t = fmtDia.format(ymd(s)).replace(/\.$/, '').replace(',', '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function hora(iso) { return iso ? iso.slice(11, 16) : ''; }

  /* ---------- datos ---------- */
  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.data && c.at) { data = c.data; fetchedAt = c.at; }
    } catch (_) {}
  }
  function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, at: fetchedAt })); } catch (_) {}
  }
  function load(force) {
    if (loading) return;
    if (!force && data && Date.now() - fetchedAt < MAX_AGE) { render(); return; }
    loading = true;
    btn.setAttribute('aria-busy', 'true');
    fetch(URL, { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (d) {
        if (!d || !d.current || !d.daily) throw new Error('respuesta incompleta');
        data = d; fetchedAt = Date.now(); writeCache();
      })
      .catch(function (e) { console.warn('Tiempo: no se pudo actualizar', e); })
      .then(function () { loading = false; btn.removeAttribute('aria-busy'); render(); });
  }

  function lluviaAhora() {
    var h = data.hourly, t = data.current.time.slice(0, 13);
    if (!h || !h.time) return null;
    for (var i = 0; i < h.time.length; i++) if (h.time[i].slice(0, 13) === t) return h.precipitation_probability[i];
    return null;
  }

  /* ---------- pintar ---------- */
  function renderBtn() {
    if (!data) {
      btn.innerHTML = icon(3, 1) + '<span class="wx-temp">—</span>';
      btn.setAttribute('aria-label', 'El tiempo en Edimburgo (sin datos ahora mismo)');
      return;
    }
    var c = data.current;
    btn.innerHTML = icon(c.weather_code, c.is_day) + '<span class="wx-temp">' + fmtTemp(c.temperature_2m) + '</span>';
    btn.setAttribute('aria-label', 'El tiempo en Edimburgo ahora: ' + texto(c.weather_code) + ', ' + r(c.temperature_2m) + ' grados. Ver la previsión de 15 días');
  }

  function renderPanel() {
    if (!data) {
      body.innerHTML = '<h2 id="tiempoTitle">Edimburgo</h2>' +
        '<p class="wx-error">' + (loading ? 'Cargando la previsión…' : 'No hemos podido cargar el tiempo ahora mismo, chicas. Revisad la conexión y probad otra vez.') + '</p>' +
        (loading ? '' : '<button type="button" class="btn btn-primary" data-wx-retry>Reintentar</button>');
      return;
    }
    var c = data.current, d = data.daily, p = lluviaAhora();
    var h = '<h2 id="tiempoTitle">Edimburgo</h2>' +
      '<p class="sub">Ahora · ' + hora(c.time) + ' h (hora local)</p>';

    h += '<section class="wx-now" aria-label="Tiempo actual">' +
      '<div class="wx-now-main">' + icon(c.weather_code, c.is_day) +
      '<div><p class="wx-now-temp">' + fmtTemp(c.temperature_2m) + '</p>' +
      '<p class="wx-now-desc">' + texto(c.weather_code) + '</p>' +
      '<p class="wx-now-feel">Sensación de ' + fmtTemp(c.apparent_temperature) + '</p></div></div>' +
      '<dl class="wx-stats">' +
      '<div><dt>Lluvia</dt><dd>' + ICO_DROP + (p != null ? p + ' %' : '—') + '</dd></div>' +
      '<div><dt>Viento</dt><dd>' + arrow(c.wind_direction_10m) + r(c.wind_speed_10m) + ' km/h</dd><dd class="wx-small">del ' + rumbo(c.wind_direction_10m) + ' · rachas de ' + r(c.wind_gusts_10m) + ' km/h</dd></div>' +
      '<div><dt>Humedad</dt><dd>' + r(c.relative_humidity_2m) + ' %</dd></div>' +
      '<div><dt>Luz hoy</dt><dd>' + hora(d.sunrise[0]) + ' – ' + hora(d.sunset[0]) + '</dd></div>' +
      '</dl></section>';

    h += '<h3>Próximos ' + d.time.length + ' días</h3><ol class="wx-days">';
    for (var i = 0; i < d.time.length; i++) {
      if (i === 7) {
        h += '</ol><div class="wx-split"><p class="eyebrow">Más adelante</p><p>A partir del octavo día la previsión es <strong>orientativa</strong>: puede cambiar bastante de un día para otro.</p></div><ol class="wx-days wx-days-far">';
      }
      var viaje = VIAJE[d.time[i]];
      h += '<li class="wx-day' + (viaje ? ' is-viaje' : '') + '">' +
        '<div class="wx-day-name"><strong>' + nombreDia(d.time[i], i) + '</strong>' + (viaje ? '<span class="wx-tag">Viaje</span>' : '') +
        '<span class="wx-day-desc">' + texto(d.weather_code[i]) + '</span></div>' +
        icon(d.weather_code[i], 1) +
        '<div class="wx-day-temp"><span class="max" aria-label="máxima">' + fmtTemp(d.temperature_2m_max[i]) + '</span><span class="min" aria-label="mínima">' + fmtTemp(d.temperature_2m_min[i]) + '</span></div>' +
        '<div class="wx-day-extra">' +
        '<span title="Probabilidad de lluvia">' + ICO_DROP + '<span class="visually-hidden">Lluvia: </span>' + (d.precipitation_probability_max[i] != null ? d.precipitation_probability_max[i] + ' %' : '—') +
        (d.precipitation_sum[i] >= 0.1 ? ' <small>· ' + String(Math.round(d.precipitation_sum[i] * 10) / 10).replace('.', ',') + ' mm</small>' : '') + '</span>' +
        '<span title="Viento máximo">' + arrow(d.wind_direction_10m_dominant[i]) + '<span class="visually-hidden">Viento del ' + rumbo(d.wind_direction_10m_dominant[i]) + ': </span>' +
        r(d.wind_speed_10m_max[i]) + ' km/h <small>· rachas ' + r(d.wind_gusts_10m_max[i]) + '</small></span>' +
        '</div></li>';
    }
    h += '</ol>';

    var faltan = Object.keys(VIAJE).filter(function (t) { return d.time.indexOf(t) < 0 && t > d.time[d.time.length - 1]; });
    if (faltan.length) {
      h += '<div class="note note-tip"><p><strong>' + (faltan.length === 4 ? 'Los días del viaje (19–22 nov)' : 'El resto de días del viaje') + '</strong> aparecerán aquí en cuanto entren en la previsión, que llega hasta 15 días vista.</p></div>';
    }
    var act = new Date(fetchedAt);
    var viejo = Date.now() - fetchedAt > MAX_AGE * 2;
    h += '<p class="small wx-source">' + (viejo ? 'Sin conexión: datos guardados de las ' : 'Actualizado a las ') +
      String(act.getHours()).padStart(2, '0') + ':' + String(act.getMinutes()).padStart(2, '0') +
      '. Previsión de <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0).</p>';
    body.innerHTML = h;
  }

  function render() { renderBtn(); if (!panel.hidden) renderPanel(); }

  /* ---------- panel ---------- */
  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    renderPanel();
    body.scrollTop = 0;
    closeBtn.focus();
    load(false);
  }
  function close() {
    panel.hidden = true;
    (lastFocus && lastFocus.focus ? lastFocus : btn).focus();
  }
  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  panel.addEventListener('click', function (e) {
    if (e.target === panel) close();
    if (e.target.closest('[data-wx-retry]')) { load(true); renderPanel(); }
  });
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = panel.querySelectorAll('button, a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  readCache();
  renderBtn();
  load(false);
  setInterval(function () { if (!document.hidden) load(false); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(false); });
})();
