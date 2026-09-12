// ==UserScript==
// @name         C.AI Web Enhancer
// @namespace    https://github.com/Sasha-A1000/cai-web-enhancer
// @version      15.1.0
// @description  Enhances the Character.AI web interface with a persistent chat archive, network-based chat detection, import/export tools, visual chat status, debugging tools and optional ad blocking.
// @author       Sasha-A1000
// @license      MIT
// @homepageURL  https://github.com/Sasha-A1000/cai-web-enhancer
// @supportURL   https://github.com/Sasha-A1000/cai-web-enhancer/issues
// @source       https://github.com/Sasha-A1000/cai-web-enhancer
// @updateURL    https://raw.githubusercontent.com/Sasha-A1000/cai-web-enhancer/main/cai-web-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/Sasha-A1000/cai-web-enhancer/main/cai-web-enhancer.user.js
// @match        https://character.ai/*
// @icon         https://character.ai/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ===================== КОНСТАНТЫ ХРАНИЛИЩА =====================
    const KEY_ARCHIVE = 'cai_archive_storage_v8';
    const KEY_SNAPSHOT = 'cai_last_seen_snapshot_v8';
    const KEY_LAST_BATCH = 'cai_last_batch_count_v8';
    const KEY_DELTA = 'cai_delta_since_export_v8';
    const KEY_MANUAL_DEL_FLAG = 'cai_manual_archive_delete_flag_v8';
    const KEY_MANUAL_DEL_IDS = 'cai_manual_deleted_ids_v8';
    const KEY_DELTA_TRACKED_CHATS = 'cai_delta_tracked_chats_v8';
    const KEY_SOFT_WARNING_CHATS = 'cai_soft_warning_chats_v8';
    const KEY_SETTING_VISUAL = 'cai_setting_visual_v8';
    const KEY_SETTING_DEV = 'cai_setting_dev_v8';
    const KEY_POSITIONS_SNAPSHOT = 'cai_positions_snapshot_v9';
    const KEY_SETTING_DEBUG = 'cai_setting_debug_v8';
    const KEY_SETTING_NET_INTERCEPT = 'cai_setting_net_intercept_v1';
    const KEY_SETTING_AUTO_SCAN = 'cai_setting_auto_scan_v1';
    const KEY_NET_CACHE = 'cai_net_cache_v1';
    const KEY_SETTING_ADBLOCK = 'cai_setting_adblock_v1';
    const KEY_SETTING_LANG = 'cai_setting_lang_v1'; // Язык: 'ru' | 'en'

    let lastManualDeleteTime = 0;
    let isDomStale = false;
    let networkCache = { chats: [], lastUpdate: 0 };
    let staleWarningPositioningInstalled = false;
    let staleWarningPositionQueued = false;

    const ARCHIVE_STALE_KEYS = new Set([
        KEY_ARCHIVE,
        KEY_SNAPSHOT,
        KEY_LAST_BATCH,
        KEY_DELTA,
        KEY_MANUAL_DEL_FLAG,
        KEY_MANUAL_DEL_IDS,
        KEY_DELTA_TRACKED_CHATS,
        KEY_SOFT_WARNING_CHATS,
        KEY_POSITIONS_SNAPSHOT
    ]);

    const ARCHIVE_WRITE_LOCK_KEYS = new Set([
        ...ARCHIVE_STALE_KEYS,
        KEY_NET_CACHE
    ]);

    function isArchiveStaleKey(key) {
        return ARCHIVE_STALE_KEYS.has(key);
    }

    function isArchiveWriteLockedKey(key) {
        return ARCHIVE_WRITE_LOCK_KEYS.has(key);
    }

    // ===================== СИСТЕМА ЛОКАЛИЗАЦИИ (I18N) =====================
    const I18N = {
        ru: {
            lang_name: '(Язык)',
            archive_title: '(Архив)',
            btn_save: '⬇️ Save',
            btn_load: '⬆️ Load',
            cnt_added: '(Было добавлено чатов)',
            cnt_batch: (val, suf) => `(Одновременно: ${val}/50 чатов${suf})`,
            cnt_delta: (val, suf) => `(С последнего момента: ${val}/50 чатов${suf})`,
            btn_reset: 'Сброс',
            btn_export: '⬇️ Экспорт',
            help_reset: '(С момента последнего сброса/экспорта новые чаты не превысили предел. Вам не обязательно делать экспорт данных.) Когда вы будете переходить между устройствами, не забудьте нажать кнопку Сброс на этом устройстве и также проделать на втором устройстве как только перейдёте.',
            help_export: '(Порог по чатам был превышен! Вам нужно сделать экспорт данных по кнопке ⬇️ Экспорт выше этого текста.) Не забудьте сделать импорт данных на другом устройстве!',
            del_warning: 'Так как вы удалили чат из архива навсегда, автоматически такое удаление подтянуться на другие устройства не сможет. Если вы желаете продублировать это удаление, то по окончанию сессии вам нужно экспортировать данные и перенести файл экспорта на другое устройство и импортировать его.',
            settings_title: '(Настройки)',
            opt_visual: '(Визуализация разделов)',
            legend_new: '- Новые чаты',
            legend_old: '- Старые чаты',
            legend_warn: '- Скрытые (опасные)',
            legend_divider: 'Граница новых/старых',
            opt_adblock: '(Скрыть рекламу)',
            opt_net: '(Перехват сети fetch/XHR)',
            opt_autoscan: '(DOM-сканирование fallback)',
            opt_dev: '(Режим разработчика)',
            dev_warn_title: '⚠️ Используйте осторожно!',
            dev_warn_desc: 'Этот режим отключает защитные механизмы синхронизации.',
            dev_li_1: '– Экспорт/Импорт через верхние кнопки не сбрасывает счётчики',
            dev_li_2: '– Можно отключить визуализацию даже при 50+ новых чатах',
            dev_li_3: '– Тестирование архива без влияния на дельту-счётчики',
            dev_li_4: '– Нумерация порядка позиций на чатах',
            dev_li_5: '– Риск рассинхронизации между устройствами при неправильном использовании',
            opt_debug: '(Консоль логов)',
            total_chats: (count) => `(Чатов в архиве: ${count})`,
            empty_archive: 'Пусто',
            confirm_delete_chat: (name) => `Удалить ${name}?`,
            dev_vis_alert: 'Отключить визуализацию при 50+ чатах можно только в Режиме разработчика!',
            // Модальное окно рассинхронизации
            stale_title: 'Вкладка устарела',
            stale_text: 'Архив изменён в другой вкладке. Действия архива тут отключены до обновления.',
            stale_btn: 'Нажмите, чтобы обновить',
            stale_box_tooltip: 'Нажмите, чтобы обновить страницу',
            stale_ctrl_tooltip: 'Вкладка устарела. Нажмите жёлтое уведомление, чтобы обновить страницу.',
            stale_link_tooltip: 'Архив на этой вкладке заблокирован до перезагрузки.',
            action_archive_action: 'действие архива',
            action_blocked_log: (act) => `Заблокировано действие на устаревшей вкладке: ${act}. Нужна перезагрузка.`,
            // Логи и консоль
            dbg_header: '(Фоновый лог действий)',
            dbg_clear: 'Очистить',
            dbg_cleared: 'Логи очищены пользователем',
            dbg_opened: 'Консоль открыта. Фоновые логи загружены',
            // Экспорт / Импорт / Сброс
            reset_alert_high: (delta) => `ВНИМАНИЕ! Порог был превышен (${delta}/50)!\nВы сделали сброс вместо экспорта. Рассинхронизация вероятна, не забудьте сделать сброс и на других устройствах!`,
            reset_alert_ok: (delta) => `Счетчик дельты (${delta}/50) успешно сброшен!\nНе забудьте нажать кнопку 'Сброс' и на других ваших устройствах при входе.`,
            reset_alert_zero: 'Счетчик уже равен нулю (0/50). Сброс не требовался, но выполнен.',
            export_empty: 'Архив пуст. Скачивать нечего.',
            export_alert_high: (delta) => `Порог по чатам был превышен (${delta}/50)!\nДанные сохранены. Обязательно сделайте ИМПОРТ этого файла на других устройствах!`,
            export_alert_ok: (delta) => `Порог ещё не превышен (${delta}/50).\nДанные сохранены. Вы можете сделать импорт на других устройствах для надежности.`,
            export_alert_zero: 'Данные архива сохранены.\nНовых чатов с прошлого раза не было (0/50).',
            export_dev_note: '\n[Режим Разработчика: Верхняя кнопка. Счётчики Дельты НЕ стёрты]',
            import_confirm: (count) => `Заменить архив (${count} чатов)?`,
            import_dev_done: '[Режим Разработчика] Импорт без стирания дельты завершен',
            import_error: (err) => `Ошибка импорта: ${err}`,
            // Логи
            log_net_install: 'Установка перехвата fetch и XMLHttpRequest...',
            log_net_install_ok: 'Перехват fetch и XMLHttpRequest успешно установлен',
            log_net_fetch_recent: (url) => `[NET/fetch] Перехвачен запрос недавних чатов: ${url}...`,
            log_net_fetch_neo: (url) => `[NET/fetch] Перехвачен Neo API запрос: ${url}...`,
            log_net_json_err: (err) => `[NET/fetch] Ошибка парсинга JSON: ${err}`,
            log_net_err: (err) => `[NET/fetch] Ошибка перехвата: ${err}`,
            log_net_xhr_recent: (url) => `[NET/XHR] Перехвачен запрос недавних чатов: ${url}...`,
            log_net_xhr_neo: (url) => `[NET/XHR] Перехвачен Neo API запрос: ${url}...`,
            log_net_xhr_err: (err) => `[NET/XHR] Ошибка перехвата: ${err}`,
            log_net_stale_skip: (src) => `[NET/${src}] Обработка сетевых данных пропущена: вкладка устарела и архив заблокирован до перезагрузки`,
            log_net_empty: (src) => `[NET/${src}] Данные получены, но массив чатов пуст или не распознан`,
            log_net_received: (src, count) => `[NET/${src}] Получено ${count} чатов из сети`,
            log_net_normalized: (src, count) => `[NET/${src}] Нормализовано ${count} чатов. Запуск слияния...`,
            log_net_neo_extracted: (src, count) => `[NET/${src}] Neo API: извлечено ${count} чатов из вложенной структуры`,
            log_net_neo_err: (src, err) => `[NET/${src}] Neo API: ошибка извлечения: ${err}`,
            log_net_merge_stale: '[NET Merge] Слияние пропущено: вкладка устарела и архив заблокирован до перезагрузки',
            log_net_unarchived: (name) => `[NET Merge] Чат разархивирован (вернулся): ${name}`,
            log_net_to_archive: (count) => `[NET Merge] Отправка в архив: ${count} чатов`,
            log_net_new_chats: (count) => `[NET Merge] Обнаружено ${count} новых чатов`,
            log_net_merge_done: (arch, trk) => `[NET Merge] Слияние завершено. Архив: ${arch}, Tracked: ${trk}`,
            log_save_lock: (key) => `Запись ${key} заблокирована: вкладка устарела и требует перезагрузки`,
            log_save_err: (key, err) => `Ошибка сохранения ${key}: ${err}`,
            log_snapshot_created: (cnt) => `Создан новый слепок позиций (Всего ${cnt})`,
            log_pos_calc: (name, id, pos) => `[Позиция] Расчет для чата ${name} (ID ${id}). Позиция в слепке: ${pos}`,
            log_pos_missing: (name) => `[⚠️ ВНИМАНИЕ] Чат ${name} отсутствует в слепке позиций! Падает на индекс 0.`,
            log_pos_intersect: (idx) => `[Позиция] Найдено пересечение! Индекс вставки: ${idx}`,
            log_delta_reset: (delta) => `Сброс дельты пользователем. Текущая дельта: ${delta}`,
            log_export_attempt: (chats, delta) => `Попытка экспорта. Чатов: ${chats}, Дельта: ${delta}`,
            log_export_dev: 'Экспорт в режиме разработчика (без сброса дельты)',
            log_export_clear: 'Очистка счетчиков после успешного экспорта',
            log_import_open: 'Открыто окно импорта',
            log_import_ok: (cnt) => `Импорт подтвержден. Загружено ${cnt} чатов`,
            log_import_cancel: 'Импорт отменен пользователем',
            log_import_err: (err) => `Ошибка импорта: ${err}`,
            log_stale_shown: 'Показано уведомление рассинхронизации вкладок',
            log_scan_skip_net: 'DOM-сканирование пропущено (актуальные сетевые данные)',
            log_scan_disabled: 'DOM-сканирование отключено (только перехват сети)',
            log_manual_del_revert: (ids) => `Снят статус ручного удаления для вернувшихся чатов: ${ids}`,
            log_unarchived_screen: (name) => `Чат разархивирован (вернулся на экран): ${name}`,
            log_green_pos_updated: 'Обновлены позиции зелёных чатов в слепке',
            log_sort_to_archive: (cnt) => `[Сортировка] Найдено чатов для архивации: ${cnt}`,
            log_insert_result: (name, idx) => `[Итог вставки] Чат ${name} -> индекс [${idx}]`,
            log_soft_warn_hidden: (name) => `Мягкое предупреждение! Скрыт новый чат ${name}`,
            log_batch_added: (cnt) => `Добавлена пачка новых чатов. Размер: ${cnt}`,
            log_batch_blocked_manual: 'Блокировка счетчика новых чатов из-за недавнего ручного скрытия',
            log_crit_delta: 'КРИТИЧЕСКАЯ ДЕЛЬТА >= 50. Принудительное включение визуала',
            log_delta_change: (cur, next) => `Изменение дельты: ${cur} -> ${next}`,
            log_net_on: 'Перехват сети включён',
            log_net_off: 'Перехват сети выключён. Перезагрузите страницу для полного отключения.',
            log_autoscan_state: (st) => `DOM-сканирование: ${st ? 'включено' : 'выключено'}`,
            log_manual_deleted: (name) => `Ручное удаление чата из архива: ${name}`,
            log_manual_hide_intercepted: 'Перехвачен клик ручного скрытия (hide character)',
            log_script_loaded: 'C.AI Chat Archive v15.1 загружен',
            log_adblock_hidden: (cnt) => `AdBlock: скрыто элементов: ${cnt}`,
            log_lang_changed: (lang) => `Язык изменён на: ${lang.toUpperCase()}`,
            soft_warning_text: (count) => {
                const lastTwo = count % 100;
                const lastOne = count % 10;
                let chatWord;
                if (lastTwo >= 11 && lastTwo <= 14) chatWord = 'новых чатов';
                else if (lastOne === 1) chatWord = 'новый чат';
                else if (lastOne >= 2 && lastOne <= 4) chatWord = 'новых чата';
                else chatWord = 'новых чатов';

                const isOne = (lastTwo !== 11 && lastOne === 1);
                const pronoun1 = isOne ? 'его' : 'их';
                const pronoun2 = isOne ? 'этот чат был удалён' : 'эти чаты были удалены';
                const ending = isOne ? 'этому чату' : 'этим чатам';
                const endingAlt = isOne ? 'этот чат попал сюда сам' : 'эти чаты или некоторые из них попали сюда сами';
                return `(Вы скрыли ${count} ${chatWord} в архив. Чтобы избежать рассинхронизации, удалите ${pronoun1} крестиком из списка ниже, либо сделайте экспорт. Если ${pronoun2} вами, то смело жмите крестик по ${ending}; если же ${endingAlt}, лучше сделайте экспорт)`;
            }
        },
        en: {
            lang_name: '(Language)',
            archive_title: '(Archive)',
            btn_save: '⬇️ Save',
            btn_load: '⬆️ Load',
            cnt_added: '(Chats added)',
            cnt_batch: (val, suf) => `(At once: ${val}/50 chats${suf})`,
            cnt_delta: (val, suf) => `(Since last moment: ${val}/50 chats${suf})`,
            btn_reset: 'Reset',
            btn_export: '⬇️ Export',
            help_reset: '(Since the last reset/export, new chats have not exceeded the limit. Data export is not required.) When switching between devices, remember to click Reset on this device and do the same on your second device as soon as you switch.',
            help_export: '(Chat threshold was exceeded! You need to export data via the ⬇️ Export button above this text.) Remember to import the data on your other device!',
            del_warning: 'Since you permanently deleted a chat from the archive, this deletion cannot sync automatically to other devices. To mirror this deletion, export your data at the end of the session, transfer the export file to the other device and import it.',
            settings_title: '(Settings)',
            opt_visual: '(Section visualization)',
            legend_new: '- New chats',
            legend_old: '- Old chats',
            legend_warn: '- Hidden (critical)',
            legend_divider: 'New/old boundary',
            opt_adblock: '(Hide ads)',
            opt_net: '(Network interception fetch/XHR)',
            opt_autoscan: '(DOM scan fallback)',
            opt_dev: '(Developer mode)',
            dev_warn_title: '⚠️ Use with caution!',
            dev_warn_desc: 'This mode disables synchronization safety mechanisms.',
            dev_li_1: '– Top button Export/Import does not reset counters',
            dev_li_2: '– Visualization can be disabled even at 50+ new chats',
            dev_li_3: '– Archive testing without affecting delta counters',
            dev_li_4: '– Position order numbering on chats',
            dev_li_5: '– Risk of desync between devices if misused',
            opt_debug: '(Log console)',
            total_chats: (count) => `(Chats in archive: ${count})`,
            empty_archive: 'Empty',
            confirm_delete_chat: (name) => `Delete ${name}?`,
            dev_vis_alert: 'Disabling visualization at 50+ chats is only allowed in Developer Mode!',
            // Stale window
            stale_title: 'Tab is outdated',
            stale_text: 'Archive was modified in another tab. Archive actions here are disabled until reload.',
            stale_btn: 'Click to reload',
            stale_box_tooltip: 'Click to reload the page',
            stale_ctrl_tooltip: 'Tab is outdated. Click the yellow notification to reload page.',
            stale_link_tooltip: 'Archive on this tab is locked until reload.',
            action_archive_action: 'archive action',
            action_blocked_log: (act) => `Action blocked on outdated tab: ${act}. Reload required.`,
            // Logs and console
            dbg_header: '(Background action log)',
            dbg_clear: 'Clear',
            dbg_cleared: 'Logs cleared by user',
            dbg_opened: 'Console opened. Background logs loaded',
            // Export / Import / Reset
            reset_alert_high: (delta) => `WARNING! Threshold was exceeded (${delta}/50)!\nYou performed a Reset instead of an Export. Desync is likely, don't forget to reset on other devices as well!`,
            reset_alert_ok: (delta) => `Delta counter (${delta}/50) successfully reset!\nRemember to click 'Reset' on your other devices as well upon sign-in.`,
            reset_alert_zero: 'Counter is already zero (0/50). Reset was not required, but performed.',
            export_empty: 'Archive is empty. Nothing to download.',
            export_alert_high: (delta) => `Chat threshold was exceeded (${delta}/50)!\nData saved. Be sure to IMPORT this file on other devices!`,
            export_alert_ok: (delta) => `Threshold not exceeded yet (${delta}/50).\nData saved. You can import on other devices for reliability.`,
            export_alert_zero: 'Archive data saved.\nNo new chats since last time (0/50).',
            export_dev_note: '\n[Dev Mode: Top button. Delta counters were NOT erased]',
            import_confirm: (count) => `Replace archive (${count} chats)?`,
            import_dev_done: '[Dev Mode] Import without erasing delta completed',
            import_error: (err) => `Import error: ${err}`,
            // Logs
            log_net_install: 'Installing fetch and XMLHttpRequest interception...',
            log_net_install_ok: 'Fetch and XMLHttpRequest interception installed successfully',
            log_net_fetch_recent: (url) => `[NET/fetch] Intercepted recent chats request: ${url}...`,
            log_net_fetch_neo: (url) => `[NET/fetch] Intercepted Neo API request: ${url}...`,
            log_net_json_err: (err) => `[NET/fetch] JSON parse error: ${err}`,
            log_net_err: (err) => `[NET/fetch] Interception error: ${err}`,
            log_net_xhr_recent: (url) => `[NET/XHR] Intercepted recent chats request: ${url}...`,
            log_net_xhr_neo: (url) => `[NET/XHR] Intercepted Neo API request: ${url}...`,
            log_net_xhr_err: (err) => `[NET/XHR] Interception error: ${err}`,
            log_net_stale_skip: (src) => `[NET/${src}] Network data processing skipped: tab is outdated and archive is locked until reload`,
            log_net_empty: (src) => `[NET/${src}] Data received, but chats array is empty or unrecognized`,
            log_net_received: (src, count) => `[NET/${src}] Received ${count} chats from network`,
            log_net_normalized: (src, count) => `[NET/${src}] Normalized ${count} chats. Starting merge...`,
            log_net_neo_extracted: (src, count) => `[NET/${src}] Neo API: extracted ${count} chats from nested structure`,
            log_net_neo_err: (src, err) => `[NET/${src}] Neo API: extraction error: ${err}`,
            log_net_merge_stale: '[NET Merge] Merge skipped: tab is outdated and archive is locked until reload',
            log_net_unarchived: (name) => `[NET Merge] Chat unarchived (returned): ${name}`,
            log_net_to_archive: (count) => `[NET Merge] Sending to archive: ${count} chats`,
            log_net_new_chats: (count) => `[NET Merge] Detected ${count} new chats`,
            log_net_merge_done: (arch, trk) => `[NET Merge] Merge completed. Archive: ${arch}, Tracked: ${trk}`,
            log_save_lock: (key) => `Writing ${key} locked: tab is outdated and requires reload`,
            log_save_err: (key, err) => `Error saving ${key}: ${err}`,
            log_snapshot_created: (cnt) => `New positions snapshot created (Total ${cnt})`,
            log_pos_calc: (name, id, pos) => `[Position] Calculation for chat ${name} (ID ${id}). Position in snapshot: ${pos}`,
            log_pos_missing: (name) => `[⚠️ WARNING] Chat ${name} is missing in position snapshot! Dropping to index 0.`,
            log_pos_intersect: (idx) => `[Position] Intersection found! Insert index: ${idx}`,
            log_delta_reset: (delta) => `Delta reset by user. Current delta: ${delta}`,
            log_export_attempt: (chats, delta) => `Export attempt. Chats: ${chats}, Delta: ${delta}`,
            log_export_dev: 'Export in Developer Mode (without resetting delta)',
            log_export_clear: 'Counters cleared after successful export',
            log_import_open: 'Import file picker opened',
            log_import_ok: (cnt) => `Import confirmed. Loaded ${cnt} chats`,
            log_import_cancel: 'Import cancelled by user',
            log_import_err: (err) => `Import error: ${err}`,
            log_stale_shown: 'Tabs desync notification shown',
            log_scan_skip_net: 'DOM scan skipped (fresh network data)',
            log_scan_disabled: 'DOM scan disabled (network intercept only)',
            log_manual_del_revert: (ids) => `Removed manual deletion flag for returned chats: ${ids}`,
            log_unarchived_screen: (name) => `Chat unarchived (returned to screen): ${name}`,
            log_green_pos_updated: 'Updated green chat positions in snapshot',
            log_sort_to_archive: (cnt) => `[Sorting] Found chats to archive: ${cnt}`,
            log_insert_result: (name, idx) => `[Insert Result] Chat ${name} -> index [${idx}]`,
            log_soft_warn_hidden: (name) => `Soft warning! Hidden new chat ${name}`,
            log_batch_added: (cnt) => `Added batch of new chats. Size: ${cnt}`,
            log_batch_blocked_manual: 'Blocked new chats counter due to recent manual hide',
            log_crit_delta: 'CRITICAL DELTA >= 50. Forcing visual mode ON',
            log_delta_change: (cur, next) => `Delta change: ${cur} -> ${next}`,
            log_net_on: 'Network intercept enabled',
            log_net_off: 'Network intercept disabled. Reload the page for full effect.',
            log_autoscan_state: (st) => `DOM scanning: ${st ? 'enabled' : 'disabled'}`,
            log_manual_deleted: (name) => `Manual deletion of chat from archive: ${name}`,
            log_manual_hide_intercepted: 'Intercepted manual hide click (hide character)',
            log_script_loaded: 'C.AI Chat Archive v15.1 loaded',
            log_adblock_hidden: (cnt) => `AdBlock: elements hidden: ${cnt}`,
            log_lang_changed: (lang) => `Language changed to: ${lang.toUpperCase()}`,
            soft_warning_text: (count) => {
                const isOne = count === 1;
                const chatWord = isOne ? 'new chat' : 'new chats';
                const pronoun1 = isOne ? 'it' : 'them';
                const pronoun2 = isOne ? 'this chat was removed' : 'these chats were removed';
                const ending = isOne ? 'this chat' : 'these chats';
                const endingAlt = isOne ? 'this chat ended up here automatically' : 'these chats (or some of them) ended up here automatically';
                return `(You hid ${count} ${chatWord} into the archive. To avoid desync, delete ${pronoun1} with the cross icon in the list below, or export data. If ${pronoun2} by you, feel free to click the cross on ${ending}; if ${endingAlt}, it is better to export)`;
            }
        }
    };

    function getLang() {
        const stored = getData(KEY_SETTING_LANG);
        return (stored === 'en' || stored === 'ru') ? stored : 'ru';
    }

    function t(key, ...args) {
        const lang = getLang();
        const dict = I18N[lang] || I18N.ru;
        const val = dict[key] !== undefined ? dict[key] : (I18N.ru[key] || key);
        if (typeof val === 'function') {
            return val(...args);
        }
        return val;
    }

    function setLanguage(lang) {
        if (lang !== 'ru' && lang !== 'en') return;
        saveData(KEY_SETTING_LANG, lang);
        caiLog(t('log_lang_changed', lang), 'action');

        // Обновляем заголовок консоли отладки, если она существует
        const dbgHeader = document.querySelector('#cai-debug-console .cai-debug-header span');
        const dbgClearBtn = document.querySelector('#cai-debug-clear');
        if (dbgHeader) dbgHeader.textContent = t('dbg_header');
        if (dbgClearBtn) dbgClearBtn.textContent = t('dbg_clear');

        // Перерисовываем архив с новым языком
        renderArchive();
    }

    function blockStaleArchiveAction(actionName = null, event = null) {
        if (!actionName) actionName = t('action_archive_action');
        if (!isDomStale) return false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
        caiLog(t('action_blocked_log', actionName), 'warn');
        showStaleWarningModal();
        return true;
    }

    // ===================== СИСТЕМА ЛОГИРОВАНИЯ =====================
    function initDebugConsole() {
        if (document.getElementById('cai-debug-console')) return;
        if (!document.body) return;

        const consoleEl = document.createElement('div');
        consoleEl.id = 'cai-debug-console';

        const isDev = getData(KEY_SETTING_DEV);
        const isDebug = getData(KEY_SETTING_DEBUG);
        consoleEl.style.display = (isDev && isDebug) ? 'flex' : 'none';

        consoleEl.innerHTML = `
            <div class="cai-debug-header" style="padding: 4px 8px; background: #27272a; border-bottom: 1px solid #52525b; font-weight: bold; color: #fff; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <span>${t('dbg_header')}</span>
                <button id="cai-debug-clear" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 11px;">${t('dbg_clear')}</button>
            </div>
            <div class="cai-debug-messages" id="cai-debug-messages" style="flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; pointer-events: auto;"></div>
        `;
        document.body.appendChild(consoleEl);

        document.getElementById('cai-debug-clear').onclick = () => {
            document.getElementById('cai-debug-messages').innerHTML = '';
            caiLog(t('dbg_cleared'), 'info');
        };
    }

    function toggleDebugConsole() {
        const consoleEl = document.getElementById('cai-debug-console');
        if (!consoleEl) {
            initDebugConsole();
            return;
        }
        const isDev = getData(KEY_SETTING_DEV);
        const isDebug = getData(KEY_SETTING_DEBUG);
        consoleEl.style.display = (isDev && isDebug) ? 'flex' : 'none';
    }

    function caiLog(msg, type = 'info') {
        console.log(`[CAI Archive] [${type}] ${msg}`);

        let consoleEl = document.getElementById('cai-debug-console');
        if (!consoleEl) {
            initDebugConsole();
            consoleEl = document.getElementById('cai-debug-console');
        }
        if (!consoleEl) return;

        const msgsEl = consoleEl.querySelector('#cai-debug-messages');
        if (!msgsEl) return;

        const entry = document.createElement('div');
        const langLocale = getLang() === 'en' ? 'en-US' : 'ru-RU';
        const time = new Date().toLocaleTimeString(langLocale, {
            hour12: false,
            second: '2-digit',
            minute: '2-digit',
            hour: '2-digit',
            fractionalSecondDigits: 3
        });

        let color = '#a1a1aa';
        if (type === 'warn') color = '#fde047';
        if (type === 'error') color = '#ef4444';
        if (type === 'action') color = '#6ee7b7';
        if (type === 'net') color = '#38bdf8';

        entry.style.color = color;
        entry.textContent = `[${time}] ${msg}`;
        msgsEl.appendChild(entry);

        while (msgsEl.children.length > 500) {
            msgsEl.removeChild(msgsEl.firstChild);
        }

        msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    // ===================== СТИЛИ =====================
    const style = document.createElement('style');
    style.textContent = `
        .cai-archive-item:hover { background-color: rgba(255, 255, 255, 0.05); }
        .cai-btn { background: none; border: none; cursor: pointer; color: #a1a1aa; font-size: 12px; margin-left: 8px; padding: 2px 5px; border-radius: 4px; transition: background 0.2s; }
        .cai-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .cai-delete-btn { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.5); color: white; border: none; display: none; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; z-index: 20; }
        .cai-delete-btn:hover { background: rgba(200, 50, 50, 0.9); }
        .cai-archive-item:hover .cai-delete-btn { display: flex; }
        .cai-count-safe { color: rgba(110, 231, 183, 0.7); }
        .cai-count-warn { color: rgba(253, 224, 71, 0.7); }
        .cai-count-danger { color: rgba(252, 165, 165, 0.7); }
        .cai-counter-label { font-size: 11px; color: #a1a1aa; margin-top: 4px; display: block; }
        .cai-counter-val { font-size: 11px; margin-left: 4px; display: block; font-weight: normal; }
        .cai-bottom-panel { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
        .cai-wide-btn { width: 100%; padding: 6px; margin-bottom: 4px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; border: none; transition: opacity 0.2s; color: white; }
        .cai-wide-btn:hover { opacity: 0.8; }
        .cai-btn-reset { background-color: #3f3f46; }
        .cai-btn-alert { background-color: #7f1d1d; }
        .cai-help-text { font-size: 10px; color: rgba(255,255,255,0.5); line-height: 1.3; display: block; }
        .cai-deletion-warning { margin-top: 8px; padding: 6px; background: rgba(234, 88, 12, 0.15); border: 1px solid rgba(234, 88, 12, 0.3); border-radius: 4px; color: #fdba74; font-size: 10px; line-height: 1.3; }
        .cai-soft-warning { margin-top: 8px; padding: 6px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 4px; color: #fde047; font-size: 10px; line-height: 1.3; }
        .cai-item-soft-warn { box-shadow: inset 0 0 0 1px rgba(234, 179, 8, 0.5) !important; background-color: rgba(234, 179, 8, 0.05) !important; }
        .cai-total-count { font-size: 11px; color: #71717a; text-align: center; display: block; padding-bottom: 4px; }
        .cai-settings-divider { margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 8px; margin-bottom: 8px; }
        .cai-settings-title { font-size: 11px; color: #71717a; text-align: center; margin-bottom: 8px; font-weight: bold; }
        
        /* Языковой переключатель */
        .cai-lang-container { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .cai-lang-label { font-size: 11px; color: #a1a1aa; font-weight: 500; user-select: none; }
        .cai-lang-btn-group { display: inline-flex; background: rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 2px; gap: 2px; border: 1px solid rgba(255, 255, 255, 0.1); }
        .cai-lang-btn { background: transparent; border: none; color: #a1a1aa; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; line-height: 1.4; }
        .cai-lang-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
        .cai-lang-btn.active { background: #3b82f6; color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

        .cai-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px; color: #a1a1aa; margin-bottom: 8px; user-select: none; }
        .cai-toggle input { display: none; }
        .cai-slider { position: relative; width: 30px; height: 16px; border-radius: 16px; transition: background-color 0.3s ease; flex-shrink: 0; }
        .cai-slider::before { content: ""; position: absolute; width: 12px; height: 12px; border-radius: 50%; top: 2px; left: 2px; background: white; transition: transform 0.3s ease, background-color 0.3s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .cai-toggle input:checked + .cai-slider::before { transform: translateX(14px); }
        .cai-slider-red-green { background: #ef4444; }
        .cai-toggle input:checked + .cai-slider-red-green { background: #22c55e; }
        .cai-slider-gray-blue { background: #52525b; }
        .cai-toggle input:checked + .cai-slider-gray-blue { background: #3b82f6; }
        .cai-slider-orange-teal { background: #52525b; }
        .cai-toggle input:checked + .cai-slider-orange-teal { background: #2dd4bf; }
        .cai-legend { font-size: 10px; color: #a1a1aa; margin-left: 38px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
        .cai-legend-item { display: flex; align-items: center; gap: 6px; }
        .cai-color-box { width: 10px; height: 10px; border-radius: 2px; }
        .cai-box-green, .cai-item-new, .cai-main-item-new { background-color: rgba(34, 197, 94, 0.1) !important; box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.5) !important; }
        .cai-box-blue, .cai-item-old, .cai-main-item-old { background-color: rgba(59, 130, 246, 0.1) !important; box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.5) !important; }
        .cai-box-yellow, .cai-item-warn, .cai-main-item-warn { background-color: rgba(234, 179, 8, 0.1) !important; box-shadow: inset 0 0 0 1px rgba(234, 179, 8, 0.5) !important; }
        .cai-divider-after { border-bottom: 2px solid #ef4444 !important; border-bottom-left-radius: 0 !important; border-bottom-right-radius: 0 !important; margin-bottom: 4px !important; }
        .cai-dev-warning { margin-top: 8px; padding: 8px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; color: #93c5fd; font-size: 10px; line-height: 1.4; }
        .cai-dev-warning-title { font-weight: bold; color: #fde047; margin-bottom: 4px; display: block; }
        .cai-dev-list { margin-top: 6px; padding-left: 14px; color: #a1a1aa; }
        .cai-dev-list li { margin-bottom: 3px; }
        .cai-dev-order-num { position: absolute; left: 36px; top: 50%; transform: translateY(-50%); font-size: 9px; font-weight: bold; color: #fde047; background: rgba(0,0,0,0.6); border-radius: 3px; padding: 1px 3px; z-index: 10; pointer-events: none; }
        .cai-archive-order-num { position: absolute; left: 36px; top: 50%; transform: translateY(-50%); font-size: 9px; font-weight: bold; color: #fde047; background: rgba(0,0,0,0.6); border-radius: 3px; padding: 1px 3px; z-index: 10; pointer-events: none; }
        @keyframes cai-stale-glow {
            0%, 100% { box-shadow: 0 0 10px rgba(253, 224, 71, 0.35), 0 6px 18px rgba(0,0,0,0.35); }
            50% { box-shadow: 0 0 22px rgba(253, 224, 71, 0.75), 0 6px 18px rgba(0,0,0,0.35); }
        }
        #cai-stale-modal {
            position: fixed;
            top: var(--cai-stale-top, 12px);
            left: var(--cai-stale-left, 12px);
            width: auto;
            height: auto;
            max-width: min(280px, calc(100vw - 16px));
            background: transparent;
            z-index: 999999;
            display: block;
            pointer-events: none;
            backdrop-filter: none;
        }
        .cai-stale-box {
            pointer-events: auto;
            background: rgba(113, 63, 18, 0.96);
            border: 1px solid rgba(253, 224, 71, 0.75);
            border-left: 4px solid #fde047;
            border-radius: 10px;
            padding: 9px 11px;
            max-width: 260px;
            text-align: left;
            color: #fef9c3;
            box-shadow: 0 0 14px rgba(253, 224, 71, 0.45), 0 6px 18px rgba(0,0,0,0.35);
            font-family: inherit;
            cursor: pointer;
            user-select: none;
            animation: cai-stale-glow 1.8s ease-in-out infinite;
        }
        .cai-stale-box:hover { filter: brightness(1.06); }
        .cai-stale-box:focus-visible { outline: 2px solid #fde047; outline-offset: 2px; }
        .cai-stale-title { margin: 0 0 4px 0; font-size: 12px; line-height: 1.2; color: #fde047; font-weight: 800; }
        .cai-stale-text { margin: 0; font-size: 11px; color: #fef3c7; line-height: 1.35; }
        .cai-stale-btn { display: inline-block; margin-top: 6px; color: #fff7ed; font-size: 11px; font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
        .cai-archive-readonly { opacity: 0.62; }
        .cai-archive-readonly button,
        .cai-archive-readonly input,
        .cai-archive-readonly label,
        .cai-archive-readonly a.cai-archive-item {
            cursor: not-allowed !important;
        }
        .cai-archive-readonly .cai-delete-btn { display: none !important; }

        #cai-debug-console {
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 420px;
            height: 350px;
            background: rgba(0,0,0,0.92);
            border: 1px solid #52525b;
            border-radius: 8px;
            z-index: 9999999;
            flex-direction: column;
            font-family: monospace;
            font-size: 11px;
            pointer-events: none;
            backdrop-filter: blur(4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        #cai-debug-console .cai-debug-header { pointer-events: auto; }
        #cai-debug-console button { pointer-events: auto; }

        /* === ADBLOCK === */
        html.cai-adblock-on [data-testid="in-house-anchor-ad"],
        html.cai-adblock-on div[id^="div-gpt-ad"],
        html.cai-adblock-on div[id^="google_ads_iframe"],
        html.cai-adblock-on button[aria-label="Скрыть рекламу"],
        html.cai-adblock-on button[aria-label="Hide Ad"],
        html.cai-adblock-on button[aria-label="Hide ad"] {
            display: none !important;
        }
        html.cai-adblock-on .cai-ad-hidden,
        html.cai-adblock-on .cai-ad-collapsed {
            display: none !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);

    // ===================== ПЕРЕХВАТ СЕТИ (NETWORK INTERCEPTION) =====================
    function installNetworkInterceptor() {
        const isEnabled = getData(KEY_SETTING_NET_INTERCEPT);
        if (!isEnabled) return;

        caiLog(t('log_net_install'), 'net');

        // --- Перехват fetch ---
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');

                if (url.includes('/api/agents/recent/') ||
                    url.includes('/chat/characters/recent/') ||
                    url.includes('recent-chats') ||
                    url.includes('/api/chats/recent') ||
                    url.includes('get-my-recent-chats')) {

                    caiLog(t('log_net_fetch_recent', url.substring(0, 80)), 'net');

                    const cloned = response.clone();
                    cloned.json().then(data => {
                        processNetworkChatsData(data, 'fetch');
                    }).catch(err => {
                        caiLog(t('log_net_json_err', err.message), 'error');
                    });
                }

                if (url.includes('/api/trpc/') ||
                    url.includes('neo') ||
                    url.includes('character.info') ||
                    url.includes('chat.configs') ||
                    url.includes('recent-chat')) {

                    caiLog(t('log_net_fetch_neo', url.substring(0, 80)), 'net');

                    const cloned = response.clone();
                    cloned.json().then(data => {
                        processNeoApiData(data, 'fetch');
                    }).catch(() => { /* не все ответы — JSON */ });
                }

            } catch (err) {
                caiLog(t('log_net_err', err.message), 'error');
            }
            return response;
        };

        // --- Перехват XMLHttpRequest ---
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._caiUrl = url;
            return originalXHROpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                try {
                    const url = this._caiUrl || '';

                    if (url.includes('/api/agents/recent/') ||
                        url.includes('/chat/characters/recent/') ||
                        url.includes('recent-chats') ||
                        url.includes('/api/chats/recent') ||
                        url.includes('get-my-recent-chats')) {

                        caiLog(t('log_net_xhr_recent', url.substring(0, 80)), 'net');
                        const data = JSON.parse(this.responseText);
                        processNetworkChatsData(data, 'xhr');
                    }

                    if (url.includes('/api/trpc/') ||
                        url.includes('neo') ||
                        url.includes('character.info') ||
                        url.includes('chat.configs') ||
                        url.includes('recent-chat')) {

                        caiLog(t('log_net_xhr_neo', url.substring(0, 80)), 'net');
                        try {
                            const data = JSON.parse(this.responseText);
                            processNeoApiData(data, 'xhr');
                        } catch (_) { /* не все ответы — JSON */ }
                    }
                } catch (err) {
                    caiLog(t('log_net_xhr_err', err.message), 'error');
                }
            });
            return originalXHRSend.apply(this, args);
        };

        caiLog(t('log_net_install_ok'), 'action');
    }

    // Обработка данных чатов из сетевого ответа
    function processNetworkChatsData(data, source) {
        if (!data) return;
        if (isDomStale) {
            caiLog(t('log_net_stale_skip', source), 'warn');
            return;
        }

        let chats = [];

        if (data.chats && Array.isArray(data.chats)) {
            chats = data.chats;
        } else if (data.result && data.result.chats && Array.isArray(data.result.chats)) {
            chats = data.result.chats;
        } else if (data.result?.data?.chats) {
            chats = data.result.data.chats;
        } else if (Array.isArray(data)) {
            chats = data;
        } else if (data.result && Array.isArray(data.result)) {
            chats = data.result;
        }

        if (chats.length === 0) {
            caiLog(t('log_net_empty', source), 'warn');
            return;
        }

        caiLog(t('log_net_received', source, chats.length), 'action');

        const normalizedChats = chats.map(chat => {
            const id = chat.character_id || chat.character?.id || chat.id || chat.chat_id || null;
            const name = chat.character_name || chat.character?.name || chat.name || chat.title || 'Unknown';
            const avatar = chat.character_avatar_url || chat.character?.avatar_file_name || chat.avatar_url || chat.avatar || null;
            const href = id ? `/chat/${id}` : (chat.href || '#');

            return {
                id: id,
                href: href,
                name: name,
                avatar: avatar ? (avatar.startsWith('http') ? avatar : `https://characterai.io/i/200/static/avatars/${avatar}`) : null,
                timestamp: Date.now(),
                source: 'network'
            };
        }).filter(c => c.id !== null);

        networkCache.chats = normalizedChats;
        networkCache.lastUpdate = Date.now();
        saveData(KEY_NET_CACHE, networkCache);

        caiLog(t('log_net_normalized', source, normalizedChats.length), 'action');

        setTimeout(() => mergeNetworkData(normalizedChats), 100);
    }

    function processNeoApiData(data, source) {
        if (!data) return;

        try {
            const chatData = extractChatsFromDeepObject(data);
            if (chatData.length > 0) {
                caiLog(t('log_net_neo_extracted', source, chatData.length), 'net');
                processNetworkChatsData({ chats: chatData }, source + '/neo');
            }
        } catch (err) {
            caiLog(t('log_net_neo_err', source, err.message), 'error');
        }
    }

    function extractChatsFromDeepObject(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== 'object') return [];
        const results = [];

        if (obj.character_id || (obj.character?.id) || (obj.chat_id && obj.character_name)) {
            results.push(obj);
            return results;
        }

        if (Array.isArray(obj)) {
            for (const item of obj) {
                results.push(...extractChatsFromDeepObject(item, depth + 1));
            }
        } else {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    results.push(...extractChatsFromDeepObject(obj[key], depth + 1));
                }
            }
        }

        return results;
    }

    // ===================== ADBLOCK =====================
    let adblockObserver = null;

    const AD_TARGET_SELECTORS = [
        '[data-testid="in-house-anchor-ad"]',
        'button[aria-label="Скрыть рекламу"]',
        'button[aria-label="Hide Ad"]',
        'button[aria-label="Hide ad"]',
        'div[id^="div-gpt-ad"]',
        'div[id^="google_ads_iframe"]'
    ];

    function hideAdElement(el) {
        if (!el || el.classList.contains('cai-ad-hidden')) return false;
        el.classList.add('cai-ad-hidden');
        el.style.setProperty('display', 'none', 'important');
        return true;
    }

    function restoreAdElement(el) {
        el.classList.remove('cai-ad-hidden');
        el.classList.remove('cai-ad-collapsed');
        if (el.style.display === 'none') el.style.removeProperty('display');
    }

    function hasVisibleContent(el) {
        for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.textContent.trim() !== '') return true;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.classList.contains('cai-ad-hidden') || child.classList.contains('cai-ad-collapsed')) continue;
                return true;
            }
        }
        return false;
    }

    function applyAdBlock() {
        document.documentElement.classList.add('cai-adblock-on');
        scanAndHideAds();
        if (!adblockObserver && document.body) {
            adblockObserver = new MutationObserver(() => {
                if (getData(KEY_SETTING_ADBLOCK)) scanAndHideAds();
            });
            adblockObserver.observe(document.body, { childList: true, subtree: true });
        }
        caiLog('AdBlock: on', 'action');
    }

    function removeAdBlock() {
        document.documentElement.classList.remove('cai-adblock-on');
        document.querySelectorAll('.cai-ad-hidden, .cai-ad-collapsed').forEach(el => {
            restoreAdElement(el);
        });
        if (adblockObserver) {
            adblockObserver.disconnect();
            adblockObserver = null;
        }
        caiLog('AdBlock: off, ads restored', 'action');
    }

    function scanAndHideAds() {
        if (!document.documentElement.classList.contains('cai-adblock-on')) {
            document.documentElement.classList.add('cai-adblock-on');
        }

        let newlyHidden = 0;

        const hiddenAds = [];
        AD_TARGET_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                hiddenAds.push(el);
                if (hideAdElement(el)) newlyHidden++;
            });
        });

        hiddenAds.forEach(el => {
            let parent = el.parentElement;
            let depth = 0;
            while (parent && parent !== document.body && parent !== document.documentElement && depth < 5) {
                if (parent.classList.contains('cai-ad-collapsed')) break;
                if (parent.hasAttribute('role')) break;
                if (/^(MAIN|HEADER|NAV|ASIDE|FOOTER|FORM)$/.test(parent.tagName)) break;
                if (hasVisibleContent(parent)) break;
                parent.classList.add('cai-ad-collapsed');
                parent.style.setProperty('display', 'none', 'important');
                parent = parent.parentElement;
                depth++;
            }
        });

        Array.from(document.querySelectorAll('.cai-ad-collapsed')).reverse().forEach(wrapper => {
            if (hasVisibleContent(wrapper)) {
                restoreAdElement(wrapper);
            }
        });

        document.querySelectorAll('p').forEach(p => {
            const txt = p.textContent.trim();
            if (txt === 'Реклама' || txt === 'Ad' || txt === 'Advertisement') {
                const container = p.closest('div.flex.justify-between');
                if (container && container.parentElement) {
                    if (hideAdElement(container.parentElement)) newlyHidden++;
                }
            }
        });

        document.querySelectorAll('button.text-white').forEach(btn => {
            if (btn.textContent.includes('Обновить до') || btn.textContent.includes('Upgrade to')) {
                const wrapper = btn.closest('div[class*="rounded"]');
                if (hideAdElement(wrapper)) newlyHidden++;
            }
        });

        if (newlyHidden > 0) {
            caiLog(t('log_adblock_hidden', newlyHidden), 'action');
        }
    }

    // Слияние сетевых данных с архивом
    function mergeNetworkData(netChats) {
        if (netChats.length === 0) return;
        if (isDomStale) {
            caiLog(t('log_net_merge_stale'), 'warn');
            return;
        }

        let archive = getData(KEY_ARCHIVE);
        let snapshotObjs = getData(KEY_SNAPSHOT);
        let trackedChats = getData(KEY_DELTA_TRACKED_CHATS);
        let softWarningChats = getData(KEY_SOFT_WARNING_CHATS);
        let positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];
        let archiveChanged = false;
        let countersChanged = false;
        let softWarningChanged = false;

        const currentIds = new Set(netChats.map(c => c.id));
        const archivedIds = new Set(archive.map(c => c.id));
        const snapshotIds = new Set(snapshotObjs.map(c => c.id));

        const newArchive = archive.filter(archivedChat => {
            if (currentIds.has(archivedChat.id)) {
                caiLog(t('log_net_unarchived', archivedChat.name), 'info');
                archiveChanged = true;
                if (softWarningChats.includes(archivedChat.id)) {
                    softWarningChats = softWarningChats.filter(id => id !== archivedChat.id);
                    softWarningChanged = true;
                }
                return false;
            }
            return true;
        });
        archive = newArchive;

        const chatsToArchive = [];
        snapshotObjs.forEach(oldChat => {
            if (!currentIds.has(oldChat.id) && !archive.find(c => c.id === oldChat.id)) {
                const fromNet = netChats.find(c => c.id === oldChat.id);
                chatsToArchive.push(fromNet || oldChat);
            }
        });

        if (chatsToArchive.length > 0) {
            caiLog(t('log_net_to_archive', chatsToArchive.length), 'warn');

            chatsToArchive.sort((a, b) => {
                const posA = positionsSnapshot.findIndex(c => c.id === a.id);
                const posB = positionsSnapshot.findIndex(c => c.id === b.id);
                return (posA === -1 ? Infinity : posA) - (posB === -1 ? Infinity : posB);
            });

            chatsToArchive.forEach(oldChat => {
                const insertIndex = findInsertIndexInArchive(oldChat.id, oldChat.name, archive, positionsSnapshot);
                archive.splice(insertIndex, 0, oldChat);
                archiveChanged = true;

                if (trackedChats.includes(oldChat.id)) {
                    if (!softWarningChats.includes(oldChat.id)) {
                        softWarningChats.push(oldChat.id);
                        softWarningChanged = true;
                        countersChanged = true;
                    }
                }
            });
        }

        const newChats = netChats.filter(c => !snapshotIds.has(c.id) && !archivedIds.has(c.id));
        if (newChats.length > 0) {
            caiLog(t('log_net_new_chats', newChats.length), 'action');
            saveData(KEY_LAST_BATCH, newChats.length);
            countersChanged = true;

            const trulyNewIds = newChats.map(c => c.id);
            trackedChats = [...new Set([...trackedChats, ...trulyNewIds])];
        }

        if (archiveChanged) saveData(KEY_ARCHIVE, archive);
        if (softWarningChanged) saveData(KEY_SOFT_WARNING_CHATS, softWarningChats);
        if (countersChanged) {
            saveData(KEY_DELTA_TRACKED_CHATS, trackedChats);
            saveData(KEY_DELTA, trackedChats.length);
        }

        saveData(KEY_SNAPSHOT, netChats);

        netChats.forEach(chat => {
            const positionIds = new Set(positionsSnapshot.map(c => c.id));
            if (!positionIds.has(chat.id)) {
                positionsSnapshot.push({ id: chat.id });
            }
        });
        saveData(KEY_POSITIONS_SNAPSHOT, positionsSnapshot);

        renderArchive();
        caiLog(t('log_net_merge_done', archive.length, trackedChats.length), 'action');
    }

    // ===================== УТИЛИТЫ ДАННЫХ =====================
    function getData(key) {
        try {
            const val = JSON.parse(localStorage.getItem(key));
            if (val === null) throw new Error();
            return val;
        } catch (e) {
            if (key === KEY_MANUAL_DEL_FLAG) return false;
            if (key === KEY_LAST_BATCH || key === KEY_DELTA) return 0;
            if (key === KEY_SETTING_VISUAL || key === KEY_SETTING_DEV) return false;
            if (key === KEY_SETTING_DEBUG) return false;
            if (key === KEY_SETTING_NET_INTERCEPT) return true;
            if (key === KEY_SETTING_AUTO_SCAN) return true;
            if (key === KEY_NET_CACHE) return { chats: [], lastUpdate: 0 };
            if (key === KEY_SETTING_ADBLOCK) return false;
            if (key === KEY_SETTING_LANG) return 'ru';
            return [];
        }
    }

    function saveData(key, data) {
        try {
            if (isDomStale && isArchiveWriteLockedKey(key)) {
                caiLog(t('log_save_lock', key), 'warn');
                return;
            }
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            caiLog(t('log_save_err', key, e.message), 'error');
        }
    }

    function getCleanId(el) {
        let id = el.getAttribute('data-key');
        if (!id) {
            const href = el.getAttribute('href');
            if (href) {
                const parts = href.split('/');
                id = parts[parts.length - 1] || parts[parts.length - 2];
            }
        }
        return id;
    }

    // ===================== СНИМОК ПОЗИЦИЙ =====================
    function buildFullPositionsSnapshot() {
        const listContainer = document.querySelector('ul[data-slot="list"]');
        if (!listContainer) return [];

        const visibleElements = Array.from(listContainer.querySelectorAll('a[href^="/chat"]'))
            .filter(el => !el.closest('#cai-archive-container'));
        const archive = getData(KEY_ARCHIVE) || [];
        const result = [];
        const seen = new Set();

        visibleElements.forEach(el => {
            const id = getCleanId(el);
            if (id && !seen.has(id)) {
                result.push({ id: id });
                seen.add(id);
            }
        });

        archive.forEach(chat => {
            if (!seen.has(chat.id)) {
                result.push({ id: chat.id });
                seen.add(chat.id);
            }
        });

        caiLog(t('log_snapshot_created', result.length), 'info');
        return result;
    }

    function updateGreenPositionsInSnapshot(currentArray, trackedChats, positionsSnapshot, archive) {
        const archivedIds = new Set(archive.map(c => c.id));
        const visibleGreenOrdered = currentArray.filter(c => trackedChats.includes(c.id) && !archivedIds.has(c.id));
        if (visibleGreenOrdered.length === 0) return positionsSnapshot;

        const newSnapshot = [...positionsSnapshot];
        const greenSlots = [];
        const greenInSnapshot = new Set(visibleGreenOrdered.map(c => c.id));

        for (let i = 0; i < newSnapshot.length; i++) {
            if (greenInSnapshot.has(newSnapshot[i].id)) {
                greenSlots.push(i);
            }
        }

        const idsInSnapshot = new Set(newSnapshot.map(c => c.id));
        const missingGreens = visibleGreenOrdered.filter(c => !idsInSnapshot.has(c.id));

        missingGreens.forEach(missingChat => {
            const posInCurrent = currentArray.findIndex(c => c.id === missingChat.id);
            let insertAfterSnapshotIdx = -1;
            for (let j = posInCurrent - 1; j >= 0; j--) {
                const neighborId = currentArray[j].id;
                const neighborSnapshotIdx = newSnapshot.findIndex(s => s.id === neighborId);
                if (neighborSnapshotIdx !== -1) {
                    insertAfterSnapshotIdx = neighborSnapshotIdx;
                    break;
                }
            }

            if (insertAfterSnapshotIdx === -1) {
                newSnapshot.unshift({ id: missingChat.id });
                for (let k = 0; k < greenSlots.length; k++) greenSlots[k]++;
                greenSlots.unshift(0);
            } else {
                newSnapshot.splice(insertAfterSnapshotIdx + 1, 0, { id: missingChat.id });
                for (let k = 0; k < greenSlots.length; k++) {
                    if (greenSlots[k] > insertAfterSnapshotIdx) greenSlots[k]++;
                }
                greenSlots.push(insertAfterSnapshotIdx + 1);
                greenSlots.sort((a, b) => a - b);
            }
        });

        const slotsForVisible = greenSlots.slice(0, visibleGreenOrdered.length);
        slotsForVisible.forEach((slotIdx, i) => {
            newSnapshot[slotIdx] = { id: visibleGreenOrdered[i].id };
        });

        return newSnapshot;
    }

    // ===================== ТРАССИРОВКА ИНДЕКСА ВСТАВКИ =====================
    function findInsertIndexInArchive(chatId, chatName, archive, positionsSnapshot) {
        const posInSnapshot = positionsSnapshot.findIndex(c => c.id === chatId);

        caiLog(t('log_pos_calc', chatName, chatId, posInSnapshot), 'info');

        if (posInSnapshot === -1) {
            caiLog(t('log_pos_missing', chatName), 'warn');
            return 0;
        }

        let insertIndex = archive.length;

        for (let i = 0; i < archive.length; i++) {
            const archiveChatPosInSnapshot = positionsSnapshot.findIndex(c => c.id === archive[i].id);

            if (archiveChatPosInSnapshot === -1) {
                continue;
            }

            if (archiveChatPosInSnapshot > posInSnapshot) {
                insertIndex = i;
                caiLog(t('log_pos_intersect', i), 'action');
                break;
            }
        }

        return insertIndex;
    }

    // ===================== ВИЗУАЛИЗАЦИЯ ОСНОВНОГО СПИСКА =====================
    function updateMainVisuals() {
        const listContainer = document.querySelector('ul[data-slot="list"]');
        if (!listContainer) return;

        const allElements = Array.from(listContainer.querySelectorAll('a[href^="/chat"]'))
            .filter(el => !el.closest('#cai-archive-container'));

        let visualMode = getData(KEY_SETTING_VISUAL);
        let trackedChats = getData(KEY_DELTA_TRACKED_CHATS) || [];
        let softWarningChats = getData(KEY_SOFT_WARNING_CHATS) || [];
        let positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];
        let archiveData = getData(KEY_ARCHIVE) || [];
        let isDev = getData(KEY_SETTING_DEV);
        const archivedIds = new Set(archiveData.map(c => c.id));

        allElements.forEach(el => {
            el.classList.remove('cai-main-item-new', 'cai-main-item-old', 'cai-main-item-warn', 'cai-divider-after');
            const oldNum = el.querySelector('.cai-dev-order-num');
            if (oldNum) oldNum.remove();
        });

        if (!visualMode) return;

        const archiveHasGreen = archiveData.some(c => trackedChats.includes(c.id));

        let lastGreenIndex = -1;
        for (let i = allElements.length - 1; i >= 0; i--) {
            const id = getCleanId(allElements[i]);
            if (trackedChats.includes(id) && !archivedIds.has(id)) {
                lastGreenIndex = i;
                break;
            }
        }

        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            const id = getCleanId(el);
            const isSoftWarn = softWarningChats.includes(id);
            const isNew = trackedChats.includes(id);

            if (isSoftWarn)        el.classList.add('cai-main-item-warn');
            else if (isNew)        el.classList.add('cai-main-item-new');
            else                   el.classList.add('cai-main-item-old');

            if (i === lastGreenIndex && !archiveHasGreen) {
                el.classList.add('cai-divider-after');
            }
        }

        if (isDev && visualMode && positionsSnapshot.length > 0) {
            let num = 1;
            for (let pos = 0; pos < positionsSnapshot.length; pos++) {
                const chatId = positionsSnapshot[pos].id;
                const el = allElements.find(e => getCleanId(e) === chatId);
                if (el) {
                    const numEl = document.createElement('span');
                    numEl.className = 'cai-dev-order-num';
                    numEl.textContent = num;
                    el.style.position = 'relative';
                    el.appendChild(numEl);
                }
                num++;
            }
        }
    }

    // ===================== ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ =====================
    function resetDelta() {
        if (blockStaleArchiveAction(t('btn_reset'))) return;
        const delta = getData(KEY_DELTA) || 0;
        caiLog(t('log_delta_reset', delta), 'action');
        let message = '';

        if (delta > 50) {
            message = t('reset_alert_high', delta);
        } else if (delta > 0) {
            message = t('reset_alert_ok', delta);
        } else {
            message = t('reset_alert_zero');
        }

        saveData(KEY_DELTA, 0);
        saveData(KEY_DELTA_TRACKED_CHATS, []);
        saveData(KEY_SOFT_WARNING_CHATS, []);

        const fullSnapshot = buildFullPositionsSnapshot();
        saveData(KEY_POSITIONS_SNAPSHOT, fullSnapshot);

        if (!getData(KEY_SETTING_DEV)) saveData(KEY_SETTING_VISUAL, false);
        renderArchive();
        setTimeout(() => alert(message), 100);
    }

    function doExport(isTopButton) {
        if (blockStaleArchiveAction(t('btn_export'))) return;
        const data = getData(KEY_ARCHIVE);
        const lastBatch = getData(KEY_LAST_BATCH) || 0;
        const delta = getData(KEY_DELTA) || 0;

        caiLog(t('log_export_attempt', data.length, delta), 'action');

        if (data.length === 0) { alert(t('export_empty')); return; }

        let isDev = getData(KEY_SETTING_DEV);
        let skipErase = isTopButton && isDev;
        let message = '';

        if (delta > 50) {
            message = t('export_alert_high', delta);
        } else if (delta > 0) {
            message = t('export_alert_ok', delta);
        } else {
            message = t('export_alert_zero');
        }

        if (skipErase) {
            message += t('export_dev_note');
            caiLog(t('log_export_dev'), 'warn');
        }

        const exportObj = { version: '15.1', chats: data, lastBatch: lastBatch, delta: 0 };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cai-archive-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (!skipErase) {
            caiLog(t('log_export_clear'), 'info');
            saveData(KEY_DELTA, 0);
            saveData(KEY_DELTA_TRACKED_CHATS, []);
            saveData(KEY_SOFT_WARNING_CHATS, []);
            saveData(KEY_MANUAL_DEL_FLAG, false);
            saveData(KEY_MANUAL_DEL_IDS, []);

            const fullSnapshot = buildFullPositionsSnapshot();
            saveData(KEY_POSITIONS_SNAPSHOT, fullSnapshot);

            if (!isDev) saveData(KEY_SETTING_VISUAL, false);
        }
        renderArchive();
        setTimeout(() => alert(message), 100);
    }

    function doImport(isTopButton) {
        if (blockStaleArchiveAction(t('btn_load'))) return;
        caiLog(t('log_import_open'), 'action');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const json = JSON.parse(event.target.result);
                    let importedChats = Array.isArray(json) ? json : (json.chats || []);
                    let importedBatch = Math.max(0, json.lastBatch || 0);

                    if (confirm(t('import_confirm', importedChats.length))) {
                        caiLog(t('log_import_ok', importedChats.length), 'warn');
                        let isDev = getData(KEY_SETTING_DEV);
                        let skipErase = isTopButton && isDev;
                        saveData(KEY_ARCHIVE, importedChats);
                        saveData(KEY_LAST_BATCH, importedBatch);

                        if (!skipErase) {
                            saveData(KEY_DELTA, 0);
                            saveData(KEY_MANUAL_DEL_FLAG, false);
                            saveData(KEY_MANUAL_DEL_IDS, []);
                            saveData(KEY_DELTA_TRACKED_CHATS, []);
                            saveData(KEY_SOFT_WARNING_CHATS, []);

                            setTimeout(() => {
                                const fullSnapshot = buildFullPositionsSnapshot();
                                saveData(KEY_POSITIONS_SNAPSHOT, fullSnapshot);
                                renderArchive();
                            }, 100);
                            if (!isDev) saveData(KEY_SETTING_VISUAL, false);
                        } else {
                            setTimeout(() => alert(t('import_dev_done')), 100);
                        }
                        renderArchive();
                    } else {
                        caiLog(t('log_import_cancel'), 'info');
                    }
                } catch (err) {
                    caiLog(t('log_import_err', err.message), 'error');
                    alert(t('import_error', err.message));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ===================== РЕЖИМ УСТАРЕВШЕЙ ВКЛАДКИ =====================
    function getChatsPanelAnchor() {
        const listContainer = document.querySelector('ul[data-slot="list"]');
        if (!listContainer) return null;
        return listContainer.closest('aside, nav') || listContainer.parentElement || listContainer;
    }

    function positionStaleWarning() {
        const modal = document.getElementById('cai-stale-modal');
        if (!modal) return;

        const gap = 8;
        const anchor = getChatsPanelAnchor();
        const modalWidth = modal.offsetWidth || 280;
        const modalHeight = modal.offsetHeight || 82;
        let top = gap;
        let left = gap;

        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            top = Math.max(gap, rect.top + gap);
            left = rect.right + gap;
        }

        if (left + modalWidth > window.innerWidth - gap) {
            left = Math.max(gap, window.innerWidth - modalWidth - gap);
        }
        if (top + modalHeight > window.innerHeight - gap) {
            top = Math.max(gap, window.innerHeight - modalHeight - gap);
        }

        modal.style.setProperty('--cai-stale-top', `${Math.round(top)}px`);
        modal.style.setProperty('--cai-stale-left', `${Math.round(left)}px`);
    }

    function scheduleStaleWarningPosition() {
        if (staleWarningPositionQueued) return;
        staleWarningPositionQueued = true;
        requestAnimationFrame(() => {
            staleWarningPositionQueued = false;
            positionStaleWarning();
        });
    }

    function installStaleWarningPositioning() {
        if (staleWarningPositioningInstalled) return;
        staleWarningPositioningInstalled = true;
        window.addEventListener('resize', scheduleStaleWarningPosition);
        window.addEventListener('scroll', scheduleStaleWarningPosition, true);
    }

    function applyArchiveReadOnlyState() {
        const archiveContainer = document.getElementById('cai-archive-container');
        if (!archiveContainer) return;

        archiveContainer.classList.toggle('cai-archive-readonly', isDomStale);
        archiveContainer.setAttribute('aria-disabled', isDomStale ? 'true' : 'false');

        archiveContainer.querySelectorAll('button, input').forEach(control => {
            if (isDomStale) {
                if (!control.dataset.caiPrevDisabled) {
                    control.dataset.caiPrevDisabled = control.disabled ? 'true' : 'false';
                }
                control.disabled = true;
                control.setAttribute('aria-disabled', 'true');
                control.title = t('stale_ctrl_tooltip');
            } else if (control.dataset.caiPrevDisabled) {
                control.disabled = control.dataset.caiPrevDisabled === 'true';
                control.removeAttribute('aria-disabled');
                control.removeAttribute('title');
                delete control.dataset.caiPrevDisabled;
            }
        });

        archiveContainer.querySelectorAll('a.cai-archive-item').forEach(link => {
            if (isDomStale) {
                link.setAttribute('aria-disabled', 'true');
                link.setAttribute('tabindex', '-1');
                link.title = t('stale_link_tooltip');
            } else {
                link.removeAttribute('aria-disabled');
                link.removeAttribute('tabindex');
                link.removeAttribute('title');
            }
        });
    }

    function guardArchiveReadOnlyClick(event) {
        if (!isDomStale) return;
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const actionable = target?.closest('button, a, input, label');
        if (!actionable || !actionable.closest('#cai-archive-container')) return;
        blockStaleArchiveAction(t('action_archive_action'), event);
    }

    // ===================== УВЕДОМЛЕНИЕ РАССИНХРОНИЗАЦИИ =====================
    function showStaleWarningModal() {
        const existing = document.getElementById('cai-stale-modal');
        if (existing) {
            scheduleStaleWarningPosition();
            return;
        }
        caiLog(t('log_stale_shown'), 'warn');
        const modal = document.createElement('div');
        modal.id = 'cai-stale-modal';

        const box = document.createElement('div');
        box.className = 'cai-stale-box';
        box.setAttribute('role', 'button');
        box.setAttribute('tabindex', '0');
        box.title = t('stale_box_tooltip');
        box.onclick = () => window.location.reload();
        box.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.location.reload();
            }
        };

        const title = document.createElement('h3');
        title.className = 'cai-stale-title';
        title.textContent = t('stale_title');

        const text = document.createElement('p');
        text.className = 'cai-stale-text';
        text.textContent = t('stale_text');

        const btn = document.createElement('span');
        btn.className = 'cai-stale-btn';
        btn.textContent = t('stale_btn');

        box.appendChild(title);
        box.appendChild(text);
        box.appendChild(btn);
        modal.appendChild(box);
        document.body.appendChild(modal);
        installStaleWarningPositioning();
        positionStaleWarning();
        setTimeout(positionStaleWarning, 0);
    }

    // ===================== СКАНИРОВАНИЕ DOM (FALLBACK) =====================
    function scanChats() {
        if (document.hidden) return;
        if (isDomStale) return;

        const isNetEnabled = getData(KEY_SETTING_NET_INTERCEPT);
        const isAutoScanEnabled = getData(KEY_SETTING_AUTO_SCAN);

        if (isNetEnabled && networkCache.lastUpdate > 0 && (Date.now() - networkCache.lastUpdate < 3000)) {
            caiLog(t('log_scan_skip_net'), 'info');
            return;
        }

        if (!isAutoScanEnabled && isNetEnabled) {
            caiLog(t('log_scan_disabled'), 'info');
            return;
        }

        const listContainer = document.querySelector('ul[data-slot="list"]');
        if (!listContainer) return;

        const visibleElements = Array.from(listContainer.querySelectorAll('a[href^="/chat"]'))
            .filter(el => !el.closest('#cai-archive-container'));

        const currentMap = new Map();
        const currentArray = [];

        visibleElements.forEach(el => {
            const id = getCleanId(el);
            if (!id) return;
            const nameEl = el.querySelector('div.text-md');
            const imgEl = el.querySelector('img');
            const chatObj = {
                id: id,
                href: el.getAttribute('href'),
                name: nameEl ? nameEl.textContent.trim() : 'Unknown',
                avatar: imgEl ? imgEl.src : null,
                timestamp: Date.now()
            };
            currentMap.set(id, chatObj);
            currentArray.push(chatObj);
        });

        let archive = getData(KEY_ARCHIVE);
        let snapshotObjs = getData(KEY_SNAPSHOT);
        let trackedChats = getData(KEY_DELTA_TRACKED_CHATS);
        let softWarningChats = getData(KEY_SOFT_WARNING_CHATS);
        let positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];
        let manualDelIds = getData(KEY_MANUAL_DEL_IDS) || [];

        let archiveChanged = false;
        let countersChanged = false;
        let softWarningChanged = false;
        let positionsChanged = false;
        let manualDelChanged = false;

        if (manualDelIds.length > 0) {
            const returnedToMain = manualDelIds.filter(id => currentMap.has(id));
            if (returnedToMain.length > 0) {
                caiLog(t('log_manual_del_revert', returnedToMain.join(', ')), 'info');
                manualDelIds = manualDelIds.filter(id => !currentMap.has(id));
                manualDelChanged = true;
            }
        }

        const newArchive = archive.filter(archivedChat => {
            if (currentMap.has(archivedChat.id)) {
                archiveChanged = true;
                caiLog(t('log_unarchived_screen', archivedChat.name), 'info');
                if (softWarningChats.includes(archivedChat.id)) {
                    softWarningChats = softWarningChats.filter(id => id !== archivedChat.id);
                    softWarningChanged = true;
                }
                return false;
            }
            return true;
        });
        archive = newArchive;

        if (positionsSnapshot.length === 0 && (snapshotObjs.length > 0 || archive.length > 0 || currentArray.length > 0)) {
            positionsSnapshot = buildFullPositionsSnapshot();
            if (positionsSnapshot.length > 0) {
                saveData(KEY_POSITIONS_SNAPSHOT, positionsSnapshot);
                positionsChanged = true;
            }
        }

        if (trackedChats.length > 0 && currentArray.length > 0) {
            const updatedSnapshot = updateGreenPositionsInSnapshot(currentArray, trackedChats, positionsSnapshot, archive);
            const changed = updatedSnapshot.length !== positionsSnapshot.length ||
                updatedSnapshot.some((s, i) => positionsSnapshot[i]?.id !== s.id);
            if (changed) {
                caiLog(t('log_green_pos_updated'), 'info');
                positionsSnapshot = updatedSnapshot;
                positionsChanged = true;
            }
        }

        const positionIds = new Set(positionsSnapshot.map(c => c.id));

        if (snapshotObjs.length > 0) {
            const chatsToArchive = [];
            snapshotObjs.forEach(oldChat => {
                if (!currentMap.has(oldChat.id) && !archive.find(c => c.id === oldChat.id)) {
                    chatsToArchive.push(oldChat);
                }
            });

            if (chatsToArchive.length > 0) {
                caiLog(t('log_sort_to_archive', chatsToArchive.length), 'warn');
                chatsToArchive.sort((a, b) => {
                    const posA = positionsSnapshot.findIndex(c => c.id === a.id);
                    const posB = positionsSnapshot.findIndex(c => c.id === b.id);
                    const effectivePosA = posA === -1 ? Infinity : posA;
                    const effectivePosB = posB === -1 ? Infinity : posB;
                    return effectivePosA - effectivePosB;
                });

                chatsToArchive.forEach(oldChat => {
                    const insertIndex = findInsertIndexInArchive(oldChat.id, oldChat.name, archive, positionsSnapshot);
                    caiLog(t('log_insert_result', oldChat.name, insertIndex), 'warn');

                    archive.splice(insertIndex, 0, oldChat);
                    archiveChanged = true;

                    if (trackedChats.includes(oldChat.id)) {
                        if (!softWarningChats.includes(oldChat.id)) {
                            caiLog(t('log_soft_warn_hidden', oldChat.name), 'error');
                            softWarningChats.push(oldChat.id);
                            softWarningChanged = true;
                            countersChanged = true;
                        }
                    }
                });
            }
        }

        if (manualDelChanged) {
            saveData(KEY_MANUAL_DEL_IDS, manualDelIds);
            if (manualDelIds.length === 0) {
                saveData(KEY_MANUAL_DEL_FLAG, false);
            }
        }

        let currentIds = currentArray.map(c => c.id);
        let snapshotIds = snapshotObjs.map(c => c.id);
        let appearedIds = currentIds.filter(id => !snapshotIds.includes(id));

        if (appearedIds.length > 0) {
            let timeSinceManualDelete = Date.now() - lastManualDeleteTime;
            let isRecentManualDelete = timeSinceManualDelete < 5000;
            let newToTopCount = 0;

            if (snapshotIds.length === 0) {
                newToTopCount = currentArray.length;
            } else {
                let firstKnownIndex = currentArray.findIndex(c => snapshotIds.includes(c.id));
                if (firstKnownIndex > 0) {
                    newToTopCount = firstKnownIndex;
                } else if (firstKnownIndex === -1 && currentArray.length > 0) {
                    newToTopCount = currentArray.length;
                }
            }

            if (newToTopCount > 0) {
                if (!isRecentManualDelete) {
                    caiLog(t('log_batch_added', newToTopCount), 'info');
                    saveData(KEY_LAST_BATCH, newToTopCount);
                    countersChanged = true;
                } else {
                    caiLog(t('log_batch_blocked_manual'), 'warn');
                }
                let topAppearedIds = currentIds.slice(0, newToTopCount);
                let oldTrackedLength = trackedChats.length;
                const trulyNewIds = topAppearedIds.filter(id => !positionIds.has(id));
                trackedChats = [...new Set([...trackedChats, ...trulyNewIds])];
                if (trackedChats.length !== oldTrackedLength) countersChanged = true;
            }
        }

        let domNeedsUpdate = false;
        if (archiveChanged) { saveData(KEY_ARCHIVE, archive); domNeedsUpdate = true; }
        if (softWarningChanged) { saveData(KEY_SOFT_WARNING_CHATS, softWarningChats); domNeedsUpdate = true; }
        if (manualDelChanged) { domNeedsUpdate = true; }

        if (appearedIds.length > 0 || currentIds.join() !== snapshotIds.join()) saveData(KEY_SNAPSHOT, currentArray);

        const currentOldChats = currentArray.filter(c => !trackedChats.includes(c.id) && !softWarningChats.includes(c.id));
        const currentPositionIds = new Set(positionsSnapshot.map(c => c.id));

        for (const chat of currentOldChats) {
            if (!currentPositionIds.has(chat.id)) {
                positionsSnapshot.push({ id: chat.id });
                positionsChanged = true;
                currentPositionIds.add(chat.id);
            }
        }
        for (const chat of archive) {
            if (!trackedChats.includes(chat.id) && !softWarningChats.includes(chat.id) && !currentPositionIds.has(chat.id)) {
                positionsSnapshot.push({ id: chat.id });
                positionsChanged = true;
                currentPositionIds.add(chat.id);
            }
        }

        const combinedList = [...currentArray, ...archive];
        let lastTrackedIndex = -1;
        for (let i = combinedList.length - 1; i >= 0; i--) {
            const id = combinedList[i].id;
            if (trackedChats.includes(id)) {
                lastTrackedIndex = i;
                break;
            }
        }

        const updatedPositionIds = new Set(positionsSnapshot.map(c => c.id));
        let oldAboveRedLine = 0;
        if (lastTrackedIndex > 0) {
            for (let i = 0; i < lastTrackedIndex; i++) {
                const id = combinedList[i].id;
                if (updatedPositionIds.has(id) && !trackedChats.includes(id)) {
                    oldAboveRedLine++;
                }
            }
        }

        if (positionsChanged) { saveData(KEY_POSITIONS_SNAPSHOT, positionsSnapshot); }

        let newDelta = trackedChats.length + oldAboveRedLine;
        let currentDelta = getData(KEY_DELTA) || 0;
        let devMode = getData(KEY_SETTING_DEV);

        if (!devMode) {
            if (newDelta >= 50 && currentDelta < 50) {
                caiLog(t('log_crit_delta'), 'error');
                saveData(KEY_SETTING_VISUAL, true);
                domNeedsUpdate = true;
            }
            else if (newDelta < 50 && currentDelta >= 50) {
                saveData(KEY_SETTING_VISUAL, false);
                domNeedsUpdate = true;
            }
            else if (newDelta >= 50 && !getData(KEY_SETTING_VISUAL)) {
                saveData(KEY_SETTING_VISUAL, true);
                domNeedsUpdate = true;
            }
        }

        if (currentDelta !== newDelta || countersChanged) {
            if (currentDelta !== newDelta) {
                caiLog(t('log_delta_change', currentDelta, newDelta), 'warn');
            }
            saveData(KEY_DELTA, newDelta);
            saveData(KEY_DELTA_TRACKED_CHATS, trackedChats);
            domNeedsUpdate = true;
        }

        if (domNeedsUpdate || !document.getElementById('cai-archive-container')) renderArchive();
        updateMainVisuals();
    }

    // ===================== ТОЧЕЧНОЕ ОБНОВЛЕНИЕ КЛАССОВ АРХИВА =====================
    function updateArchiveItemClasses() {
        const archiveContainer = document.getElementById('cai-archive-container');
        if (!archiveContainer) return;

        const trackedChatsArr = getData(KEY_DELTA_TRACKED_CHATS) || [];
        const softWarningChats = getData(KEY_SOFT_WARNING_CHATS) || [];
        const isVisualMode = getData(KEY_SETTING_VISUAL);
        const isDev = getData(KEY_SETTING_DEV);
        const positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];

        const ul = archiveContainer.querySelector('ul[role="group"]');
        if (!ul) return;

        const items = ul.querySelectorAll('.cai-archive-item');
        let lastTrackedIndex = -1;
        const itemsArr = Array.from(items);

        for (let i = itemsArr.length - 1; i >= 0; i--) {
            const id = itemsArr[i]._caiChatId;
            if (id && trackedChatsArr.includes(id)) {
                lastTrackedIndex = i;
                break;
            }
        }

        itemsArr.forEach((a, i) => {
            const id = a._caiChatId;
            if (!id) return;
            const isSoftWarn = softWarningChats.includes(id);
            const isNew = trackedChatsArr.includes(id);

            a.classList.remove('cai-item-new', 'cai-item-old', 'cai-item-warn', 'cai-item-soft-warn', 'cai-divider-after');
            const oldNum = a.querySelector('.cai-archive-order-num');
            if (oldNum) oldNum.remove();

            if (isVisualMode) {
                if (isSoftWarn)        a.classList.add('cai-item-warn');
                else if (isNew)        a.classList.add('cai-item-new');
                else                   a.classList.add('cai-item-old');

                if (i === lastTrackedIndex) {
                    a.classList.add('cai-divider-after');
                }
            } else if (isSoftWarn) {
                a.classList.add('cai-item-soft-warn');
            }

            if (isDev && isVisualMode && positionsSnapshot.length > 0) {
                const posInSnapshot = positionsSnapshot.findIndex(c => c.id === id);
                if (posInSnapshot !== -1) {
                    const numEl = document.createElement('span');
                    numEl.className = 'cai-archive-order-num';
                    numEl.textContent = posInSnapshot + 1;
                    a.appendChild(numEl);
                }
            }
        });
    }

    // ===================== РЕНДЕР АРХИВА (САЙДБАР) =====================
    function renderArchive() {
        const listContainer = document.querySelector('ul[data-slot="list"]');
        if (!listContainer) return;

        let archiveContainer = document.getElementById('cai-archive-container');
        const archiveData = getData(KEY_ARCHIVE);
        const batchCount = Math.max(0, getData(KEY_LAST_BATCH) || 0);
        const deltaCount = getData(KEY_DELTA) || 0;
        const hasManualDel = getData(KEY_MANUAL_DEL_FLAG) === true;
        const manualDelIds = getData(KEY_MANUAL_DEL_IDS) || [];
        const softWarningChats = getData(KEY_SOFT_WARNING_CHATS);
        const trackedChatsArr = getData(KEY_DELTA_TRACKED_CHATS) || [];
        const isVisualMode = getData(KEY_SETTING_VISUAL);
        const isDev = getData(KEY_SETTING_DEV);
        const positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];
        const currentLang = getLang();

        if (!archiveContainer) {
            archiveContainer = document.createElement('li');
            archiveContainer.id = 'cai-archive-container';
            archiveContainer.className = 'relative mb-2 mt-4 border-t border-white/10 pt-2';
            archiveContainer.setAttribute('data-slot', 'base');
            archiveContainer.addEventListener('click', guardArchiveReadOnlyClick, true);

            const headerDiv = document.createElement('div');
            headerDiv.className = 'flex flex-col pr-2';

            const titleRow = document.createElement('div');
            titleRow.className = 'flex items-center justify-between';

            const headerTitle = document.createElement('span');
            headerTitle.id = 'cai-header-title';
            headerTitle.className = 'pl-1 text-tiny text-foreground-500 font-bold';
            headerTitle.textContent = t('archive_title');

            const controlsDiv = document.createElement('div');

            const btnExport = document.createElement('button');
            btnExport.id = 'cai-top-export';
            btnExport.textContent = t('btn_save');
            btnExport.className = 'cai-btn';
            btnExport.onclick = () => doExport(true);

            const btnImport = document.createElement('button');
            btnImport.id = 'cai-top-import';
            btnImport.textContent = t('btn_load');
            btnImport.className = 'cai-btn';
            btnImport.onclick = () => doImport(true);

            controlsDiv.appendChild(btnExport);
            controlsDiv.appendChild(btnImport);
            titleRow.appendChild(headerTitle);
            titleRow.appendChild(controlsDiv);

            const countersDiv = document.createElement('div');
            countersDiv.id = 'cai-counters-area';

            const bottomPanel = document.createElement('div');
            bottomPanel.id = 'cai-bottom-panel';
            bottomPanel.className = 'cai-bottom-panel';

            headerDiv.appendChild(titleRow);
            headerDiv.appendChild(countersDiv);
            headerDiv.appendChild(bottomPanel);
            archiveContainer.appendChild(headerDiv);

            const ul = document.createElement('ul');
            ul.className = 'data-[has-title=true]:pt-1';
            ul.setAttribute('role', 'group');
            archiveContainer.appendChild(ul);

            listContainer.appendChild(archiveContainer);
        }

        // Обновление заголовка и верхних кнопок при смене языка
        const headerTitleEl = archiveContainer.querySelector('#cai-header-title');
        if (headerTitleEl) headerTitleEl.textContent = t('archive_title');
        const btnTopExp = archiveContainer.querySelector('#cai-top-export');
        if (btnTopExp) btnTopExp.textContent = t('btn_save');
        const btnTopImp = archiveContainer.querySelector('#cai-top-import');
        if (btnTopImp) btnTopImp.textContent = t('btn_load');

        // Обновление счетчиков
        const countersDiv = archiveContainer.querySelector('#cai-counters-area');
        if (countersDiv) {
            const getColor = (val) => val >= 40 ? 'cai-count-danger' : val >= 25 ? 'cai-count-warn' : 'cai-count-safe';
            const getSuffix = (val) => val >= 40 ? '!!' : val >= 25 ? '!' : '';
            countersDiv.innerHTML = `
                <span class="cai-counter-label pl-1">${t('cnt_added')}</span>
                <span class="cai-counter-val ${getColor(batchCount)}">${t('cnt_batch', batchCount, getSuffix(batchCount))}</span>
                <span class="cai-counter-val ${getColor(deltaCount)}">${t('cnt_delta', deltaCount, getSuffix(deltaCount))}</span>
            `;
        }

        // Нижняя панель
        const bottomPanel = archiveContainer.querySelector('#cai-bottom-panel');
        if (bottomPanel) {
            bottomPanel.innerHTML = '';

            if (deltaCount < 50) {
                const btn = document.createElement('button');
                btn.className = 'cai-wide-btn cai-btn-reset';
                btn.textContent = t('btn_reset');
                btn.onclick = resetDelta;
                const txt = document.createElement('span');
                txt.className = 'cai-help-text';
                txt.textContent = t('help_reset');
                bottomPanel.appendChild(btn);
                bottomPanel.appendChild(txt);
            } else {
                const btn = document.createElement('button');
                btn.className = 'cai-wide-btn cai-btn-alert';
                btn.textContent = t('btn_export');
                btn.onclick = () => doExport(false);
                const txt = document.createElement('span');
                txt.className = 'cai-help-text';
                txt.innerHTML = t('help_export');
                bottomPanel.appendChild(btn);
                bottomPanel.appendChild(txt);
            }

            // Мягкие предупреждения
            if (softWarningChats.length > 0) {
                const d = document.createElement('div');
                d.className = 'cai-soft-warning';
                d.textContent = t('soft_warning_text', softWarningChats.length);
                bottomPanel.appendChild(d);
            }

            // Предупреждение о ручном удалении
            if (hasManualDel && manualDelIds.length > 0) {
                const d = document.createElement('div');
                d.className = 'cai-deletion-warning';
                d.textContent = t('del_warning');
                bottomPanel.appendChild(d);
            }

            // БЛОК НАСТРОЕК
            const settingsDiv = document.createElement('div');
            settingsDiv.className = 'cai-settings-divider';

            const titleSettings = document.createElement('div');
            titleSettings.className = 'cai-settings-title';
            titleSettings.textContent = t('settings_title');
            settingsDiv.appendChild(titleSettings);

            // ================= ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА ENG / RUS =================
            const langContainer = document.createElement('div');
            langContainer.className = 'cai-lang-container';

            const langLabel = document.createElement('span');
            langLabel.className = 'cai-lang-label';
            langLabel.textContent = t('lang_name');

            const langBtnGroup = document.createElement('div');
            langBtnGroup.className = 'cai-lang-btn-group';

            const btnLangEn = document.createElement('button');
            btnLangEn.className = `cai-lang-btn ${currentLang === 'en' ? 'active' : ''}`;
            btnLangEn.textContent = 'ENG';
            btnLangEn.type = 'button';
            btnLangEn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (currentLang !== 'en') setLanguage('en');
            };

            const btnLangRu = document.createElement('button');
            btnLangRu.className = `cai-lang-btn ${currentLang === 'ru' ? 'active' : ''}`;
            btnLangRu.textContent = 'RUS';
            btnLangRu.type = 'button';
            btnLangRu.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (currentLang !== 'ru') setLanguage('ru');
            };

            langBtnGroup.appendChild(btnLangEn);
            langBtnGroup.appendChild(btnLangRu);
            langContainer.appendChild(langLabel);
            langContainer.appendChild(langBtnGroup);
            settingsDiv.appendChild(langContainer);

            // --- Визуализация разделов ---
            const isVisual = getData(KEY_SETTING_VISUAL);
            const lblVisual = document.createElement('label');
            lblVisual.className = 'cai-toggle';
            lblVisual.innerHTML = `<input type="checkbox" ${isVisual ? 'checked' : ''}><span class="cai-slider cai-slider-red-green"></span><span>${t('opt_visual')}</span>`;

            const legendDiv = document.createElement('div');
            legendDiv.className = 'cai-legend';
            legendDiv.style.display = isVisual ? 'flex' : 'none';
            legendDiv.innerHTML = `
                <div class="cai-legend-item"><div class="cai-color-box cai-box-green"></div> ${t('legend_new')}</div>
                <div class="cai-legend-item"><div class="cai-color-box cai-box-blue"></div> ${t('legend_old')}</div>
                <div class="cai-legend-item"><div class="cai-color-box cai-box-yellow"></div> ${t('legend_warn')}</div>
                <div class="cai-legend-item" style="margin-top:6px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.1)">
                    <span style="display:inline-block;width:24px;height:2px;background:#ef4444;margin-right:6px;vertical-align:middle"></span>
                    <span style="font-size:9px;color:#a1a1aa">${t('legend_divider')}</span>
                </div>
            `;

            // --- Адблок ---
            const isAdBlock = getData(KEY_SETTING_ADBLOCK);
            const lblAdBlock = document.createElement('label');
            lblAdBlock.className = 'cai-toggle';
            lblAdBlock.innerHTML = `<input type="checkbox" ${isAdBlock ? 'checked' : ''}><span class="cai-slider cai-slider-red-green"></span><span>${t('opt_adblock')}</span>`;

            // --- Перехват сети ---
            const isNetIntercept = getData(KEY_SETTING_NET_INTERCEPT);
            const lblNet = document.createElement('label');
            lblNet.className = 'cai-toggle';
            lblNet.innerHTML = `<input type="checkbox" ${isNetIntercept ? 'checked' : ''}><span class="cai-slider cai-slider-orange-teal"></span><span>${t('opt_net')}</span>`;

            // --- Автосканирование DOM ---
            const isAutoScan = getData(KEY_SETTING_AUTO_SCAN);
            const lblAutoScan = document.createElement('label');
            lblAutoScan.className = 'cai-toggle';
            lblAutoScan.innerHTML = `<input type="checkbox" ${isAutoScan ? 'checked' : ''}><span class="cai-slider cai-slider-orange-teal"></span><span>${t('opt_autoscan')}</span>`;

            // --- Режим разработчика ---
            const isDevMode = getData(KEY_SETTING_DEV);
            const lblDev = document.createElement('label');
            lblDev.className = 'cai-toggle';
            lblDev.innerHTML = `<input type="checkbox" ${isDevMode ? 'checked' : ''}><span class="cai-slider cai-slider-gray-blue"></span><span>${t('opt_dev')}</span>`;

            const devWarningDiv = document.createElement('div');
            devWarningDiv.className = 'cai-dev-warning';
            devWarningDiv.style.display = isDevMode ? 'block' : 'none';
            devWarningDiv.innerHTML = `
                <span class="cai-dev-warning-title">${t('dev_warn_title')}</span>
                ${t('dev_warn_desc')}
                <ul class="cai-dev-list" style="list-style: none; padding: 0; margin: 0;">
                    <li>${t('dev_li_1')}</li>
                    <li>${t('dev_li_2')}</li>
                    <li>${t('dev_li_3')}</li>
                    <li>${t('dev_li_4')}</li>
                    <li>${t('dev_li_5')}</li>
                </ul>
            `;

            // --- Консоль логов ---
            const isDebugMode = getData(KEY_SETTING_DEBUG);
            const lblDebug = document.createElement('label');
            lblDebug.className = 'cai-toggle';
            lblDebug.style.marginTop = '10px';
            lblDebug.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            lblDebug.style.paddingTop = '10px';
            lblDebug.innerHTML = `<input type="checkbox" ${isDebugMode ? 'checked' : ''}><span class="cai-slider cai-slider-gray-blue"></span><span>${t('opt_debug')}</span>`;

            // Сборка настроек
            settingsDiv.appendChild(lblVisual);
            settingsDiv.appendChild(legendDiv);
            settingsDiv.appendChild(lblAdBlock);
            settingsDiv.appendChild(lblNet);
            settingsDiv.appendChild(lblAutoScan);
            settingsDiv.appendChild(lblDev);
            devWarningDiv.appendChild(lblDebug);
            settingsDiv.appendChild(devWarningDiv);
            bottomPanel.appendChild(settingsDiv);

            // Обработчики настроек
            lblVisual.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_visual'), e)) {
                    e.target.checked = getData(KEY_SETTING_VISUAL);
                    return;
                }
                const devM = getData(KEY_SETTING_DEV);
                const dCount = getData(KEY_DELTA) || 0;
                if (!devM && dCount >= 50 && !e.target.checked) {
                    e.target.checked = true;
                    alert(t('dev_vis_alert'));
                    return;
                }
                saveData(KEY_SETTING_VISUAL, e.target.checked);
                legendDiv.style.display = e.target.checked ? 'flex' : 'none';
                updateArchiveItemClasses();
                updateMainVisuals();
            });

            lblAdBlock.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_adblock'), e)) {
                    e.target.checked = getData(KEY_SETTING_ADBLOCK);
                    return;
                }
                saveData(KEY_SETTING_ADBLOCK, e.target.checked);
                if (e.target.checked) {
                    applyAdBlock();
                } else {
                    removeAdBlock();
                }
            });

            lblNet.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_net'), e)) {
                    e.target.checked = getData(KEY_SETTING_NET_INTERCEPT);
                    return;
                }
                saveData(KEY_SETTING_NET_INTERCEPT, e.target.checked);
                if (e.target.checked) {
                    installNetworkInterceptor();
                    caiLog(t('log_net_on'), 'action');
                } else {
                    caiLog(t('log_net_off'), 'warn');
                }
            });

            lblAutoScan.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_autoscan'), e)) {
                    e.target.checked = getData(KEY_SETTING_AUTO_SCAN);
                    return;
                }
                saveData(KEY_SETTING_AUTO_SCAN, e.target.checked);
                caiLog(t('log_autoscan_state', e.target.checked), 'action');
            });

            lblDev.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_dev'), e)) {
                    e.target.checked = getData(KEY_SETTING_DEV);
                    return;
                }
                saveData(KEY_SETTING_DEV, e.target.checked);
                devWarningDiv.style.display = e.target.checked ? 'block' : 'none';
                toggleDebugConsole();
                updateArchiveItemClasses();
                updateMainVisuals();
            });

            lblDebug.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction(t('opt_debug'), e)) {
                    e.target.checked = getData(KEY_SETTING_DEBUG);
                    return;
                }
                saveData(KEY_SETTING_DEBUG, e.target.checked);
                toggleDebugConsole();
                if (e.target.checked) caiLog(t('dbg_opened'), 'info');
            });

            // Счетчик общего количества
            const totalCountDiv = document.createElement('div');
            totalCountDiv.className = 'cai-total-count';
            totalCountDiv.textContent = t('total_chats', archiveData.length);
            bottomPanel.appendChild(totalCountDiv);
        }

        // Рендер списка архивных чатов
        const ul = archiveContainer.querySelector('ul[role="group"]');
        ul.innerHTML = '';

        if (archiveData.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'text-center text-xs text-foreground-500 py-2 italic';
            emptyMsg.textContent = t('empty_archive');
            ul.appendChild(emptyMsg);
            updateMainVisuals();
            applyArchiveReadOnlyState();
            if (isDomStale) scheduleStaleWarningPosition();
            return;
        }

        let lastTrackedArchiveIndex = -1;
        for (let i = archiveData.length - 1; i >= 0; i--) {
            if (trackedChatsArr.includes(archiveData[i].id)) {
                lastTrackedArchiveIndex = i;
                break;
            }
        }

        archiveData.forEach((chat, i) => {
            const a = document.createElement('a');
            const isSoftWarn = softWarningChats.includes(chat.id);
            const isNew = trackedChatsArr.includes(chat.id);

            a.className = 'cai-archive-item flex group gap-2 items-center justify-between relative px-2 py-1.5 h-full box-border rounded-small subpixel-antialiased cursor-pointer tap-highlight-transparent outline-none w-full mt-1 data-[hover=true]:bg-scrim-8';
            a._caiChatId = chat.id;

            if (isVisualMode) {
                if (isSoftWarn)        a.classList.add('cai-item-warn');
                else if (isNew)        a.classList.add('cai-item-new');
                else                   a.classList.add('cai-item-old');

                if (i === lastTrackedArchiveIndex) {
                    a.classList.add('cai-divider-after');
                }
            } else if (isSoftWarn) {
                a.classList.add('cai-item-soft-warn');
            }

            a.href = chat.href;
            const avatarSrc = chat.avatar || 'https://characterai.io/i/200/static/avatars/uploaded/default.png';
            a.innerHTML = `
                <span class="relative flex h-auto w-full overflow-hidden rounded-full amp-block shrink-0 grow-0" style="width: 32px; height: 32px; border-radius: 32px;">
                    <img alt="${chat.name}" loading="lazy" width="32" height="32" class="object-cover object-center bg-card shrink-0 grow-0 h-full amp-block" src="${avatarSrc}">
                </span>
                <span class="flex-1 text-sm font-normal truncate ml-2">
                    <div class="w-full flex flex-row items-center">
                        <div class="text-md truncate flex-1 flex flex-col w-full text-foreground">${chat.name}</div>
                    </div>
                </span>`;

            if (isDev && isVisualMode && positionsSnapshot.length > 0) {
                const posInSnapshot = positionsSnapshot.findIndex(c => c.id === chat.id);
                if (posInSnapshot !== -1) {
                    const numEl = document.createElement('span');
                    numEl.className = 'cai-archive-order-num';
                    numEl.textContent = posInSnapshot + 1;
                    a.style.position = 'relative';
                    a.appendChild(numEl);
                }
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'cai-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (blockStaleArchiveAction(t('confirm_delete_chat', chat.name), e)) return;
                if (confirm(t('confirm_delete_chat', chat.name))) {
                    caiLog(t('log_manual_deleted', chat.name), 'error');
                    const newArch = getData(KEY_ARCHIVE).filter(c => c.id !== chat.id);
                    saveData(KEY_ARCHIVE, newArch);

                    let swChats = getData(KEY_SOFT_WARNING_CHATS);
                    const wasSoftWarning = swChats.includes(chat.id);
                    swChats = swChats.filter(id => id !== chat.id);
                    saveData(KEY_SOFT_WARNING_CHATS, swChats);

                    let tcChats = getData(KEY_DELTA_TRACKED_CHATS);
                    tcChats = tcChats.filter(id => id !== chat.id);
                    saveData(KEY_DELTA_TRACKED_CHATS, tcChats);

                    if (!wasSoftWarning) {
                        saveData(KEY_MANUAL_DEL_FLAG, true);
                        let delIds = getData(KEY_MANUAL_DEL_IDS) || [];
                        if (!delIds.includes(chat.id)) {
                            delIds.push(chat.id);
                            saveData(KEY_MANUAL_DEL_IDS, delIds);
                        }
                    }
                    renderArchive();
                }
            };
            a.appendChild(deleteBtn);
            ul.appendChild(a);
        });

        updateMainVisuals();
        toggleDebugConsole();
        applyArchiveReadOnlyState();
        if (isDomStale) scheduleStaleWarningPosition();
    }

    // ===================== НАБЛЮДАТЕЛЬ DOM (FALLBACK) =====================
    let timeout;
    const observer = new MutationObserver(() => {
        if (document.hidden) return;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(scanChats, 500);
    });

    // ===================== ОБРАБОТКА КЛИКОВ РУЧНОГО УДАЛЕНИЯ =====================
    document.addEventListener('click', (e) => {
        const target = e.target.closest('button, div[role="menuitem"]');
        if (target) {
            const text = target.innerText.toLowerCase();
            const keywords = ['удалить из недавних', 'remove from recent', 'hide character', 'hide chat'];
            if (keywords.some(k => text.includes(k))) {
                lastManualDeleteTime = Date.now();
                caiLog(t('log_manual_hide_intercepted'), 'action');
            }
        }
    }, true);

    // ===================== ЗАПУСК =====================
    function start() {
        if (document.body) {
            caiLog(t('log_script_loaded'), 'action');

            installNetworkInterceptor();

            initDebugConsole();
            observer.observe(document.body, { childList: true, subtree: true });

            window.addEventListener('storage', (e) => {
                if (e.key && isArchiveStaleKey(e.key)) {
                    isDomStale = true;
                    if (!document.getElementById('cai-archive-container')) {
                        renderArchive();
                    }
                    applyArchiveReadOnlyState();
                    showStaleWarningModal();
                }
            });

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && !isDomStale) setTimeout(scanChats, 500);
            });

            if (getData(KEY_SETTING_ADBLOCK)) {
                applyAdBlock();
            }

            setTimeout(scanChats, 1000);
        } else {
            setTimeout(start, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
