import { animate } from 'motion/mini';

/* POAP KINGS gamify — Motion for readable DOM feedback, PixiJS for the
   progressive-enhancement particle layer. Tinylytics still owns the count. */
(function(){
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pixiModule;

  function fmt(n){ return n.toLocaleString('en-US') }

  /* ── Star counter: Motion choreography + a lazy PixiJS particle layer ── */
  function spawnFallbackSparks(badge, count){
    const rect = badge.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const N = count || 8;
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

  function loadPixi(){
    if (!pixiModule) pixiModule = import('pixi.js');
    return pixiModule;
  }

  async function spawnPixiBurst(badge, rankUp){
    if (reduce || !badge || !badge.isConnected) return false;
    let app;
    let host;
    let destroyed = false;
    try {
      const pixi = await loadPixi();
      if (!badge.isConnected) return false;

      host = document.createElement('div');
      host.className = 'star-fx-layer';
      host.setAttribute('aria-hidden', 'true');
      document.body.appendChild(host);

      app = new pixi.Application();
      await app.init({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2)
      });
      if (!badge.isConnected){
        app.destroy(true, true);
        host.remove();
        return false;
      }

      app.canvas.className = 'star-fx-layer__canvas';
      app.canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(app.canvas);

      const rect = badge.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      const count = rankUp ? 48 : 14;
      const colors = rankUp
        ? [0xf5c84c, 0xfff3c2, 0xffffff, 0x8b5cf6, 0xd7c8ff]
        : [0xf5c84c, 0xfff3c2, 0x8b5cf6, 0xd7c8ff];
      const particles = [];

      for (let i = 0; i < count; i++){
        const radius = (rankUp ? 4 : 3) + Math.random() * (rankUp ? 6 : 4);
        const graphic = new pixi.Graphics();
        if (i % 4 === 0){
          graphic.circle(0, 0, radius * .58).fill({ color: colors[i % colors.length], alpha: .95 });
        } else {
          graphic.star(0, 0, 5, radius, radius * .44).fill({ color: colors[i % colors.length], alpha: .98 });
        }
        graphic.blendMode = 'add';
        graphic.position.set(originX + (Math.random() - .5) * 16, originY + (Math.random() - .5) * 10);
        app.stage.addChild(graphic);

        const angle = (Math.PI * 2 * i) / count + (Math.random() - .5) * .5;
        const speed = (rankUp ? 170 : 115) + Math.random() * (rankUp ? 260 : 155);
        const maxLifeMs = (rankUp ? 780 : 620) + Math.random() * (rankUp ? 520 : 320);
        particles.push({
          graphic: graphic,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed - (rankUp ? 105 : 70),
          gravity: rankUp ? 390 : 430,
          spin: (Math.random() - .5) * 12,
          lifeMs: maxLifeMs,
          maxLifeMs: maxLifeMs
        });
      }

      function destroy(){
        if (destroyed) return;
        destroyed = true;
        if (app) app.destroy(true, true);
        if (host) host.remove();
      }

      app.ticker.add(function(ticker){
        const seconds = ticker.deltaMS / 1000;
        for (let i = particles.length - 1; i >= 0; i--){
          const particle = particles[i];
          particle.lifeMs -= ticker.deltaMS;
          if (particle.lifeMs <= 0){
            app.stage.removeChild(particle.graphic);
            particle.graphic.destroy();
            particles.splice(i, 1);
            continue;
          }
          particle.velocityY += particle.gravity * seconds;
          particle.graphic.x += particle.velocityX * seconds;
          particle.graphic.y += particle.velocityY * seconds;
          particle.graphic.rotation += particle.spin * seconds;
          const remaining = particle.lifeMs / particle.maxLifeMs;
          particle.graphic.alpha = Math.min(1, remaining * 2.2);
          particle.graphic.scale.set(.45 + remaining * .75);
        }
        if (!particles.length) destroy();
      });
      setTimeout(destroy, 1800);
      return true;
    } catch (error){
      if (app && !destroyed) app.destroy(true, true);
      if (host) host.remove();
      return false;
    }
  }

  function isArenaRankUp(count){
    const ranks = readRanks();
    return !!(ranks && ranks.some(function(rank){
      return rank.threshold > 0 && rank.threshold === count;
    }));
  }

  function playParticleBurst(badge, rankUp){
    if (reduce) return;
    spawnPixiBurst(badge, rankUp).then(function(rendered){
      if (!rendered) spawnFallbackSparks(badge, rankUp ? 16 : 8);
    });
  }

  function playStarCelebration(badge, hitsEl, rankUp){
    if (reduce) return;
    const icon = badge.querySelector('.starcount__icon');
    const flash = document.createElement('span');
    flash.className = 'starcount__flash';
    flash.setAttribute('aria-hidden', 'true');
    badge.appendChild(flash);

    const plus = document.createElement('span');
    plus.className = 'starcount__plus';
    plus.textContent = rankUp ? 'RANK UP!' : '+1';
    plus.setAttribute('aria-hidden', 'true');
    badge.appendChild(plus);

    const controls = [
      animate(badge, {
        transform: ['scale(1)', 'scale(.88, 1.06)', 'scale(1.35, .85)', 'scale(.94, 1.08)', 'scale(1.06, .98)', 'scale(1)']
      }, { duration: .9, times: [0, .12, .28, .48, .72, 1], ease: 'ease-out' }),
      animate(hitsEl, {
        transform: ['translateY(0)', 'translateY(-4px)', 'translateY(0)'],
        color: ['#FFE9B3', '#FFFFFF', '#FFE9B3'],
        textShadow: ['0 0 0 rgba(255,240,180,0)', '0 0 12px rgba(255,240,180,.95)', '0 0 0 rgba(255,240,180,0)']
      }, { duration: .52, times: [0, .38, 1], ease: 'ease-out', delay: .16 }),
      animate(flash, {
        opacity: [0, 1, 0],
        transform: ['scale(.55)', 'scale(1.15)', 'scale(1.75)']
      }, { duration: .65, times: [0, .25, 1], ease: 'ease-out', delay: .12 }),
      animate(plus, {
        opacity: [0, 1, 1, 0],
        transform: [
          'translate(-50%, 6px) scale(.4) rotate(-8deg)',
          'translate(-50%, -10px) scale(1.35) rotate(6deg)',
          'translate(-50%, -24px) scale(1.08) rotate(-3deg)',
          'translate(-50%, -60px) scale(1) rotate(0deg)'
        ]
      }, { duration: 1, times: [0, .18, .42, 1], ease: 'ease-out', delay: .12 })
    ];
    if (icon){
      controls.push(animate(icon, {
        transform: ['scale(1) rotate(0deg)', 'scale(1.65) rotate(180deg)', 'scale(.9) rotate(360deg)', 'scale(1) rotate(360deg)'],
        filter: [
          'drop-shadow(0 1px 2px rgba(0,0,0,.45))',
          'drop-shadow(0 0 14px rgba(255,240,180,1)) brightness(1.4)',
          'drop-shadow(0 0 5px rgba(245,200,76,.7))',
          'drop-shadow(0 1px 2px rgba(0,0,0,.45))'
        ]
      }, { duration: .9, times: [0, .28, .58, 1], ease: 'ease-out', delay: .08 }));
    }

    playParticleBurst(badge, rankUp);

    setTimeout(function(){
      controls.forEach(function(control){
        if (control && typeof control.cancel === 'function') control.cancel();
      });
      flash.remove();
      plus.remove();
    }, 1250);
  }

  function initStarCounter(){
    const hitsEl = document.querySelector('.starcount .tinylytics_hits');
    const badge = document.querySelector('.starcount');
    if (!hitsEl || !badge) return;
    if (badge.dataset.starWired) return;
    badge.dataset.starWired = '1';
    // Opening the rank card gets a small tactile burst without implying that
    // the click itself added another visit/star.
    badge.addEventListener('click', function(){ playParticleBurst(badge, false); });

    let tries = 0;
    const poll = setInterval(function(){
      tries++;
      const raw = (hitsEl.textContent || '').trim().replace(/[^0-9]/g, '');
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0){
        clearInterval(poll);
        if (reduce) return;
        // Number has landed — fire the celebration once for this visit.
        setTimeout(function(){
          playStarCelebration(badge, hitsEl, isArenaRankUp(n));
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
    container.textContent = '';
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
      var rankNumber = document.createElement('span');
      rankNumber.textContent = String(rank.n);
      ph.appendChild(rankNumber);
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

  /* ── Testimonial carousel: crossfade the member quotes on the home page ── */
  function initTestimonialCarousel(){
    const root = document.querySelector('[data-testimonial-carousel]');
    if (!root) return;
    const slides = Array.from(root.querySelectorAll('[data-testimonial-slide]'));
    const dots = Array.from(root.querySelectorAll('[data-testimonial-dot]'));
    const prevBtn = root.querySelector('[data-testimonial-prev]');
    const nextBtn = root.querySelector('[data-testimonial-next]');
    if (slides.length < 2) return;

    const INTERVAL = 8000;
    let index = 0;
    let timer = null;
    let hovered = false;
    let onScreen = true;

    root.classList.add('pk-testimonial--live');

    function show(next){
      index = (next + slides.length) % slides.length;
      slides.forEach(function(slide, i){
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function(dot, i){
        const active = i === index;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function stop(){ if (timer){ clearInterval(timer); timer = null } }

    function start(){
      // Reduced motion: no auto-rotation. The dots still reach every quote.
      if (reduce || timer) return;
      if (hovered || !onScreen || document.hidden) return;
      timer = setInterval(function(){ show(index + 1) }, INTERVAL);
    }

    function restart(){ stop(); start() }

    function goTo(next){ show(next); restart() }

    dots.forEach(function(dot, i){
      dot.addEventListener('click', function(){ goTo(i) });
    });
    if (prevBtn) prevBtn.addEventListener('click', function(){ goTo(index - 1) });
    if (nextBtn) nextBtn.addEventListener('click', function(){ goTo(index + 1) });

    // Arrow keys work once anything in the carousel has focus.
    root.addEventListener('keydown', function(e){
      if (e.key === 'ArrowLeft'){ e.preventDefault(); goTo(index - 1) }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); goTo(index + 1) }
    });

    root.addEventListener('pointerenter', function(){ hovered = true; stop() });
    root.addEventListener('pointerleave', function(){ hovered = false; start() });
    root.addEventListener('focusin', function(){ hovered = true; stop() });
    root.addEventListener('focusout', function(){
      if (!root.contains(document.activeElement)){ hovered = false; start() }
    });

    document.addEventListener('visibilitychange', function(){
      if (document.hidden) stop(); else start();
    });

    if ('IntersectionObserver' in window){
      const io = new IntersectionObserver(function(entries){
        onScreen = entries[0].isIntersecting;
        if (onScreen) start(); else stop();
      }, { threshold: .2 });
      io.observe(root);
    }

    show(0);
    start();
  }

  function boot(){ initStarCounter(); initStarModal(); initTestimonialCarousel(); }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.POAPGamify = {
    celebrateStar: function(rankUp){
      const badge = document.querySelector('.starcount');
      const hitsEl = badge && badge.querySelector('.tinylytics_hits');
      if (badge && hitsEl) playStarCelebration(badge, hitsEl, !!rankUp);
    }
  };
})();
