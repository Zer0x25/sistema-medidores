import { z } from "zod";
import { ConsumosService } from "../consumos/consumos.service.js";
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { LecturasService } from "./lecturas.service.js";
import { isDomainError } from "../../core/errors.js";
import { RegistrarLecturaInput, BatchSyncLecturasInput } from "./lecturas.schema.js";

export function createLecturasController(service: LecturasService, consumos?: ConsumosService): FastifyPluginAsync {
  return async function (fastify: FastifyInstance) {
    if (consumos) fastify.get<{ Params: { medidorId: string } }>("/medidores/:medidorId/consumo-actual", async (request, reply) => {
      if (!z.string().uuid().safeParse(request.params.medidorId).success) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Medidor inválido" });
      const user = (request as unknown as { user: { allowedInstalacionIds?: string[] } }).user;
      try { return await consumos.consumoActual(request.params.medidorId, user.allowedInstalacionIds); }
      catch (error) {
        if (isDomainError(error)) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
        throw error;
      }
    });
    fastify.post(
      "/lecturas/batch-sync",
      async (request: FastifyRequest<{ Body: BatchSyncLecturasInput }>, reply: FastifyReply) => {
        try {
          const result = await service.sincronizarLote(request.body);
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
            message: "Error interno al sincronizar lote",
          });
        }
      }
    );

    fastify.post(
      "/lecturas",
      async (request: FastifyRequest<{ Body: RegistrarLecturaInput }>, reply: FastifyReply) => {
        try {
          const user = (request as unknown as { user?: { userId: string } }).user;
          const body = {
            ...request.body,
            operadorId: request.body?.operadorId || user?.userId,
          };
          const result = await service.registrarLectura(body);
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
      }
    );

    fastify.get(
      "/medidores/:medidorId/lecturas",
      async (request: FastifyRequest<{ Params: { medidorId: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.listarLecturasPorMedidor(request.params.medidorId);
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
      "/medidores/:medidorId/lecturas/ultima",
      async (request: FastifyRequest<{ Params: { medidorId: string } }>, reply: FastifyReply) => {
        try {
          const result = await service.obtenerUltimaLectura(request.params.medidorId);
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
