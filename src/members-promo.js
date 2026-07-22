// Members page — copy-to-clipboard for the recruiting Subject/Body,
// and a prefilled mailto draft for Elixir update requests (no backend).
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
    var mailLink = document.querySelector("[data-email-mailto]");
    var playerField = emailForm.querySelector("[name='player']");
    var emailField = emailForm.querySelector("[name='email']");
    if (!mailLink || !playerField || !emailField) return;

    var player = playerField.value.trim();
    var email = emailField.value.trim();
    var recipient = emailForm.getAttribute("data-email-to") || "Jamie@thingelstad.com";
    var subject = "POAP KINGS Elixir updates — " + player;
    var body = [
      "Hi Jamie,",
      "",
      "Please add me to the POAP KINGS Elixir email updates.",
      "",
      "Clash Royale player: " + player,
      "Email: " + email,
      "",
      "Thanks!"
    ].join("\n");

    mailLink.href = "mailto:" + recipient
      + "?subject=" + encodeURIComponent(subject)
      + "&body=" + encodeURIComponent(body);
    if (done) done.hidden = false;
    mailLink.focus({ preventScroll: true });
  });
}
