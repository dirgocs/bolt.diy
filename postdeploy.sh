#!/bin/bash
set -e

echo "=== INICIANDO POSTDEPLOY ==="

# Identifica o container do serviço "bolt-app" pela label do Docker Compose
container_id=$(docker ps --filter "label=com.docker.compose.service=bolt-app" --format "{{.ID}}")
if [ -z "$container_id" ]; then
  echo "Container para o serviço 'bolt-app' não encontrado!"
  exit 1
fi

echo "=== Configurando Wrangler Secret para SESSION_SECRET ==="
docker exec -T "$container_id" sh -c "echo '$SESSION_SECRET' | wrangler secret put SESSION_SECRET"

echo "=== Verificando a existência da network 'bolt_network' ==="
if ! docker network inspect bolt_network >/dev/null 2>&1; then
  echo "Network 'bolt_network' não encontrada. Criando..."
  docker network create bolt_network
else
  echo "Network 'bolt_network' já existe."
fi

echo "=== Configurando bucket no Minio ==="
mc alias set supabase-minio http://supabase-minio:9000 "${SERVICE_USER_MINIO}" "${SERVICE_PASSWORD_MINIO}"
mc mb --ignore-existing supabase-minio/bolt-app-files

echo "=== Executando migrações do banco de dados ==="
if [ -f migrations.sql ]; then
  echo "Executando migrations.sql..."
  psql "$DATABASE_URL" -f migrations.sql
elif [ -d migrations ]; then
  echo "Executando migrações na pasta 'migrations'..."
  for file in $(ls migrations/*.sql | sort); do
    echo "Executando $file..."
    psql "$DATABASE_URL" -f "$file"
  done
else
  echo "Nenhum arquivo de migração encontrado."
fi

echo "=== Post-deploy concluído! ==="
