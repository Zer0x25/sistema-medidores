import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { DashboardService } from "./dashboard.service.js";
import { DashboardSerieQuerySchema } from "./dashboard.schema.js";
import { isDomainError } from "../../core/errors.js";

export function createDashboardController(service: DashboardService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    fastify.get("/dashboard/kpis", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
        const result = await service.obtenerKpis(user?.allowedInstalacionIds);
        return reply.status(200).send(result);
      } catch (error) {
        if (isDomainError(error)) {
          return reply.status(error.statusCode).send({
            error: error.code,
            message: error.message,
            details: error.details,
          });
        }
        return reply.status(500).send({
          error: "INTERNAL_SERVER_ERROR",
          message: "Error interno del servidor",
        });
      }
    });

    fastify.get(
      "/dashboard/desatendidos",
      async (
        request: FastifyRequest<{ Querystring: { horas?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
          const horas = request.query.horas ? parseInt(request.query.horas, 10) : 24;
          const result = await service.obtenerMedidoresDesatendidos(horas, user?.allowedInstalacionIds);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.get("/dashboard/consumos", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
        const result = await service.obtenerConsumoPorInstalacion(user?.allowedInstalacionIds);
        return reply.status(200).send(result);
      } catch (error) {
        if (isDomainError(error)) {
          return reply.status(error.statusCode).send({
            error: error.code,
            message: error.message,
            details: error.details,
          });
        }
        return reply.status(500).send({
          error: "INTERNAL_SERVER_ERROR",
          message: "Error interno del servidor",
        });
      }
    });

    fastify.get(
      "/dashboard/actividad-reciente",
      async (
        request: FastifyRequest<{ Querystring: { limit?: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
          const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
          const result = await service.obtenerActividadReciente(limit, user?.allowedInstalacionIds);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );

    fastify.get(
      "/dashboard/series",
      async (
        request: FastifyRequest<{
          Querystring: {
            medidorId?: string;
            instalacionId?: string;
            recurso?: string;
            fechaInicio?: string;
            fechaFin?: string;
            limite?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        const parsed = DashboardSerieQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.status(400).send({
            error: "VALIDATION_ERROR",
            message: "Parámetros de serie inválidos",
            details: parsed.error.format(),
          });
        }
        try {
          const user = (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
          const result = await service.obtenerSeries(parsed.data, user?.allowedInstalacionIds);
          return reply.status(200).send(result);
        } catch (error) {
          if (isDomainError(error)) {
            return reply.status(error.statusCode).send({
              error: error.code,
              message: error.message,
              details: error.details,
            });
          }
          return reply.status(500).send({
            error: "INTERNAL_SERVER_ERROR",
            message: "Error interno del servidor",
          });
        }
      }
    );
  };
}
