# Инструкция по созданию проекта SG Analytics Engine
## Каждое действие отдельно — без пропусков

---

# ЧАСТЬ 1 — GitHub репозиторий

**Действие 1.1**
Открыть браузер. Перейти по адресу:
```
https://github.com/new
```

**Действие 1.2**
В поле **Repository name** ввести:
```
sg-analytics-engine
```

**Действие 1.3**
Найти раздел с переключателем Public / Private.
Нажать на **Private**.

**Действие 1.4**
Прокрутить вниз. Найти чекбокс **"Add a README file"**.
Поставить галочку.

**Действие 1.5**
Нажать зелёную кнопку **"Create repository"** внизу страницы.

**Действие 1.6**
Открыть PowerShell. Выполнить:
```powershell
cd C:\Users\dorof\Documents
git clone https://github.com/privatedeskai/sg-analytics-engine
cd sg-analytics-engine
```

**Действие 1.7**
Скопировать все файлы пакета в папку `C:\Users\dorof\Documents\sg-analytics-engine`:
- PROJECT_INSTRUCTIONS.md
- PROJECT_STATUS.md
- DECISIONS.md
- SG_Analytics_Engine_CONCEPT_v1.1.docx
- SG_Analytics_Engine_UI_Mockups.html

**Действие 1.8**
В PowerShell выполнить:
```powershell
git add .
git commit -m "init: project documents"
git push
```

---

# ЧАСТЬ 2 — Проект в Claude.ai

**Действие 2.1**
Перейти по адресу:
```
https://claude.ai
```

**Действие 2.2**
В левом меню найти слово **"Projects"**.
Нажать на него.

**Действие 2.3**
Нажать кнопку **"New project"** или значок **"+"**.

**Действие 2.4**
В поле названия ввести:
```
SG Analytics Engine
```
Нажать **"Create"** или **Enter**.

---

# ЧАСТЬ 3 — Custom Instructions (КРИТИЧНО)

**Действие 3.1**
Внутри проекта найти иконку карандаша или шестерёнки рядом с названием.
Нажать на неё.

**Действие 3.2**
Найти поле **"Custom instructions"** или **"Project instructions"**.
Нажать внутрь поля.

**Действие 3.3**
Нажать **Ctrl+A** — затем **Delete**.

**Действие 3.4**
Скопировать весь текст ниже и вставить в поле (Ctrl+V):

```
Ты — PM и разработчик проекта SG Analytics Engine (Universal AI Analytics Platform).

РЕГЛАМЕНТ — применять в каждом сообщении без исключений:
• Все шаги ОДНИМ сообщением — никогда не разбивать на несколько
• Весь код только в блоках кода — никогда inline
• Полные файлы целиком — никогда частичные вставки или diff
• PowerShell: без &&, команды группировать через ;
• Архитектурные решения принимаешь сам — не задавай вопросы Олегу
• В конце каждой сессии предоставить готовый блок для PROJECT_STATUS.md

РОЛИ:
• Claude = пишет весь код, архитектура, промпты, конфиги, документация
• Олег = выполняет команды в терминале, деплоит, тестирует

СТЕК:
• AI аналитик: Kimi K2.6 (DeepInfra — US серверы)
• Execution: E2B sandbox
• Vision + финальный текст: Claude API
• Backend: Cloudflare Workers + KV + Durable Objects
• Frontend: Vercel
• Billing: Stripe

РАБОЧИЙ КАТАЛОГ:
C:\Users\dorof\Documents\sg-analytics-engine

ДЕПЛОЙ:
• Worker: npx wrangler deploy
• Web App: cd web-app ; npx vercel --prod --yes ; cd ..
• Checkpoint: git add . ; git commit -m "checkpoint: [описание]" ; git push

ФАЙЛЫ:
• Редактировать через GitHub (карандаш → Ctrl+A → вставить → Commit)
• НЕ использовать Node.js write скрипты
• После GitHub коммита выполнить git pull

В НАЧАЛЕ КАЖДОЙ СЕССИИ:
Прочитать PROJECT_STATUS.md и PROJECT_INSTRUCTIONS.md из Project knowledge.
Продолжать с того места где остановились.

В КОНЦЕ КАЖДОЙ СЕССИИ:
Предоставить готовый блок текста для вставки в PROJECT_STATUS.md.
```

