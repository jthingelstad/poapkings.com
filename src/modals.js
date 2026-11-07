(function(){
  var modals = {
    join: document.getElementById('joinModal'),
    star: document.getElementById('starModal')
  };
  var current = null;
  var lastFocus = null;
  function open(name){
    var modal = modals[name];
    if (!modal) return;
    current = modal;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(function(){ modal.classList.add('is-open'); });
    modal.dispatchEvent(new CustomEvent('modal:open'));
    var primary = modal.querySelector('.btn--gold, .btn--purple, .modal__close');
    if (primary) primary.focus();
  }
  function close(){
    if (!current) return;
    var modal = current;
    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    setTimeout(function(){ modal.hidden = true; }, 200);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    current = null;
  }
  document.addEventListener('click', function(e){
    var opener = e.target.closest('[data-modal-open]');
    if (opener){ e.preventDefault(); open(opener.getAttribute('data-modal-open')); return; }
    if (e.target.closest('[data-modal-close]')) close();
  });
  document.addEventListener('keydown', function(e){
    if (!current) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.from(current.querySelectorAll(
      '.modal__panel a[href], .modal__panel button:not([disabled]), .modal__panel input:not([disabled]), .modal__panel select:not([disabled]), .modal__panel textarea:not([disabled]), .modal__panel [tabindex]:not([tabindex="-1"])'
    )).filter(function(el){ return el.offsetParent !== null; });
    if (!focusable.length) { e.preventDefault(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
})();

// Mobile hamburger dropdown
(function(){
  var toggle = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('navMenu');
  if (!toggle || !nav) return;
  function setOpen(open){
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
  }
  toggle.addEventListener('click', function(e){
    e.stopPropagation();
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function(e){
    if (e.target.closest('[data-nav-link]')) setOpen(false);
  });
  document.addEventListener('click', function(e){
    if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') setOpen(false);
  });
})();
