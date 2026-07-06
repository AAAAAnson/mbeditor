#!/bin/sh
# /app/data 为具名卷挂载点;确保其与子目录存在(网关配置 gateway.json 落在 /app/data)。
mkdir -p /app/data /app/data/images /app/data/articles
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
