// Clan Data page — Roster Explorer scatter + Clan Timeline line chart.
// Vanilla port of the redesign's component logic. No framework.
(function () {
  var SVGNS = "http://www.w3.org/2000/svg";
  function readJSON(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }
  function el(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  // ─────────────────────────── Roster Explorer ───────────────────────────
  var members = readJSON("explorerData");
  if (members && el("scatterDots")) initExplorer(members);

  function initExplorer(ptsAll) {
    var state = { xKey: "collection", yKey: "trophies", sizeKey: "wins", colorMode: "role", roleFilter: "all", hover: -1 };
    var METRICS = ["trophies", "wins", "years", "collection", "donations"];
    var LABEL = { trophies: "Trophies", wins: "Career Wins", years: "Years Played", collection: "Collection", donations: "Donations/wk" };
    var PX0 = 70, PX1 = 724, PY0 = 32, PY1 = 372;

    function metricLabel(k) { return LABEL[k]; }
    function fmtMetric(k, v) { return k === "years" ? v + "y" : fmt(v); }
    function roleColor2(role) { return role === "Co-Leader" || role === "Leader" ? "#f5c84c" : role === "Elder" ? "#d7c8ff" : "#8b5cf6"; }
    function mix(a, b, t) { return Math.round(a + (b - a) * t); }
    function mixColor(t) { return "rgb(" + mix(109, 245, t) + "," + mix(40, 200, t) + "," + mix(217, 76, t) + ")"; }

    function inRole(m) {
      var rf = state.roleFilter;
      if (rf === "all") return true;
      if (rf === "lead") return m.role === "Co-Leader" || m.role === "Leader";
      if (rf === "elder") return m.role === "Elder";
      return m.role === "Member";
    }

    var dotEls = [];

    function render() {
      var pts = ptsAll.filter(inRole);
      var xK = state.xKey, yK = state.yKey, zK = state.sizeKey;
      function ext(k) { var vs = pts.map(function (m) { return m[k]; }); return [Math.min.apply(null, vs), Math.max.apply(null, vs)]; }
      var ex = ext(xK), ey = ext(yK), ez = ext(zK);
      var xmin = ex[0], xmax = ex[1], ymin = ey[0], ymax = ey[1], zmin = ez[0], zmax = ez[1];
      function sx(v) { return PX0 + (xmax === xmin ? 0.5 : (v - xmin) / (xmax - xmin)) * (PX1 - PX0); }
      function sy(v) { return PY1 - (ymax === ymin ? 0.5 : (v - ymin) / (ymax - ymin)) * (PY1 - PY0); }
      function median(k) { var a = pts.map(function (m) { return m[k]; }).sort(function (p, q) { return p - q; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }
      var xMed = median(xK), yMed = median(yK);
      var hov = state.hover;

      // Dots
      var group = el("scatterDots");
      if (dotEls.length !== pts.length) {
        group.textContent = "";
        dotEls = pts.map(function (m, i) {
          var c = document.createElementNS(SVGNS, "circle");
          c.setAttribute("cx", "0"); c.setAttribute("cy", "0");
          c.addEventListener("mouseenter", function () { state.hover = i; render(); });
          c.addEventListener("mouseleave", function () { state.hover = -1; render(); });
          group.appendChild(c);
          return c;
        });
      }
      pts.forEach(function (m, i) {
        var x = sx(m[xK]), y = sy(m[yK]);
        var fz = zmax === zmin ? 0.5 : (m[zK] - zmin) / (zmax - zmin);
        var r = 7 + fz * 15;
        var fy = ymax === ymin ? 0.5 : (m[yK] - ymin) / (ymax - ymin);
        var fill = state.colorMode === "role" ? roleColor2(m.role) : mixColor(fy);
        var on = hov === i;
        dotEls[i].setAttribute("style",
          "transform:translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px);r:" + r.toFixed(1) + "px;fill:" + fill +
          ";fill-opacity:" + (on ? 1 : 0.82) + ";stroke:" + (on ? "#fff" : "rgba(7,6,16,.55)") + ";stroke-width:" + (on ? 3 : 1.5) +
          ";transition:transform .65s cubic-bezier(.34,1.1,.5,1),r .4s ease,fill .35s ease,stroke .15s,fill-opacity .15s;cursor:pointer;");
      });

      // Medians
      var xm = sx(xMed).toFixed(1), ym = sy(yMed).toFixed(1);
      el("xMedLine").setAttribute("x1", xm); el("xMedLine").setAttribute("x2", xm);
      el("yMedLine").setAttribute("y1", ym); el("yMedLine").setAttribute("y2", ym);
      el("xMedLabel").setAttribute("x", xm);

      // Axis labels
      el("xMinL").textContent = fmtMetric(xK, xmin);
      el("xMaxL").textContent = fmtMetric(xK, xmax);
      el("yMinL").textContent = fmtMetric(yK, ymin);
      el("yMaxL").textContent = fmtMetric(yK, ymax);
      el("xAxisLabel").textContent = metricLabel(xK) + " →";
      el("yAxisLabel").textContent = metricLabel(yK) + " →";

      // Detail panel
      var detail = (hov >= 0 && hov < pts.length) ? pts[hov] : pts.reduce(function (b, m) { return (!b || m[yK] > b[yK]) ? m : b; }, null);
      el("shownCount").textContent = pts.length;
      el("detailKicker").textContent = (hov >= 0 && hov < pts.length) ? "Selected member" : ("Leads · " + metricLabel(yK));
      el("detailName").textContent = detail ? detail.name : "—";
      el("detailRole").textContent = detail ? detail.role : "";
      el("detailRole").style.color = detail ? roleColor2(detail.role) : "#c8c1e6";
      var stats = el("detailStats");
      stats.textContent = "";
      if (detail) {
        METRICS.forEach(function (k) {
          var row = document.createElement("div");
          row.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(215,200,255,.08);";
          var l = document.createElement("span");
          l.style.cssText = "font-size:.78rem;color:#c8c1e6;"; l.textContent = metricLabel(k);
          var v = document.createElement("strong");
          v.style.cssText = "font-size:.85rem;color:#f7f4ff;font-variant-numeric:tabular-nums;"; v.textContent = fmtMetric(k, detail[k]);
          row.appendChild(l); row.appendChild(v); stats.appendChild(row);
        });
      }
    }

    // Control wiring
    document.querySelectorAll("[data-explorer-group]").forEach(function (grp) {
      var key = grp.getAttribute("data-explorer-group");
      grp.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-val]");
        if (!btn) return;
        state[key] = btn.getAttribute("data-val");
        grp.querySelectorAll(".pk-pill").forEach(function (p) { p.classList.remove("is-active"); });
        btn.classList.add("is-active");
        dotEls = []; // force rebuild in case filter changed count
        render();
      });
    });

    render();
  }

  // ─────────────────────────── Clan Timeline ───────────────────────────
  var series = readJSON("timelineData");
  if (series && el("timelineLines")) initTimeline(series);

  function initTimeline(S) {
    var TX0 = 60, TX1 = 736, TY0 = 24, TY1 = 250;
    var META = [
      { key: "clanScore", label: "Clan trophies", color: "#f5c84c" },
      { key: "members", label: "Clan members", color: "#57d0e6" },
      { key: "war", label: "War trophies", color: "#c084fc" },
      { key: "donations", label: "Donations/wk", color: "#4ade80" }
    ];
    var on = { clanScore: true, members: true, war: false, donations: false };
    var tPos = S.length - 1;

    function tx(i) { return TX0 + (i / (S.length - 1)) * (TX1 - TX0); }
    function col(k) { var vs = S.map(function (r) { return r[k]; }); return [Math.min.apply(null, vs), Math.max.apply(null, vs)]; }
    function tyOf(k, v) { var c = col(k), a = c[0], b = c[1]; return TY1 - (b === a ? 0.5 : (v - a) / (b - a)) * (TY1 - TY0); }
    function linePoints(k) { return S.map(function (r, i) { return tx(i).toFixed(1) + "," + tyOf(k, r[k]).toFixed(1); }).join(" "); }
    function tFmt(k, v) { return k === "members" ? String(v) : fmt(v); }
    function fmtDate(iso) {
      var m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var p = String(iso).split("-");
      if (p.length !== 3) return iso;
      return m[Number(p[1]) - 1] + " " + Number(p[2]) + ", " + p[0];
    }

    function render() {
      var ti = Math.min(tPos, S.length - 1);
      var active = META.filter(function (m) { return on[m.key]; });
      var headX = tx(ti).toFixed(1);
      el("timelineHead").setAttribute("x1", headX);
      el("timelineHead").setAttribute("x2", headX);
      el("timelineDate").textContent = fmtDate(S[ti].date);

      // Lines + head dots
      var g = el("timelineLines");
      g.textContent = "";
      active.forEach(function (m) {
        var pl = document.createElementNS(SVGNS, "polyline");
        pl.setAttribute("points", linePoints(m.key));
        pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", m.color);
        pl.setAttribute("stroke-width", "3");
        pl.setAttribute("stroke-linecap", "round");
        pl.setAttribute("stroke-linejoin", "round");
        g.appendChild(pl);
        var c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", headX);
        c.setAttribute("cy", tyOf(m.key, S[ti][m.key]).toFixed(1));
        c.setAttribute("r", "5");
        c.setAttribute("fill", m.color);
        c.setAttribute("stroke", "#070610");
        c.setAttribute("stroke-width", "1.5");
        g.appendChild(c);
      });

      // Counters + legend
      var counters = el("timelineCounters"); counters.textContent = "";
      var legend = el("timelineLegend"); legend.textContent = "";
      active.forEach(function (m) {
        var d = document.createElement("div");
        d.style.cssText = "padding:6px 0;";
        d.innerHTML = '<strong style="font-family:\'Supercell Magic\',system-ui,sans-serif;font-size:1.9rem;color:' + m.color + ';display:block;line-height:1;font-variant-numeric:tabular-nums;"></strong><span style="font-size:.66rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#c8c1e6;"></span>';
        d.children[0].textContent = tFmt(m.key, S[ti][m.key]);
        d.children[1].textContent = m.label;
        counters.appendChild(d);

        var s = document.createElement("span");
        s.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
        s.innerHTML = '<i style="width:10px;height:10px;border-radius:50%;background:' + m.color + ';display:inline-block;"></i>';
        s.appendChild(document.createTextNode(" " + m.label));
        legend.appendChild(s);
      });
    }

    // Chips toggle
    el("timelineChips").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-series]");
      if (!btn) return;
      var key = btn.getAttribute("data-series");
      on[key] = !on[key];
      btn.classList.toggle("is-active", on[key]);
      btn.style.borderColor = on[key] ? btn.getAttribute("data-color") : "";
      render();
    });

    // Hover scrub
    var hover = el("timelineHover");
    function move(e) {
      var r = hover.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var f = (cx - r.left) / r.width;
      var idx = Math.max(0, Math.min(S.length - 1, Math.round(f * (S.length - 1))));
      if (idx !== tPos) { tPos = idx; render(); }
    }
    hover.addEventListener("mousemove", move);
    hover.addEventListener("touchstart", move);
    hover.addEventListener("touchmove", move);
    hover.addEventListener("mouseleave", function () { tPos = S.length - 1; render(); });

    render();
  }
})();
