/* Shared navigation, image-viewer accessibility and optional analytics. */
(function () {
  'use strict';
  var measurementId = 'G-L5C6FX3W3S';
  var preferenceKey = 'switch-analytics-choice-v1';
  var analyticsLoaded = false;
  function readChoice() {
    try { return localStorage.getItem(preferenceKey); } catch (_) { return null; }
  }
  function clearAnalyticsCookies() {
    document.cookie.split(';').forEach(function (cookie) {
      var name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) return;
      var expiry = name + '=; Max-Age=0; path=/; SameSite=Lax';
      document.cookie = expiry;
      var parts = location.hostname.split('.');
      for (var i = 0; i < parts.length - 1; i++) {
        document.cookie = expiry + '; domain=' + parts.slice(i).join('.');
      }
    });
  }
  function enableAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window['ga-disable-' + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }
  function initCookies() {
    var choice = readChoice();
    window['ga-disable-' + measurementId] = choice !== 'accepted';
    if (choice === 'accepted') enableAnalytics();
    else clearAnalyticsCookies();
    var banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML = '<p>We use optional Google Analytics cookies to understand how this website is used. You can accept or reject analytics. <a href="/cookie-policy.html">Read our cookie policy</a>.</p><div class="cookie-actions"><button type="button" class="btn btn-dark" data-choice="accepted">Accept analytics</button><button type="button" class="btn btn-dark" data-choice="rejected">Reject analytics</button></div>';
    banner.hidden = choice === 'accepted' || choice === 'rejected';
    document.body.appendChild(banner);
    var settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'cookie-settings';
    settings.textContent = 'Cookie settings';
    (document.querySelector('.footer-bottom') || document.body).appendChild(settings);
    settings.addEventListener('click', function () {
      banner.hidden = false;
      banner.querySelector('button').focus();
    });
    banner.querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = button.dataset.choice;
        try { localStorage.setItem(preferenceKey, next); } catch (_) { /* Applies to this page if storage is blocked. */ }
        banner.hidden = true;
        settings.focus();
        if (next === 'accepted') enableAnalytics();
        else {
          window['ga-disable-' + measurementId] = true;
          clearAnalyticsCookies();
          if (analyticsLoaded) location.reload();
        }
      });
    });
    window.addEventListener('storage', function (event) {
      if (event.key === preferenceKey || event.key === null) location.reload();
    });
  }
  function initMenu() {
    var toggle = document.querySelector('.mobile-menu-toggle');
    var nav = document.getElementById('mobileNav');
    var overlay = document.getElementById('mobileOverlay');
    if (!toggle || !nav || !overlay) return;
    toggle.setAttribute('aria-controls', 'mobileNav');
    function setOpen(open, restoreFocus) {
      toggle.classList.toggle('active', open);
      nav.classList.toggle('active', open);
      overlay.classList.toggle('active', open);
      nav.inert = !open;
      nav.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) nav.querySelector('a').focus();
      else if (restoreFocus) toggle.focus();
    }
    setOpen(false, false);
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('active'), true); });
    overlay.addEventListener('click', function () { setOpen(false, true); });
    document.addEventListener('keydown', function (event) {
      if (!nav.classList.contains('active')) return;
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); }
      if (event.key === 'Tab') {
        var links = Array.from(nav.querySelectorAll('a'));
        var controls = [toggle].concat(links);
        var index = controls.indexOf(document.activeElement);
        event.preventDefault();
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      }
    });
    window.addEventListener('resize', function () {
      if (getComputedStyle(toggle).display === 'none') setOpen(false, false);
    });
  }
  function initLightboxes() {
    document.querySelectorAll('.product-card, .gallery-item').forEach(function (card) {
      // Existing click handlers retain the image selection and captions.
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      var title = card.querySelector('h4');
      var image = card.querySelector('img');
      card.setAttribute('aria-label', 'Enlarge ' + (title ? title.textContent : image ? image.alt : 'image'));
      card.addEventListener('click', function () { card.focus(); }, true);
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
      });
    });
    document.querySelectorAll('.lightbox').forEach(function (box) {
      var trigger = null;
      var wasOpen = false;
      var background = [];
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Enlarged image');
      box.setAttribute('aria-hidden', 'true');
      box.inert = true;
      [['.lightbox-close', 'Close image'], ['.lightbox-prev', 'Previous image'], ['.lightbox-next', 'Next image']].forEach(function (pair) {
        var button = box.querySelector(pair[0]);
        if (button) button.setAttribute('aria-label', pair[1]);
      });
      new MutationObserver(function () {
        var open = box.classList.contains('active');
        if (open === wasOpen) return;
        wasOpen = open;
        box.inert = !open;
        box.setAttribute('aria-hidden', String(!open));
        if (open) {
          trigger = document.activeElement;
          background = Array.from(document.body.children).filter(function (el) { return el !== box && !el.contains(box); }).map(function (el) { return [el, el.inert]; });
          background.forEach(function (entry) { entry[0].inert = true; });
          requestAnimationFrame(function () {
            if (box.classList.contains('active')) box.querySelector('button').focus();
          });
        } else {
          background.forEach(function (entry) { entry[0].inert = entry[1]; });
          if (trigger && trigger.isConnected) trigger.focus();
        }
      }).observe(box, { attributes: true, attributeFilter: ['class'] });
      box.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var buttons = Array.from(box.querySelectorAll('button'));
        var index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      });
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    initCookies();
    initMenu();
    initLightboxes();
  });
})();
