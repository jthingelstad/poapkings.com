// Members page — copy-to-clipboard for the recruiting Subject/Body.
document.addEventListener("click", function (e) {
  var btn = e.target.closest(".promoCopy");
  if (!btn) return;
  var target = document.getElementById(btn.getAttribute("data-copy-target"));
  if (!target) return;
  navigator.clipboard.writeText(target.value.trim()).then(function () {
    btn.textContent = "COPIED ✓";
    setTimeout(function () { btn.textContent = "COPY"; }, 1500);
  });
});
