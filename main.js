/* CVVD Lab — page behaviour
   The background lives in waves.js. This file is header state, navigation,
   and scroll reveal. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ header */

  var header = document.querySelector('header');

  if (header) {
    var scrolled = false;
    window.addEventListener('scroll', function () {
      var next = window.scrollY > 40;
      if (next === scrolled) return;   // don't touch the class list every frame
      scrolled = next;
      header.classList.toggle('is-scrolled', next);
    }, { passive: true });
  }

  /* -------------------------------------------------------------- navigation */

  var navToggle = document.querySelector('.nav-toggle');

  if (navToggle && header) {
    var closeNav = function () {
      header.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
    };

    navToggle.addEventListener('click', function () {
      var open = !header.classList.contains('nav-open');
      header.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    // Tapping a destination or pressing Escape puts the menu away.
    document.querySelectorAll('.nav-links a').forEach(function (link) {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) {
        closeNav();
        navToggle.focus();
      }
    });
  }

  /* Mark the current page in the nav, so the header always answers
     "where am I" without every page hand-setting a class. */
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a:not(.btn)').forEach(function (link) {
    var target = (link.getAttribute('href') || '').split('#')[0];
    if (target && target === here) {
      link.setAttribute('aria-current', 'page');
    }
  });

  /* ------------------------------------------------------ publication filter
     Filtering is plain show/hide on a pre-rendered list, so the full record is
     in the HTML for crawlers and for anyone without JavaScript. */

  var filterBar = document.querySelector('.pub-filter');

  if (filterBar) {
    var pubs = Array.prototype.slice.call(document.querySelectorAll('.pub-item'));
    var readout = document.querySelector('.pub-count');

    var applyFilter = function (topic) {
      var shown = 0;
      pubs.forEach(function (item) {
        var match = topic === 'all' || item.getAttribute('data-topic') === topic;
        item.hidden = !match;
        if (match) shown++;
      });
      if (readout) {
        readout.textContent = 'Showing ' + shown + ' of ' + pubs.length + ' publications';
      }
    };

    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      filterBar.querySelectorAll('.chip').forEach(function (c) {
        var on = c === btn;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', String(on));
      });
      applyFilter(btn.getAttribute('data-filter'));
    });

    applyFilter('all');
  }

  /* -------------------------------------------------------- inspection viewer
     Cycles the hero demos. Clicking a tab is an explicit choice, so it stops
     the carousel for good rather than fighting the user every few seconds. */

  (function () {
    var scope = document.querySelector('.scope');
    if (!scope) return;

    var demos = [].slice.call(scope.querySelectorAll('.dm'));
    var tabs = [].slice.call(scope.querySelectorAll('.scope-tab'));
    var reads = {};
    scope.querySelectorAll('[data-read]').forEach(function (el) {
      reads[el.getAttribute('data-read')] = el;
    });
    if (demos.length < 2) return;

    var at = 0;
    var timer = 0;

    function show(i) {
      at = (i + demos.length) % demos.length;
      demos.forEach(function (d, n) { d.classList.toggle('is-on', n === at); });
      tabs.forEach(function (t, n) {
        t.classList.toggle('is-on', n === at);
        t.setAttribute('aria-pressed', String(n === at));
      });
      var d = demos[at];
      Object.keys(reads).forEach(function (k) {
        var v = d.getAttribute('data-' + k);
        if (v !== null) reads[k].textContent = v;
      });
    }

    function stop() {
      clearInterval(timer);
      timer = 0;
    }

    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () {
        stop();
        show(n);
      });
    });

    if (reduceMotion) return;

    // Match the scan-sweep period so a demo swaps as a sweep completes.
    timer = setInterval(function () { show(at + 1); }, 4500);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stop();
      } else if (!timer) {
        timer = setInterval(function () { show(at + 1); }, 4500);
      }
    });
  })();

  /* -------------------------------------------------------------- flip cards
     Hover covers mouse and :focus-visible covers keyboard, both in CSS. This
     only exists for touch, which has neither. */

  document.querySelectorAll('.flip-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var open = card.getAttribute('aria-expanded') !== 'true';
      card.setAttribute('aria-expanded', String(open));
    });
  });

  /* ----------------------------------------------------------- scroll reveal
     Reveal once and stop observing. Re-animating on every direction change is
     the thing that makes scroll-reveal feel cheap. */

  var revealables = document.querySelectorAll('.reveal');

  if (!revealables.length) return;

  var showAll = function () {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  };

  if (reduceMotion || !('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  revealables.forEach(function (el) { io.observe(el); });

  /* Safety net: hiding content behind an observer means any failure to fire
     leaves the page blank. If anything is still hidden after 3s, show it. */
  setTimeout(showAll, 3000);
})();
