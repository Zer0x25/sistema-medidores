// Panel de consumo: resumen ligero y una página de un equipo bajo demanda.
(() => {
  const el = id => document.getElementById(id);
  const estado = { grupos: [], catalogo: [], pagina: 1, paginaSedes: 1, datos: null, visible: false,
    version: 0, versionIntervalos: 0, resumen: null, peticion: null };
  const grupo = () => estado.grupos.find(g => `${g.recurso}:${g.unidad}` === el("filtroGraficoMagnitud").value);
  const numero = (v, unidad) => `${window.Components.formatNumber(v)} ${unidad || ""}`;
  const fecha = v => v ? window.Components.formatDate(v, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Sin referencia";
  const fechaCorta = v => window.Components.formatDate(v, { day: "2-digit", month: "short" });
  const nombreEstado = s => s === "CALCULADO" ? "Calculado" : s === "NO_COMPARABLE" ? "Lecturas no comparables" : "Datos insuficientes";

  function filtros() {
    const q = {};
    for (const [campo, clave] of [["Instalacion", "instalacionId"], ["Recurso", "recurso"]]) {
      const valor = el(`filtroGrafico${campo}`).value;
      if (valor) q[clave] = valor;
    }
    const desde = el("filtroGraficoDesde").value, hasta = el("filtroGraficoHasta").value;
    if (desde) q.fechaInicio = new Date(`${desde}T00:00:00.000`).toISOString();
    if (hasta) q.fechaFin = new Date(`${hasta}T23:59:59.999`).toISOString();
    return q;
  }

  function tabla(contenedor, titulos, filas) {
    const table = document.createElement("table"); table.className = "data-table";
    const tr = table.createTHead().insertRow();
    for (const titulo of titulos) { const th = document.createElement("th"); th.scope = "col"; th.textContent = titulo; tr.append(th); }
    const body = table.createTBody();
    for (const fila of filas) {
      const row = body.insertRow();
      fila.forEach((valor, i) => { const cell = row.insertCell(); cell.dataset.label = titulos[i]; cell.textContent = valor; });
    }
    contenedor.replaceChildren(table);
  }

  function invalidarIntervalos(cerrar = true) {
    estado.versionIntervalos++;
    estado.peticion?.controller.abort(); estado.peticion = null; estado.datos = null;
    if (cerrar) el("detalleIntervalos").open = false;
    el("tablaIntervalos").replaceChildren();
    el("panelEvolucion").setAttribute("aria-busy", "false");
    el("intervalosRecientes").disabled = true; el("intervalosAntiguos").disabled = true;
    el("paginaIntervalosInfo").textContent = "Sin registros";
    el("reintentarEvolucion").hidden = true;
    dibujar();
  }

  function poblarEquipo() {
    const select = el("filtroGraficoMedidor"), anterior = select.value;
    select.replaceChildren();
    for (const m of grupo()?.medidores || []) select.add(new Option(`${m.medidorCodigo} · ${m.instalacionNombre}`, m.medidorId));
    if ([...select.options].some(o => o.value === anterior)) select.value = anterior;
    if (!select.options.length) select.add(new Option("Sin medidores acumulativos", ""));
  }

  function dibujar() {
    const g = grupo(); const unidad = estado.datos?.unidad || g?.unidad || "";
    window.Charts.dibujarIntervalos(el("chartEvolucionMedidor"), estado.datos?.items || [], { unidad });
    const consumos = (g?.consumos || []).slice((estado.paginaSedes - 1) * 12, estado.paginaSedes * 12);
    window.Charts.dibujarBarras(el("chartConsumoInstalacion"), consumos, { unidad: g?.unidad || "" });
    window.Charts.dibujarDona(el("chartDistribucionRecurso"), g?.distribucionComparable
      ? g.consumos.map(c => ({ clave: c.instalacionNombre, valor: c.consumoNeto })) : [],
      { unidad: g?.unidad || "", mensajeVacio: "Sin períodos comparables para distribuir." });
    el("chartEvolucionMedidor").setAttribute("aria-label", `Barras de consumo por intervalo ${unidad}`);
  }

  function renderizarResumen() {
    const g = grupo(), consumos = g?.consumos || [];
    const pagina = consumos.slice((estado.paginaSedes - 1) * 12, estado.paginaSedes * 12);
    tabla(el("resumenGraficos"), ["Instalación", "Consumo del período", "Período real", "Cobertura"], pagina.map(c => [
      c.instalacionNombre, c.estadoConsumo === "CALCULADO" ? numero(c.consumoNeto, g.unidad) : nombreEstado(c.estadoConsumo),
      `${fecha(c.fechaInicialReal)} → ${fecha(c.fechaFinalReal)}`, c.cobertura === "COMPLETA" ? "Completa" : c.cobertura === "PARCIAL" ? "Parcial" : "Insuficiente",
    ]));
    el("paginaSedesInfo").textContent = consumos.length ? `Página ${estado.paginaSedes} de ${Math.ceil(consumos.length / 12)} · ${consumos.length} sedes` : "Sin consumos";
    el("sedesAnteriores").disabled = estado.paginaSedes <= 1;
    el("sedesSiguientes").disabled = estado.paginaSedes * 12 >= consumos.length;
    el("estadoGraficos").textContent = g ? `${g.recurso} · ${g.unidad}. Totales del período por sede, sin duplicar remarcadores.` : "Sin datos acumulativos para estos filtros.";
    dibujar();
  }

  window.cargarGraficosDashboard = function () {
    const params = { ...filtros(), vista: "resumen" };
    const key = JSON.stringify(params);
    if (estado.resumen?.key === key) return estado.resumen.promise;
    estado.resumen?.controller.abort();
    const controller = new AbortController(), version = ++estado.version;
    invalidarIntervalos(); estado.pagina = 1;
    el("estadoGraficos").textContent = "Actualizando resumen de consumo…";
    el("evolucionEstado").textContent = "Preparando medidores…";
    const promise = (async () => {
      try {
        const data = await window.api.dashboard.getGraficos(params, { signal: controller.signal });
        if (version !== estado.version) return;
        estado.grupos = data.grupos;
        if (!params.instalacionId && !params.recurso || !estado.catalogo.length) {
          estado.catalogo = data.grupos.flatMap(g => g.consumos);
          const select = el("filtroGraficoInstalacion"), anterior = select.value;
          const sedes = [...new Map(estado.catalogo.map(c => [c.instalacionId, c])).values()];
          select.replaceChildren(new Option("Todas las sedes", ""));
          for (const s of sedes) select.add(new Option(s.instalacionNombre, s.instalacionId));
          select.value = anterior;
        }
        const select = el("filtroGraficoMagnitud"), anterior = select.value;
        select.replaceChildren();
        for (const g of data.grupos) select.add(new Option(`${g.recurso} · ${g.unidad}`, `${g.recurso}:${g.unidad}`));
        if ([...select.options].some(o => o.value === anterior)) select.value = anterior;
        if (!select.options.length) select.add(new Option("Sin datos", ""));
        estado.paginaSedes = 1; poblarEquipo(); renderizarResumen();
        el("evolucionEstado").textContent = "El historial se carga al visualizar este panel.";
        if (estado.visible) await window.cargarIntervalosGrafico();
      } catch (err) {
        if (err.name === "AbortError" || version !== estado.version) return;
        estado.grupos = []; renderizarResumen();
        el("estadoGraficos").textContent = err.message || "No se pudo actualizar. Usa Refrescar gráficos para reintentar.";
        el("evolucionEstado").textContent = "No se pudo consultar el resumen.";
      } finally { if (version === estado.version) estado.resumen = null; }
    })();
    estado.resumen = { key, promise, controller }; return promise;
  };

  window.cargarIntervalosGrafico = function (forzar = false) {
    const medidorId = el("filtroGraficoMedidor").value;
    if (!medidorId || !grupo()) { el("evolucionEstado").textContent = "No hay un medidor para estos filtros."; return Promise.resolve(); }
    const params = { ...filtros(), recurso: grupo().recurso, medidorId, pagina: estado.pagina, tamanio: 30 };
    const key = JSON.stringify(params);
    if (estado.peticion?.key === key) return estado.peticion.promise;
    if (!forzar && estado.datos?.key === key) return Promise.resolve();
    estado.peticion?.controller.abort();
    const controller = new AbortController(), version = ++estado.versionIntervalos;
    estado.datos = null; el("tablaIntervalos").replaceChildren(); dibujar();
    el("panelEvolucion").setAttribute("aria-busy", "true");
    el("evolucionEstado").textContent = "Cargando esta página de consumo…";
    el("reintentarEvolucion").hidden = true;
    el("intervalosRecientes").disabled = true; el("intervalosAntiguos").disabled = true;
    const promise = (async () => {
      try {
        const datos = await window.api.dashboard.getIntervalos(params, { signal: controller.signal });
        if (version !== estado.versionIntervalos) return;
        estado.datos = { ...datos, key }; dibujar();
        el("paginaIntervalosInfo").textContent = datos.total ? `Página ${datos.pagina} de ${datos.totalPaginas} · ${datos.total} registros` : "Sin registros";
        el("intervalosRecientes").disabled = datos.pagina <= 1;
        el("intervalosAntiguos").disabled = datos.pagina >= datos.totalPaginas;
        const primero = datos.items.at(-1)?.lecturaFinal?.fechaLectura, ultimo = datos.items[0]?.lecturaFinal?.fechaLectura;
        el("evolucionEstado").textContent = datos.items.length
          ? `${datos.medidorCodigo} · ${datos.items.length} registros. ${fechaCorta(primero)} a ${fechaCorta(ultimo)}.`
          : "Sin lecturas en el período seleccionado.";
        window.alternarDetalleIntervalos();
      } catch (err) {
        if (err.name === "AbortError" || version !== estado.versionIntervalos) return;
        el("evolucionEstado").textContent = err.message || "No se pudo cargar esta página.";
        el("reintentarEvolucion").hidden = false;
      } finally {
        if (version === estado.versionIntervalos) { estado.peticion = null; el("panelEvolucion").setAttribute("aria-busy", "false"); }
      }
    })();
    estado.peticion = { key, promise, controller }; return promise;
  };

  window.cambiarMedidorGrafico = () => { estado.pagina = 1; invalidarIntervalos(); return window.cargarIntervalosGrafico(); };
  window.cambiarMagnitudGrafico = () => { estado.paginaSedes = 1; poblarEquipo(); renderizarResumen(); return window.cambiarMedidorGrafico(); };
  window.cambiarPaginaIntervalos = delta => {
    if (!estado.datos) return;
    const siguiente = estado.pagina + delta;
    if (siguiente < 1 || siguiente > estado.datos.totalPaginas) return;
    estado.pagina = siguiente; return window.cargarIntervalosGrafico();
  };
  window.cambiarPaginaSedes = delta => {
    const siguiente = estado.paginaSedes + delta;
    if (siguiente < 1 || siguiente > Math.ceil((grupo()?.consumos.length || 0) / 12)) return;
    estado.paginaSedes = siguiente; renderizarResumen();
  };
  window.alternarDetalleIntervalos = () => {
    const panel = el("tablaIntervalos");
    if (!el("detalleIntervalos").open || !estado.datos) { panel.replaceChildren(); return; }
    const datos = estado.datos;
    tabla(panel, ["Consumo", "Desde", "Hasta", "Estado"], datos.items.map(c => [
      c.estado === "CALCULADO" ? numero(c.consumo, datos.unidad) : "—",
      fecha(c.lecturaInicial?.fechaLectura), fecha(c.lecturaFinal?.fechaLectura), nombreEstado(c.estado),
    ]));
  };
  window.renderizarGraficosDashboard = dibujar;
  let frame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (el("viewAdmin")?.offsetParent) dibujar(); });
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      estado.visible = entries[0].isIntersecting;
      if (estado.visible && !estado.resumen && estado.grupos.length) window.cargarIntervalosGrafico();
    }, { rootMargin: "100px" }).observe(el("panelEvolucion"));
  } else estado.visible = true;
})();
