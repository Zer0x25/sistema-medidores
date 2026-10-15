import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { config } from "../src/core/config.js";
import { DomainError } from "../src/core/errors.js";
import { hashPassword } from "../src/modules/usuarios/auth.utils.js";
import { RegistrarAuditoriaInputSchema } from "../src/modules/auditoria/auditoria.schema.js";

const SeedHistoricoInputSchema = z.object({
  ahora: z.date(), entorno: z.enum(["development", "test", "staging", "production"]),
});
type SeedHistoricoInput = z.infer<typeof SeedHistoricoInputSchema>;
type SeedErrorCode = "SEED_ENTORNO_PROHIBIDO" | "SEED_BASE_NO_VACIA" | "SEED_ENTRADA_INVALIDA";
class SeedHistoricoError extends DomainError {
  readonly statusCode = 400;
  constructor(readonly code: SeedErrorCode, message: string) { super(message); }
}

/** Solo inserta en una base vacía. No reinicia ni borra almacenamiento existente. */
export async function sembrarHistorico(prisma: PrismaClient, input: SeedHistoricoInput) {
  const parsed = SeedHistoricoInputSchema.safeParse(input);
  if (!parsed.success || input.ahora.getTime() > Date.now()) throw new SeedHistoricoError("SEED_ENTRADA_INVALIDA", "Fecha o configuración de semilla inválida.");
  if (input.entorno !== "development" && input.entorno !== "test") {
    throw new SeedHistoricoError("SEED_ENTORNO_PROHIBIDO", "La semilla histórica solo se permite en desarrollo o test.");
  }
  const dia = 86400000;
  const fin = new Date(input.ahora);
  fin.setUTCMinutes(0, 0, 0); fin.setUTCHours(fin.getUTCHours() - 1);
  const inicio = new Date(fin.getTime() - 60 * dia);
  const creado = new Date(inicio.getTime() - dia);
  const vigenteDesde = new Date(inicio.getTime() - 3600000);
  const passwordHash = await hashPassword("demo1234");
  return prisma.$transaction(async tx => {
    const tablas = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`;
    for (const tabla of tablas) {
      // Identificadores del catálogo SQLite, nunca valores recibidos del usuario.
      const filas = await tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM "${tabla.name.replace(/"/g, '""')}" LIMIT 1`);
      if (filas.length) throw new SeedHistoricoError("SEED_BASE_NO_VACIA", "Usa una base nueva: la semilla no modifica datos existentes.");
    }
    const admin = await tx.usuario.create({ data: { email: "admin@medidores.cl", nombre: "Administrador Central", rol: "ADMIN", passwordHash, createdAt: creado } });
    const supervisor = await tx.usuario.create({ data: { email: "supervisor@medidores.cl", nombre: "Supervisión Planta Norte", rol: "SUPERVISOR", passwordHash, createdAt: creado } });
    const operador = await tx.usuario.create({ data: { email: "operador@medidores.cl", nombre: "Operador de Terreno", rol: "OPERADOR", passwordHash, createdAt: creado } });
    const sedes = [
      { codigo: "NORTE", nombre: "Planta Industrial Norte", ubicacion: "Sector Industrial Norte", factor: 1.4 },
      { codigo: "CORP", nombre: "Edificio Corporativo", ubicacion: "Centro de oficinas", factor: 0.85 },
      { codigo: "SUR", nombre: "Centro Logístico Sur", ubicacion: "Parque Logístico Sur", factor: 1.1 },
    ];
    const recursos = [
      { prefijo: "AG", nombre: "Agua potable acumulativa", recurso: "AGUA", unidad: "M3", base: 1800, inicial: 100000 },
      { prefijo: "LUZ", nombre: "Electricidad acumulativa", recurso: "LUZ", unidad: "KWH", base: 45000, inicial: 5000000 },
      { prefijo: "GAS", nombre: "Gas natural acumulativo", recurso: "GAS", unidad: "M3", base: 950, inicial: 500000 },
    ];
    const tipos = await Promise.all(recursos.map(r => tx.tipoMedidor.create({ data: {
      nombre: r.nombre, recurso: r.recurso, unidad: r.unidad, tipoMedicion: "ACUMULATIVO", multiplicador: 1, createdAt: creado,
    } })));
    let cantidadMedidores = 0;
    for (const [sedeIndex, sede] of sedes.entries()) {
      const inst = await tx.instalacion.create({ data: { codigo: sede.codigo, nombre: sede.nombre, ubicacion: sede.ubicacion, createdAt: creado } });
      await tx.asignacionOperador.create({ data: { instalacionId: inst.id, usuarioId: operador.id, createdAt: creado } });
      if (sedeIndex === 0) await tx.asignacionOperador.create({ data: { instalacionId: inst.id, usuarioId: supervisor.id, createdAt: creado } });
      for (const [recursoIndex, recurso] of recursos.entries()) {
        const perfiles = [
          { sufijo: "GENERAL", nombre: "General", padre: -1 },
          { sufijo: "PROCESOS", nombre: "Sector Procesos", padre: 0 },
          { sufijo: "SERVICIOS", nombre: "Sector Servicios", padre: 0 },
          { sufijo: "TALLER", nombre: "Taller de Procesos", padre: 1 },
        ];
        const ids: string[] = [];
        // Centésimas enteras: factores/sumas y saldos reproducibles sin errores acumulados.
        const diarios = Array.from({ length: 60 }, (_, i) => {
          const fecha = new Date(inicio.getTime() + (i + 1) * dia);
          const finSemana = fecha.getUTCDay() === 0 || fecha.getUTCDay() === 6;
          const semanal = finSemana ? 0.63 : 1;
          const oscilacion = 1 + 0.17 * Math.sin(i * 0.73 + sedeIndex + recursoIndex);
          const tendencia = 1 + i * 0.003;
          const pico = (i === 18 || i === 43) ? 1.45 : 1;
          const general = Math.round(recurso.base * sede.factor * semanal * oscilacion * tendencia * pico);
          const procesos = Math.round(general * (0.44 + 0.03 * Math.sin(i * 0.4)));
          return [general, procesos, Math.round(general * 0.28), Math.round(procesos * 0.4)];
        });
        for (const [perfilIndex, perfil] of perfiles.entries()) {
          const medidorPadreId = perfil.padre < 0 ? null : ids[perfil.padre];
          const medidor = await tx.medidor.create({ data: {
            instalacionId: inst.id, tipoMedidorId: tipos[recursoIndex].id,
            codigo: `${recurso.prefijo}-${sede.codigo}-${perfil.sufijo}`, ubicacionInterna: perfil.nombre,
            medidorPadreId, createdAt: creado, factorInstalacion: 1,
          } });
          ids.push(medidor.id); cantidadMedidores++;
          if (medidorPadreId) {
            await tx.medidorVinculo.create({ data: { medidorId: medidor.id, medidorPadreId, usuarioId: admin.id, vigenteDesde, createdAt: vigenteDesde } });
            const evento = RegistrarAuditoriaInputSchema.parse({ usuarioId: admin.id, accion: "MEDIDOR_PADRE_ASIGNADO",
              entidad: "MEDIDOR", entidadId: medidor.id, detalles: { medidorPadreId, vigenteDesde: vigenteDesde.toISOString(), origen: "DEMO_HISTORICA" }, ip: "127.0.0.1" });
            await tx.auditoriaEvento.create({ data: { ...evento, detalles: JSON.stringify(evento.detalles), createdAt: vigenteDesde } });
          }
          let valorCent = Math.round(recurso.inicial * (perfilIndex === 0 ? 1 : 0.2 * perfilIndex));
          const lecturas = Array.from({ length: 61 }, (_, i) => {
            if (i > 0) valorCent += diarios[i - 1][perfilIndex];
            const fechaLectura = new Date(inicio.getTime() + i * dia);
            return { medidorId: medidor.id, operadorId: operador.id, valor: valorCent / 100, valorBruto: valorCent / 100,
              multiplicadorAplicado: 1, origen: "IMPORTADA", fechaLectura, createdAt: fechaLectura,
              notas: i === 0 ? "Demo histórica: apertura" : "Demo histórica: cierre diario" };
          });
          await tx.lectura.createMany({ data: lecturas });
        }
      }
    }
    await tx.reglaAlerta.createMany({ data: [
      { nombre: "Sin reporte > 48 horas", tipo: "SIN_REPORTE", umbralValor: 48 },
      { nombre: "Variación de consumo > 80%", tipo: "SALTO_CONSUMO", umbralValor: 80 },
    ] });
    return { instalaciones: sedes.length, medidores: cantidadMedidores, lecturas: cantidadMedidores * 61, intervalos: 60, inicio, fin };
  }, { timeout: 30000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma: PrismaClient = new PrismaClient();
  try {
    console.log(JSON.stringify(await sembrarHistorico(prisma, { ahora: new Date(), entorno: config.NODE_ENV }), null, 2));
  } catch (error) {
    console.error(error instanceof DomainError ? `${error.code}: ${error.message}` : "No se pudo crear la semilla histórica.");
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
