from aiogram.fsm.state import State, StatesGroup


class TrainingStates(StatesGroup):
    waiting_for_mode = State()
    in_training = State()


class DialogueStates(StatesGroup):
    waiting_for_dialogue = State()
    waiting_for_file = State()


class SearchStates(StatesGroup):
    waiting_for_query = State()


class ObjectionStates(StatesGroup):
    waiting_for_objection = State()


class AdminStates(StatesGroup):
    waiting_for_broadcast = State()
    waiting_for_knowledge_title = State()
    waiting_for_knowledge_category = State()
    waiting_for_knowledge_content = State()
    waiting_for_knowledge_tags = State()
    waiting_for_knowledge_delete_id = State()
