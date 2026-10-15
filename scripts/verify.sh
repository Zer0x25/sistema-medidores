#!/usr/bin/env bash
# ==============================================================================
# Script de Quality Gate Determinista para Agentes de Software
# ==============================================================================
# Este script actúa como barrera inmutable. Si algún paso falla (código != 0),
# la ejecución se detiene de inmediato con salida 1, forzando al agente a autocorregir.
# ==============================================================================

set -euo pipefail

# Colores para salida de terminal
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   QUALITY GATE DETERMINISTA - VERIFICACIÓN DE REPO   ${NC}"
echo -e "${BLUE}======================================================${NC}"

# FASE A: Verificación en estado Semilla (Hito 0 previo a andamiaje)
if [ ! -f "package.json" ]; then
  echo -e "${YELLOW}[ESTADO] Repositorio en fase de semilla (Hito 0).${NC}"
  echo -e "${BLUE}--> Verificando integridad estructural del blueprint...${NC}"

  ARCHIVOS_CRITICOS=(
    "AGENTS.md"
    "STATE.md"
    ".agents/bootstrap.md"
    "docs/adr/0000-template.md"
    "docs/adr/0000-adopcion-gobernanza-agentica.md"
    "specs/templates/feature.template.md"
    ".env.example"
    "src/core/errors.ts"
  )

  ERRORES=0
  for ARCHIVO in "${ARCHIVOS_CRITICOS[@]}"; do
    if [ -f "$ARCHIVO" ]; then
      echo -e "${GREEN}✓ Presente: $ARCHIVO${NC}"
    else
      echo -e "${RED}✗ Falta archivo crítico: $ARCHIVO${NC}"
      ERRORES=$((ERRORES + 1))
    fi
  done

  if [ $ERRORES -eq 0 ]; then
    echo -e "\n${GREEN}======================================================${NC}"
    echo -e "${GREEN}✓ Semilla estructural íntegra y lista para Hito 0.${NC}"
    echo -e "${GREEN}Instrucción: Abre el agente y di 'Inicia Hito 0'${NC}"
    echo -e "${GREEN}======================================================${NC}"
    exit 0
  else
    echo -e "\n${RED}======================================================${NC}"
    echo -e "${RED}✗ La estructura semilla está incompleta ($ERRORES errores).${NC}"
    echo -e "${RED}======================================================${NC}"
    exit 1
  fi
fi

# FASE B: Verificación de Código de Producción (Post Hito 0 / Hito 1+)
echo -e "${BLUE}[ESTADO] Entorno compilado detectado (package.json presente).${NC}"

# Asegurar entorno y configuración determinista si no existe .env
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo -e "${YELLOW}[CONFIG] No se detectó .env. Creando .env desde .env.example para pruebas...${NC}"
  cp .env.example .env
fi

if [ -f "prisma/schema.prisma" ]; then
  # Prisma necesita un archivo SQLite inicializado en algunos runtimes. Crear solo si falta;
  # resolver rutas relativas contra schema.prisma y jamás truncar almacenamiento existente.
  node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.startsWith("file:")) {
  const databasePath = path.resolve("prisma", databaseUrl.slice(5).split("?")[0]);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  if (!fs.existsSync(databasePath)) fs.closeSync(fs.openSync(databasePath, "ax"));
}
NODE
  npx prisma generate
  npx prisma db push --skip-generate
fi

# 1. Chequeo de Tipos Estricto
echo -e "\n${BLUE}--> [Paso 1/3] Verificación de Tipos (Typecheck)...${NC}"
if npm run typecheck; then
  echo -e "${GREEN}✓ Typecheck superado sin errores.${NC}"
else
  echo -e "${RED}✗ Error en Typecheck. Corrige los tipos antes de continuar.${NC}"
  exit 1
fi

# 2. Análisis Estático y Linter
echo -e "\n${BLUE}--> [Paso 2/3] Análisis Estático (Linter)...${NC}"
if npm run lint; then
  echo -e "${GREEN}✓ Linter superado sin advertencias críticas.${NC}"
else
  echo -e "${RED}✗ Error de Linter. Corrige el formato o las reglas violadas.${NC}"
  exit 1
fi

# 3. Suite de Pruebas Automatizadas
echo -e "\n${BLUE}--> [Paso 3/3] Suite de Pruebas (Tests)...${NC}"
if npm test; then
  echo -e "${GREEN}✓ Todos los tests pasaron exitosamente (100%).${NC}"
else
  echo -e "${RED}✗ Pruebas fallidas. El código no satisface los criterios de aceptación.${NC}"
  exit 1
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ✓ QUALITY GATE CUMPLIDO: CÓDIGO DE SALIDA 0        ${NC}"
echo -e "${GREEN}======================================================${NC}"
exit 0
