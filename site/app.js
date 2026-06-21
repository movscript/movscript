const languageTabs = Array.from(document.querySelectorAll("[data-language-tab]"));
const languagePanels = Array.from(document.querySelectorAll("[data-language-panel]"));
const platformTabs = Array.from(document.querySelectorAll("[data-platform-tab]"));
const platformPanels = Array.from(document.querySelectorAll("[data-platform-panel]"));
const copyButtons = Array.from(document.querySelectorAll("[data-copy-command]"));
const releaseStatuses = Array.from(document.querySelectorAll("[data-release-status]"));
const releaseAssetLinks = Array.from(document.querySelectorAll("[data-release-asset]"));

const releaseApiUrl = "https://api.github.com/repos/movscript/movscript/releases/latest";
const releasesUrl = "https://github.com/movscript/movscript/releases/latest";
const releaseAssetMatchers = {
  macos: (name) => name.startsWith("movscript-desktop-macos-arm64-") && name.endsWith(".dmg"),
  windows: (name) => name.startsWith("movscript-desktop-windows-x64-") && name.endsWith(".exe"),
};

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

function formatAssetSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const precision = unit === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unit]}`;
}

function setReleaseStatus(key, values = {}) {
  for (const status of releaseStatuses) {
    let text = status.dataset[key] ?? "";
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, value);
    }
    status.textContent = text;
  }
}

function findReleaseAsset(release, platform) {
  const matcher = releaseAssetMatchers[platform];
  if (!matcher) return null;
  return release.assets?.find((asset) => matcher(asset.name)) ?? null;
}

function updateReleaseAssetLinks(release) {
  for (const link of releaseAssetLinks) {
    const platform = link.dataset.releaseAsset;
    const asset = findReleaseAsset(release, platform);

    if (!asset?.browser_download_url) {
      link.href = releasesUrl;
      continue;
    }

    const size = formatAssetSize(asset.size);
    link.href = asset.browser_download_url;
    link.title = size ? `${asset.name} (${size})` : asset.name;
  }
}

async function loadLatestRelease() {
  setReleaseStatus("releaseLoading");

  try {
    const response = await fetch(releaseApiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`);

    const release = await response.json();
    updateReleaseAssetLinks(release);
    setReleaseStatus("releaseReady", { version: release.tag_name ?? "latest" });
  } catch {
    setReleaseStatus("releaseFallback");
  }
}

selectLanguage(detectLanguage());
selectPlatform(detectPlatform());
void loadLatestRelease();
