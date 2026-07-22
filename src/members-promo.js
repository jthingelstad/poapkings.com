// Members page — copy-to-clipboard for the recruiting Subject/Body,
// and the Elixir email-capture form (progressive enhancement, no backend).
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

var emailForm = document.querySelector("[data-email-form]");
if (emailForm) {
  emailForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var done = document.querySelector("[data-email-done]");
    if (done) done.hidden = false;
    emailForm.reset();
  });
}
