#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== APEX Chatter Trainer — Запуск ==="

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Ошибка: файл .env не найден. Скопируйте .env.example в .env и заполните ключи."
    exit 1
fi

if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo "Создание виртуального окружения..."
    python3 -m venv "$SCRIPT_DIR/venv"
fi

echo "Активация venv..."
source "$SCRIPT_DIR/venv/bin/activate"

echo "Установка зависимостей..."
pip install -r "$SCRIPT_DIR/requirements.txt" --quiet

echo "Запуск бота..."
python -m app.main
