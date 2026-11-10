# Подключение OpenRouter API в Django

Инструкция для встраивания облачных нейросетей через OpenRouter в свой проект.

---

## 1. Получение ключа

1. Регистрация: [https://openrouter.ai/](https://openrouter.ai/)
2. Создание ключа: [https://openrouter.ai/keys](https://openrouter.ai/keys)

---

## 2. Установка

```bash
pip install python-decouple requests
```

---

## 3. Конфигурация

Файл `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-ваш-ключ
```

---

## 4. Сервис

Создать файл `llm_service.py`:

```python
import json
import requests
from typing import Optional, List, Dict, Any
from decouple import config


DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

FALLBACK_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-235b-a22b:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
]


class LLMService:
    def __init__(self):
        self.api_key = config('OPENROUTER_API_KEY', default='')
        self.base_url = "https://openrouter.ai/api/v1"

    def get_available_models(self) -> List[Dict]:
        """Получить список доступных моделей"""
        try:
            response = requests.get(f'{self.base_url}/models', timeout=10)
            response.raise_for_status()
            models = response.json().get('data', [])
            
            result = []
            for m in models:
                model_id = m.get('id', '')
                pricing = m.get('pricing', {})
                prompt_price = float(pricing.get('prompt', '0')) * 1_000_000
                is_free = ':free' in model_id or prompt_price == 0
                
                result.append({
                    "id": model_id,
                    "name": m.get('name', model_id),
                    "context_length": m.get('context_length', 4096),
                    "is_free": is_free,
                })
            return result
        except Exception as e:
            print(f"Error: {e}")
            return []

    def get_balance(self) -> Optional[Dict]:
        """Получить баланс аккаунта"""
        if not self.api_key:
            return None
        try:
            response = requests.get(
                f'{self.base_url}/credits',
                headers={'Authorization': f'Bearer {self.api_key}'},
                timeout=10
            )
            response.raise_for_status()
            data = response.json().get('data', {})
            return {
                "balance": data.get('total_credits', 0) - data.get('total_usage', 0),
                "usage": data.get('total_usage', 0),
            }
        except Exception as e:
            print(f"Error: {e}")
            return None

    def chat(
        self,
        messages: List[Dict],
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Optional[str]:
        """
        Запрос к LLM с автоматическим fallback при ошибках.
        
        messages: [{"role": "system|user|assistant", "content": "..."}]
        """
        if not self.api_key:
            return None

        models_to_try = [model or DEFAULT_MODEL] + [m for m in FALLBACK_MODELS if m != model]
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
        }

        for try_model in models_to_try:
            try:
                response = requests.post(
                    f'{self.base_url}/chat/completions',
                    headers=headers,
                    json={
                        'model': try_model,
                        'messages': messages,
                        'temperature': temperature,
                        'max_tokens': max_tokens,
                    },
                    timeout=120
                )
                response.raise_for_status()
                return response.json()['choices'][0]['message']['content']
            except requests.exceptions.RequestException as e:
                # При rate limit (429) или блокировке (403) пробуем следующую модель
                if hasattr(e, 'response') and e.response and e.response.status_code in (429, 403):
                    continue
                print(f"Error: {e}")
                continue
        return None

    def extract_json(self, response: str, is_array: bool = False) -> Optional[Any]:
        """Извлечь JSON из ответа LLM (убирает markdown обёртки)"""
        if not response:
            return None
            
        text = response.strip()
        
        # Убираем ```json ... ```
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                text = parts[1].strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Ищем границы JSON
        start = '[' if is_array else '{'
        end = ']' if is_array else '}'
        i = text.find(start)
        j = text.rfind(end) + 1
        
        if i != -1 and j > i:
            try:
                return json.loads(text[i:j])
            except json.JSONDecodeError:
                pass
        return None


# Синглтон
llm_service = LLMService()
```

---

## 5. Использование

```python
from llm_service import llm_service

# Простой запрос
response = llm_service.chat([
    {"role": "system", "content": "Ты помощник."},
    {"role": "user", "content": "Привет!"}
])
print(response)

# С параметрами
response = llm_service.chat(
    messages=[{"role": "user", "content": "Объясни рекурсию"}],
    model="google/gemini-2.0-flash-exp:free",
    temperature=0.5,
    max_tokens=1000
)

# Генерация JSON
response = llm_service.chat([
    {"role": "system", "content": "Верни JSON: {\"items\": [...]}"},
    {"role": "user", "content": "Список из 3 фруктов"}
])
data = llm_service.extract_json(response)
# {'items': ['яблоко', 'банан', 'апельсин']}

# Баланс
print(llm_service.get_balance())
# {'balance': 5.23, 'usage': 0.77}
```

---

## 6. Модели

### Бесплатные

| ID | Контекст |
|----|----------|
| `meta-llama/llama-3.3-70b-instruct:free` | 131K |
| `google/gemini-2.0-flash-exp:free` | 1M |
| `qwen/qwen3-235b-a22b:free` | 32K |
| `google/gemma-3-27b-it:free` | 128K |
| `mistralai/mistral-small-3.1-24b-instruct:free` | 128K |

### Платные

| ID | $/1M токенов (in/out) |
|----|----------------------|
| `anthropic/claude-sonnet-4` | $3 / $15 |
| `openai/gpt-4o` | $2.5 / $10 |
| `openai/gpt-4o-mini` | $0.15 / $0.6 |
| `deepseek/deepseek-chat-v3-0324` | $0.14 / $0.28 |

Полный список: [https://openrouter.ai/models](https://openrouter.ai/models)
