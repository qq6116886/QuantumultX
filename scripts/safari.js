// ==UserScript==
// @name         工具箱
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  右下角快捷键面板：源码、Cookies、复制、粘贴
// @author       AI
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.__tm_toolbox_loaded__) return;
    window.__tm_toolbox_loaded__ = true;

    const boot = () => {
        if (!document.body) return setTimeout(boot, 50);
        start();
    };
    boot();

    function start() {
        /* ========== 1. UI 构建 ========== */
        const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

        // 圆形主按钮工厂
        const makeBtn = (text, title, bg, fontSize = '18px') => {
            const el = document.createElement('div');
            el.innerText = text;
            el.title = title;
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', title);
            el.setAttribute('data-tm-self', '');
            el.style.cssText = `
                width: 44px; height: 44px; border-radius: 50%;
                background: ${bg}; color: #fff;
                display: flex; align-items: center; justify-content: center;
                font-size: ${fontSize}; font-weight: bold; font-family: system-ui;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                user-select: none; -webkit-user-select: none; cursor: pointer;
                transition: transform 0.12s ease, background 0.2s;
            `;
            el.addEventListener('mouseenter', () => el.style.transform = 'scale(1.08)');
            el.addEventListener('mouseleave', () => el.style.transform = 'scale(1)');
            return el;
        };

        // 面板功能项工厂
        const makeItem = (icon, label, shortcut, bg) => {
            const row = document.createElement('div');
            row.setAttribute('data-tm-self', '');
            row.setAttribute('role', 'button');
            row.setAttribute('title', `${label} (${shortcut})`);
            row.style.cssText = `
                display: flex; align-items: center; gap: 10px;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                user-select: none;
                transition: background 0.15s;
                min-width: 175px;
            `;
            row.addEventListener('mouseenter', () => row.style.background = 'rgba(0,0,0,0.06)');
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');

            const iconEl = document.createElement('span');
            iconEl.innerText = icon;
            iconEl.style.cssText = `
                width: 26px; height: 26px; border-radius: 50%;
                background: ${bg}; color: #fff;
                display: flex; align-items: center; justify-content: center;
                font-size: 12px; font-weight: bold;
                flex-shrink: 0;
            `;

            const labelEl = document.createElement('span');
            labelEl.innerText = label;
            labelEl.style.cssText = 'flex: 1; font-size: 14px; color: #333; font-family: system-ui; white-space: nowrap;';

            const shortcutEl = document.createElement('span');
            shortcutEl.innerText = shortcut;
            shortcutEl.style.cssText = `
                font-size: 11px; color: #888;
                font-family: monospace;
                background: #f0f0f0;
                padding: 2px 6px; border-radius: 4px;
            `;

            row.append(iconEl, labelEl, shortcutEl);
            return row;
        };

        // 容器（右下角）
        const container = document.createElement('div');
        container.id = '__tm_toolbox__';
        container.setAttribute('data-tm-self', '');
        container.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            z-index: 2147483647;
            display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
        `;

        // 面板
        const panel = document.createElement('div');
        panel.setAttribute('data-tm-self', '');
        panel.style.cssText = `
            display: none;
            flex-direction: column;
            background: rgba(255,255,255,0.98);
            border-radius: 12px;
            padding: 6px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.25);
            backdrop-filter: blur(10px);
        `;

        // 面板功能项
        const sourceItem = makeItem('</>', '查看源码',    'Alt+X', 'rgba(142,68,173,1)');
        const cookieItem = makeItem('🍪', '查看 Cookies', 'Alt+K', 'rgba(210,105,30,1)');
        const copyItem   = makeItem('📋', '复制全文',     'Alt+C', 'rgba(0,122,255,1)');
        const pasteItem  = makeItem('📥', '智能粘贴',     'Alt+V', 'rgba(255,149,0,1)');

        panel.append(sourceItem, cookieItem, copyItem, pasteItem);

        // 主按钮
        const mainBtn = makeBtn('⌨️', '工具箱', 'rgba(50,50,50,0.9)', '20px');

        container.append(panel, mainBtn);
        document.body.appendChild(container);

        // 主按钮：切换面板
        mainBtn.addEventListener('click', (e) => {
            stop(e);
            const open = panel.style.display === 'flex';
            panel.style.display = open ? 'none' : 'flex';
            mainBtn.innerText = open ? '⌨️' : '✕';
        });

        // 点击外部关闭面板
        document.addEventListener('click', (e) => {
            if (panel.style.display !== 'flex') return;
            if (container.contains(e.target)) return;
            panel.style.display = 'none';
            mainBtn.innerText = '⌨️';
        }, true);

        /* ========== 2. 记录最后一次聚焦的可输入元素 ========== */
        let lastActiveElement = null;
        document.addEventListener('focusin', (e) => {
            const t = e.target;
            if (!t) return;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) {
                lastActiveElement = t;
            }
        }, true);

        /* ========== 3. 文本 / 源码 / Cookies ========== */
        function extractText() {
            const clone = document.body.cloneNode(true);

            const noise = 'script,style,noscript,iframe,svg,canvas,link,meta,[hidden]';
            clone.querySelectorAll(noise).forEach(el => el.remove());

            // 剔除本脚本自身 UI
            clone.querySelectorAll('[data-tm-self]').forEach(el => el.remove());
            clone.querySelectorAll('#__tm_toolbox__, [id^="__tm_"], .__tm_modal__').forEach(el => el.remove());

            const host = document.createElement('div');
            host.style.cssText = 'position:fixed;top:0;left:-99999px;opacity:0;';
            host.appendChild(clone);
            document.body.appendChild(host);
            let text = clone.innerText || clone.textContent || '';
            host.remove();

            return text
                .replace(/\r\n?/g, '\n')
                .replace(/[ \t\u00a0]+/g, ' ')
                .replace(/ *\n */g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        const getSourceCode = () => '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        const getCookies    = () => document.cookie || '当前页面无 Cookie，或 Cookie 被标记为 HttpOnly 无法读取。';

        /* ========== 4. 复制（带旧浏览器兜底） ========== */
        async function doCopy() {
            const text = extractText();
            if (!text) { toast('复制：内容为空', 'red'); return; }
            try {
                await navigator.clipboard.writeText(text);
                toast('✅ 已复制全文', 'green');
            } catch {
                const ok = fallbackCopy(text);
                toast(ok ? '✅ 已复制全文' : '❌ 复制失败', ok ? 'green' : 'red');
            }
        }

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:-99999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch {}
            ta.remove();
            return ok;
        }

        /* ========== 5. 粘贴（兼容 React / Vue 受控组件） ========== */
        function setNativeValue(el, value) {
            const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        async function doPaste() {
            let text;
            try {
                text = await navigator.clipboard.readText();
            } catch {
                toast('❌ 剪贴板读取被拒绝', 'red');
                return;
            }

            if (!text) { toast('剪贴板为空', 'red'); return; }

            const el = lastActiveElement;
            const usable = el && document.contains(el) && !el.disabled && !el.readOnly;

            if (!usable) {
                showModal(text, '剪贴板内容（未找到可输入目标）');
                toast('未找到可输入目标，已弹出查看', 'blue');
                return;
            }

            const skipTypes = ['submit','button','reset','checkbox','radio','file','image','range','color','hidden'];
            if (el.tagName === 'INPUT' && skipTypes.includes((el.type || 'text').toLowerCase())) {
                toast('该输入框不支持粘贴', 'red');
                return;
            }

            try {
                el.focus();

                if (el.isContentEditable) {
                    const ok = document.execCommand('insertText', false, text);
                    if (!ok) {
                        el.textContent = (el.textContent || '') + text;
                        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
                    }
                } else {
                    const textTypes = ['text','search','url','tel','email','password',''];
                    const type = (el.type || '').toLowerCase();
                    if (el.tagName === 'TEXTAREA' || textTypes.includes(type)) {
                        const val = el.value || '';
                        const startPos = el.selectionStart ?? val.length;
                        const endPos   = el.selectionEnd   ?? val.length;
                        setNativeValue(el, val.slice(0, startPos) + text + val.slice(endPos));
                        try { el.setSelectionRange(startPos + text.length, startPos + text.length); } catch {}
                    } else {
                        setNativeValue(el, (el.value || '') + text);
                    }
                }

                toast('✅ 已粘贴', 'green');
            } catch (err) {
                console.warn('[toolbox] paste failed:', err);
                toast('❌ 粘贴失败', 'red');
            }
        }

        /* ========== 6. 事件绑定 ========== */
        sourceItem.addEventListener('click', (e) => { stop(e); showInfoModal('网页源代码', getSourceCode(), 'rgba(142,68,173,1)'); });
        cookieItem.addEventListener('click', (e) => { stop(e); showInfoModal('网页 Cookies', getCookies(), 'rgba(210,105,30,1)'); });
        copyItem.addEventListener('click',   (e) => { stop(e); doCopy(); });
        pasteItem.addEventListener('click',  (e) => { stop(e); doPaste(); });

        window.addEventListener('keydown', (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const map = {
                KeyX: () => showInfoModal('网页源代码', getSourceCode(), 'rgba(142,68,173,1)'),
                KeyK: () => showInfoModal('网页 Cookies', getCookies(), 'rgba(210,105,30,1)'),
                KeyC: doCopy,
                KeyV: doPaste,
            };
            const fn = map[e.code];
            if (fn) { e.preventDefault(); e.stopPropagation(); fn(); }
        }, true);

        /* ========== 7. UI 辅助 ========== */
        function toast(msg, color = 'gray') {
            const bg = color === 'green' ? 'rgba(40,160,80,1)' :
                       color === 'red'   ? 'rgba(200,40,40,1)' :
                       color === 'blue'  ? 'rgba(0,122,255,1)' :
                                           'rgba(80,80,80,1)';
            const t = document.createElement('div');
            t.setAttribute('data-tm-self', '');
            t.innerText = msg;
            t.style.cssText = `
                position: fixed; bottom: 80px; right: 20px;
                background: ${bg}; color: #fff;
                padding: 8px 14px; border-radius: 8px;
                font-size: 13px; font-family: system-ui;
                z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                pointer-events: none;
                opacity: 1;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; }, 1200);
            setTimeout(() => t.remove(), 1500);
        }

        function showModal(text, title) {
            document.querySelectorAll('.__tm_modal__').forEach(el => el.remove());

            const overlay = document.createElement('div');
            overlay.className = '__tm_modal__';
            overlay.setAttribute('data-tm-self', '');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;width:80%;max-width:400px;border-radius:12px;padding:15px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;';
            const head = document.createElement('div');
            head.innerText = title || '提示';
            head.style.cssText = 'font-weight:bold;font-size:16px;color:#333;';
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'width:100%;height:200px;padding:10px;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;resize:none;font-size:14px;line-height:1.5;';
            const close = document.createElement('button');
            close.innerText = '关闭';
            close.style.cssText = 'padding:10px;border:none;border-radius:8px;background:#007AFF;color:#fff;font-size:16px;cursor:pointer;';
            close.onclick = () => overlay.remove();
            box.append(head, ta, close);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            ta.focus(); ta.select();
        }

        function showInfoModal(titleText, content, themeColor) {
            document.querySelectorAll('.__tm_modal__').forEach(el => el.remove());

            const overlay = document.createElement('div');
            overlay.className = '__tm_modal__';
            overlay.setAttribute('data-tm-self', '');
            overlay.style.cssText = `
                position: fixed; inset: 0;
                background: rgba(20,20,20,0.98); z-index: 2147483647;
                display: flex; flex-direction: column;
                padding-bottom: env(safe-area-inset-bottom);
                box-sizing: border-box;
            `;

            const topBar = document.createElement('div');
            topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 15px;background:#222;color:#fff;flex-shrink:0;border-bottom:1px solid #333;';

            const title = document.createElement('div');
            title.innerText = titleText;
            title.style.cssText = 'font-size:16px;font-weight:bold;flex:1;text-align:left;';

            const copyBtn2 = document.createElement('div');
            copyBtn2.innerText = '📋 一键复制';
            copyBtn2.style.cssText = `background:${themeColor};color:#fff;padding:6px 15px;border-radius:15px;font-size:14px;cursor:pointer;font-weight:bold;user-select:none;margin:0 10px;`;
            copyBtn2.onclick = async () => {
                let ok = false;
                try { await navigator.clipboard.writeText(content); ok = true; }
                catch { ok = fallbackCopy(content); }
                copyBtn2.innerText = ok ? '✅ 已复制' : '❌ 复制失败';
                copyBtn2.style.background = ok ? 'rgba(40,160,80,1)' : 'rgba(200,40,40,1)';
                setTimeout(() => {
                    copyBtn2.innerText = '📋 一键复制';
                    copyBtn2.style.background = themeColor;
                }, 2000);
            };

            const closeBtn = document.createElement('div');
            closeBtn.innerText = '✕';
            closeBtn.style.cssText = 'font-size:22px;padding:0 5px;cursor:pointer;';
            closeBtn.onclick = () => overlay.remove();

            topBar.append(title, copyBtn2, closeBtn);

            const ta = document.createElement('textarea');
            ta.value = content;
            ta.readOnly = true;
            ta.style.cssText = 'flex:1;width:100%;box-sizing:border-box;background:#1e1e1e;color:#d4d4d4;border:none;padding:15px;font-family:monospace;font-size:13px;line-height:1.5;resize:none;outline:none;margin:0;';

            overlay.append(topBar, ta);
            document.body.appendChild(overlay);
        }
    }
})();