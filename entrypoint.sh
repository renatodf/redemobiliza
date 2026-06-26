#!/bin/sh
set -e

echo "Aplicando migrations do banco de dados..."
node_modules/.bin/prisma migrate deploy || echo "AVISO: migrate falhou — app iniciará mesmo assim, verifique conectividade com o banco"

echo "Iniciando servidor Next.js..."
exec node server.js
