import { ConsumosService } from "./modules/consumos/consumos.service.js";
import { PrismaConsumosRepository } from "./modules/consumos/consumos.repository.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { FastifyInstance, FastifyRequest, FastifyError } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { config } from "./core/config.js";
import {
  configurePrismaSQLite,
  createHotBackup,
  BackupRequestSchema,
} from "./core/database.js";

// Repositorios
import { PrismaInstalacionesRepository } from "./modules/instalaciones/instalaciones.repository.js";
import { PrismaMedidoresRepository } from "./modules/medidores/medidores.repository.js";
import { PrismaLecturasRepository } from "./modules/lecturas/lecturas.repository.js";
import { PrismaDashboardRepository } from "./modules/dashboard/dashboard.repository.js";
import { PrismaUsuariosRepository } from "./modules/usuarios/usuarios.repository.js";
import { PrismaReportesRepository } from "./modules/reportes/reportes.repository.js";
import { PrismaAlertasRepository } from "./modules/alertas/alertas.repository.js";
import { PrismaAuditoriaRepository } from "./modules/auditoria/auditoria.repository.js";
import { PrismaWebhooksRepository } from "./modules/webhooks/webhooks.repository.js";

// Servicios y Controladores
import {
  InstalacionesService,
  calcularPeriodoGracia,
} from "./modules/instalaciones/instalaciones.service.js";
import { createInstalacionesController } from "./modules/instalaciones/instalaciones.controller.js";
import {
  MedidoresService,
  IInstalacionesVerificationService,
} from "./modules/medidores/medidores.service.js";
import { createMedidoresController } from "./modules/medidores/medidores.controller.js";
import {
  LecturasService,
  IMedidorInfoService,
  IOperadorAccessService,
} from "./modules/lecturas/lecturas.service.js";
import { createLecturasController } from "./modules/lecturas/lecturas.controller.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { createDashboardController } from "./modules/dashboard/dashboard.controller.js";
import { UsuariosService } from "./modules/usuarios/usuarios.service.js";
import { createUsuariosController } from "./modules/usuarios/usuarios.controller.js";
import { ReportesService } from "./modules/reportes/reportes.service.js";
import { createReportesController } from "./modules/reportes/reportes.controller.js";
import { AlertasService } from "./modules/alertas/alertas.service.js";
import { createAlertasController } from "./modules/alertas/alertas.controller.js";
import { PrismaMantenimientoRepository } from "./modules/mantenimiento/mantenimiento.repository.js";
import { MantenimientoService } from "./modules/mantenimiento/mantenimiento.service.js";
import { createMantenimientoController } from "./modules/mantenimiento/mantenimiento.controller.js";
import { AuditoriaService } from "./modules/auditoria/auditoria.service.js";
import { createAuditoriaController } from "./modules/auditoria/auditoria.controller.js";
import { WebhookDispatcherService } from "./modules/webhooks/webhooks.service.js";
import {
  createWebhooksController,
  ICalibracionesChecker,
} from "./modules/webhooks/webhooks.controller.js";
import { createNotificacionesController } from "./modules/notificaciones/notificaciones.controller.js";
import { NotificacionesService } from "./modules/notificaciones/notificaciones.service.js";
import { PrismaNotificacionesRepository } from "./modules/notificaciones/notificaciones.repository.js";
import { hashPassword } from "./modules/usuarios/auth.utils.js";

// Errores
import {
  InstalacionNotFoundError,
  InstalacionInactivaError,
} from "./modules/instalaciones/instalaciones.schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildServerOptions {
  prisma?: PrismaClient;
  serveStatic?: boolean;
  logger?: boolean | Record<string, unknown>;
  webhooksService?: WebhookDispatcherService;
  notificacionesService?: NotificacionesService;
}

/**
 * Guardia de entorno para la carga de datos demo (feat-027).
 * Habilitado solo en development/test. Bloqueado en staging/production.
 */
