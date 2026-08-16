# APEX Chatter Trainer — Telegram Bot

AI-тренер по продажам в Telegram. Симулирует клиентов, анализирует диалоги, ищет скрипты, отслеживает прогресс.

## Возможности

- **Тренировка** — 6 режимов симуляции клиента (быстрый раунд, продажи, возражения, холодный диалог, сложный клиент, свободная)
- **Симулятор** — stateful диалог с AI-клиентом, оценка по 12 навыкам
- **Разбор диалога** — загрузка текста/TXT/JSON файла для анализа
- **Поиск скриптов** — поиск по базе знаний + AI-генерация ответа
- **Возражения** — работа с конкретными возражениями клиента
- **База знаний** — категории: Scripts, Objections, Dialogues, Examples, Training, Psychology, Sales, Mistakes, Templates
- **Статистика** — количество тренировок, средняя оценка, лучший результат, профиль навыков
- **Прогрессия** — 6 уровней сложности (FOUNDATION → ELITE)
- **AI Router** — OpenRouter + Mistral с автоматическим fallback
- **Админ-панель** — управление пользователями, базой знаний, рассылка, логи ошибок

## Установка (Linux/VPS)

### 1. Установка Python

```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip -y
```

### 2. Клонирование проекта

```bash
cd /opt
# Скопируйте файлы проекта в /opt/apex-trainer
cd apex-trainer
```

### 3. Создание виртуального окружения

```bash
python3 -m venv venv
source venv/bin/activate
```

### 4. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 5. Настройка .env

```bash
cp .env.example .env
nano .env
```

Заполните:
- `BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather)
- `OPENROUTER_API_KEY` — ключ с [openrouter.ai](https://openrouter.ai)
- `MISTRAL_API_KEY` — ключ с [console.mistral.ai](https://console.mistral.ai)
- `DATABASE_URL` — строка подключения PostgreSQL (Supabase: `postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres`)
- `ADMIN_TELEGRAM_IDS` — ваш Telegram ID (узнать у [@userinfobot](https://t.me/userinfobot))

### 6. Запуск миграций

Миграции базы данных уже применены через Supabase. Если используете отдельный PostgreSQL, выполните SQL из `supabase/migrations/20260816142642_create_telegram_bot_schema.sql`.

### 7. Запуск бота

```bash
./start.sh
```

Или вручную:

```bash
source venv/bin/activate
python -m app.main
```

## Запуск через Docker

```bash
docker-compose up -d --build
```

## Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Главное меню |
| `/help` | Справка |
| `/stats` | Моя статистика |
| `/cancel` | Отменить действие |
| `/admin` | Панель администратора (только для админов) |

## Архитектура

```
Telegram User
    ↓
Telegram Bot (aiogram 3.x)
    ↓
Backend API (Python async)
    ↓
AI Provider Router
    ├── OpenRouter API
    └── Mistral API (fallback)
    ↓
PostgreSQL (Supabase)
    ↓
Training Engine
    ├── Simulator
    ├── Evaluator
    └── Knowledge Search
```

## Структура проекта

```
app/
├── bot/
│   ├── handlers/      — обработчики сообщений и callback
│   ├── keyboards/     — inline и reply клавиатуры
│   ├── middlewares/   — middleware (создание юзера, логирование)
│   └── states/        — FSM состояния
├── ai/
│   ├── openrouter.py  — OpenRouter провайдер
│   ├── mistral.py     — Mistral провайдер
│   ├── router.py      — AI роутер с fallback
│   └── prompts.py     — системные промпты
├── database/
│   ├── models.py      — дата-классы
│   ├── repository.py  — доступ к БД
│   └── database.py    — пул соединений
├── training/
│   ├── simulator.py   — симулятор тренировок
│   ├── evaluator.py   — статистика и оценка
│   └── knowledge.py   — поиск по базе знаний
├── config.py          — конфигурация из .env
└── main.py            — точка входа
```

## Переменные окружения

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `BOT_TOKEN` | Токен Telegram бота | Да |
| `OPENROUTER_API_KEY` | Ключ OpenRouter | Да (один из двух) |
| `OPENROUTER_MODEL` | Модель OpenRouter | Нет (по умолчанию `openai/gpt-4o-mini`) |
| `MISTRAL_API_KEY` | Ключ Mistral | Да (один из двух) |
| `MISTRAL_MODEL` | Модель Mistral | Нет (по умолчанию `mistral-large-latest`) |
| `DATABASE_URL` | Строка подключения PostgreSQL | Да |
| `AI_PROVIDER` | Основной провайдер (`openrouter` или `mistral`) | Нет |
| `FALLBACK_ENABLED` | Включить fallback между провайдерами | Нет |
| `ADMIN_TELEGRAM_IDS` | ID администраторов через запятую | Нет |
| `LOG_LEVEL` | Уровень логирования | Нет |
