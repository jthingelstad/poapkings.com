/* POAP KINGS gamify — count-ups only.
   Star Level counter in the nav is rendered by Tinylytics' tinylytics_hits hook;
   this script just animates [data-count-up] elements when they enter view. */
(function(){
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmt(n){ return n.toLocaleString('en-US') }

  function countUp(el, target, duration){
    if (duration == null) duration = 1200;
    if (reduce){ el.textContent = fmt(target); return; }
    const start = Date.now();
    const from = 0;
    const iv = setInterval(function(){
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (target - from) * eased);
      el.textContent = fmt(val);
      if (t >= 1){ clearInterval(iv); el.textContent = fmt(target); }
    }, 16);
  }

  function initCountUps(){
    const els = document.querySelectorAll('[data-count-up]');
    function trigger(el){
      if (el.dataset.countUpDone) return;
      el.dataset.countUpDone = '1';
      const target = Number(el.dataset.countUp || 0);
      el.textContent = '0';
      countUp(el, target, Number(el.dataset.countUpMs || 1200));
    }
    // Safety fallback: any element still un-triggered after 3s gets the final value
    els.forEach(function(el){
      const target = Number(el.dataset.countUp || 0);
      setTimeout(function(){
        if (!el.dataset.countUpDone){
          el.dataset.countUpDone = '1';
          el.textContent = fmt(target);
        }
      }, 3000);
    });
    if (!('IntersectionObserver' in window)){
      els.forEach(trigger);
      return;
    }
    const obs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting){
          trigger(e.target);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: .2 });
    els.forEach(function(el){
      const r = el.getBoundingClientRect();
      const inView = r.top < (window.innerHeight || 0) && r.bottom > 0;
      if (inView) trigger(el);
      else obs.observe(el);
    });
  }

  /* ── Star counter: decrement by one, then tick up with a full game-feel pop ── */
  function spawnSparks(badge){
    const rect = badge.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const N = 8;
    for (let i = 0; i < N; i++){
      const s = document.createElement('span');
      s.className = 'star-spark';
      s.textContent = '★';
      const angle = (Math.PI * 2 * i) / N + Math.random() * .4;
      const dist = 42 + Math.random() * 24;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', dx + 'px');
      s.style.setProperty('--dy', dy + 'px');
      s.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      document.body.appendChild(s);
      setTimeout(function(){ if (s.parentNode) s.parentNode.removeChild(s); }, 800);
    }
  }

  function initStarCounter(){
    const hitsEl = document.querySelector('.starcount .tinylytics_hits');
    const badge = document.querySelector('.starcount');
    if (!hitsEl || !badge) return;
    if (badge.dataset.starWired) return;
    badge.dataset.starWired = '1';

    let tries = 0;
    const poll = setInterval(function(){
      tries++;
      const raw = (hitsEl.textContent || '').trim().replace(/[^0-9]/g, '');
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0){
        clearInterval(poll);
        if (reduce) return;
        // Number has landed — fire the pop once as a celebration of the visit.
        badge.classList.add('is-anticipating');
        setTimeout(function(){
          badge.classList.remove('is-anticipating');
          badge.classList.add('is-popping');
          hitsEl.classList.add('is-ticking');
          spawnSparks(badge);
          const plus = document.createElement('span');
          plus.className = 'starcount__plus';
          plus.textContent = '+1';
          badge.appendChild(plus);
          setTimeout(function(){
            badge.classList.remove('is-popping');
            hitsEl.classList.remove('is-ticking');
            if (plus.parentNode) plus.parentNode.removeChild(plus);
          }, 1000);
        }, 180);
      } else if (tries > 40){
        clearInterval(poll); // give up after ~8s if Tinylytics never fills in
      }
    }, 200);
  }

  function boot(){ initCountUps(); initStarCounter(); }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.POAPGamify = { countUp: countUp };
})();