export function isDemoSeedEnabled(env: string): boolean {
  return env !== "staging" && env !== "production";
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? (config.NODE_ENV === "test" ? false : { level: config.LOG_LEVEL }),
  });

  // Permitir cuerpos vacíos cuando Content-Type es application/json
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body: string, done) => {
      if (!body || body.trim() === "") {
        return done(null, {});
      }
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err: unknown) {
        done(err as Error, undefined);
      }
    }
  );

  const prisma: PrismaClient = options.prisma ?? new PrismaClient();
  await configurePrismaSQLite(prisma);

  // 1. Plugins de transporte y seguridad
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: "TOO_MANY_REQUESTS",
      message: `Demasiados intentos de acceso. Por favor intente nuevamente en ${Math.ceil(context.ttl / 1000)} segundos.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  if (options.serveStatic !== false) {
    const publicPath = path.join(__dirname, "../public");
    await app.register(fastifyStatic, {
      root: publicPath,
      prefix: "/",
    });
  }

  // 2. Instanciación de Repositorios y Servicios
  const auditoriaRepo = new PrismaAuditoriaRepository(prisma);
  const auditoriaService = new AuditoriaService(auditoriaRepo);

  const usuariosRepo = new PrismaUsuariosRepository(prisma);
  const usuariosService = new UsuariosService(usuariosRepo, config.JWT_SECRET, auditoriaService);

  // Hook de autenticación y RBAC transversal
  app.addHook("preHandler", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7).trim();
        const payload = usuariosService.verificarToken(token);
        if (payload.rol !== "ADMIN") {
          const asignaciones = await prisma.asignacionOperador.findMany({
            where: { usuarioId: payload.userId },
            select: { instalacionId: true },
          });
          (request as unknown as { user?: typeof payload & { allowedInstalacionIds: string[] } }).user = {
            ...payload,
            allowedInstalacionIds: asignaciones.map((a) => a.instalacionId),
          };
        } else {
          (request as unknown as { user?: typeof payload & { allowedInstalacionIds?: string[] } }).user = payload;
        }
      } catch {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token de autenticación inválido o expirado.",
        });
      }
    }

    const user = (request as unknown as { user?: { rol: string; userId: string } }).user;

    // 1. Blindaje Perimetral Zero-Trust (ADR 0013 / feat-019)
    // Preservar 404 para rutas que no existen en el enrutador de Fastify
    if (request.is404) {
      return;
    }

    // Si una ruta bajo /api/ cayó en el fallback comodín de archivos estáticos (/*), no es un endpoint válido
    if (request.url.startsWith("/api/") && request.routeOptions?.url === "/*") {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: `Ruta ${request.method} ${request.url} no encontrada.`,
      });
    }

    const isPublicApiRoute =
      request.url === "/healthz" ||
      request.url === "/readyz" ||
      request.url.startsWith("/api/health") ||
      request.url.startsWith("/api/config") ||
      request.url.startsWith("/api/auth/login") ||
      request.url.startsWith("/api/auth/register") ||
      request.url.startsWith("/api/demo/seed");

    if (request.url.startsWith("/api/") && !isPublicApiRoute) {
      if (!user) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Cabecera Authorization con formato Bearer <token> requerida.",
        });
      }
    }

    if (user) {
      // Regla RBAC 1: Crear o modificar Instalación solo permitido para ADMIN
      if (request.method !== "GET" && request.url.startsWith("/api/instalaciones")) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para crear o modificar instalaciones.`,
          });
        }
      }

      // Regla RBAC 2: Crear Medidores
      // - ADMIN: permitido en cualquier sede
      // - SUPERVISOR: permitido solo si tiene la instalación asignada
      // - OPERADOR: denegado
      if (request.method === "POST" && request.url.startsWith("/api/medidores")) {
        const body = request.body as { instalacionId?: string } | undefined;
        if (user.rol === "OPERADOR") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: "Acceso denegado: el rol «OPERADOR» no cuenta con permisos para crear medidores.",
          });
        }
        if (user.rol === "SUPERVISOR" && body?.instalacionId) {
          const asignado = await usuariosRepo.isUsuarioAssignedToInstalacion(
            user.userId,
            body.instalacionId
          );
          if (!asignado) {
            return reply.status(403).send({
              error: "INSTALACION_NO_ASIGNADA",
              message: `Operación denegada: el supervisor no tiene asignada la instalación «${body.instalacionId}».`,
            });
          }
        }
      }

      // Regla RBAC 2.1: Modificar o Eliminar Medidor solo permitido para ADMIN
      if (
        (request.method === "PATCH" || request.method === "DELETE") &&
        request.url.startsWith("/api/medidores")
      ) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para editar, archivar o eliminar medidores.`,
          });
        }
      }

      // Regla RBAC 2.2: Gestión del catálogo de Tipos de Medidor solo permitido para ADMIN
      if (
        (request.method === "POST" ||
          request.method === "PATCH" ||
          request.method === "DELETE") &&
        request.url.startsWith("/api/tipos-medidor")
      ) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para crear o modificar tipos de medidor.`,
          });
        }
      }

      // Regla RBAC 3: Gestión de Usuarios solo permitido para ADMIN
      if (request.url.startsWith("/api/usuarios")) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para gestionar usuarios.`,
          });
        }
      }

      // Regla RBAC 4: Auditoría solo accesible para ADMIN
      if (request.url.startsWith("/api/auditoria")) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para consultar auditoría.`,
          });
        }
      }

      // Regla RBAC 5: Webhooks administrable solo por ADMIN (SUPERVISOR puede disparar check-calibraciones)
      if (request.url.startsWith("/api/webhooks")) {
        if (request.url.includes("/check-calibraciones")) {
          if (user.rol !== "ADMIN" && user.rol !== "SUPERVISOR") {
            return reply.status(403).send({
              error: "ACCESO_DENEGADO",
              message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para evaluar calibraciones.`,
            });
          }
        } else if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para gestionar webhooks.`,
          });
        }
      }

      // Regla RBAC 6: Pruebas e historial de Notificaciones restringido a ADMIN y SUPERVISOR
      if (
        request.url.startsWith("/api/notificaciones/telegram/test") ||
        request.url.startsWith("/api/notificaciones/push/test") ||
        request.url.startsWith("/api/notificaciones/historial")
      ) {
        if (user.rol !== "ADMIN" && user.rol !== "SUPERVISOR") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para realizar pruebas o consultar historial de notificaciones.`,
          });
        }
      }

      // Regla RBAC 7: Respaldo de Base de Datos exclusivo para ADMIN
      if (request.url.startsWith("/api/admin/backup")) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para generar respaldos de base de datos.`,
          });
        }
      }

      // Regla RBAC 8: Módulos de Gestión Administrativa (Dashboard, Reportes, Alertas, Mantenimiento)
      // Denegados para OPERADOR (Modo Terreno exclusivo)
      if (
        request.url.startsWith("/api/dashboard") ||
        request.url.startsWith("/api/reportes") ||
        request.url.startsWith("/api/alertas") ||
        request.url.startsWith("/api/mantenimiento")
      ) {
        if (user.rol === "OPERADOR") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «OPERADOR» no tiene permisos para acceder a módulos administrativos.`,
          });
        }
      }
    }
  });

  // 3. Probes de Salud Operativa y Seed Demo
  app.get("/healthz", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/readyz", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ready",
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return reply.status(503).send({
        status: "not_ready",
        database: "disconnected",
        timestamp: new Date().toISOString(),
        error: errMsg,
      });
    }
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/health",
    handler: async () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "Sistema Medidores",
      };
    },
  });

  app.get("/api/config", async () => {
    return {
      env: config.NODE_ENV,
      features: {
        devRoleSwitcher: config.NODE_ENV === "development" || config.NODE_ENV === "test",
      },
    };
  });

  app.post("/api/demo/seed", async (_req, reply) => {
    // Guardia fail-closed: demo solo en dev/test (feat-027)
    if (!isDemoSeedEnabled(config.NODE_ENV)) {
      return reply.status(403).send({
        error: "DEMO_SEED_DISABLED",
        message: "Carga de datos demo deshabilitada fuera de desarrollo.",
      });
    }
    try {
      // 1. Usuarios Demo con los 3 Roles: ADMIN, SUPERVISOR, OPERADOR
      const defaultPasswordHash = await hashPassword("demo1234");

      await prisma.usuario.upsert({
        where: { email: "admin@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "ADMIN", activo: true, nombre: "Administrador Central" },
        create: {
          email: "admin@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Administrador Central",
          rol: "ADMIN",
          activo: true,
        },
      });

      const supervisorUser = await prisma.usuario.upsert({
        where: { email: "supervisor@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "SUPERVISOR", activo: true, nombre: "Carlos Supervisor (Planta Norte)" },
        create: {
          email: "supervisor@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Carlos Supervisor (Planta Norte)",
          rol: "SUPERVISOR",
          activo: true,
        },
      });

      const operadorUser = await prisma.usuario.upsert({
        where: { email: "operador@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "OPERADOR", activo: true, nombre: "Juan Operador Terreno" },
        create: {
          email: "operador@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Juan Operador Terreno",
          rol: "OPERADOR",
          activo: true,
        },
      });

      // 2. Instalaciones
      let instNorte = await prisma.instalacion.findUnique({ where: { nombre: "Planta Industrial Norte" } });
      if (!instNorte) {
        instNorte = await prisma.instalacion.create({
          data: { nombre: "Planta Industrial Norte", ubicacion: "Sector Industrial Panamericana Km 15", activa: true },
        });
      }

      let instCorp = await prisma.instalacion.findUnique({ where: { nombre: "Edificio Corporativo" } });
      if (!instCorp) {
        instCorp = await prisma.instalacion.create({
          data: { nombre: "Edificio Corporativo", ubicacion: "Av. Las Condes 12500", activa: true },
        });
      }

      // 3. Asignaciones de Roles a Instalaciones
      // Supervisor asignado únicamente a Planta Norte
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instNorte.id, usuarioId: supervisorUser.id } },
        update: {},
        create: { instalacionId: instNorte.id, usuarioId: supervisorUser.id },
      });

      // Operador asignado a Planta Norte y Edificio Corporativo
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instNorte.id, usuarioId: operadorUser.id } },
        update: {},
        create: { instalacionId: instNorte.id, usuarioId: operadorUser.id },
      });
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instCorp.id, usuarioId: operadorUser.id } },
        update: {},
        create: { instalacionId: instCorp.id, usuarioId: operadorUser.id },
      });

      // 4. Tipos de Medidor
      const tiposData = [
        { nombre: "Agua Potable Red", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO", multiplicador: 1, capacidadMaxima: null },
        { nombre: "Electricidad Trifásica", recurso: "LUZ", unidad: "KWH", tipoMedicion: "ACUMULATIVO", multiplicador: 1, capacidadMaxima: null },
        { nombre: "Diésel Generador Respaldo", recurso: "PETROLEO", unidad: "LITROS", tipoMedicion: "NIVEL", multiplicador: 1, capacidadMaxima: 5000 },
        { nombre: "Gas Natural Calderas", recurso: "GAS", unidad: "M3", tipoMedicion: "ACUMULATIVO", multiplicador: 1, capacidadMaxima: null },
      ];

      const tiposMap = new Map<string, string>();
      for (const t of tiposData) {
        let tipo = await prisma.tipoMedidor.findUnique({ where: { nombre: t.nombre } });
        if (!tipo) {
          tipo = await prisma.tipoMedidor.create({ data: { ...t, activo: true } });
        } else {
          // Backfill idempotente de factor y capacidad (feat-024)
          const cur = tipo as unknown as { multiplicador?: number | null; capacidadMaxima?: number | null };
          if ((cur.multiplicador ?? 1) !== t.multiplicador || (cur.capacidadMaxima ?? null) !== t.capacidadMaxima) {
            tipo = await prisma.tipoMedidor.update({
              where: { id: tipo.id },
              data: { multiplicador: t.multiplicador, capacidadMaxima: t.capacidadMaxima },
            });
          }
        }
        tiposMap.set(t.nombre, tipo.id);
      }

      // 5. Medidores Físicos
      const medidoresData = [
        { codigo: "MED-AG-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Agua Potable Red")!, ubicacionInterna: "Sala de bombas - Patio Exterior" },
        { codigo: "MED-LUZ-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Electricidad Trifásica")!, ubicacionInterna: "Subestación Eléctrica 1" },
        { codigo: "MED-DIE-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Diésel Generador Respaldo")!, ubicacionInterna: "Patio de Tanques - Tanque 5.000L" },
        { codigo: "MED-AG-CORP-01", instalacionId: instCorp.id, tipoMedidorId: tiposMap.get("Agua Potable Red")!, ubicacionInterna: "Subterráneo -1 Sala Técnica" },
        { codigo: "MED-GAS-CORP-01", instalacionId: instCorp.id, tipoMedidorId: tiposMap.get("Gas Natural Calderas")!, ubicacionInterna: "Azotea Climatización" },
      ];

      const medidoresMap = new Map<string, string>();
      for (const m of medidoresData) {
        const medidor = await prisma.medidor.upsert({
          where: { codigo: m.codigo },
          update: { activo: true, instalacionId: m.instalacionId, tipoMedidorId: m.tipoMedidorId, ubicacionInterna: m.ubicacionInterna },
          create: { ...m, activo: true },
        });
        medidoresMap.set(m.codigo, medidor.id);
      }

      // 6. Lecturas de prueba
      const ahora = Date.now();
      const medidorAgNorte = medidoresMap.get("MED-AG-NORTE-01")!;
      const countLecturas = await prisma.lectura.count({ where: { medidorId: medidorAgNorte } });

      if (countLecturas === 0) {
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1200.0, fechaLectura: new Date(ahora - 48 * 3600 * 1000), notas: "Lectura inicial" },
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1245.5, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Cierre día anterior" },
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1289.0, fechaLectura: new Date(ahora - 2 * 3600 * 1000), notas: "Turno mañana" },
          ],
        });

        const medidorLuzNorte = medidoresMap.get("MED-LUZ-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorLuzNorte, operadorId: operadorUser.id, valor: 45000.0, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Lectura inicio de semana" },
            { medidorId: medidorLuzNorte, operadorId: operadorUser.id, valor: 45320.0, fechaLectura: new Date(ahora - 1 * 3600 * 1000), notas: "Turno actual" },
          ],
        });

        const medidorDieNorte = medidoresMap.get("MED-DIE-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorDieNorte, operadorId: operadorUser.id, valor: 4800.0, fechaLectura: new Date(ahora - 72 * 3600 * 1000), notas: "Llenado de estanque" },
            { medidorId: medidorDieNorte, operadorId: operadorUser.id, valor: 4200.0, fechaLectura: new Date(ahora - 30 * 3600 * 1000), notas: "Consumo prueba de generador" },
          ],
        });
      }

      // 7. Reglas de alertas iniciales
      const countReglas = await prisma.reglaAlerta.count();
      if (countReglas === 0) {
        await prisma.reglaAlerta.createMany({
          data: [
            { nombre: "Alerta por Medidor sin Reporte > 48 horas", tipo: "SIN_REPORTE", umbralValor: 48, activa: true },
            { nombre: "Detección de Salto Atípico de Consumo (+50%)", tipo: "SALTO_CONSUMO", umbralValor: 50, activa: true },
            { nombre: "Detección de Fuga Continua en Agua", tipo: "FUGA_PROBABLE", recurso: "AGUA", umbralValor: 3, activa: true },
          ],
        });
      }

      // 8. Registro de mantenimiento inicial de prueba
      const countMantenimientos = await prisma.registroMantenimiento.count();
      if (countMantenimientos === 0) {
        const medidorAgNorteId = medidoresMap.get("MED-AG-NORTE-01");
        if (medidorAgNorteId) {
          await prisma.registroMantenimiento.create({
            data: {
              medidorId: medidorAgNorteId,
              tipo: "CALIBRACION",
              fechaMantenimiento: new Date(ahora - 90 * 24 * 3600 * 1000),
              proximaCalibracion: new Date(ahora + 275 * 24 * 3600 * 1000),
              tecnicoResponsable: "Ing. Rodrigo Silva (Dictuc)",
              certificadoCalibracion: "CERT-DICTUC-2026-081",
              numeroPrecintoAnterior: "PREC-ANT-90",
              numeroPrecintoNuevo: "PREC-AG-2026-01",
              observaciones: "Calibración reglamentaria y colocación de precinto de seguridad sellado.",
            },
          });
          await prisma.medidor.update({
            where: { id: medidorAgNorteId },
            data: {
              precintoActual: "PREC-AG-2026-01",
              fechaUltimaCalibracion: new Date(ahora - 90 * 24 * 3600 * 1000),
              fechaProximaCalibracion: new Date(ahora + 275 * 24 * 3600 * 1000),
            },
          });
        }
      }

      // 9. Pista de Auditoría inicial de prueba
      const countAuditoria = await prisma.auditoriaEvento.count();
      if (countAuditoria === 0) {
        const medidorAgNorteId = medidoresMap.get("MED-AG-NORTE-01");
        await prisma.auditoriaEvento.createMany({
          data: [
            {
              accion: "CAMBIO_ROL",
              entidad: "USUARIO",
              entidadId: supervisorUser.id,
              usuarioId: null,
              detalles: JSON.stringify({ rolAnterior: "OPERADOR", rolNuevo: "SUPERVISOR", email: "supervisor@medidores.cl" }),
              ip: "127.0.0.1",
              createdAt: new Date(ahora - 5 * 24 * 3600 * 1000),
            },
            ...(medidorAgNorteId
              ? [
                  {
                    accion: "CAMBIO_PRECINTO",
                    entidad: "MEDIDOR",
                    entidadId: medidorAgNorteId,
                    usuarioId: null,
                    detalles: JSON.stringify({
                      medidorCodigo: "MED-AG-NORTE-01",
                      precintoAnterior: "PREC-ANT-90",
                      precintoNuevo: "PREC-AG-2026-01",
                      tecnicoResponsable: "Ing. Rodrigo Silva (Dictuc)",
                    }),
                    ip: "127.0.0.1",
                    createdAt: new Date(ahora - 90 * 24 * 3600 * 1000),
                  },
                ]
              : []),
          ],
        });
      }

      return reply.status(200).send({
        status: "ok",
        message: "Demostración y usuarios RBAC inicializados exitosamente",
        credencialesDemo: [
          { email: "admin@medidores.cl", pass: "demo1234", rol: "ADMIN" },
          { email: "supervisor@medidores.cl", pass: "demo1234", rol: "SUPERVISOR", instalacion: "Planta Industrial Norte" },
          { email: "operador@medidores.cl", pass: "demo1234", rol: "OPERADOR", instalaciones: ["Planta Norte", "Corporativo"] },
        ],
        seedData: {
          instalaciones: [
            { id: instNorte.id, nombre: instNorte.nombre },
            { id: instCorp.id, nombre: instCorp.nombre },
          ],
          medidores: medidoresData.map((m) => m.codigo),
          usuarios: ["admin@medidores.cl", "supervisor@medidores.cl", "operador@medidores.cl"],
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: "SEED_FAILED", message: errorMsg });
    }
  });

  // 4. Adaptadores de verificación entre módulos
  const instalacionesVerifService: IInstalacionesVerificationService = {
    async verifyInstalacionActiva(id: string) {
      const inst = await prisma.instalacion.findUnique({ where: { id } });
      if (!inst) throw new InstalacionNotFoundError(id);
      if (!inst.activa) throw new InstalacionInactivaError(id);
    },
  };

  const medidorInfoService: IMedidorInfoService = {
    async getMedidorInfo(medidorId: string) {
      const medidor = await prisma.medidor.findUnique({
        where: { id: medidorId },
        include: { tipoMedidor: true },
      });
      if (!medidor) return null;
      const tipo = medidor.tipoMedidor as unknown as { tipoMedicion: string; multiplicador?: number | null; capacidadMaxima?: number | null };
      const med = medidor as unknown as { factorInstalacion?: number | null };
      // Factor efectivo: override por activo, si no el del tipo, si no 1 (feat-025)
      const efectivo = med.factorInstalacion ?? tipo.multiplicador ?? 1;
      return {
        id: medidor.id,
        instalacionId: medidor.instalacionId,
        activo: medidor.activo,
        tipoMedicion: tipo.tipoMedicion as
          | "ACUMULATIVO"
          | "INSTANTANEO"
          | "NIVEL",
        multiplicador: efectivo,
        capacidadMaxima: tipo.capacidadMaxima ?? null,
      };
    },
  };

  const operadorAccessService: IOperadorAccessService = {
    async isOperadorAssigned(operadorId: string, instalacionId: string) {
      const user = await prisma.usuario.findUnique({ where: { id: operadorId } });
      if (user && (user.rol === "ADMIN" || user.rol === "SUPERVISOR")) {
        return true;
      }
      const asignacion = await prisma.asignacionOperador.findUnique({
        where: {
          instalacionId_usuarioId: {
            instalacionId,
            usuarioId: operadorId,
          },
        },
      });
      return !!asignacion;
    },
  };

  const instalacionesRepo = new PrismaInstalacionesRepository(prisma);
  const instalacionesService = new InstalacionesService(instalacionesRepo, auditoriaService);

  const medidoresRepo = new PrismaMedidoresRepository(prisma);
  const medidoresService = new MedidoresService(medidoresRepo, instalacionesVerifService, auditoriaService);

  const lecturasRepo = new PrismaLecturasRepository(prisma);
  const lecturasService = new LecturasService(
    lecturasRepo,
    medidorInfoService,
    operadorAccessService
  );

  const dashboardRepo = new PrismaDashboardRepository(prisma);
  const dashboardService = new DashboardService(dashboardRepo);

  const reportesRepo = new PrismaReportesRepository(prisma);
  const reportesService = new ReportesService(reportesRepo);
  const consumosService = new ConsumosService(new PrismaConsumosRepository(prisma));

  const webhooksRepo = new PrismaWebhooksRepository(prisma);
  const webhooksService = options.webhooksService ?? new WebhookDispatcherService(webhooksRepo);

  const notificacionesRepo = new PrismaNotificacionesRepository(prisma);
  const notificacionesService =
    options.notificacionesService ??
    new NotificacionesService(notificacionesRepo, {
      telegramBotToken: config.TELEGRAM_BOT_TOKEN,
      telegramChatId: config.TELEGRAM_CHAT_ID,
      vapidPublicKey: config.VAPID_PUBLIC_KEY,
      vapidPrivateKey: config.VAPID_PRIVATE_KEY,
      vapidSubject: config.VAPID_SUBJECT,
    });

  const alertasRepo = new PrismaAlertasRepository(prisma);
  const alertasService = new AlertasService(alertasRepo, webhooksService, notificacionesService);

  const mantenimientoRepo = new PrismaMantenimientoRepository(prisma);
  const mantenimientoService = new MantenimientoService(mantenimientoRepo, auditoriaService);

  const calibracionesChecker: ICalibracionesChecker = {
    async verificarCalibracionesProximas(diasAnticipacion = 30) {
      const ahora = new Date();
      const limite = new Date(ahora.getTime() + diasAnticipacion * 24 * 3600 * 1000);

      const medidores = await prisma.medidor.findMany({
        where: {
          activo: true,
          fechaProximaCalibracion: {
            not: null,
            lte: limite,
          },
        },
        include: {
          instalacion: true,
        },
      });

      const detalles: Array<{
        medidorCodigo: string;
        fechaProximaCalibracion: Date;
        estado: "PROXIMA" | "VENCIDA";
      }> = [];

      let eventosDespachados = 0;

      for (const m of medidores) {
        if (!m.fechaProximaCalibracion) continue;
        const esVencida = m.fechaProximaCalibracion.getTime() < ahora.getTime();
        const estado: "PROXIMA" | "VENCIDA" = esVencida ? "VENCIDA" : "PROXIMA";
        const diffDias = Math.round(
          (m.fechaProximaCalibracion.getTime() - ahora.getTime()) / (1000 * 3600 * 24)
        );

        detalles.push({
          medidorCodigo: m.codigo,
          fechaProximaCalibracion: m.fechaProximaCalibracion,
          estado,
        });

        await webhooksService.despacharEvento({
          event: esVencida ? "medidor.calibracion_vencida" : "medidor.calibracion_proxima",
          severity: esVencida ? "CRITICAL" : "WARNING",
          title: esVencida
            ? `Calibración periódica VENCIDA para medidor ${m.codigo}`
            : `Calibración periódica PRÓXIMA A VENCER para medidor ${m.codigo}`,
          message: esVencida
            ? `El medidor ${m.codigo} (${m.instalacion.nombre}) tiene su calibración periódica vencida desde hace ${Math.abs(diffDias)} días.`
            : `El medidor ${m.codigo} (${m.instalacion.nombre}) requiere calibración periódica en ${diffDias} días.`,
          data: {
            medidorId: m.id,
            medidorCodigo: m.codigo,
            instalacionNombre: m.instalacion.nombre,
            fechaProximaCalibracion: m.fechaProximaCalibracion,
            diasRestantes: diffDias,
            estado,
          },
        }).catch(() => {});

        eventosDespachados++;
      }

      return {
        medidoresEvaluados: medidores.length,
        eventosDespachados,
        detalles,
      };
    },
  };

  // 4.5. Manejador Centralizado de Errores y Trigger de Webhooks ante Errores Críticos (ADR 0006)
  app.setErrorHandler(async (error: FastifyError | Error, request, reply) => {
    const err = error as { statusCode?: number; name?: string; message?: string; stack?: string };
    const statusCode = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error(
        {
          err: error,
          reqId: request.id,
          method: request.method,
          url: request.url,
          statusCode,
        },
        `Error crítico de servidor: ${err.message ?? "Error desconocido"}`
      );

      try {
        await webhooksService.despacharEvento({
          event: "sistema.error_critico",
          severity: "CRITICAL",
          title: `Error Crítico de Servidor en ${request.method} ${request.url}`,
          message: err.message || "Error interno del servidor",
          data: {
            reqId: request.id,
            method: request.method,
            url: request.url,
            statusCode,
            errorName: err.name || "Error",
            timestamp: new Date().toISOString(),
          },
        });

        await notificacionesService.despacharNotificacion({
          evento: "sistema.error_critico",
          severidad: "CRITICAL",
          titulo: `Error Crítico de Servidor en ${request.method} ${request.url}`,
          mensaje: err.message || "Error interno del servidor",
          datos: {
            reqId: request.id,
            method: request.method,
            url: request.url,
            statusCode,
          },
        });
      } catch {
        // Fail-safe: errores en el despacho saliente no interfieren con la respuesta HTTP
      }

      return reply.status(500).send({
        statusCode: 500,
        error: "INTERNAL_SERVER_ERROR",
        message: "Error interno del servidor",
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: err.name || "BAD_REQUEST",
      message: err.message ?? "Error en la solicitud",
    });
  });

  // 5. Registro de Controladores
  await app.register(createUsuariosController(usuariosService), { prefix: "/api" });
  await app.register(createInstalacionesController(instalacionesService), { prefix: "/api" });
  await app.register(createMedidoresController(medidoresService), { prefix: "/api" });
  await app.register(createLecturasController(lecturasService, consumosService), { prefix: "/api" });
  await app.register(createDashboardController(dashboardService), { prefix: "/api" });
  await app.register(createReportesController(reportesService, consumosService), { prefix: "/api" });
  await app.register(createAlertasController(alertasService), { prefix: "/api" });
  await app.register(createMantenimientoController(mantenimientoService), { prefix: "/api" });
  await app.register(createAuditoriaController(auditoriaService), { prefix: "/api" });
  await app.register(createWebhooksController(webhooksService, calibracionesChecker), {
    prefix: "/api/webhooks",
  });
  await app.register(createNotificacionesController(notificacionesService), {
    prefix: "/api/notificaciones",
  });

  // 6. Endpoints complementarios para Frontend & RBAC
  app.get("/api/instalaciones", async (request: FastifyRequest<{ Querystring: { estado?: string } }>) => {
    const user = (request as unknown as { user?: { rol: string; allowedInstalacionIds?: string[] } }).user;
    const where: { activa?: boolean; id?: { in: string[] } } = {};
    if (user && user.rol !== "ADMIN") {
      where.id = { in: user.allowedInstalacionIds || [] };
      where.activa = true;
    } else {
      const estado = request.query?.estado || "activas";
      if (estado === "activas") {
        where.activa = true;
      } else if (estado === "archivadas") {
        where.activa = false;
      }
    }
    const list = await prisma.instalacion.findMany({ where, orderBy: { nombre: "asc" } });
    return list.map((i) => {
      const { enPeriodoGracia, diasRestantesGracia } = calcularPeriodoGracia(i.createdAt);
      return {
        ...i,
        direccion: i.ubicacion,
        enPeriodoGracia,
        diasRestantesGracia,
      };
    });
  });

  app.get("/api/instalaciones/operador/:usuarioId", async (req: FastifyRequest<{ Params: { usuarioId: string } }>) => {
    const asignaciones = await prisma.asignacionOperador.findMany({
      where: { usuarioId: req.params.usuarioId },
      include: { instalacion: true },
    });
    return asignaciones
      .map((a) => a.instalacion)
      .filter((i) => i.activa)
      .map((i) => ({
        ...i,
        direccion: i.ubicacion,
      }));
  });

  const LecturasRecientesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
  });

  app.get("/api/lecturas/recientes", async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
    const parsed = LecturasRecientesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Parámetro limit inválido (debe ser un número entero entre 1 y 100)",
        details: parsed.error.format(),
      });
    }
    const user = (req as unknown as { user?: { allowedInstalacionIds?: string[] } }).user;
    return await dashboardService.obtenerActividadReciente(parsed.data.limit, user?.allowedInstalacionIds);
  });

  app.post("/api/admin/backup", async (request, reply) => {
    const user = (request as unknown as { user?: { rol: string; userId: string } }).user;
    if (!user || user.rol !== "ADMIN") {
      return reply.status(403).send({
        error: "ACCESO_DENEGADO",
        message: "Acceso denegado: solo administradores pueden generar respaldos de base de datos.",
      });
    }

    const parsed = BackupRequestSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Datos de solicitud inválidos",
        details: parsed.error.format(),
      });
    }

    const backupResult = await createHotBackup(prisma, {
      customFilename: parsed.data.nombreArchivo,
    });

    // Registrar en pista inmutable de auditoría (Regla 10)
    await auditoriaService.registrarEvento({
      usuarioId: user.userId,
      accion: "BACKUP_SISTEMA",
      entidad: "SISTEMA",
      entidadId: backupResult.archivo,
      detalles: {
        archivo: backupResult.archivo,
        rutaAbsoluta: backupResult.rutaAbsoluta,
        tamanoBytes: backupResult.tamanoBytes,
      },
      ip: request.ip,
    });

    return reply.status(200).send(backupResult);
  });

  return app;
}
