// ==UserScript==
// @name         C.AI Web Enhancer
// @namespace    https://github.com/Sasha-A1000/cai-web-enhancer
// @version      15.0.0
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
    const KEY_LANGUAGE = 'cai_setting_language_v1';

    // All user-facing labels are kept in one small dictionary so the archive can
    // be switched without changing its behaviour or stored archive data.
    const I18N = {
        ru: {
            archive: '(Архив)', save: '⬇️ Сохранить', load: '⬆️ Загрузить', reset: 'Сброс',
            settings: '(Настройки)', language: '(Язык)', english: 'ENG', russian: 'RUS',
            visual: '(Визуализация разделов)', adblock: '(Скрыть рекламу)', network: '(Перехват сети fetch/XHR)',
            autoscan: '(DOM-сканирование fallback)', developer: '(Режим разработчика)', debug: '(Консоль логов)',
            empty: 'Пусто', chats: 'Чатов в архиве', added: '(Было добавлено чатов)', simultaneous: '(Одновременно:', since: '(С последнего момента:',
            newChats: 'Новые чаты', oldChats: 'Старые чаты', hidden: 'Скрытые (опасные)', boundary: 'Граница новых/старых',
            debugLog: '(Фоновый лог действий)', clear: 'Очистить'
        },
        en: {
            archive: '(Archive)', save: '⬇️ Save', load: '⬆️ Load', reset: 'Reset',
            settings: '(Settings)', language: '(Language)', english: 'ENG', russian: 'RUS',
            visual: '(Section visualization)', adblock: '(Hide ads)', network: '(Network interception fetch/XHR)',
            autoscan: '(DOM scanning fallback)', developer: '(Developer mode)', debug: '(Log console)',
            empty: 'Empty', chats: 'Chats in archive', added: '(Chats added)', simultaneous: '(At once:', since: '(Since last export:',
            newChats: 'New chats', oldChats: 'Old chats', hidden: 'Hidden (dangerous)', boundary: 'New/old boundary',
            debugLog: '(Background action log)', clear: 'Clear'
        }
    };
    function currentLanguage() { return getData(KEY_LANGUAGE) === 'en' ? 'en' : 'ru'; }
    function t(key) { return I18N[currentLanguage()][key] || I18N.ru[key] || key; }

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

    function blockStaleArchiveAction(actionName = 'действие архива', event = null) {
        if (!isDomStale) return false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
        caiLog(`Заблокировано действие на устаревшей вкладке: ${actionName}. Нужна перезагрузка.`, 'warn');
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
                <span>(Фоновый лог действий)</span>
                <button id="cai-debug-clear" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 11px;">Очистить</button>
            </div>
            <div class="cai-debug-messages" id="cai-debug-messages" style="flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; pointer-events: auto;"></div>
        `;
        document.body.appendChild(consoleEl);

        document.getElementById('cai-debug-clear').onclick = () => {
            document.getElementById('cai-debug-messages').innerHTML = '';
            caiLog('Логи очищены пользователем', 'info');
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
        const time = new Date().toLocaleTimeString('ru-RU', {
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
    // При @run-at document-start элемента <head> может ещё не существовать,
    // поэтому используем запасной узел, чтобы стили применились в любом случае.
    (document.head || document.documentElement).appendChild(style);

    // ===================== ПЕРЕХВАТ СЕТИ (NETWORK INTERCEPTION) =====================
    function installNetworkInterceptor() {
        const isEnabled = getData(KEY_SETTING_NET_INTERCEPT);
        if (!isEnabled) return;

        caiLog('Установка перехвата fetch и XMLHttpRequest...', 'net');

        // --- Перехват fetch ---
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');

                // Эндпоинт недавних чатов / списка персонажей
                if (url.includes('/api/agents/recent/') ||
                    url.includes('/chat/characters/recent/') ||
                    url.includes('recent-chats') ||
                    url.includes('/api/chats/recent') ||
                    url.includes('get-my-recent-chats')) {

                    caiLog(`[NET/fetch] Перехвачен запрос недавних чатов: ${url.substring(0, 80)}...`, 'net');

                    const cloned = response.clone();
                    cloned.json().then(data => {
                        processNetworkChatsData(data, 'fetch');
                    }).catch(err => {
                        caiLog(`[NET/fetch] Ошибка парсинга JSON: ${err.message}`, 'error');
                    });
                }

                // Эндпоинт Neo API — история / информация о чате
                if (url.includes('/api/trpc/') ||
                    url.includes('neo') ||
                    url.includes('character.info') ||
                    url.includes('chat.configs') ||
                    url.includes('recent-chat')) {

                    caiLog(`[NET/fetch] Перехвачен Neo API запрос: ${url.substring(0, 80)}...`, 'net');

                    const cloned = response.clone();
                    cloned.json().then(data => {
                        processNeoApiData(data, 'fetch');
                    }).catch(() => { /* не все ответы — JSON */ });
                }

            } catch (err) {
                caiLog(`[NET/fetch] Ошибка перехвата: ${err.message}`, 'error');
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

                        caiLog(`[NET/XHR] Перехвачен запрос недавних чатов: ${url.substring(0, 80)}...`, 'net');
                        const data = JSON.parse(this.responseText);
                        processNetworkChatsData(data, 'xhr');
                    }

                    if (url.includes('/api/trpc/') ||
                        url.includes('neo') ||
                        url.includes('character.info') ||
                        url.includes('chat.configs') ||
                        url.includes('recent-chat')) {

                        caiLog(`[NET/XHR] Перехвачен Neo API запрос: ${url.substring(0, 80)}...`, 'net');
                        try {
                            const data = JSON.parse(this.responseText);
                            processNeoApiData(data, 'xhr');
                        } catch (_) { /* не все ответы — JSON */ }
                    }
                } catch (err) {
                    caiLog(`[NET/XHR] Ошибка перехвата: ${err.message}`, 'error');
                }
            });
            return originalXHRSend.apply(this, args);
        };

        caiLog('Перехват fetch и XMLHttpRequest успешно установлен', 'action');
    }

    // Обработка данных чатов из сетевого ответа
    function processNetworkChatsData(data, source) {
        if (!data) return;
        if (isDomStale) {
            caiLog(`[NET/${source}] Обработка сетевых данных пропущена: вкладка устарела и архив заблокирован до перезагрузки`, 'warn');
            return;
        }

        // C.AI может возвращать данные в разных форматах
        let chats = [];

        // Формат 1: { chats: [...] }
        if (data.chats && Array.isArray(data.chats)) {
            chats = data.chats;
        }
        // Формат 2: { result: { chats: [...] } } (Neo API)
        else if (data.result && data.result.chats && Array.isArray(data.result.chats)) {
            chats = data.result.chats;
        }
        // Формат 3: { result: { data: { chats: [...] } } }
        else if (data.result?.data?.chats) {
            chats = data.result.data.chats;
        }
        // Формат 4: массив напрямую
        else if (Array.isArray(data)) {
            chats = data;
        }
        // Формат 5: { result: [...] }
        else if (data.result && Array.isArray(data.result)) {
            chats = data.result;
        }

        if (chats.length === 0) {
            caiLog(`[NET/${source}] Данные получены, но массив чатов пуст или не распознан`, 'warn');
            return;
        }

        caiLog(`[NET/${source}] Получено ${chats.length} чатов из сети`, 'action');

        // Нормализуем данные чатов в наш формат
        const normalizedChats = chats.map(chat => {
            // Разные поля для ID, имени, аватара в зависимости от API
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

        // Сохраняем в сетевой кэш
        networkCache.chats = normalizedChats;
        networkCache.lastUpdate = Date.now();
        saveData(KEY_NET_CACHE, networkCache);

        caiLog(`[NET/${source}] Нормализовано ${normalizedChats.length} чатов. Запуск слияния...`, 'action');

        // Запускаем слияние с архивом (асинхронно, чтобы не блокировать)
        setTimeout(() => mergeNetworkData(normalizedChats), 100);
    }

    // Обработка Neo API данных (trpc-запросы)
    function processNeoApiData(data, source) {
        if (!data) return;

        // Ищем вложенные данные о чатах/персонажах в любом уровне вложенности
        try {
            const chatData = extractChatsFromDeepObject(data);
            if (chatData.length > 0) {
                caiLog(`[NET/${source}] Neo API: извлечено ${chatData.length} чатов из вложенной структуры`, 'net');
                processNetworkChatsData({ chats: chatData }, source + '/neo');
            }
        } catch (err) {
            caiLog(`[NET/${source}] Neo API: ошибка извлечения: ${err.message}`, 'error');
        }
    }

    // Рекурсивный поиск объектов, похожих на чаты, в глубине JSON
    function extractChatsFromDeepObject(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== 'object') return [];
        const results = [];

        // Проверяем, не является ли текущий объект чатом
        if (obj.character_id || (obj.character?.id) || (obj.chat_id && obj.character_name)) {
            results.push(obj);
            return results;
        }

        // Рекурсивный обход
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

    // Точечные селекторы рекламных блоков. По ним скрывается ТОЛЬКО сам
    // найденный элемент (баннер и кнопка "Скрыть рекламу") — без подъёма
    // к произвольным предкам, поэтому реальный интерфейс не затрагивается.
    const AD_TARGET_SELECTORS = [
        '[data-testid="in-house-anchor-ad"]',   // внутренний баннер (c.ai FM / c.ai+)
        'button[aria-label="Скрыть рекламу"]',  // кнопка скрытия, торчащая снизу/сверху баннера
        'button[aria-label="Hide Ad"]',
        'button[aria-label="Hide ad"]',
        'div[id^="div-gpt-ad"]',                // контейнеры рекламы Google
        'div[id^="google_ads_iframe"]'
    ];

    function hideAdElement(el) {
        if (!el || el.classList.contains('cai-ad-hidden')) return false;
        el.classList.add('cai-ad-hidden');
        // Дублируем инлайном с !important: скрытие переживёт даже перезапись
        // классов/стилей со стороны Next.js/React при гидрации и ре-рендерах.
        el.style.setProperty('display', 'none', 'important');
        return true;
    }

    function restoreAdElement(el) {
        el.classList.remove('cai-ad-hidden');
        el.classList.remove('cai-ad-collapsed');
        if (el.style.display === 'none') el.style.removeProperty('display');
    }

    // Есть ли внутри элемента видимый контент (текст или не скрытые нами элементы)?
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
        // Самовосстановление класса на <html>, если сайт затёр его при ре-рендере/гидрации
        if (!document.documentElement.classList.contains('cai-adblock-on')) {
            document.documentElement.classList.add('cai-adblock-on');
        }

        let newlyHidden = 0;

        // 1) Точечно скрываем сами рекламные блоки и кнопки "Скрыть рекламу"
        //    (оба варианта: кнопка снизу баннера и кнопка сверху баннера).
        const hiddenAds = [];
        AD_TARGET_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                hiddenAds.push(el);
                if (hideAdElement(el)) newlyHidden++;
            });
        });

        // 2) Схлопываем опустевшие после скрытия рекламы обёртки, чтобы не
        //    оставалось пустой полосы (баннер 85px + кнопка 24px). Поднимаемся
        //    вверх ТОЛЬКО пока внутри не осталось ничего видимого: первый же
        //    элемент интерфейса останавливает подъём, поэтому скрыть интерфейс невозможно.
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

        // 3) Если сайт вернул контент в схлопнутую обёртку (ре-рендер), возвращаем её.
        //    Обход с конца (самые глубокие первыми), чтобы вложенные обёртки
        //    восстанавливались в правильном порядке.
        Array.from(document.querySelectorAll('.cai-ad-collapsed')).reverse().forEach(wrapper => {
            if (hasVisibleContent(wrapper)) {
                restoreAdElement(wrapper);
            }
        });

        // 4) Блоки с текстовой пометкой "Реклама"
        document.querySelectorAll('p').forEach(p => {
            if (p.textContent.trim() === 'Реклама') {
                const container = p.closest('div.flex.justify-between');
                if (container && container.parentElement) {
                    if (hideAdElement(container.parentElement)) newlyHidden++;
                }
            }
        });

        // 5) Апселл-блоки "Обновить до c.ai+"
        document.querySelectorAll('button.text-white').forEach(btn => {
            if (btn.textContent.includes('Обновить до') || btn.textContent.includes('Upgrade to')) {
                const wrapper = btn.closest('div[class*="rounded"]');
                if (hideAdElement(wrapper)) newlyHidden++;
            }
        });

        if (newlyHidden > 0) {
            caiLog(`AdBlock: скрыто элементов: ${newlyHidden}`, 'action');
        }
    }

    // Слияние сетевых данных с архивом
    function mergeNetworkData(netChats) {
        if (netChats.length === 0) return;
        if (isDomStale) {
            caiLog('[NET Merge] Слияние пропущено: вкладка устарела и архив заблокирован до перезагрузки', 'warn');
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

        // 1) Чаты, которые были в архиве, но вернулись в недавние — разархивируем
        const newArchive = archive.filter(archivedChat => {
            if (currentIds.has(archivedChat.id)) {
                caiLog(`[NET Merge] Чат разархивирован (вернулся): ${archivedChat.name}`, 'info');
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

        // 2) Чаты, которые были в снимке, но пропали из недавних — отправляем в архив
        const chatsToArchive = [];
        snapshotObjs.forEach(oldChat => {
            if (!currentIds.has(oldChat.id) && !archive.find(c => c.id === oldChat.id)) {
                // Проверяем, есть ли в сетевом кэше — если есть, берём обновлённые данные
                const fromNet = netChats.find(c => c.id === oldChat.id);
                chatsToArchive.push(fromNet || oldChat);
            }
        });

        if (chatsToArchive.length > 0) {
            caiLog(`[NET Merge] Отправка в архив: ${chatsToArchive.length} чатов`, 'warn');

            const positionIds = new Set(positionsSnapshot.map(c => c.id));

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

        // 3) Обнаружение новых чатов
        const newChats = netChats.filter(c => !snapshotIds.has(c.id) && !archivedIds.has(c.id));
        if (newChats.length > 0) {
            caiLog(`[NET Merge] Обнаружено ${newChats.length} новых чатов`, 'action');
            saveData(KEY_LAST_BATCH, newChats.length);
            countersChanged = true;

            const trulyNewIds = newChats.map(c => c.id);
            trackedChats = [...new Set([...trackedChats, ...trulyNewIds])];
        }

        // Сохраняем результаты
        if (archiveChanged) saveData(KEY_ARCHIVE, archive);
        if (softWarningChanged) saveData(KEY_SOFT_WARNING_CHATS, softWarningChats);
        if (countersChanged) {
            saveData(KEY_DELTA_TRACKED_CHATS, trackedChats);
            saveData(KEY_DELTA, trackedChats.length);
        }

        // Обновляем снимок
        saveData(KEY_SNAPSHOT, netChats);

        // Обновляем позиции
        netChats.forEach(chat => {
            const positionIds = new Set(positionsSnapshot.map(c => c.id));
            if (!positionIds.has(chat.id)) {
                positionsSnapshot.push({ id: chat.id });
            }
        });
        saveData(KEY_POSITIONS_SNAPSHOT, positionsSnapshot);

        renderArchive();
        caiLog(`[NET Merge] Слияние завершено. Архив: ${archive.length}, Tracked: ${trackedChats.length}`, 'action');
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
            if (key === KEY_SETTING_NET_INTERCEPT) return true; // По умолчанию включён
            if (key === KEY_SETTING_AUTO_SCAN) return true;
            if (key === KEY_NET_CACHE) return { chats: [], lastUpdate: 0 };
            if (key === KEY_SETTING_ADBLOCK) return false;
            return [];
        }
    }

    function saveData(key, data) {
        try {
            if (isDomStale && isArchiveWriteLockedKey(key)) {
                caiLog(`Запись ${key} заблокирована: вкладка устарела и требует перезагрузки`, 'warn');
                return;
            }
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            caiLog(`Ошибка сохранения ${key}: ${e.message}`, 'error');
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

        caiLog(`Создан новый слепок позиций (Всего ${result.length})`, 'info');
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

        caiLog(`[Позиция] Расчет для чата ${chatName} (ID ${chatId}). Позиция в слепке: ${posInSnapshot}`, 'info');

        if (posInSnapshot === -1) {
            caiLog(`[⚠️ ВНИМАНИЕ] Чат ${chatName} отсутствует в слепке позиций! Падает на индекс 0.`, 'warn');
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
                caiLog(`[Позиция] Найдено пересечение! Индекс вставки: ${i}`, 'action');
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

        // Проверяем, есть ли зелёные чаты в архиве
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

            // Красная линия только если в архиве НЕТ зелёных чатов
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
        if (blockStaleArchiveAction('сброс счётчика')) return;
        const delta = getData(KEY_DELTA) || 0;
        caiLog(`Сброс дельты пользователем. Текущая дельта: ${delta}`, 'action');
        let message = '';

        if (delta > 50) {
            message = `ВНИМАНИЕ! Порог был превышен (${delta}/50)!\nВы сделали сброс вместо экспорта. Рассинхронизация вероятна, не забудьте сделать сброс и на других устройствах!`;
        } else if (delta > 0) {
            message = `Счетчик дельты (${delta}/50) успешно сброшен!\nНе забудьте нажать кнопку 'Сброс' и на других ваших устройствах при входе.`;
        } else {
            message = 'Счетчик уже равен нулю (0/50). Сброс не требовался, но выполнен.';
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
        if (blockStaleArchiveAction('экспорт архива')) return;
        const data = getData(KEY_ARCHIVE);
        const lastBatch = getData(KEY_LAST_BATCH) || 0;
        const delta = getData(KEY_DELTA) || 0;

        caiLog(`Попытка экспорта. Чатов: ${data.length}, Дельта: ${delta}`, 'action');

        if (data.length === 0) { alert('Архив пуст. Скачивать нечего.'); return; }

        let isDev = getData(KEY_SETTING_DEV);
        let skipErase = isTopButton && isDev;
        let message = '';

        if (delta > 50) {
            message = `Порог по чатам был превышен (${delta}/50)!\nДанные сохранены. Обязательно сделайте ИМПОРТ этого файла на других устройствах!`;
        } else if (delta > 0) {
            message = `Порог ещё не превышен (${delta}/50).\nДанные сохранены. Вы можете сделать импорт на других устройствах для надежности.`;
        } else {
            message = `Данные архива сохранены.\nНовых чатов с прошлого раза не было (0/50).`;
        }

        if (skipErase) {
            message += '\n[Режим Разработчика: Верхняя кнопка. Счётчики Дельты НЕ стёрты]';
            caiLog('Экспорт в режиме разработчика (без сброса дельты)', 'warn');
        }

        const exportObj = { version: '15.0', chats: data, lastBatch: lastBatch, delta: 0 };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cai-archive-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (!skipErase) {
            caiLog('Очистка счетчиков после успешного экспорта', 'info');
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
        if (blockStaleArchiveAction('импорт архива')) return;
        caiLog('Открыто окно импорта', 'action');
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

                    if (confirm(`Заменить архив (${importedChats.length} чатов)?`)) {
                        caiLog(`Импорт подтвержден. Загружено ${importedChats.length} чатов`, 'warn');
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
                            setTimeout(() => alert('[Режим Разработчика] Импорт без стирания дельты завершен'), 100);
                        }
                        renderArchive();
                    } else {
                        caiLog('Импорт отменен пользователем', 'info');
                    }
                } catch (err) {
                    caiLog(`Ошибка импорта: ${err.message}`, 'error');
                    alert('Ошибка импорта: ' + err.message);
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
                control.title = 'Вкладка устарела. Нажмите жёлтое уведомление, чтобы обновить страницу.';
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
                link.title = 'Архив на этой вкладке заблокирован до перезагрузки.';
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
        blockStaleArchiveAction('клик по заблокированному блоку архива', event);
    }

    // ===================== УВЕДОМЛЕНИЕ РАССИНХРОНИЗАЦИИ =====================
    function showStaleWarningModal() {
        const existing = document.getElementById('cai-stale-modal');
        if (existing) {
            scheduleStaleWarningPosition();
            return;
        }
        caiLog('Показано уведомление рассинхронизации вкладок', 'warn');
        const modal = document.createElement('div');
        modal.id = 'cai-stale-modal';

        const box = document.createElement('div');
        box.className = 'cai-stale-box';
        box.setAttribute('role', 'button');
        box.setAttribute('tabindex', '0');
        box.title = 'Нажмите, чтобы обновить страницу';
        box.onclick = () => window.location.reload();
        box.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.location.reload();
            }
        };

        const title = document.createElement('h3');
        title.className = 'cai-stale-title';
        title.textContent = 'Вкладка устарела';

        const text = document.createElement('p');
        text.className = 'cai-stale-text';
        text.textContent = 'Архив изменён в другой вкладке. Действия архива тут отключены до обновления.';

        const btn = document.createElement('span');
        btn.className = 'cai-stale-btn';
        btn.textContent = 'Нажмите, чтобы обновить';

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

        // Если сеть включена и недавно получали данные — пропускаем DOM-сканирование
        const isNetEnabled = getData(KEY_SETTING_NET_INTERCEPT);
        const isAutoScanEnabled = getData(KEY_SETTING_AUTO_SCAN);

        if (isNetEnabled && networkCache.lastUpdate > 0 && (Date.now() - networkCache.lastUpdate < 3000)) {
            caiLog('DOM-сканирование пропущено (актуальные сетевые данные)', 'info');
            return;
        }

        if (!isAutoScanEnabled && isNetEnabled) {
            caiLog('DOM-сканирование отключено (только перехват сети)', 'info');
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
                caiLog(`Снят статус ручного удаления для вернувшихся чатов: ${returnedToMain.join(', ')}`, 'info');
                manualDelIds = manualDelIds.filter(id => !currentMap.has(id));
                manualDelChanged = true;
            }
        }

        const newArchive = archive.filter(archivedChat => {
            if (currentMap.has(archivedChat.id)) {
                archiveChanged = true;
                caiLog(`Чат разархивирован (вернулся на экран): ${archivedChat.name}`, 'info');
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
                caiLog('Обновлены позиции зелёных чатов в слепке', 'info');
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
                caiLog(`[Сортировка] Найдено чатов для архивации: ${chatsToArchive.length}`, 'warn');
                chatsToArchive.sort((a, b) => {
                    const posA = positionsSnapshot.findIndex(c => c.id === a.id);
                    const posB = positionsSnapshot.findIndex(c => c.id === b.id);
                    const effectivePosA = posA === -1 ? Infinity : posA;
                    const effectivePosB = posB === -1 ? Infinity : posB;
                    return effectivePosA - effectivePosB;
                });

                chatsToArchive.forEach(oldChat => {
                    const insertIndex = findInsertIndexInArchive(oldChat.id, oldChat.name, archive, positionsSnapshot);
                    caiLog(`[Итог вставки] Чат ${oldChat.name} -> индекс [${insertIndex}]`, 'warn');

                    archive.splice(insertIndex, 0, oldChat);
                    archiveChanged = true;

                    if (trackedChats.includes(oldChat.id)) {
                        if (!softWarningChats.includes(oldChat.id)) {
                            caiLog(`Мягкое предупреждение! Скрыт новый чат ${oldChat.name}`, 'error');
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
                    caiLog(`Добавлена пачка новых чатов. Размер: ${newToTopCount}`, 'info');
                    saveData(KEY_LAST_BATCH, newToTopCount);
                    countersChanged = true;
                } else {
                    caiLog('Блокировка счетчика новых чатов из-за недавнего ручного скрытия', 'warn');
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
                caiLog('КРИТИЧЕСКАЯ ДЕЛЬТА >= 50. Принудительное включение визуала', 'error');
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
                caiLog(`Изменение дельты: ${currentDelta} -> ${newDelta}`, 'warn');
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
        const isDebug = getData(KEY_SETTING_DEBUG);
        const positionsSnapshot = getData(KEY_POSITIONS_SNAPSHOT) || [];

        // Создание контейнера архива
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
            headerTitle.className = 'pl-1 text-tiny text-foreground-500 font-bold';
            headerTitle.textContent = t('archive');

            const controlsDiv = document.createElement('div');

            const btnExport = document.createElement('button');
            btnExport.textContent = t('save');
            btnExport.className = 'cai-btn';
            btnExport.onclick = () => doExport(true);

            const btnImport = document.createElement('button');
            btnImport.textContent = t('load');
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

        // Обновление счетчиков
        const countersDiv = archiveContainer.querySelector('#cai-counters-area');
        if (countersDiv) {
            const getColor = (val) => val >= 40 ? 'cai-count-danger' : val >= 25 ? 'cai-count-warn' : 'cai-count-safe';
            const getSuffix = (val) => val >= 40 ? '!!' : val >= 25 ? '!' : '';
            countersDiv.innerHTML = `
                <span class="cai-counter-label pl-1">${t('added')}</span>
                <span class="cai-counter-val ${getColor(batchCount)}">${t('simultaneous')} ${batchCount}/50</span>
                <span class="cai-counter-val ${getColor(deltaCount)}">${t('since')} ${deltaCount}/50</span>
            `;
        }

        // Нижняя панель
        const bottomPanel = archiveContainer.querySelector('#cai-bottom-panel');
        if (bottomPanel) {
            bottomPanel.innerHTML = '';

            if (deltaCount < 50) {
                const btn = document.createElement('button');
                btn.className = 'cai-wide-btn cai-btn-reset';
                btn.textContent = t('reset');
                btn.onclick = resetDelta;
                const txt = document.createElement('span');
                txt.className = 'cai-help-text';
                txt.textContent = '(С момента последнего сброса/экспорта новые чаты не превысили предел. Вам не обязательно делать экспорт данных.) Когда вы будете переходить между устройствами, не забудьте нажать кнопку Сброс на этом устройстве и также проделать на втором устройстве как только перейдёте.';
                bottomPanel.appendChild(btn);
                bottomPanel.appendChild(txt);
            } else {
                const btn = document.createElement('button');
                btn.className = 'cai-wide-btn cai-btn-alert';
                btn.textContent = '⬇️ Экспорт';
                btn.onclick = () => doExport(false);
                const txt = document.createElement('span');
                txt.className = 'cai-help-text';
                txt.innerHTML = '(Порог по чатам был превышен! Вам нужно сделать экспорт данных по кнопке ⬇️ Экспорт выше этого текста.) Не забудьте сделать импорт данных на другом устройстве!';
                bottomPanel.appendChild(btn);
                bottomPanel.appendChild(txt);
            }

            // Мягкие предупреждения
            if (softWarningChats.length > 0) {
                const count = softWarningChats.length;
                const lastTwo = count % 100;
                const lastOne = count % 10;
                let chatWord;
                if (lastTwo >= 11 && lastTwo <= 14) {
                    chatWord = 'новых чатов';
                } else if (lastOne === 1) {
                    chatWord = 'новый чат';
                } else if (lastOne >= 2 && lastOne <= 4) {
                    chatWord = 'новых чата';
                } else {
                    chatWord = 'новых чатов';
                }
                const isOne = (lastTwo !== 11 && lastOne === 1);
                const pronoun1 = isOne ? 'его' : 'их';
                const pronoun2 = isOne ? 'этот чат был удалён' : 'эти чаты были удалены';
                const ending = isOne ? 'этому чату' : 'этим чатам';
                const endingAlt = isOne ? 'этот чат попал сюда сам' : 'эти чаты или некоторые из них попали сюда сами';

                const d = document.createElement('div');
                d.className = 'cai-soft-warning';
                d.textContent = `(Вы скрыли ${count} ${chatWord} в архив. Чтобы избежать рассинхронизации, удалите ${pronoun1} крестиком из списка ниже, либо сделайте экспорт. Если ${pronoun2} вами, то смело жмите крестик по ${ending}; если же ${endingAlt}, лучше сделайте экспорт)`;
                bottomPanel.appendChild(d);
            }

            // Предупреждение о ручном удалении
            if (hasManualDel && manualDelIds.length > 0) {
                const d = document.createElement('div');
                d.className = 'cai-deletion-warning';
                d.textContent = 'Так как вы удалили чат из архива навсегда, автоматически такое удаление подтянуться на другие устройства не сможет. Если вы желаете продублировать это удаление, то по окончанию сессии вам нужно экспортировать данные и перенести файл экспорта на другое устройство и импортировать его.';
                bottomPanel.appendChild(d);
            }

            // БЛОК НАСТРОЕК
            const settingsDiv = document.createElement('div');
            settingsDiv.className = 'cai-settings-divider';

            const titleSettings = document.createElement('div');
            titleSettings.className = 'cai-settings-title';
            titleSettings.textContent = t('settings');

            // --- Визуализация разделов ---
            const isVisual = getData(KEY_SETTING_VISUAL);
            const lblVisual = document.createElement('label');
            lblVisual.className = 'cai-toggle';
            lblVisual.innerHTML = `<input type="checkbox" ${isVisual ? 'checked' : ''}><span class="cai-slider cai-slider-red-green"></span><span>${t('visual')}</span>`;

            const legendDiv = document.createElement('div');
            legendDiv.className = 'cai-legend';
            legendDiv.style.display = isVisual ? 'flex' : 'none';
            legendDiv.innerHTML = `
                <div class="cai-legend-item"><div class="cai-color-box cai-box-green"></div> - ${t('newChats')}</div>
                <div class="cai-legend-item"><div class="cai-color-box cai-box-blue"></div> - ${t('oldChats')}</div>
                <div class="cai-legend-item"><div class="cai-color-box cai-box-yellow"></div> - ${t('hidden')}</div>
                <div class="cai-legend-item" style="margin-top:6px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.1)">
                    <span style="display:inline-block;width:24px;height:2px;background:#ef4444;margin-right:6px;vertical-align:middle"></span>
                    <span style="font-size:9px;color:#a1a1aa">Граница новых/старых</span>
                </div>
            `;

            // --- Адблок ---
            const isAdBlock = getData(KEY_SETTING_ADBLOCK);
            const lblAdBlock = document.createElement('label');
            lblAdBlock.className = 'cai-toggle';
            lblAdBlock.innerHTML = `<input type="checkbox" ${isAdBlock ? 'checked' : ''}><span class="cai-slider cai-slider-red-green"></span><span>${t('adblock')}</span>`;

            // --- Перехват сети ---
            const isNetIntercept = getData(KEY_SETTING_NET_INTERCEPT);
            const lblNet = document.createElement('label');
            lblNet.className = 'cai-toggle';
            lblNet.innerHTML = `<input type="checkbox" ${isNetIntercept ? 'checked' : ''}><span class="cai-slider cai-slider-orange-teal"></span><span>${t('network')}</span>`;

            // --- Автосканирование DOM ---
            const isAutoScan = getData(KEY_SETTING_AUTO_SCAN);
            const lblAutoScan = document.createElement('label');
            lblAutoScan.className = 'cai-toggle';
            lblAutoScan.innerHTML = `<input type="checkbox" ${isAutoScan ? 'checked' : ''}><span class="cai-slider cai-slider-orange-teal"></span><span>${t('autoscan')}</span>`;

            // --- Режим разработчика ---
            const isDevMode = getData(KEY_SETTING_DEV);
            const lblDev = document.createElement('label');
            lblDev.className = 'cai-toggle';
            lblDev.innerHTML = `<input type="checkbox" ${isDevMode ? 'checked' : ''}><span class="cai-slider cai-slider-gray-blue"></span><span>${t('developer')}</span>`;

            const devWarningDiv = document.createElement('div');
            devWarningDiv.className = 'cai-dev-warning';
            devWarningDiv.style.display = isDevMode ? 'block' : 'none';
            devWarningDiv.innerHTML = `
                <span class="cai-dev-warning-title">⚠️ ${currentLanguage() === 'en' ? 'Use with caution!' : 'Используйте осторожно!'}</span>
                ${currentLanguage() === 'en' ? 'This mode disables synchronization safeguards.' : 'Этот режим отключает защитные механизмы синхронизации.'}
                <ul class="cai-dev-list" style="list-style: none; padding: 0; margin: 0;">
                    <li>– ${currentLanguage() === 'en' ? 'Export/Import from the top buttons does not reset counters' : 'Экспорт/Импорт через верхние кнопки не сбрасывает счётчики'}</li>
                    <li>– ${currentLanguage() === 'en' ? 'Visualization can be disabled even with 50+ new chats' : 'Можно отключить визуализацию даже при 50+ новых чатах'}</li>
                    <li>– ${currentLanguage() === 'en' ? 'Test the archive without affecting delta counters' : 'Тестирование архива без влияния на дельта-счётчики'}</li>
                    <li>– ${currentLanguage() === 'en' ? 'Show position numbers on chats' : 'Нумерация порядка позиций на чатах'}</li>
                    <li>– ${currentLanguage() === 'en' ? 'Risk of device synchronization issues if misused' : 'Риск рассинхронизации между устройствами при неправильном использовании'}</li>
                </ul>
            `;

            // --- Консоль логов ---
            const isDebugMode = getData(KEY_SETTING_DEBUG);
            const lblDebug = document.createElement('label');
            lblDebug.className = 'cai-toggle';
            lblDebug.style.marginTop = '10px';
            lblDebug.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            lblDebug.style.paddingTop = '10px';
            lblDebug.innerHTML = `<input type="checkbox" ${isDebugMode ? 'checked' : ''}><span class="cai-slider cai-slider-gray-blue"></span><span>${t('debug')}</span>`;

            // Переключатель языка находится первым в настройках: он всегда доступен
            // и сам переводится после переключения.
            const languageRow = document.createElement('div');
            languageRow.className = 'cai-language-switcher';
            languageRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
            languageRow.innerHTML = `<span>${t('language')}</span><span style="display:flex;gap:4px"><button type="button" class="cai-btn cai-lang-btn" data-lang="en">${t('english')}</button><button type="button" class="cai-btn cai-lang-btn" data-lang="ru">${t('russian')}</button></span>`;
            languageRow.querySelectorAll('[data-lang]').forEach(button => {
                button.style.opacity = button.dataset.lang === currentLanguage() ? '1' : '0.55';
                button.addEventListener('click', () => {
                    if (blockStaleArchiveAction('language change')) return;
                    saveData(KEY_LANGUAGE, button.dataset.lang);
                    renderArchive();
                });
            });

            // Сборка настроек
            settingsDiv.appendChild(titleSettings);
            settingsDiv.appendChild(languageRow);
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
                if (blockStaleArchiveAction('изменение настройки визуализации', e)) {
                    e.target.checked = getData(KEY_SETTING_VISUAL);
                    return;
                }
                const devM = getData(KEY_SETTING_DEV);
                const dCount = getData(KEY_DELTA) || 0;
                if (!devM && dCount >= 50 && !e.target.checked) {
                    e.target.checked = true;
                    alert('Отключить визуализацию при 50+ чатах можно только в Режиме разработчика!');
                    return;
                }
                saveData(KEY_SETTING_VISUAL, e.target.checked);
                legendDiv.style.display = e.target.checked ? 'flex' : 'none';
                // Точечное обновление без пересоздания DOM (анимация тумблера сохраняется)
                updateArchiveItemClasses();
                updateMainVisuals();
            });

            lblAdBlock.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction('изменение настройки блокировки рекламы', e)) {
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
                if (blockStaleArchiveAction('изменение настройки перехвата сети', e)) {
                    e.target.checked = getData(KEY_SETTING_NET_INTERCEPT);
                    return;
                }
                saveData(KEY_SETTING_NET_INTERCEPT, e.target.checked);
                if (e.target.checked) {
                    installNetworkInterceptor();
                    caiLog('Перехват сети включён', 'action');
                } else {
                    caiLog('Перехват сети выключён. Перезагрузите страницу для полного отключения.', 'warn');
                }
            });

            lblAutoScan.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction('изменение настройки DOM-сканирования', e)) {
                    e.target.checked = getData(KEY_SETTING_AUTO_SCAN);
                    return;
                }
                saveData(KEY_SETTING_AUTO_SCAN, e.target.checked);
                caiLog(`DOM-сканирование: ${e.target.checked ? 'включено' : 'выключено'}`, 'action');
            });

            lblDev.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction('изменение режима разработчика', e)) {
                    e.target.checked = getData(KEY_SETTING_DEV);
                    return;
                }
                saveData(KEY_SETTING_DEV, e.target.checked);
                devWarningDiv.style.display = e.target.checked ? 'block' : 'none';
                toggleDebugConsole();
                // Точечное обновление без пересоздания DOM (анимация тумблера сохраняется)
                updateArchiveItemClasses();
                updateMainVisuals();
            });

            lblDebug.querySelector('input').addEventListener('change', (e) => {
                if (blockStaleArchiveAction('изменение настройки консоли логов', e)) {
                    e.target.checked = getData(KEY_SETTING_DEBUG);
                    return;
                }
                saveData(KEY_SETTING_DEBUG, e.target.checked);
                toggleDebugConsole();
                if (e.target.checked) caiLog('Консоль открыта. Фоновые логи загружены', 'info');
            });

            // Счетчик общего количества
            const totalCountDiv = document.createElement('div');
            totalCountDiv.className = 'cai-total-count';
            totalCountDiv.textContent = `(Чатов в архиве: ${archiveData.length})`;
            bottomPanel.appendChild(totalCountDiv);
        }

        // Рендер списка архивных чатов
        const ul = archiveContainer.querySelector('ul[role="group"]');
        ul.innerHTML = '';

        if (archiveData.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'text-center text-xs text-foreground-500 py-2 italic';
            emptyMsg.textContent = 'Пусто';
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
            a._caiChatId = chat.id; // Сохраняем ID для updateArchiveItemClasses()

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
                if (blockStaleArchiveAction('удаление чата из архива', e)) return;
                if (confirm(`Удалить ${chat.name}?`)) {
                    caiLog(`Ручное удаление чата из архива: ${chat.name}`, 'error');
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
            const keywords = ['удалить из недавних', 'remove from recent', 'hide character'];
            if (keywords.some(k => text.includes(k))) {
                lastManualDeleteTime = Date.now();
                caiLog('Перехвачен клик ручного скрытия (hide character)', 'action');
            }
        }
    }, true);

    // ===================== ЗАПУСК =====================
    function start() {
        if (document.body) {
            caiLog('C.AI Chat Archive v15.0 загружен', 'action');

            // Устанавливаем перехват сети как можно раньше
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

            // Инициализация адблока при запуске
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
