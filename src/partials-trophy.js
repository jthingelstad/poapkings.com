/* Trophy SVG injection — runs once on load and on DOM mutations.
   Hydrates every .medal__ring with an inline gold cup whose colors come
   from CSS custom properties so .medal--silver / --bronze / --teal cascade. */
(function(){
  const SVG_MARKUP = '' +
    '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="trophy-svg" preserveAspectRatio="xMidYMid meet">' +
      '<defs>' +
        '<linearGradient id="cupBody" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0"   stop-color="var(--t-hi, #FFE28A)"/>' +
          '<stop offset=".45" stop-color="var(--t-bright, #F5C84C)"/>' +
          '<stop offset=".75" stop-color="var(--t-mid, #C98C10)"/>' +
          '<stop offset="1"   stop-color="var(--t-edge, #8a5a0a)"/>' +
        '</linearGradient>' +
        '<linearGradient id="cupRim" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="var(--t-hi, #FFE28A)"/>' +
          '<stop offset="1" stop-color="var(--t-mid, #C98C10)"/>' +
        '</linearGradient>' +
        '<radialGradient id="cupHl" cx=".35" cy=".3" r=".6">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity=".7"/>' +
          '<stop offset=".5" stop-color="#ffffff" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<rect x="46" y="188" width="108" height="18" rx="3" fill="url(#cupBody)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.4"/>' +
      '<path d="M66 162 L134 162 L144 188 L56 188 Z" fill="url(#cupBody)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M40 74 C16 86 16 120 46 128 L56 128 L56 116 L50 116 C34 116 34 92 56 88 Z" fill="url(#cupBody)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M160 74 C184 86 184 120 154 128 L144 128 L144 116 L150 116 C166 116 166 92 144 88 Z" fill="url(#cupBody)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M50 48 L150 48 L142 140 C140 154 128 162 100 162 C72 162 60 154 58 140 Z" fill="url(#cupBody)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<rect x="44" y="40" width="112" height="12" rx="3" fill="url(#cupRim)" stroke="var(--t-edge, #8a5a0a)" stroke-width="1.4"/>' +
      '<path d="M60 54 L140 54 L134 136 C132 146 124 152 100 152 C76 152 68 146 66 136 Z" fill="none" stroke="var(--t-inner, #6d3f08)" stroke-width="1.2" stroke-opacity=".55"/>' +
      '<path d="M64 58 C70 54 82 52 92 52 L92 138 C78 134 68 126 66 108 Z" fill="url(#cupHl)"/>' +
      '<path d="M100 74 L108 92 L128 95 L113 109 L117 128 L100 119 L83 128 L87 109 L72 95 L92 92 Z" fill="var(--t-star, #2a0b5e)" opacity=".32"/>' +
    '</svg>';

  function inject(el){
    if (el.__trophyInjected) return;
    el.__trophyInjected = true;
    el.innerHTML = SVG_MARKUP;
    const medal = el.closest('.medal');
    if (medal && !medal.querySelector('.medal__gloss')){
      const g = document.createElement('span');
      g.className = 'medal__gloss';
      medal.appendChild(g);
    }
  }
  function run(){
    document.querySelectorAll('.medal__ring').forEach(inject);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  if (typeof MutationObserver !== 'undefined'){
    new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
