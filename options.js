const API = "https://keep.booq.cc/api/v1";

const $ = (id) => document.getElementById(id);
const status = (text, cls = "") => { $("status").textContent = text; $("status").className = `status ${cls}`; };

async function whoami(apiKey) {
  const res = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 401 || res.status === 403) throw new Error("That key was rejected.");
  if (!res.ok) throw new Error(`Server returned ${res.status}.`);
  return res.json();
}

(async () => {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (apiKey) {
    $("key").value = apiKey;
    try {
      const me = await whoami(apiKey);
      status(`Connected as ${me.name || me.email}.`, "ok");
    } catch (e) {
      status(e.message, "bad");
    }
  }

  const cmds = await chrome.commands.getAll();
  const sc = cmds.find((c) => c.name === "_execute_action")?.shortcut;
  $("shortcut").textContent = sc || "unset";
})();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const apiKey = $("key").value.trim();
  if (!apiKey) {
    await chrome.storage.local.remove("apiKey");
    return status("Key cleared.");
  }
  $("save").disabled = true;
  status("Checking…");
  try {
    const me = await whoami(apiKey);
    await chrome.storage.local.set({ apiKey });
    status(`Connected as ${me.name || me.email}. You're all set.`, "ok");
  } catch (err) {
    status(err.message || "Couldn't reach keep.booq.cc.", "bad");
  } finally {
    $("save").disabled = false;
  }
});
