// ==============================================================================
// MEDIDORES CHARTS - RENDERIZADO NATIVO CANVAS 2D (feat-028)
// Sin dependencias externas: CSP-safe, offline-first, PWA-friendly.
// ==============================================================================

(function () {
  const PALETA = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const COLOR_EJE = "#64748b";
  const COLOR_GRID = "rgba(100, 116, 139, 0.18)";

  function prepararCanvas(canvas, altura = 260) {
    const dpr = window.devicePixelRatio || 1;
    const anchoCss = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    canvas.style.width = "100%";
    canvas.style.height = `${altura}px`;
    canvas.width = Math.round(anchoCss * dpr);
    canvas.height = Math.round(altura * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, anchoCss, altura);
    return { ctx, w: anchoCss, h: altura };
  }

  function textoVacio(ctx, w, h, mensaje) {
    ctx.fillStyle = COLOR_EJE;
    ctx.font = "13px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(mensaje, w / 2, h / 2);
  }

  function dibujarLinea(canvas, series, opciones = {}) {
    if (!canvas) return;
    const altura = opciones.altura || 260;
    const { ctx, w, h } = prepararCanvas(canvas, altura);
    const todas = (series || []).filter((s) => s.puntos?.some(p => p.valor !== null && Number.isFinite(Number(p.valor)))).slice(0, 8);
    if (todas.length === 0) {
      textoVacio(ctx, w, h, "Sin consumos en el rango seleccionado.");
      return;
    }
    const pad = { l: 52, r: 12, t: 28, b: 30 };
    let minV = Infinity;
    let maxV = -Infinity;
    let minT = Infinity;
    let maxT = -Infinity;
    const parsed = todas.map((s) => ({
      meta: s,
      pts: s.puntos
        .map((p) => ({ t: new Date(p.fecha).getTime(), v: p.valor === null ? null : Number(p.valor) }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t),
    }));
    for (const s of parsed) {
      for (const p of s.pts) {
        if (p.v === null || !Number.isFinite(p.v)) continue;
        if (p.v < minV) minV = p.v;
        if (p.v > maxV) maxV = p.v;
        if (p.t < minT) minT = p.t;
        if (p.t > maxT) maxT = p.t;
      }
    }
    if (!Number.isFinite(minV)) {
      textoVacio(ctx, w, h, "Sin dos lecturas comparables.");
      return;
    }
    minV = 0;
    maxV = Math.max(maxV, 1);
    if (minT === maxT) { minT -= 86400000; maxT += 86400000; }

    const X = (t) => pad.l + ((t - minT) / (maxT - minT)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * (h - pad.t - pad.b);

    ctx.strokeStyle = COLOR_GRID;
    ctx.fillStyle = COLOR_EJE;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    ctx.textAlign = "left";
    ctx.fillText(`Consumo (${opciones.unidad || ""})`, pad.l, 13);
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = minV + ((maxV - minV) * i) / 4;
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(formatoCorto(v), pad.l - 6, y + 4);
    }
    ctx.textAlign = "center";
    const tIni = new Date(minT);
    const tFin = new Date(maxT);
    ctx.fillText(etiquetaFecha(tIni), pad.l + 30, h - 10);
    ctx.fillText(etiquetaFecha(tFin), w - pad.r - 30, h - 10);

    parsed.forEach((s, idx) => {
      const color = PALETA[idx % PALETA.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let conectado = false;
      s.pts.forEach((p) => {
        if (p.v === null || !Number.isFinite(p.v)) { conectado = false; return; }
        const x = X(p.t);
        const y = Y(p.v);
        if (!conectado) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        conectado = true;
      });
      ctx.stroke();
      ctx.fillStyle = color;
      for (const p of s.pts) {
        if (p.v === null || !Number.isFinite(p.v)) continue;
        ctx.beginPath();
        ctx.arc(X(p.t), Y(p.v), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Leyenda compacta
    ctx.textAlign = "left";
    ctx.font = "12px 'Plus Jakarta Sans', system-ui, sans-serif";
    parsed.forEach((s, idx) => {
      const y = pad.t + idx * 16;
      if (y > h - pad.b) return;
      ctx.fillStyle = PALETA[idx % PALETA.length];
      ctx.fillRect(w - pad.r - 150, y - 9, 10, 10);
      ctx.fillStyle = COLOR_EJE;
      ctx.fillText(String(s.meta.medidorCodigo).slice(0, 20), w - pad.r - 136, y);
    });
  }

  function dibujarBarras(canvas, items, opciones = {}) {
    if (!canvas) return;
    const altura = opciones.altura || 260;
    const { ctx, w, h } = prepararCanvas(canvas, altura);
    const datos = (items || []).filter(d => d.consumoNeto !== null && Number.isFinite(Number(d.consumoNeto)) && (!d.estadoConsumo || d.estadoConsumo === "CALCULADO")).slice(0, 12);
    if (datos.length === 0) {
      textoVacio(ctx, w, h, "Sin consumo calculable para este período.");
      return;
    }
    const pad = { l: 52, r: 12, t: 28, b: 56 };
    const maxV = Math.max(...datos.map((d) => Number(d.consumoNeto) || 0), 1);
    const n = datos.length;
    const slot = (w - pad.l - pad.r) / n;
    const barW = Math.min(46, slot * 0.55);

    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = COLOR_EJE;
    ctx.textAlign = "right";
    ctx.strokeStyle = COLOR_GRID;
    ctx.textAlign = "left";
    ctx.fillText(`Consumo (${opciones.unidad || ""})`, pad.l, 13);
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      const y = pad.t + (1 - i / 4) * (h - pad.t - pad.b);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(formatoCorto(v), pad.l - 6, y + 4);
    }

    ctx.textAlign = "center";
    ctx.font = "11px 'Plus Jakarta Sans', system-ui, sans-serif";
    datos.forEach((d, i) => {
      const v = Number(d.consumoNeto) || 0;
      const bh = ((h - pad.t - pad.b) * v) / maxV;
      const x = pad.l + slot * i + (slot - barW) / 2;
      const y = h - pad.b - bh;
      ctx.fillStyle = PALETA[i % PALETA.length];
      ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = COLOR_EJE;
      ctx.fillText(formatoCorto(v), x + barW / 2, y - 6);
      ctx.save();
      ctx.translate(x + barW / 2, h - pad.b + 12);
      ctx.rotate(-0.35);
      ctx.fillStyle = COLOR_EJE;
      const etiqueta = String(d.instalacionNombre || "?").slice(0, 16);
      ctx.fillText(etiqueta, 0, 10);
      ctx.restore();
    });
  }

  function dibujarIntervalos(canvas, items, opciones = {}) {
    if (!canvas) return;
    const { ctx, w, h } = prepararCanvas(canvas, opciones.altura || 280);
    const datos = [...(items || [])].reverse();
    canvas.onpointermove = null; canvas.title = "";
    if (!datos.some(c => c.estado === "CALCULADO" && c.consumo !== null)) {
      textoVacio(ctx, w, h, "Sin consumo comparable en esta página."); return;
    }
    const pad = { l: 48, r: 12, t: 26, b: 34 };
    const max = Math.max(1, ...datos.filter(c => c.estado === "CALCULADO").map(c => c.consumo));
    const ancho = w - pad.l - pad.r, alto = h - pad.t - pad.b;
    const slot = ancho / datos.length, barW = Math.max(1, Math.min(32, slot * 0.72));
    ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = COLOR_EJE;
    ctx.textAlign = "left"; ctx.fillText(`Consumo (${opciones.unidad || ""})`, pad.l, 13);
    ctx.textAlign = "right"; ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + alto * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(formatoCorto(max * i / 4), pad.l - 6, y + 4);
    }
    const etiquetas = Math.max(1, Math.ceil(datos.length / Math.max(2, Math.floor(ancho / 72))));
    datos.forEach((c, i) => {
      const centro = pad.l + slot * (i + 0.5);
      if (c.estado === "CALCULADO" && c.consumo !== null) {
        const bh = alto * c.consumo / max;
        ctx.fillStyle = PALETA[0];
        ctx.fillRect(centro - barW / 2, pad.t + alto - Math.max(bh, 1), barW, Math.max(bh, 1));
      }
      if (i === datos.length - 1 || (i % etiquetas === 0 && i < datos.length - 1 - etiquetas * 0.65)) {
        ctx.fillStyle = COLOR_EJE; ctx.textAlign = "center";
        const fecha = new Date(c.lecturaFinal?.fechaLectura);
        if (Number.isFinite(fecha.getTime())) ctx.fillText(etiquetaFecha(fecha), centro, h - 10, Math.max(slot * etiquetas - 4, 35));
      }
    });
    canvas.onpointermove = event => {
      const rect = canvas.getBoundingClientRect();
      const indice = Math.floor((event.clientX - rect.left - pad.l) / slot);
      const c = datos[indice];
      if (!c) { canvas.title = ""; return; }
      const fecha = new Date(c.lecturaFinal?.fechaLectura);
      canvas.title = `${Number.isFinite(fecha.getTime()) ? etiquetaFecha(fecha) : ""}: ${c.estado === "CALCULADO" ? `${c.consumo} ${opciones.unidad || ""}` : "Sin consumo comparable"}`;
    };
  }

  function dibujarDona(canvas, entradas, opciones = {}) {
    if (!canvas) return;
    const altura = opciones.altura || 260;
    const { ctx, w, h } = prepararCanvas(canvas, altura);
    const datos = (entradas || []).filter((e) => Number(e.valor) > 0);
    if (datos.length === 0) {
      textoVacio(ctx, w, h, opciones.mensajeVacio || "Sin consumo positivo para distribuir.");
      return;
    }
    const total = datos.reduce((a, e) => a + Number(e.valor), 0);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 24;
    const r = R * 0.58;
    let ang = -Math.PI / 2;
    datos.forEach((e, i) => {
      const frac = Number(e.valor) / total;
      const ang2 = ang + frac * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, ang, ang2);
      ctx.arc(cx, cy, r, ang2, ang, true);
      ctx.closePath();
      ctx.fillStyle = PALETA[i % PALETA.length];
      ctx.fill();
      ang = ang2;
    });
    // Leyenda lateral / inferior
    ctx.font = "12px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "left";
    datos.forEach((e, i) => {
      const y = 20 + i * 18;
      if (y > h - 8) return;
      ctx.fillStyle = PALETA[i % PALETA.length];
      ctx.fillRect(12, y - 10, 10, 10);
      ctx.fillStyle = COLOR_EJE;
      const pct = ((Number(e.valor) / total) * 100).toFixed(1);
      ctx.fillText(`${e.clave}: ${formatoCorto(e.valor)} ${opciones.unidad || ""} (${pct}%)`, 28, y, w - 40);
    });
  }

  function formatoCorto(v) {
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 10) / 10);
  }

  function etiquetaFecha(d) {
    try {
      return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
    } catch {
      return "";
    }
  }

  window.Charts = { dibujarLinea, dibujarBarras, dibujarDona, dibujarIntervalos };
})();
