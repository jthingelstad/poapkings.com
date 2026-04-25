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

  /* ── Star rank modal: compute current arena from hits + thresholds ── */
  // Zones (stateless, derived from count alone):
  //   close       — count is within 10% of next.threshold (anticipation on next arena art)
  //   just-passed — count < current.threshold + 10% of bracket (celebration on current arena art)
  //   bracket = next.threshold − current.threshold; falls out of zone naturally as count moves.
  function readRanks(){
    var node = document.getElementById('starRanksData');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }
  function rankFor(ranks, count){
    var cur = ranks[0], next = null;
    for (var i = 0; i < ranks.length; i++){
      if (count >= ranks[i].threshold){ cur = ranks[i]; next = ranks[i + 1] || null; }
      else break;
    }
    return { current: cur, next: next };
  }
  function zoneFor(count, current, next){
    if (next){
      var bracket = next.threshold - current.threshold;
      if (count >= next.threshold - bracket * 0.1) return 'close';
      if (count < current.threshold + bracket * 0.1 && current.threshold > 0) return 'just-passed';
    } else if (current.threshold > 0){
      // Top rank: linger on the celebration since there's no next bracket.
      return 'just-passed';
    }
    return 'default';
  }
  function placeArt(container, rank, zone){
    container.innerHTML = '';
    container.dataset.zone = zone;
    if (rank.image){
      var img = document.createElement('img');
      img.className = 'rank-card__img';
      img.src = rank.image;
      img.alt = rank.name + ' arena';
      img.loading = 'lazy';
      container.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'rank-card__placeholder';
      ph.innerHTML = '<span>' + rank.n + '</span>';
      container.appendChild(ph);
    }
    container.classList.toggle('is-close', zone === 'close');
    container.classList.toggle('is-just-passed', zone === 'just-passed');
  }
  function renderStarModal(count){
    var modal = document.getElementById('starModal');
    var ranks = readRanks();
    if (!modal || !ranks || !ranks.length) return;
    var info = rankFor(ranks, count);
    var current = info.current, next = info.next;
    var zone = zoneFor(count, current, next);

    var nameEl = modal.querySelector('[data-rank-name]');
    var countEl = modal.querySelector('[data-rank-count]');
    var fillEl = modal.querySelector('[data-rank-fill]');
    var labelEl = modal.querySelector('[data-rank-label]');
    var artEl = modal.querySelector('[data-rank-art]');

    if (nameEl) nameEl.textContent = current.name;
    if (countEl) countEl.textContent = fmt(count);

    if (fillEl && labelEl){
      if (next){
        var span = next.threshold - current.threshold;
        var into = Math.max(0, count - current.threshold);
        var pct = Math.min(100, Math.round((into / span) * 100));
        fillEl.style.width = pct + '%';
        var togo = Math.max(0, next.threshold - count);
        labelEl.textContent = fmt(togo) + ' to ' + next.name;
      } else {
        fillEl.style.width = '100%';
        labelEl.textContent = 'Top rank reached.';
      }
    }
    if (artEl) placeArt(artEl, current, zone);
  }
  function initStarModal(){
    var modal = document.getElementById('starModal');
    var hitsEl = document.querySelector('.starcount .tinylytics_hits');
    if (!modal || !hitsEl) return;
    var lastCount = 0;
    function tryRender(){
      var raw = (hitsEl.textContent || '').trim().replace(/[^0-9]/g, '');
      var n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0){
        lastCount = n;
        renderStarModal(n);
        return true;
      }
      return false;
    }
    // Initial paint with whatever we have (might be the placeholder ★ → 0).
    renderStarModal(0);
    // Poll for the Tinylytics value, same cadence as the star counter.
    var tries = 0;
    var poll = setInterval(function(){
      tries++;
      if (tryRender() || tries > 40) clearInterval(poll);
    }, 200);
    // Re-render on every modal open in case hits arrived after first paint.
    modal.addEventListener('modal:open', function(){
      if (!tryRender() && lastCount) renderStarModal(lastCount);
    });
  }

  function boot(){ initCountUps(); initStarCounter(); initStarModal(); }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.POAPGamify = { countUp: countUp };
})();
