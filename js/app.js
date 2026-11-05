/* ============================================================
   Edimburgo · mapa interactivo de la guía
   Única fuente de datos: data/guia.json
   ============================================================ */
(function () {
  'use strict';

  var DIAS = ['jueves', 'viernes', 'sabado', 'domingo'];
  var DIA_CORTO = { jueves: 'Jue 19', viernes: 'Vie 20', sabado: 'Sáb 21', domingo: 'Dom 22' };
  var COLOR = { jueves: '#4f6478', viernes: '#8a6a35', sabado: '#7b2d3a', domingo: '#1c2b3a' };
  var COLOR_EXC = '#a8844a';

  var ICON_CASA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9.5h4.5v-5h3v5H18V10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  var ICON_EXC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 19.5 9 9l3.6 5.6L15 11l6.5 8.5z" fill="currentColor"/><circle cx="17" cy="6" r="2.2" fill="currentColor"/></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-3.9 0-7 3-7 6.9 0 5.1 7 12.1 7 12.1s7-7 7-12.1c0-3.9-3.1-6.9-7-6.9z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.4" r="2.6" fill="currentColor"/></svg>';

  var G = null;              // guía
  var seq = {};              // dia -> paradas numeradas en orden
  var excItem = null;        // la excursión del viernes
  var casaItem = null;       // el alojamiento
  var excMarkers = [];
  var visible = [];          // marcadores visibles {m, ll}
  var map, markersLayer, linesLayer;
  var meMarker = null, meCircle = null, watchId = null, hadFix = false;

  var state = { filtro: 'todo', sel: null, sheet: 'peek', sheetH: 120 };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    splash: $('splash'), pills: $('pills'), topbar: $('topbar'),
    sheet: $('sheet'), grip: $('grip'), gripBtn: $('gripBtn'), head: $('sheetHead'), body: $('sheetBody'),
    info: $('info'), infoBody: $('infoBody'), infoClose: $('infoClose'),
    btnInfo: $('btnInfo'), btnLocate: $('btnLocate'), toast: $('toast')
  };
  var mqDesk = window.matchMedia('(min-width: 900px)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var isDesk = function () { return mqDesk.matches; };

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function base(file) { return file.replace(/\.(jpe?g|png)$/i, ''); }
  function pic(file, alt, opts) {
    opts = opts || {};
    var b = 'img/' + base(file) + (opts.thumb ? '_t' : '');
    return '<picture><source type="image/webp" srcset="' + b + '.webp">' +
      '<img src="' + b + '.jpg" alt="' + esc(alt) + '" loading="' + (opts.eager ? 'eager' : 'lazy') + '" decoding="async"></picture>';
  }
  function tkey(h) {
    if (/^noche/i.test(h)) return 1440;
    if (/alojamiento/i.test(h)) return 1380;
    var m = String(h).match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : 99999;
  }
  var toastTimer;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, ms || 4500);
  }

  /* ---------- datos ---------- */
  function buildData() {
    DIAS.forEach(function (dia) {
      var items = [];
      G.paradas.forEach(function (p, i) {
        if (p.dia !== dia) return;
        var it = { kind: p.tipo === 'alojamiento' ? 'casa' : 'parada', p: p, dia: dia, key: tkey(p.hora), ord: i };
        if (it.kind === 'casa') casaItem = it;
        items.push(it);
      });
      if (G.excursion_viernes && G.excursion_viernes.dia === dia) {
        excItem = { kind: 'exc', p: G.excursion_viernes, dia: dia, key: tkey(G.excursion_viernes.hora), ord: 1000 };
        items.push(excItem);
      }
      items.sort(function (a, b) { return a.key - b.key || a.ord - b.ord; });
      items.forEach(function (it, i) { it.n = i + 1; it.total = items.length; });
      seq[dia] = items;
    });
  }

  /* ---------- mapa ---------- */
  function pinIcon(it) {
    var html;
    if (it.kind === 'casa') html = '<div class="pin pin-casa">' + ICON_CASA + '</div>';
    else html = '<div class="pin" style="--c:' + COLOR[it.dia] + '">' + it.n + '</div>';
    return L.divIcon({ className: 'pin-wrap', html: html, iconSize: [44, 44], iconAnchor: [22, 22] });
  }
  function excIcon() {
    return L.divIcon({ className: 'pin-wrap pin-wrap-exc', html: '<div class="pin pin-exc">' + ICON_EXC + '</div>', iconSize: [44, 44], iconAnchor: [22, 22] });
  }
  function labelFor(it) {
    if (it.kind === 'casa') return 'Alojamiento: ' + it.p.nombre;
    return DIA_CORTO[it.dia] + ', parada ' + it.n + ': ' + it.p.nombre;
  }
  function a11yMarker(m, label) {
    m.on('add', function () {
      var e = m.getElement();
      if (e) { e.setAttribute('aria-label', label); e.setAttribute('role', 'button'); }
    });
  }

  function initMap() {
    map = L.map('map', {
      zoomControl: false, attributionControl: true,
      center: [55.9505, -3.1935], zoom: 14, minZoom: 6, maxZoom: 19,
      tap: false, zoomSnap: 0.25, zoomDelta: 0.5
    });
    L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>'
    }).addTo(map);
    linesLayer = L.layerGroup().addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    DIAS.forEach(function (dia) {
      seq[dia].forEach(function (it) {
        if (it.kind === 'exc' || it.p.lat == null) return;
        it.ll = L.latLng(it.p.lat, it.p.lng);
        var title = labelFor(it);
        it.marker = L.marker(it.ll, { icon: pinIcon(it), title: title, keyboard: true, riseOnHover: true });
        a11yMarker(it.marker, title);
        it.marker.on('click', function () { openItem(it, { push: true }); });
      });
    });
    excItem.points = [];
    var DIRS = ['bottom', 'top', 'bottom'], k = 0;
    G.excursion_viernes.galeria.forEach(function (g) {
      if (g.lat == null || g.lng == null) return;
      var ll = L.latLng(g.lat, g.lng);
      var title = 'Excursión del viernes: ' + g.nombre;
      var m = L.marker(ll, { icon: excIcon(), title: title, keyboard: true, riseOnHover: true });
      a11yMarker(m, title);
      var dir = DIRS[k++] || 'top';
      m.bindTooltip(esc(g.nombre), { permanent: true, direction: dir, offset: dir === 'bottom' ? [0, 16] : [0, -16], className: 'exc-label' });
      m.on('click', function () { openItem(excItem, { push: true }); });
      excMarkers.push({ m: m, ll: ll });
      excItem.points.push(ll);
    });
    excItem.start = seq.viernes.filter(function (it) { return it.ll; })[0]; // 17 Charlotte Square (la salida)

    map.on('zoomend', spread);
  }

  // Separa marcadores que se solapan en pantalla (Royal Mile y St Giles, etc.)
  function spread() {
    if (!map) return;
    var z = map.getZoom();
    // Separación local: cada marcador se aparta solo lo justo de sus vecinos
    var orig = visible.map(function (o) { var p = map.project(o.ll, z); return { x: p.x, y: p.y }; });
    var pos = orig.map(function (p) { return { x: p.x, y: p.y }; });
    var TH = 34, MAXD = 40;
    for (var it = 0; it < 40; it++) {
      var moved = false;
      for (var i = 0; i < pos.length; i++) {
        for (var j = i + 1; j < pos.length; j++) {
          var dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d >= TH) continue;
          if (d < 0.01) { var a = (i + j) * 2.39996; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
          var push = (TH - d) / 2 + 0.5;
          var ux = dx / d, uy = dy / d;
          pos[i].x -= ux * push; pos[i].y -= uy * push;
          pos[j].x += ux * push; pos[j].y += uy * push;
          moved = true;
        }
      }
      // que ninguno se aleje demasiado de su sitio real
      pos.forEach(function (p, k) {
        var ox = p.x - orig[k].x, oy = p.y - orig[k].y, od = Math.sqrt(ox * ox + oy * oy);
        if (od > MAXD) { p.x = orig[k].x + ox / od * MAXD; p.y = orig[k].y + oy / od * MAXD; }
      });
      if (!moved) break;
    }
    visible.forEach(function (o, k) {
      var same = Math.abs(pos[k].x - orig[k].x) < 0.5 && Math.abs(pos[k].y - orig[k].y) < 0.5;
      o.m.setLatLng(same ? o.ll : map.unproject(L.point(pos[k].x, pos[k].y), z));
    });
  }

  function padding() {
    var size = map.getSize();
    var topH = el.topbar.offsetHeight;
    if (isDesk()) return { l: el.sheet.offsetWidth + 40, t: topH + 20, r: 80, b: 40, size: size };
    return { l: 24, t: topH + 16, r: 66, b: state.sheetH + 24, size: size };
  }
  function fitLLs(lls, maxZoom, extra) {
    if (!lls.length) return;
    var p = padding();
    if (extra) { p.l += extra * 2; p.r += extra; p.t += 20; p.b += 20; }
    var b = L.latLngBounds(lls);
    map.flyToBounds(b, {
      paddingTopLeft: [p.l, p.t], paddingBottomRight: [p.r, p.b],
      maxZoom: maxZoom || 16, duration: mqReduce.matches ? 0 : 0.8, animate: !mqReduce.matches
    });
  }
  function flyToLL(ll, zoom) {
    var p = padding();
    var cx = (p.l + p.size.x - p.r) / 2, cy = (p.t + p.size.y - p.b) / 2;
    var off = L.point(cx - p.size.x / 2, cy - p.size.y / 2);
    var target = map.unproject(map.project(ll, zoom).subtract(off), zoom);
    if (mqReduce.matches) map.setView(target, zoom, { animate: false });
    else map.flyTo(target, zoom, { duration: 0.8 });
  }

  function dayLLs(dia) {
    return seq[dia].filter(function (it) { return it.ll; }).map(function (it) { return it.ll; });
  }

  function drawLayers() {
    markersLayer.clearLayers();
    linesLayer.clearLayers();
    visible = [];
    var f = state.filtro;
    var dias = f === 'todo' ? DIAS : [f];
    // alojamiento siempre visible
    markersLayer.addLayer(casaItem.marker);
    visible.push({ m: casaItem.marker, ll: casaItem.ll });
    dias.forEach(function (dia) {
      seq[dia].forEach(function (it) {
        if (!it.marker || it === casaItem) return;
        markersLayer.addLayer(it.marker);
        visible.push({ m: it.marker, ll: it.ll });
      });
    });
    if (f === 'todo' || f === 'viernes') {
      excMarkers.forEach(function (o) { markersLayer.addLayer(o.m); visible.push(o); });
    }
    if (f !== 'todo') {
      var lls = dayLLs(f).filter(function (ll) { return !(f !== 'jueves' && ll.equals(casaItem.ll)); });
      if (lls.length > 1) {
        L.polyline(lls, { color: COLOR[f], weight: 3.5, opacity: .9, dashArray: '2 9', lineCap: 'round', interactive: false }).addTo(linesLayer);
      }
      if (f === 'viernes') {
        L.polyline([excItem.start.ll].concat(excItem.points), { color: COLOR_EXC, weight: 3.5, opacity: .95, dashArray: '10 10', lineCap: 'round', interactive: false }).addTo(linesLayer);
      }
    }
    spread();
  }

  function fitFiltro() {
    var f = state.filtro;
    if (f === 'todo') {
      var all = [];
      DIAS.forEach(function (d) { all = all.concat(dayLLs(d)); });
      fitLLs(all, 15);
    } else if (f === 'viernes') {
      fitLLs(dayLLs('viernes').concat(excItem.points), 15, 30);
    } else if (f === 'jueves') {
      fitLLs([casaItem.ll], 15);
    } else {
      fitLLs(dayLLs(f), 16);
    }
  }

  function setActiveMarker(it) {
    document.querySelectorAll('.pin-wrap.is-active').forEach(function (n) { n.classList.remove('is-active'); });
    if (!it) return;
    var ms = it.kind === 'exc' ? excMarkers.map(function (o) { return o.m; }) : (it.marker ? [it.marker] : []);
    ms.forEach(function (m) { var e = m.getElement(); if (e) e.classList.add('is-active'); });
  }

  /* ---------- selector de día ---------- */
  function renderPills() {
    var h = '<button type="button" class="pill pill-todo" data-f="todo" aria-pressed="false" aria-label="Todo el viaje"><span class="pill-d">Todo</span></button>';
    DIAS.forEach(function (d) {
      var parts = DIA_CORTO[d].split(' ');
      h += '<button type="button" class="pill" data-f="' + d + '" aria-pressed="false" aria-label="' + esc(G.dias[d].titulo) + '" style="--c:' + COLOR[d] + '">' +
        '<span class="pill-d">' + parts[0] + '</span><span class="pill-n">' + parts[1] + '</span></button>';
    });
    el.pills.innerHTML = h;
    el.pills.addEventListener('click', function (e) {
      var b = e.target.closest('.pill');
      if (!b) return;
      selectFiltro(b.getAttribute('data-f'));
    });
  }
  function syncPills() {
    el.pills.querySelectorAll('.pill').forEach(function (b) {
      var on = b.getAttribute('data-f') === state.filtro;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && b.scrollIntoView) {
        var r = b.getBoundingClientRect(), pr = el.pills.getBoundingClientRect();
        if (r.left < pr.left || r.right > pr.right) el.pills.scrollLeft += (r.left - pr.left) - 12;
      }
    });
  }

  function selectFiltro(f, opts) {
    opts = opts || {};
    state.filtro = f;
    state.sel = null;
    syncPills();
    drawLayers();
    renderList();
    if (!isDesk() && opts.sheet !== false && state.sheet === 'full') setSheet('half');
    else setSheet(state.sheet);
    if (opts.fit !== false) fitFiltro();
    if (opts.hash !== false) writeHash(false);
  }

  /* ---------- panel: lista ---------- */
  function numBadge(it) {
    if (it.kind === 'casa') return '<span class="num num-casa" aria-hidden="true" style="color:#fff">' + ICON_CASA + '</span>';
    if (it.kind === 'exc') return '<span class="num num-exc" aria-hidden="true">' + ICON_EXC + '</span>';
    return '<span class="num" aria-hidden="true" style="--c:' + COLOR[it.dia] + '">' + it.n + '</span>';
  }

  function timeline(dia) {
    var rows = [];
    seq[dia].forEach(function (it) { rows.push({ t: 'stop', it: it, key: it.key, o: it.ord }); });
    G.momentos_sin_lugar.forEach(function (m, i) {
      if (m.dia === dia) rows.push({ t: 'mom', m: m, key: tkey(m.hora), o: 2000 + i });
    });
    var anchor = null;
    if (dia === 'jueves' && G.transporte_aeropuerto && G.transporte_aeropuerto.length) {
      // tras el traslado al alojamiento ("las opciones, a continuación")
      var tras = G.momentos_sin_lugar.filter(function (m) { return m.dia === 'jueves' && /traslado/i.test(m.texto); })[0];
      anchor = (tras ? tkey(tras.hora) : 1335) + 0.5;
      rows.push({ t: 'transport', key: anchor, o: 0 });
    } else if (excItem && excItem.dia === dia) {
      anchor = excItem.key + 0.5;
    }
    G.notas.forEach(function (n, i) {
      if (n.dia === dia) rows.push({ t: 'note', n: n, key: anchor != null ? anchor + 0.1 : 99999, o: 3000 + i });
    });
    rows.sort(function (a, b) { return a.key - b.key || a.o - b.o; });
    return rows;
  }

  function stopRow(it) {
    var p = it.p;
    if (it.kind === 'exc') {
      return '<li class="stop-exc"><button type="button" class="stop-btn" data-dia="' + it.dia + '" data-n="' + it.n + '">' +
        numBadge(it) +
        '<span class="exc-card"><span class="exc-img">' + pic(p.foto_principal, p.nombre, { thumb: false }) + '</span>' +
        '<span class="hora">' + esc(p.hora) + '</span><span class="exc-tag">Excursión</span>' +
        '<span class="stop-text"><span class="name">' + esc(p.nombre) + '</span></span></span></button></li>';
    }
    return '<li><button type="button" class="stop-btn" data-dia="' + it.dia + '" data-n="' + it.n + '">' +
      numBadge(it) +
      '<span class="thumb">' + pic(p.foto, p.nombre, { thumb: true }) + '</span>' +
      '<span class="stop-text"><span class="hora">' + esc(p.hora) + '</span>' +
      '<span class="name">' + esc(p.nombre) + '</span>' +
      '<span class="zona-s">' + esc(p.zona) + '</span></span></button></li>';
  }
  function noteHtml(n) {
    return '<div class="note note-' + esc(n.tipo) + '"><p>' + (n.titulo ? '<strong>' + esc(n.titulo) + '</strong> ' : '') + esc(n.texto) + '</p></div>';
  }
  function transportHtml() {
    var rows = G.transporte_aeropuerto;
    var photos = rows.filter(function (r) { return r.foto; }).map(function (r) {
      return '<figure>' + pic(r.foto, r.opcion, { thumb: false }) + '<figcaption>' + esc(r.opcion) + '</figcaption></figure>';
    }).join('');
    var body = rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r.opcion) + '</th>' +
        '<td data-label="Trayecto">' + esc(r.trayecto) + '</td>' +
        '<td data-label="Detalle">' + esc(r.detalle) + '</td>' +
        '<td data-label="Precio">' + esc(r.precio) + '</td></tr>';
    }).join('');
    return '<section class="transport" aria-labelledby="trTitle"><p class="eyebrow">Llegada</p><h3 id="trTitle">Del aeropuerto al alojamiento</h3>' +
      '<div class="transport-photos">' + photos + '</div>' +
      '<table class="ttable"><thead><tr><th scope="col">Opción</th><th scope="col">Trayecto</th><th scope="col">Detalle</th><th scope="col">Precio</th></tr></thead><tbody>' + body + '</tbody></table></section>';
  }

  function dayListHtml(dia) {
    var h = '<ul class="plan" style="--c:' + COLOR[dia] + '">';
    timeline(dia).forEach(function (r) {
      if (r.t === 'stop') h += stopRow(r.it);
      else if (r.t === 'mom') h += '<li class="moment"><span class="tick" aria-hidden="true"><span></span></span><div><span class="hora hora-soft">' + esc(r.m.hora) + '</span><p>' + esc(r.m.texto) + '</p></div></li>';
      else if (r.t === 'note') h += '<li>' + noteHtml(r.n) + '</li>';
      else if (r.t === 'transport') h += '<li>' + transportHtml() + '</li>';
    });
    return h + '</ul>';
  }

  function renderList() {
    var f = state.filtro;
    var head, body = '';
    if (f === 'todo') {
      head = '<p class="eyebrow">Guía de viaje · Escocia</p><h2>' + esc(G.viaje.titulo) + '</h2><p class="sub">' + esc(G.viaje.fechas) + '</p>';
      DIAS.forEach(function (d, i) {
        body += '<section class="day-block" style="--c:' + COLOR[d] + '"><div class="day-heading"><p class="eyebrow">Día ' + (i + 1) + '</p><h3>' + esc(G.dias[d].titulo) + '</h3><p>' + esc(G.dias[d].subtitulo) + '</p></div>' + dayListHtml(d) + '</section>';
      });
    } else {
      head = '<p class="eyebrow">Día ' + (DIAS.indexOf(f) + 1) + '</p><h2>' + esc(G.dias[f].titulo) + '</h2><p class="sub">' + esc(G.dias[f].subtitulo) + '</p>';
      body = dayListHtml(f);
    }
    el.head.innerHTML = head;
    el.body.innerHTML = body;
    el.body.scrollTop = 0;
    el.sheet.setAttribute('aria-label', f === 'todo' ? 'Plan de todo el viaje' : 'Plan del ' + G.dias[f].titulo);
  }

  el.body.addEventListener('click', function (e) {
    var b = e.target.closest('.stop-btn');
    if (b) {
      var it = findItem(b.getAttribute('data-dia'), +b.getAttribute('data-n'));
      if (it) openItem(it, { push: true });
      return;
    }
    var nav = e.target.closest('[data-go]');
    if (nav && !nav.disabled) { step(+nav.getAttribute('data-go')); return; }
    var g = e.target.closest('[data-lat]');
    if (g) {
      var ll = L.latLng(+g.getAttribute('data-lat'), +g.getAttribute('data-lng'));
      if (!isDesk() && state.sheet === 'full') setSheet('half');
      flyToLL(ll, 13);
    }
  });

  function findItem(dia, n) {
    return (seq[dia] || []).filter(function (it) { return it.n === n; })[0] || null;
  }

  /* ---------- panel: ficha ---------- */
  function fichaHtml(it) {
    var p = it.p, h = '<article class="ficha" aria-labelledby="fichaTitle">';
    var foto = it.kind === 'exc' ? p.foto_principal : p.foto;
    h += '<figure class="hero">' + pic(foto, p.pie_foto || p.nombre, { eager: true }) +
      (p.pie_foto ? '<figcaption class="pie">' + esc(p.pie_foto) + '</figcaption>' : '') + '</figure>';
    h += '<div class="ficha-meta"><span class="hora">' + esc(p.hora) + '</span><span class="zona">' + esc(it.kind === 'exc' ? 'Excursión' : p.zona) + '</span></div>';
    h += '<h3 class="ficha-title" id="fichaTitle">' + esc(p.nombre) + '</h3>';
    h += '@@GO@@';
    h += '<p class="desc">' + esc(p.descripcion) + '</p>';
    if (p.info && p.info.length) {
      h += '<ul class="info-list">' + p.info.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    var link = p.google_maps, linkTxt = 'Cómo llegar';
    if (it.kind === 'exc') {
      if (p.punto_salida) h += '<p class="punto"><strong>Punto de salida:</strong> ' + esc(p.punto_salida) + '</p>';
      h += '<div class="gallery">' + p.galeria.map(function (g) {
        var inner = pic(g.foto, g.nombre, { thumb: false }) + '<span>' + esc(g.nombre) + '</span>';
        if (g.lat != null) return '<button type="button" class="gallery-item" data-lat="' + g.lat + '" data-lng="' + g.lng + '" aria-label="Ver en el mapa: ' + esc(g.nombre) + '">' + inner + '</button>';
        return '<figure class="gallery-item">' + inner.replace('<span>', '<figcaption><span>').replace(/<\/span>$/, '</span></figcaption>') + '</figure>';
      }).join('') + '</div>';
      if (excItem.start) { link = excItem.start.p.google_maps; linkTxt = 'Cómo llegar al punto de salida'; }
    }
    if (p.fotos_extra && p.fotos_extra.length) {
      h += '<div class="extras">' + p.fotos_extra.map(function (f) { return '<figure>' + pic(f, p.nombre) + '</figure>'; }).join('') + '</div>';
    }
    h = h.replace('@@GO@@', link ? '<div class="go-wrap"><a class="btn btn-primary btn-go" href="' + esc(link) + '" target="_blank" rel="noopener">' + ICON_GO + '<span>' + esc(linkTxt) + '</span></a></div>' : '');
    var list = seq[it.dia], prev = list[it.n - 2], next = list[it.n];
    h += '<nav class="ficha-nav" aria-label="Otras paradas del día">' +
      '<button type="button" data-go="-1"' + (prev ? '' : ' disabled') + '><small>Anterior</small><span>' + (prev ? esc(prev.p.nombre) : '—') + '</span></button>' +
      '<button type="button" data-go="1"' + (next ? '' : ' disabled') + '><small>Siguiente</small><span>' + (next ? esc(next.p.nombre) : '—') + '</span></button></nav>';
    return h + '</article>';
  }

  function fichaHead(it) {
    var list = seq[it.dia];
    return '<div class="head-nav">' +
      '<button type="button" class="back" id="btnBack">' + ICON_BACK + '<span>Volver</span></button>' +
      '<span class="count" aria-hidden="true">' + it.n + ' / ' + list.length + '</span>' +
      '<button type="button" class="icon-btn" data-go="-1" aria-label="Parada anterior"' + (it.n > 1 ? '' : ' disabled') + '>' + ICON_BACK + '</button>' +
      '<button type="button" class="icon-btn" data-go="1" aria-label="Parada siguiente"' + (it.n < list.length ? '' : ' disabled') + '>' + ICON_NEXT + '</button>' +
      '</div><p class="head-where">' + esc(G.dias[it.dia].titulo) + ' · parada ' + it.n + ' de ' + list.length + '</p>' +
      '<p class="head-title">' + esc(it.p.nombre) + '</p>';
  }

  el.head.addEventListener('click', function (e) {
    if (e.target.closest('#btnBack')) { closeFicha(true); return; }
    var nav = e.target.closest('[data-go]');
    if (nav && !nav.disabled) step(+nav.getAttribute('data-go'));
  });

  function step(d) {
    if (!state.sel) return;
    var it = findItem(state.sel.dia, state.sel.n + d);
    if (it) openItem(it, { push: false });
  }

  function openItem(it, opts) {
    opts = opts || {};
    if (state.filtro !== 'todo' && state.filtro !== it.dia && !(it === casaItem)) {
      selectFiltro(it.dia, { fit: false, hash: false });
    }
    state.sel = it;
    el.head.innerHTML = fichaHead(it);
    el.body.innerHTML = fichaHtml(it);
    el.body.scrollTop = 0;
    var hero = el.body.querySelector('.hero img');
    if (hero) {
      var mark = function () { if (hero.naturalHeight > hero.naturalWidth) hero.closest('.hero').classList.add('is-tall'); };
      if (hero.complete) mark(); else hero.addEventListener('load', mark);
    }
    el.sheet.setAttribute('aria-label', 'Ficha: ' + it.p.nombre);
    if (!isDesk() && state.sheet !== 'full') setSheet('half'); else setSheet(state.sheet);
    setActiveMarker(it);
    if (it.kind === 'exc') fitLLs([excItem.start.ll].concat(excItem.points), 12, 30);
    else flyToLL(it.ll, Math.max(16, Math.min(map.getZoom(), 17)));
    writeHash(!!opts.push);
    if (opts.focus !== false) {
      var t = el.body.querySelector('#fichaTitle');
      if (t) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (_) { t.focus(); } }
    }
  }

  function closeFicha(writeH) {
    var prev = state.sel;
    state.sel = null;
    setActiveMarker(null);
    renderList();
    setSheet(state.sheet);
    if (prev) {
      var b = el.body.querySelector('.stop-btn[data-dia="' + prev.dia + '"][data-n="' + prev.n + '"]');
      if (b) {
        b.scrollIntoView({ block: 'center' });
        try { b.focus({ preventScroll: true }); } catch (_) { b.focus(); }
      }
    }
    if (writeH) writeHash(false);
  }

  /* ---------- panel deslizable ---------- */
  function heights() {
    var H = window.innerHeight;
    var topH = el.topbar.offsetHeight;
    var peek = el.grip.offsetHeight + el.head.offsetHeight + 6;
    var full = Math.max(peek + 60, H - topH - 4);
    var half = Math.min(full, Math.max(peek + 60, Math.round(H * 0.5)));
    return { peek: peek, half: half, full: full };
  }
  function setH(h) {
    state.sheetH = h;
    document.documentElement.style.setProperty('--sheet-h', (isDesk() ? 0 : h) + 'px');
  }
  function setSheet(name) {
    state.sheet = name;
    el.sheet.setAttribute('data-state', name);
    document.documentElement.style.setProperty('--top-h', el.topbar.offsetHeight + 'px');
    if (isDesk()) { setH(0); return; }
    setH(heights()[name]);
    el.gripBtn.setAttribute('aria-label', name === 'full' ? 'Plegar el panel' : 'Ampliar el panel');
  }
  function cycleSheet() {
    setSheet(state.sheet === 'peek' ? 'half' : state.sheet === 'half' ? 'full' : 'peek');
  }

  (function initDrag() {
    var startY = 0, startH = 0, dragging = false, active = false, lastY = 0, lastT = 0, v = 0, justDragged = false, pid = null;
    function down(e) {
      if (isDesk()) return;
      if (e.button != null && e.button !== 0) return;
      var onBtn = e.target.closest('button, a');
      if (onBtn && onBtn !== el.gripBtn) return;
      active = true; dragging = false;
      startY = lastY = e.clientY; lastT = performance.now(); v = 0;
      startH = state.sheetH; pid = e.pointerId;
    }
    function move(e) {
      if (!active || e.pointerId !== pid) return;
      var dy = e.clientY - startY;
      if (!dragging && Math.abs(dy) > 6) {
        dragging = true;
        el.sheet.classList.add('is-dragging');
        try { (e.currentTarget || el.sheet).setPointerCapture(pid); } catch (_) {}
      }
      if (!dragging) return;
      var hs = heights();
      var h = Math.max(hs.peek, Math.min(hs.full, startH - dy));
      var now = performance.now();
      v = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY; lastT = now;
      setH(h);
      e.preventDefault();
    }
    function up(e) {
      if (!active || e.pointerId !== pid) return;
      active = false;
      if (!dragging) {
        if (!e.target.closest('button, a')) cycleSheet();
        return;
      }
      el.sheet.classList.remove('is-dragging');
      justDragged = true; setTimeout(function () { justDragged = false; }, 80);
      var hs = heights(), h = state.sheetH;
      var order = ['peek', 'half', 'full'];
      var target;
      if (v < -0.45) target = order.filter(function (k) { return hs[k] > h + 10; })[0] || 'full';
      else if (v > 0.45) target = order.slice().reverse().filter(function (k) { return hs[k] < h - 10; })[0] || 'peek';
      else target = order.reduce(function (a, k) { return Math.abs(hs[k] - h) < Math.abs(hs[a] - h) ? k : a; }, 'peek');
      setSheet(target);
    }
    [el.grip, el.head].forEach(function (n) {
      n.addEventListener('pointerdown', down);
      n.addEventListener('pointermove', move);
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', function () { active = false; dragging = false; el.sheet.classList.remove('is-dragging'); setSheet(state.sheet); });
    });
    el.gripBtn.addEventListener('click', function () { if (!justDragged) cycleSheet(); });
  })();

  /* ---------- enlaces directos (#sabado/7) ---------- */
  function hashFor() {
    if (state.sel) return '#' + state.sel.dia + '/' + state.sel.n;
    return '#' + state.filtro;
  }
  function writeHash(push) {
    var h = hashFor();
    if (location.hash === h) return;
    try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (_) { location.hash = h; }
  }
  function parseHash() {
    var m = decodeURIComponent(location.hash.replace(/^#/, '')).match(/^(todo|jueves|viernes|sabado|domingo)(?:\/(\d+))?$/);
    if (!m) return null;
    return { f: m[1], n: m[2] ? +m[2] : null };
  }
  function applyHash(first) {
    var h = parseHash();
    if (!h) { if (!first) { if (state.sel) closeFicha(false); selectFiltro('todo', { hash: false }); } return false; }
    var it = h.n && h.f !== 'todo' ? findItem(h.f, h.n) : null;
    if (it) {
      if (first || (state.filtro !== 'todo' && state.filtro !== h.f)) selectFiltro(h.f, { fit: false, hash: false });
      openItem(it, { push: false, focus: !first });
    } else {
      if (state.sel) state.sel = null;
      selectFiltro(h.f, { hash: false });
    }
    return true;
  }
  window.addEventListener('popstate', function () { applyHash(false); });

  /* ---------- información ---------- */
  function photoLabels() {
    var lab = {};
    function add(f, t) { if (f && !lab[f]) lab[f] = t; }
    add(G.viaje.portada, 'Portada');
    G.paradas.forEach(function (p) { add(p.foto, p.nombre); (p.fotos_extra || []).forEach(function (f) { add(f, p.nombre); }); });
    var e = G.excursion_viernes;
    add(e.foto_principal, 'Excursión del viernes');
    e.galeria.forEach(function (g) { add(g.foto, g.nombre); });
    G.transporte_aeropuerto.forEach(function (t) { add(t.foto, t.opcion); });
    return lab;
  }
  function renderInfo() {
    var v = G.viaje, a = v.alojamiento, lab = photoLabels();
    var h = '<h2 id="infoTitle">' + esc(v.titulo) + '</h2><p class="sub">' + esc(v.fechas) + '</p><p class="lead">' + esc(v.subtitulo) + '</p>';
    h += '<h3>Vuelos</h3><dl class="kv"><dt>Llegada</dt><dd>' + esc(v.vuelo_llegada) + '</dd><dt>Vuelta</dt><dd>' + esc(v.vuelo_vuelta) + '</dd></dl>';
    h += '<h3>Nuestro alojamiento</h3><div class="stay"><p class="eyebrow">' + esc(a.fechas) + '</p><strong>' + esc(a.nombre) + '</strong><p>' + esc(a.direccion) + '</p>' +
      '<a class="btn" href="' + esc(casaItem.p.google_maps) + '" target="_blank" rel="noopener">' + ICON_GO + 'Cómo llegar</a></div>';
    h += '<h3>Datos útiles</h3><ul class="info-list">' + G.datos_utiles.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>';
    h += '<h3>Créditos de las fotos</h3><p class="small">Todas las fotos proceden de Wikimedia Commons y se usan según sus licencias.</p><ol class="credits">' +
      G.fotos.map(function (f) {
        return '<li><strong>' + esc(lab[f.archivo] || f.archivo) + '</strong><span class="meta">' + esc(f.autor) + ' · ' + esc(f.licencia) + '</span> · ' +
          '<a href="' + esc(f.pagina_commons) + '" target="_blank" rel="noopener">Ver en Wikimedia Commons</a></li>';
      }).join('') + '</ol>';
    h += '<h3>Mapa</h3><p class="small">Mapa: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>, con <a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>.</p>';
    el.infoBody.innerHTML = h;
  }
  var lastFocus = null;
  function openInfo() {
    lastFocus = document.activeElement;
    el.info.hidden = false;
    el.infoBody.scrollTop = 0;
    el.infoClose.focus();
  }
  function closeInfo() {
    el.info.hidden = true;
    (lastFocus && lastFocus.focus ? lastFocus : el.btnInfo).focus();
  }
  el.btnInfo.addEventListener('click', openInfo);
  el.infoClose.addEventListener('click', closeInfo);
  el.info.addEventListener('click', function (e) { if (e.target === el.info) closeInfo(); });
  el.info.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = el.info.querySelectorAll('button, a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- dónde estoy ---------- */
  el.btnLocate.addEventListener('click', function () {
    if (!('geolocation' in navigator)) { toast('Vaya, chicas: este navegador no permite ver la ubicación.'); return; }
    if (!window.isSecureContext) { toast('Para ver dónde estáis, la web tiene que abrirse con https.'); return; }
    if (meMarker && watchId != null) { flyToLL(meMarker.getLatLng(), Math.max(map.getZoom(), 16)); return; }
    toast('Buscando dónde estáis…', 8000);
    hadFix = false;
    watchId = navigator.geolocation.watchPosition(function (pos) {
      var ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: pos.coords.accuracy, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: .12, interactive: false }).addTo(map);
        meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: false, zIndexOffset: 2000, title: 'Estáis aquí' }).addTo(map);
      } else {
        meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      }
      el.btnLocate.classList.add('is-on');
      if (!hadFix) {
        hadFix = true;
        el.toast.classList.remove('is-on');
        flyToLL(ll, Math.max(map.getZoom(), 16));
      }
    }, function (err) {
      if (err.code === 1) {
        toast('Sin permiso de ubicación no podemos enseñaros dónde estáis, chicas. Si queréis, activadlo en los ajustes del navegador para esta web y volved a pulsar el botón.', 7500);
        stopWatch();
      } else if (!hadFix) {
        toast('No hemos podido encontrar vuestra ubicación ahora mismo. Probad otra vez en un momento.', 6000);
        stopWatch();
      }
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  });
  function stopWatch() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    el.btnLocate.classList.remove('is-on');
  }

  /* ---------- teclado ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!el.info.hidden) { closeInfo(); return; }
      if (!el.splash.classList.contains('is-hidden')) return;
      if (state.sel) closeFicha(true);
      return;
    }
    if (!el.info.hidden || !state.sel) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.target.closest && e.target.closest('.leaflet-container')) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  /* ---------- portada ---------- */
  function hideSplash() {
    el.splash.classList.add('is-hidden');
    el.splash.setAttribute('aria-hidden', 'true');
    map.invalidateSize();
    setSheet(state.sheet);
    fitFiltro();
    var p = el.pills.querySelector('[aria-pressed="true"]');
    if (p) p.focus();
  }
  $('splashGo').addEventListener('click', hideSplash);

  window.addEventListener('resize', function () {
    if (!map) return;
    map.invalidateSize();
    setSheet(state.sheet);
  });
  if (mqDesk.addEventListener) mqDesk.addEventListener('change', function () { setSheet(state.sheet); map.invalidateSize(); });

  /* ---------- arranque ---------- */
  function start(data) {
    G = data;
    $('splashDates').textContent = G.viaje.fechas;
    $('splashSub').textContent = G.viaje.subtitulo;
    buildData();
    renderPills();
    initMap();
    renderInfo();
    var hasHash = applyHash(true);
    if (!hasHash) selectFiltro('todo', { hash: false, fit: false });
    if (hasHash) {
      el.splash.classList.add('is-hidden');
      el.splash.setAttribute('aria-hidden', 'true');
      if (!state.sel) fitFiltro();
    } else {
      setSheet('peek');
      fitFiltro();
      $('splashGo').focus();
    }
    requestAnimationFrame(function () { setSheet(state.sheet); });
  }

  fetch('data/guia.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function (err) {
      console.error(err);
      toast('No se ha podido cargar la guía. Revisad la conexión y recargad la página, chicas.', 15000);
    });
})();
