const languageTabs = Array.from(document.querySelectorAll("[data-language-tab]"));
const languagePanels = Array.from(document.querySelectorAll("[data-language-panel]"));
const platformTabs = Array.from(document.querySelectorAll("[data-platform-tab]"));
const platformPanels = Array.from(document.querySelectorAll("[data-platform-panel]"));
const copyButtons = Array.from(document.querySelectorAll("[data-copy-command]"));

function detectLanguage() {
  const language = (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase();
  return language.startsWith("zh") ? "zh" : "en";
}

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

function selectLanguage(language) {
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";

  for (const tab of languageTabs) {
    const selected = tab.dataset.languageTab === language;
    tab.setAttribute("aria-selected", String(selected));
  }

  for (const panel of languagePanels) {
    panel.hidden = panel.dataset.languagePanel !== language;
  }
}

function selectPlatform(platform) {
  for (const tab of platformTabs) {
    const selected = tab.dataset.platformTab === platform;
    tab.setAttribute("aria-selected", String(selected));
  }

  for (const panel of platformPanels) {
    panel.hidden = panel.dataset.platformPanel !== platform;
  }
}

for (const tab of languageTabs) {
  tab.addEventListener("click", () => {
    selectLanguage(tab.dataset.languageTab);
  });
}

for (const tab of platformTabs) {
  tab.addEventListener("click", () => {
    selectPlatform(tab.dataset.platformTab);
  });
}

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const command = button.closest(".command")?.querySelector("code")?.textContent ?? "";

    try {
      await navigator.clipboard.writeText(command);
      button.textContent = "✓";
    } catch {
      button.textContent = "!";
    }

    window.setTimeout(() => {
      button.textContent = "⧉";
    }, 1200);
  });
}

selectLanguage(detectLanguage());
selectPlatform(detectPlatform());
