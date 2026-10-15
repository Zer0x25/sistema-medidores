import { ConsumosService } from "../consumos/consumos.service.js";
import { BalanceQuerySchema } from "../consumos/consumos.schema.js";
import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { ReportesService } from "./reportes.service.js";
import {
  FiltroReporteConsumoSchema,
  RegistrarFacturaInputSchema,
} from "./reportes.schema.js";
import { DomainError } from "../../core/errors.js";

export function createReportesController(service: ReportesService, consumos?: ConsumosService): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    if (consumos) app.get("/reportes/balances", async (request, reply) => {
      const parsed = BalanceQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Período o instalación inválidos", details: parsed.error.issues });
      const user = (request as unknown as { user: { allowedInstalacionIds?: string[] } }).user;
      try { return await consumos.balance(parsed.data, user.allowedInstalacionIds); }
      catch (error) {
        if (error instanceof DomainError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
        throw error;
      }
    });
    // 1. Obtener Consumo Consolidado (JSON)
    app.get(
      "/reportes/consumos",
      async (
        request: FastifyRequest<{
          Querystring: {
            instalacionId?: string;
            medidorId?: string;
            recurso?: "AGUA" | "LUZ" | "GAS" | "PETROLEO" | "OTRO";
            fechaInicio?: string;
            fechaFin?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const parsed = FiltroReporteConsumoSchema.safeParse(request.query);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Parámetros de filtro inválidos",
              details: parsed.error.issues,
            });
          }

          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resultado = await service.obtenerConsumoConsolidado(parsed.data, allowedIds);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          if (error instanceof ZodError) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: error.issues.map((i) => i.message).join(", "),
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error interno del servidor" });
        }
      }
    );

    // 2. Exportar Consumo Consolidado (CSV)
    app.get(
      "/reportes/consumos/exportar-csv",
      async (
        request: FastifyRequest<{
          Querystring: {
            instalacionId?: string;
            medidorId?: string;
            recurso?: "AGUA" | "LUZ" | "GAS" | "PETROLEO" | "OTRO";
            fechaInicio?: string;
            fechaFin?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const parsed = FiltroReporteConsumoSchema.safeParse(request.query);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Parámetros de filtro inválidos para exportación",
              details: parsed.error.issues,
            });
          }

          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const csvData = await service.exportarConsumoCSV(parsed.data, allowedIds);
          const filename = `reporte-consumo-${new Date().toISOString().split("T")[0]}.csv`;

          reply.header("Content-Type", "text/csv; charset=utf-8");
          reply.header("Content-Disposition", `attachment; filename="${filename}"`);
          return reply.status(200).send(csvData);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al exportar CSV" });
        }
      }
    );

    // 3. Registrar y Conciliar Factura de Servicios
    app.post(
      "/reportes/facturas",
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const parsed = RegistrarFacturaInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "VALIDATION_ERROR",
              message: "Datos de factura inválidos",
              details: parsed.error.issues,
            });
          }

          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resultado = await service.registrarYConciliarFactura(parsed.data, allowedIds);
          return reply.status(201).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al registrar factura" });
        }
      }
    );

    // 4. Listar Facturas y Estado de Conciliación
    app.get(
      "/reportes/facturas",
      async (
        request: FastifyRequest<{ Querystring: { instalacionId?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;

          const resultado = await service.listarFacturas(request.query.instalacionId, allowedIds);
          return reply.status(200).send(resultado);
        } catch (error: unknown) {
          if (error instanceof DomainError) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
            });
          }
          return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Error al listar facturas" });
        }
      }
    );
  };
}
