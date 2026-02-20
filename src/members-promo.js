document.addEventListener("click", function (e) {
  var btn = e.target.closest(".promoChannelCopy");
  if (!btn) return;
  var textarea = btn.closest(".promoChannel").querySelector("textarea");
  navigator.clipboard.writeText(textarea.value.trim()).then(function () {
    btn.textContent = "COPIED";
    setTimeout(function () {
      btn.textContent = "COPY";
    }, 1500);
  });
});
var sms = document.querySelector(".promoSms");
if (sms) {
  sms.addEventListener("click", function (e) {
    e.preventDefault();
    var body = sms
      .closest(".promoChannel")
      .querySelector("textarea")
      .value.trim();
    window.location.href = "sms:?&body=" + encodeURIComponent(body);
  });
}
var mailto = document.querySelector(".promoMailto");
if (mailto) {
  mailto.addEventListener("click", function (e) {
    e.preventDefault();
    var channel = mailto.closest(".promoChannel");
    var subject = channel.querySelector(".promoFieldInput").value;
    var body = channel.querySelector("textarea").value.trim();
    window.location.href =
      "mailto:?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
  });
}
