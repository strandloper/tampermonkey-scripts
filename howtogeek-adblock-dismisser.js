// ==UserScript==
// @name         HowToGeek AdBlock Message Dismisser
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically dismisses the adblock detection message on HowToGeek
// @author       You
// @match        https://www.howtogeek.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function showToast() {
        const toast = document.createElement('div');
        toast.textContent = '🛡️ Ad block dialog dismissed';
        Object.assign(toast.style, {
            position:      'fixed',
            top:           '16px',
            right:         '16px',
            zIndex:        '2147483647',
            background:    '#333',
            color:         '#fff',
            padding:       '10px 16px',
            borderRadius:  '6px',
            fontSize:      '14px',
            fontFamily:    'sans-serif',
            boxShadow:     '0 2px 8px rgba(0,0,0,0.4)',
            opacity:       '0',
            transition:    'opacity 0.3s ease',
            pointerEvents: 'none',
        });

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => { toast.style.opacity = '1'; });
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    function dismissMessage() {
        const closeBtn = document.querySelector('#adblock-message .adblock-close');
        if (closeBtn) {
            closeBtn.click();
            showToast();
            return true;
        }
        return false;
    }

    // If it's already in the DOM on load, dismiss immediately
    if (!dismissMessage()) {
        // Otherwise watch for it, but give up after 15 seconds
        const observer = new MutationObserver(() => {
            if (dismissMessage()) {
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => observer.disconnect(), 15000);
    }

})();
