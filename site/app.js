const tabs = Array.from(document.querySelectorAll("[data-platform-tab]"));
const panels = Array.from(document.querySelectorAll("[data-platform-panel]"));
const copyButton = document.querySelector("[data-copy-command]");
const installCommand = document.querySelector("#install-command")?.textContent ?? "";

function detectPlatform() {
  const value = [
    navigator.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (value.includes("win")) return "windows";
  return "macos";
}

function selectPlatform(platform) {
  for (const tab of tabs) {
    const selected = tab.dataset.platformTab === platform;
    tab.setAttribute("aria-selected", String(selected));
  }

  for (const panel of panels) {
    panel.hidden = panel.dataset.platformPanel !== platform;
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    selectPlatform(tab.dataset.platformTab);
  });
}

selectPlatform(detectPlatform());

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(installCommand);
    copyButton.textContent = "✓";
  } catch {
    copyButton.textContent = "!";
  }

  window.setTimeout(() => {
    copyButton.textContent = "⧉";
  }, 1200);
});
