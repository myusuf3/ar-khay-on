// Hidden page whose only job is to report Chrome's light/dark mode to the
// service worker, which can't use matchMedia itself.
const mq = matchMedia("(prefers-color-scheme: dark)");
const report = () => chrome.runtime.sendMessage({ kk: "scheme", dark: mq.matches });
mq.addEventListener("change", report);
report();
