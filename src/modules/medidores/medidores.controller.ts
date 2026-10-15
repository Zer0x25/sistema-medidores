import { ZodError } from "zod";
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { MedidoresService } from "./medidores.service.js";
import { isDomainError } from "../../core/errors.js";
import { CambiarPadreInput, CrearTipoMedidorInput, CrearMedidorInput, EditarMedidorInput, EditarTipoMedidorInput } from "./medidores.schema.js";

export function createMedidoresController(service: MedidoresService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    // --------------------------------------------------------------------------
    // Catálogo de Tipos de Medidor
    // --------------------------------------------------------------------------
    const handleCrearTipo = async (request: FastifyRequest<{ Body: CrearTipoMedidorInput }>, reply: FastifyReply) => {
      try {
        const result = await service.crearTipoMedidor(request.body);
        return reply.status(201).send(result);
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
    };

    fastify.post("/tipos-medidor", handleCrearTipo);
    fastify.post("/medidores/tipos", handleCrearTipo);


    const handleListarTipos = async (request: FastifyRequest<{ Querystring: { estado?: "activos" | "archivados" | "todos" } }>, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { rol: string } }).user;
        const estado = user && user.rol === "ADMIN" ? (request.query.estado ?? "activos") : "activos";
        const result = await service.listarTiposMedidor(estado);
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
    };

    fastify.get("/tipos-medidor", handleListarTipos);
    fastify.get("/medidores/tipos", handleListarTipos);

    const handleTipoById = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const result = await service.obtenerTipoPorId(request.params.id);
        return reply.status(200).send(result);
      } catch (error) {
        if (isDomainError(error)) {
          return reply.status(error.statusCode).send({
            error: error.code,
            message: error.message,
            details: error.details,
          });
        }
        return reply.status(404).send({ error: "NOT_FOUND", message: "Tipo de medidor no encontrado" });
      }
    };

    fastify.get("/tipos-medidor/:id", handleTipoById);

    const handleEditarTipo = async (
      request: FastifyRequest<{ Params: { id: string }; Body: EditarTipoMedidorInput }>,
      reply: FastifyReply
    ) => {
      try {
        const user = (request as unknown as { user?: { userId?: string } }).user;
        const result = await service.editarTipoMedidor(request.params.id, request.body, {
          usuarioId: user?.userId,
          ip: request.ip,
        });
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
    };

    fastify.patch("/tipos-medidor/:id", handleEditarTipo);

    const handleArchivarTipo = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { userId?: string } }).user;
        const result = await service.archivarTipo(request.params.id, {
          usuarioId: user?.userId,
          ip: request.ip,
        });
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
    };

    fastify.patch("/tipos-medidor/:id/archivar", handleArchivarTipo);

    const handleRestaurarTipo = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { userId?: string } }).user;
        const result = await service.restaurarTipo(request.params.id, {
          usuarioId: user?.userId,
          ip: request.ip,
        });
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
    };

    fastify.patch("/tipos-medidor/:id/restaurar", handleRestaurarTipo);

    const handleEliminarTipo = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user?: { userId?: string } }).user;
        await service.eliminarTipoFisico(request.params.id, {
          usuarioId: user?.userId,
          ip: request.ip,
        });
        return reply.status(200).send({ success: true, message: "Tipo de medidor eliminado definitivamente" });
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
    };

    fastify.delete("/tipos-medidor/:id", handleEliminarTipo);

    // --------------------------------------------------------------------------
    // Medidores Físicos
    // --------------------------------------------------------------------------
    fastify.post(
      "/medidores",
      async (request: FastifyRequest<{ Body: CrearMedidorInput }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { userId: string; allowedInstalacionIds?: string[] } }).user;
          const result = await service.crearMedidor(request.body, { usuarioId: user?.userId, ip: request.ip, allowedInstalacionIds: user?.allowedInstalacionIds });
          return reply.status(201).send(result);
        } catch (error) {
          if (error instanceof ZodError) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Datos de medidor inválidos", details: error.issues });
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

    fastify.patch<{ Params: { id: string }; Body: CambiarPadreInput }>("/medidores/:id/padre", async (request, reply) => {
      try {
        const user = (request as unknown as { user: { userId: string } }).user;
        return await service.cambiarPadre(request.params.id, request.body, { usuarioId: user.userId, ip: request.ip });
      } catch (error) {
        if (error instanceof ZodError) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Padre inválido", details: error.issues });
        if (isDomainError(error)) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
        throw error;
      }
    });

    fastify.get(
      "/medidores",
      async (
        request: FastifyRequest<{ Querystring: { instalacionId?: string; estado?: "activos" | "archivados" | "todos" } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
          const allowedIds = user && user.rol !== "ADMIN" ? (user.allowedInstalacionIds || []) : undefined;
          const estado = user && user.rol === "ADMIN" ? request.query.estado : "activos";

          if (request.query.instalacionId) {
            if (allowedIds && !allowedIds.includes(request.query.instalacionId)) {
              return reply.status(403).send({
                error: "INSTALACION_NO_ASIGNADA",
                message: "Acceso denegado: el usuario no tiene asignada esta instalación.",
              });
            }
            const result = await service.listarMedidoresPorInstalacion(
              request.query.instalacionId,
              estado
            );
            return reply.status(200).send(result);
          }

          const result = await service.listarMedidores(allowedIds, estado);
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
      "/medidores/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.obtenerMedidorPorId(request.params.id);
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

    fastify.patch(
      "/medidores/:id",
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: EditarMedidorInput }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { userId?: string } }).user;
          const result = await service.editarMedidor(request.params.id, request.body, {
            usuarioId: user?.userId,
            ip: request.ip,
          });
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

    fastify.patch(
      "/medidores/:id/archivar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { userId?: string } }).user;
          const result = await service.archivarMedidor(request.params.id, {
            usuarioId: user?.userId,
            ip: request.ip,
          });
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

    fastify.patch(
      "/medidores/:id/restaurar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { userId?: string } }).user;
          const result = await service.restaurarMedidor(request.params.id, {
            usuarioId: user?.userId,
            ip: request.ip,
          });
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

    fastify.delete(
      "/medidores/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { userId?: string } }).user;
          await service.eliminarMedidorFisico(request.params.id, {
            usuarioId: user?.userId,
            ip: request.ip,
          });
          return reply.status(200).send({ success: true, message: "Medidor eliminado definitivamente" });
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

    fastify.patch(
      "/medidores/:id/desactivar",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.desactivarMedidor(request.params.id);
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
      "/instalaciones/:instalacionId/medidores",
      async (
        request: FastifyRequest<{ Params: { instalacionId: string }; Querystring: { estado?: "activos" | "archivados" | "todos" } }>,
        reply: FastifyReply
      ) => {
        try {
          const user = (request as unknown as { user?: { rol: string } }).user;
          const estado = user && user.rol === "ADMIN" ? request.query.estado : "activos";
          const result = await service.listarMedidoresPorInstalacion(
            request.params.instalacionId,
            estado
          );
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