**Действие 3.5**
Нажать **"Save"** или галочку.

---

# ЧАСТЬ 4 — Файлы в Project knowledge

**Действие 4.1**
Внутри проекта найти кнопку **"Add content"** или значок загрузки.
Нажать.

**Действие 4.2**
Загрузить **PROJECT_INSTRUCTIONS.md**.
Дождаться "Indexed" или зелёной галочки.

**Действие 4.3**
Загрузить **PROJECT_STATUS.md**.
Дождаться "Indexed".

**Действие 4.4**
Загрузить **DECISIONS.md**.
Дождаться "Indexed".

**Действие 4.5**
Загрузить **SG_Analytics_Engine_CONCEPT_v1.1.docx**.
Дождаться "Indexed".

**Действие 4.6**
Загрузить **SG_Analytics_Engine_UI_Mockups.html**.
Дождаться "Indexed".

---

# ЧАСТЬ 5 — GitHub MCP коннектор

**Действие 5.1**
Перейти по адресу:
```
https://claude.ai/settings/integrations
```

**Действие 5.2**
Найти **GitHub** в списке.
Нажать **"Connect"**.

**Действие 5.3**
Откроется окно авторизации GitHub.
Нажать **"Authorize"**.

**Действие 5.4**
Выбрать репозиторий **sg-analytics-engine**.
Нажать **"Save"**.

---

# ЧАСТЬ 6 — API ключи

**Действие 6.1 — E2B**
Перейти по адресу:
```
https://e2b.dev
```
Нажать **"Sign up"** → войти через GitHub.
В Dashboard нажать **"API Keys"** → **"Create new key"**.
Скопировать ключ в текстовый файл.

**Действие 6.2 — Kimi K2.6 через DeepInfra**
Перейти по адресу:
```
https://deepinfra.com
```
Нажать **"Sign up"**.
В Dashboard нажать **"API Keys"** → **"Create"**.
Скопировать ключ в тот же текстовый файл.

---

# ЧАСТЬ 7 — Первая сессия

**Действие 7.1**
Открыть проект **SG Analytics Engine** в Claude.ai.

**Действие 7.2**
Нажать **"New chat"** внутри проекта.

**Действие 7.3**
Вставить в поле чата, подставив свои ключи, и отправить:

```
Старт сессии 1.

Прочитай PROJECT_INSTRUCTIONS.md и PROJECT_STATUS.md из Project knowledge.

Начинаем Э1 — День 1: E2B интеграция в Cloudflare Worker.

Мои ключи:
- E2B API key: [вставить ключ]
- DeepInfra API key (Kimi K2.6): [вставить ключ]
- Claude API key: уже есть из ScreenGuide

Подготовь все шаги одним сообщением.
```

---

# ЧЕКЛИСТ

```
[ ] 1.1 Открыт github.com/new
[ ] 1.2 Введено имя репозитория
[ ] 1.3 Выбран Private
[ ] 1.4 Галочка README поставлена
[ ] 1.5 Нажат Create repository
[ ] 1.6 git clone выполнен
[ ] 1.7 Файлы скопированы в папку
[ ] 1.8 git push выполнен
[ ] 2.1 Открыт claude.ai
[ ] 2.2 Нажат Projects
[ ] 2.3 Нажат New project
[ ] 2.4 Название введено
[ ] 3.1 Открыты настройки проекта
[ ] 3.2 Найдено поле Custom Instructions
[ ] 3.3 Поле очищено (Ctrl+A, Delete)
[ ] 3.4 Регламент вставлен
[ ] 3.5 Нажат Save
[ ] 4.1 Найдена кнопка Add content
[ ] 4.2 PROJECT_INSTRUCTIONS.md загружен
[ ] 4.3 PROJECT_STATUS.md загружен
[ ] 4.4 DECISIONS.md загружен
[ ] 4.5 CONCEPT_v1.1.docx загружен
[ ] 4.6 UI_Mockups.html загружен
[ ] 5.1 Открыты настройки интеграций
[ ] 5.2 Connect у GitHub нажат
[ ] 5.3 Авторизация пройдена
[ ] 5.4 Репозиторий выбран
[ ] 6.1 E2B ключ получен
[ ] 6.2 DeepInfra ключ получен
[ ] 7.1 Проект открыт
[ ] 7.2 Новый чат создан
[ ] 7.3 Первое сообщение отправлено
```
