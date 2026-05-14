-- ============================================================
-- Extensions — Extensiones activas en el proyecto Supabase
-- Última verificación: 2026-05-14
-- ============================================================

-- Generación de UUIDs (usado en casi todas las tablas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Funciones criptográficas (gen_random_uuid, pgcrypto)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Estadísticas de ejecución de queries
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;

-- Lenguaje procedural base de PostgreSQL
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA pg_catalog;

-- Vault de Supabase para secretos encriptados
-- (instalado automáticamente por Supabase, schema: vault)
-- CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
