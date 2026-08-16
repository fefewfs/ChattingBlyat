import logging
import json

from aiogram import Router, F, Bot
from aiogram.types import (
    Message, CallbackQuery, ReplyKeyboardRemove,
)
from aiogram.fsm.context import FSMContext

from app.config import config
from app.database import repository
from app.database.database import check_db_connection
from app.database.models import LEVELS, SKILL_LABELS_RU
from app.ai import router as ai_router
from app.ai.prompts import TRAINING_MODE_PROMPTS
from app.training import simulator, evaluator, knowledge
from app.bot.keyboards.keyboards import (
    main_menu_kb, training_modes_kb, cancel_kb, finish_training_kb,
    admin_kb, knowledge_categories_kb, settings_kb,
)
from app.bot.states.states import (
    TrainingStates, DialogueStates, SearchStates, ObjectionStates, AdminStates,
)

logger = logging.getLogger(__name__)

router = Router()

TELEGRAM_MAX_LEN = 4096


def _split_message(text: str, max_len: int = TELEGRAM_MAX_LEN) -> list[str]:
    if len(text) <= max_len:
        return [text]
    parts = []
    while text:
        if len(text) <= max_len:
            parts.append(text)
            break
        split = text.rfind("\n", 0, max_len)
        if split == -1 or split < max_len // 2:
            split = text.rfind(" ", 0, max_len)
        if split == -1:
            split = max_len
        parts.append(text[:split])
        text = text[split:].lstrip()
    return parts


async def _send_long(message: Message, text: str, reply_markup=None):
    parts = _split_message(text)
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            await message.answer(part, reply_markup=reply_markup)
        else:
            await message.answer(part)


# ============ /start ============
@router.message(F.text == "/start")
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    user = message.from_user
    is_admin = user.id in config.admin_ids
    await repository.create_or_update_user(
        telegram_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_admin=is_admin,
    )

    greeting = (
        "APEX CHATTER TRAINER\n\n"
        "Твой персональный AI-тренер по продажам.\n"
        "Я буду симулировать клиентов, анализировать диалоги и помогать закрывать сделки.\n\n"
        "Выбери действие из меню ниже:"
    )
    await message.answer(greeting, reply_markup=main_menu_kb())


# ============ /help ============
@router.message(F.text == "/help")
async def cmd_help(message: Message):
    text = (
        "КОМАНДЫ:\n\n"
        "/start — главное меню\n"
        "/help — эта справка\n"
        "/stats — моя статистика\n"
        "/cancel — отменить текущее действие\n"
    )
    if message.from_user.id in config.admin_ids:
        text += "\n/admin — панель администратора\n"
    await message.answer(text)


