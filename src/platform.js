// Marks the page with the system it runs on, so each page's styles can follow that system's own look
// (the ".mac" rules in glass.css, panel.html and settings.html). Loaded in the head, before anything is drawn.
(function () { if (/^Mac/.test(navigator.platform || '')) document.documentElement.classList.add('mac'); })();
