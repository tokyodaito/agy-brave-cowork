# Antigravity Cowork for Brave

Локальное расширение для **Brave** + zero-dependency **MCP-сервер** для **Antigravity CLI (`agy`)**, добавляющее Cowork-режим работы с браузером:

- **Фоновые папки вкладок (`chrome.tabGroups`)** — под каждую задачу создаётся цветная свёрнутая группа вкладок с названием задачи, вся работа идёт в фоне без перехвата фокуса, после завершения папка автоматически удаляется.
- **Визуальный индикатор + кнопка «Стоп»** — фиолетовая рамка и плашка с названием задачи на вкладках под управлением агента.
- **Панель управления в тулбаре Brave** — статус подключения, список активных задач агента, быстрое открытие/закрытие групп и тумблеры настроек.
- **Поиск по истории и закладкам** (read-only).
- **Native Messaging без всплывающих диалогов** — работает полностью локально через Unix-сокет `/tmp/agy-brave-cowork.sock` (`chmod 0600`).

## Установка

Требуется Node.js 18+ и [Antigravity CLI (`agy`)](https://antigravity.google/docs).

```bash
chmod +x install.sh
./install.sh
```

Затем:
1. Открой `brave://extensions` в Brave.
2. Включи **Режим разработчика** (Developer mode).
3. Нажми **Загрузить распакованное** (Load unpacked) и выбери `~/.local/share/agy-brave-cowork/extension`.
4. *(Рекомендуется)* Подключи `chrome-devtools-mcp` к твоему Brave:
   ```bash
   agy mcp add chrome-devtools npx -- -y chrome-devtools-mcp@latest \
     --autoConnect \
     --userDataDir="$HOME/.config/BraveSoftware/Brave-Browser"
   ```
   и включи тумблер в `brave://inspect/#remote-debugging`.
5. *(Опционально)* Скопируй правила из `GEMINI.example.md` в `~/.gemini/config/GEMINI.md`.
6. Перезапусти `agy`.

## Доступные MCP-инструменты (`brave-cowork`)

| Инструмент | Описание |
| --- | --- |
| `brave_create_task_group` | Создать цветную (свёрнутую) папку вкладок под задачу и открыть в ней вкладки в фоне |
| `brave_open_tab_in_group` | Открыть новую вкладку внутри существующей папки задачи |
| `brave_list_task_groups` | Список всех групп вкладок и их вкладок |
| `brave_update_task_group` | Переименовать, перекрасить, свернуть или развернуть папку |
| `brave_close_task_group` | Закрыть все вкладки в папке и удалить её |
| `brave_close_all_task_groups` | Закрыть все активные папки агента |
| `brave_set_tab_indicator` | Показать/скрыть рамку-индикатор и кнопку «Стоп» на вкладке |
| `brave_search_history` | Поиск по истории Brave (read-only) |
| `brave_search_bookmarks` | Поиск по закладкам Brave (read-only) |