# ============ /cancel ============
@router.message(F.text == "/cancel")
@router.message(F.text == "❌ Отмена")
async def cmd_cancel(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("Действие отменено.", reply_markup=main_menu_kb())


# ============ /stats ============
@router.message(F.text == "📊 Моя статистика")
@router.message(F.text == "/stats")
async def cmd_stats(message: Message):
    text = await evaluator.get_stats_text(message.from_user.id)
    await _send_long(message, text, reply_markup=main_menu_kb())


# ============ /settings ============
@router.message(F.text == "⚙️ Настройки")
async def cmd_settings(message: Message):
    await message.answer("Текущие настройки AI:", reply_markup=settings_kb())


# ============ Training ============
@router.message(F.text == "🎯 Тренировка")
async def cmd_training(message: Message, state: FSMContext):
    await state.set_state(TrainingStates.waiting_for_mode)
    await message.answer("Выбери режим тренировки:", reply_markup=training_modes_kb())


@router.callback_query(F.data.startswith("train:"))
async def cb_train_mode(callback: CallbackQuery, state: FSMContext):
    mode = callback.data.split(":", 1)[1]
    await callback.answer()
    await state.set_state(TrainingStates.in_training)

    try:
        session, opening = await simulator.start_training(callback.from_user.id, mode)
    except RuntimeError as e:
        await callback.message.answer(f"Ошибка: {e}\n\nПроверьте API ключи в .env")
        await state.clear()
        return

    await state.update_data(session_id=session.id, mode=mode)
    mode_label = TRAINING_MODE_PROMPTS.get(mode, {}).get("label", mode)
    text = f"Режим: {mode_label}\n\nКлиент:\n{opening}\n\n--- Отвечай обычным сообщением. Когда закончишь — нажми кнопку ниже ---"
    await callback.message.answer(text, reply_markup=finish_training_kb())


@router.callback_query(F.data == "finish_training")
async def cb_finish_training(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    data = await state.get_data()
    session_id = data.get("session_id")
    if not session_id:
        await callback.message.answer("Активная тренировка не найдена.")
        await state.clear()
        return

    session = await repository.get_session(session_id)
    if not session:
        await callback.message.answer("Сессия не найдена.")
        await state.clear()
        return

    await callback.message.answer("Анализирую диалог...")

    try:
        result = await simulator.finish_training(callback.from_user.id, session)
    except RuntimeError as e:
        await callback.message.answer(f"Ошибка при оценке: {e}")
        await state.clear()
        return

    feedback_text = simulator.format_feedback(result)
    await _send_long(callback.message, feedback_text, reply_markup=main_menu_kb())
    await state.clear()


# ============ Simulator (same as training but with explicit "simulator" label) ============
@router.message(F.text == "🥊 Симулятор")
async def cmd_simulator(message: Message, state: FSMContext):
    await state.set_state(TrainingStates.waiting_for_mode)
    await message.answer(
        "Симулятор клиента. Выбери тип клиента:",
        reply_markup=training_modes_kb(),
    )


# ============ Reply in training ============
@router.message(TrainingStates.in_training)
async def handle_training_reply(message: Message, state: FSMContext):
    data = await state.get_data()
    session_id = data.get("session_id")
    if not session_id:
        await state.clear()
        await message.answer("Сессия истекла. Начни заново.", reply_markup=main_menu_kb())
        return

    session = await repository.get_session(session_id)
    if not session or session.status != "active":
        await state.clear()
        await message.answer("Сессия завершена. Начни новую тренировку.", reply_markup=main_menu_kb())
        return

    try:
        reply = await simulator.reply_in_training(message.from_user.id, session, message.text)
    except RuntimeError as e:
        await message.answer(f"Ошибка AI: {e}\n\nПопробуй ещё раз или заверши тренировку.")
        return

    await _send_long(message, reply, reply_markup=finish_training_kb())


# ============ Dialogue Analysis ============
@router.message(F.text == "🧠 Разбор диалога")
async def cmd_dialogue(message: Message, state: FSMContext):
    await state.set_state(DialogueStates.waiting_for_dialogue)
    await message.answer(
        "Отправь текст диалога для анализа.\n\n"
        "Можно:\n"
        "— отправить текст одним или несколькими сообщениями\n"
        "— отправить TXT-файл\n"
        "— отправить JSON-файл\n\n"
        "Когда закончишь отправку, напиши «готово»",
        reply_markup=cancel_kb(),
    )


@router.message(DialogueStates.waiting_for_dialogue, F.document)
async def handle_dialogue_file(message: Message, state: FSMContext):
    doc = message.document
    if doc.file_size > 5 * 1024 * 1024:
        await message.answer("Файл слишком большой (макс 5 МБ).")
        return

    bot = message.bot
    file = await bot.get_file(doc.file_id)
    content = await bot.download_file(file.file_path)
    try:
        text = content.read().decode("utf-8", errors="replace")
    finally:
        content.close()

    if doc.file_name and doc.file_name.endswith(".json"):
        try:
            data = json.loads(text)
            text = json.dumps(data, indent=2, ensure_ascii=False)
        except Exception:
            pass

    await message.answer("Анализирую диалог...")
    try:
        result = await knowledge.analyze_dialogue(message.from_user.id, text)
        await _send_long(message, result, reply_markup=main_menu_kb())
    except RuntimeError as e:
        await message.answer(f"Ошибка: {e}", reply_markup=main_menu_kb())
    await state.clear()


@router.message(DialogueStates.waiting_for_dialogue, F.text == "готово")
async def handle_dialogue_done(message: Message, state: FSMContext):
    data = await state.get_data()
    accumulated = data.get("dialogue_parts", [])
    if not accumulated:
        await message.answer("Нет текста для анализа. Отправь диалог сначала.")
        return

    full_dialog = "\n".join(accumulated)
    await message.answer("Анализирую диалог...")
    try:
        result = await knowledge.analyze_dialogue(message.from_user.id, full_dialog)
        await _send_long(message, result, reply_markup=main_menu_kb())
    except RuntimeError as e:
        await message.answer(f"Ошибка: {e}", reply_markup=main_menu_kb())
    await state.clear()


@router.message(DialogueStates.waiting_for_dialogue)
async def handle_dialogue_text(message: Message, state: FSMContext):
    data = await state.get_data()
    parts = data.get("dialogue_parts", [])
    parts.append(message.text or "")
    await state.update_data(dialogue_parts=parts)
    await message.answer(
        f"Принято ({len(parts)} сообщений). Отправь ещё или напиши «готово» для анализа.",
    )


# ============ Script Search ============
@router.message(F.text == "🔍 Найти скрипт")
async def cmd_search(message: Message, state: FSMContext):
    await state.set_state(SearchStates.waiting_for_query)
    await message.answer(
        "Опиши ситуацию:\n\n"
        "Например: «клиент говорит, что дорого»\n"
        "или «клиент перестал отвечать»\n"
        "или «клиент хочет уйти»",
        reply_markup=cancel_kb(),
    )


@router.message(SearchStates.waiting_for_query)
async def handle_search_query(message: Message, state: FSMContext):
    await message.answer("Ищу подходящие скрипты...")
    try:
        result = await knowledge.search_scripts(message.from_user.id, message.text)
        await _send_long(message, result, reply_markup=main_menu_kb())
    except RuntimeError as e:
        await message.answer(f"Ошибка: {e}", reply_markup=main_menu_kb())
    await state.clear()


# ============ Objections ============
@router.message(F.text == "💬 Возражения")
async def cmd_objections(message: Message, state: FSMContext):
    await state.set_state(ObjectionStates.waiting_for_objection)
    await message.answer(
        "Напиши возражение клиента, с которым нужно помочь:\n\n"
        "Например: «дорого», «подумаю», «у нас уже есть поставщик»",
        reply_markup=cancel_kb(),
    )


@router.message(ObjectionStates.waiting_for_objection)
async def handle_objection(message: Message, state: FSMContext):
    await message.answer("Анализирую возражение...")
    try:
        result = await knowledge.handle_objection(message.from_user.id, message.text)
        await _send_long(message, result, reply_markup=main_menu_kb())
    except RuntimeError as e:
        await message.answer(f"Ошибка: {e}", reply_markup=main_menu_kb())
    await state.clear()


# ============ Knowledge Base ============
@router.message(F.text == "📚 База знаний")
async def cmd_knowledge(message: Message):
    await message.answer("Выбери категорию:", reply_markup=knowledge_categories_kb())


@router.callback_query(F.data.startswith("know_cat:"))
async def cb_knowledge_category(callback: CallbackQuery):
    category = callback.data.split(":", 1)[1]
    await callback.answer()
    items = await repository.list_knowledge(category, limit=10)
    if not items:
        await callback.message.answer(f"В категории «{category}» пока нет материалов.")
        return

    text = f"📚 {category} ({len(items)}):\n\n"
    for item in items:
        tags = ", ".join(item.tags) if item.tags else ""
        text += f"• {item.title}\n  Теги: {tags}\n  {item.content[:150]}...\n\n"
    await _send_long(callback.message, text)


# ============ Admin ============
@router.message(F.text == "/admin")
async def cmd_admin(message: Message):
    if message.from_user.id not in config.admin_ids:
        await message.answer("У вас нет доступа к админ-панели.")
        return
    await message.answer("Панель администратора:", reply_markup=admin_kb())


@router.callback_query(F.data.startswith("admin:"))
async def cb_admin(callback: CallbackQuery, state: FSMContext):
    if callback.from_user.id not in config.admin_ids:
        await callback.answer("Нет доступа", show_alert=True)
        return

    action = callback.data.split(":", 1)[1]
    await callback.answer()

    if action == "users":
        users = await repository.get_all_users(30)
        text = f"Пользователи ({len(users)}):\n\n"
        for u in users:
            text += f"• {u.first_name or '?'} (@{u.username or '-'}) ID:{u.telegram_id}\n  Тренировок: {u.training_count} | Лучший: {u.best_score}\n"
        await _send_long(callback.message, text)

    elif action == "stats":
        user_count = await repository.get_user_count()
        training_count = await repository.get_total_training_count()
        text = f"Общая статистика:\n\nПользователей: {user_count}\nЗавершённых тренировок: {training_count}"
        await callback.message.answer(text)

    elif action == "errors":
        errors = await repository.get_recent_errors(10)
        if not errors:
            await callback.message.answer("Ошибок AI пока нет.")
            return
        text = "Последние ошибки AI:\n\n"
        for e in errors:
            text += f"• [{e['provider']}] {e['error_message'][:100]}\n  {e['created_at']}\n"
        await _send_long(callback.message, text)

    elif action == "health":
        await callback.message.answer("Проверяю API...")
        results = await ai_router.health_check()
        text = "Состояние API:\n\n"
        for name, status in results.items():
            text += f"• {name}: {status}\n"
        db_ok = await check_db_connection()
        text += f"• Database: {'OK' if db_ok else 'ERROR'}\n"
        text += "• Telegram: OK"
        await callback.message.answer(text)

    elif action == "add_knowledge":
        await state.set_state(AdminStates.waiting_for_knowledge_title)
        await callback.message.answer("Введите заголовок:", reply_markup=cancel_kb())

    elif action == "del_knowledge":
        await state.set_state(AdminStates.waiting_for_knowledge_delete_id)
        await callback.message.answer("Введите ID материала для удаления:", reply_markup=cancel_kb())

    elif action == "broadcast":
        await state.set_state(AdminStates.waiting_for_broadcast)
        await callback.message.answer("Введите текст рассылки:", reply_markup=cancel_kb())


@router.message(AdminStates.waiting_for_knowledge_title)
async def admin_knowledge_title(message: Message, state: FSMContext):
    await state.update_data(k_title=message.text)
    await state.set_state(AdminStates.waiting_for_knowledge_category)
    await message.answer("Введите категорию (Scripts, Objections, etc.):", reply_markup=cancel_kb())


@router.message(AdminStates.waiting_for_knowledge_category)
async def admin_knowledge_category(message: Message, state: FSMContext):
    await state.update_data(k_category=message.text)
    await state.set_state(AdminStates.waiting_for_knowledge_content)
    await message.answer("Введите содержание:", reply_markup=cancel_kb())


@router.message(AdminStates.waiting_for_knowledge_content)
async def admin_knowledge_content(message: Message, state: FSMContext):
    await state.update_data(k_content=message.text)
    await state.set_state(AdminStates.waiting_for_knowledge_tags)
    await message.answer("Введите теги через запятую (или «-» чтобы пропустить):", reply_markup=cancel_kb())


@router.message(AdminStates.waiting_for_knowledge_tags)
async def admin_knowledge_tags(message: Message, state: FSMContext):
    data = await state.get_data()
    tags_raw = message.text if message.text != "-" else ""
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

    item_id = await repository.add_knowledge_item(
        title=data["k_title"],
        category=data["k_category"],
        content=data["k_content"],
        tags=tags,
        created_by=message.from_user.id,
    )
    await message.answer(f"Добавлено! ID: {item_id}", reply_markup=main_menu_kb())
    await state.clear()


@router.message(AdminStates.waiting_for_knowledge_delete_id)
async def admin_knowledge_delete(message: Message, state: FSMContext):
    ok = await repository.delete_knowledge_item(message.text)
    if ok:
        await message.answer("Удалено.", reply_markup=main_menu_kb())
    else:
        await message.answer("Не найдено.", reply_markup=main_menu_kb())
    await state.clear()


@router.message(AdminStates.waiting_for_broadcast)
async def admin_broadcast(message: Message, state: FSMContext):
    users = await repository.get_all_users(1000)
    sent = 0
    for u in users:
        try:
            await message.bot.send_message(u.telegram_id, message.text)
            sent += 1
        except Exception:
            pass
    await message.answer(f"Рассылка отправлена {sent} пользователям.", reply_markup=main_menu_kb())
    await state.clear()


# ============ Callback: back/cancel ============
@router.callback_query(F.data == "back:menu")
@router.callback_query(F.data == "cancel")
async def cb_back(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await state.clear()
    await callback.message.answer("Главное меню:", reply_markup=main_menu_kb())


@router.callback_query(F.data == "noop")
async def cb_noop(callback: CallbackQuery):
    await callback.answer()
