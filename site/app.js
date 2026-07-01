const languageTabs = Array.from(document.querySelectorAll("[data-language-tab]"));
const languagePanels = Array.from(document.querySelectorAll("[data-language-panel]"));
const platformTabs = Array.from(document.querySelectorAll("[data-platform-tab]"));
const platformPanels = Array.from(document.querySelectorAll("[data-platform-panel]"));
const copyButtons = Array.from(document.querySelectorAll("[data-copy-command]"));
const releaseStatuses = Array.from(document.querySelectorAll("[data-release-status]"));
const releaseAssetLinks = Array.from(document.querySelectorAll("[data-release-asset]"));
const downloadRecommendations = Array.from(document.querySelectorAll("[data-download-recommendation]"));

const releaseApiUrl = "release.json";
const releasesUrl = "https://github.com/movscript/movscript/releases/latest";
const releaseAssetMatchers = {
  "macos-arm64": [
    (name) => name.startsWith("movscript-desktop-macos-arm64-") && name.endsWith(".dmg"),
  ],
  "macos-x64": [
    (name) => name.startsWith("movscript-desktop-macos-x64-") && name.endsWith(".dmg"),
  ],
  "windows-x64": [
    (name) => name.startsWith("movscript-desktop-windows-x64-") && name.includes("Setup") && name.endsWith(".exe"),
    (name) => name.startsWith("movscript-desktop-windows-x64-") && name.endsWith(".exe"),
  ],
  "linux-x64": [
    (name) => name.startsWith("movscript-desktop-linux-x64-") && name.endsWith(".AppImage"),
  ],
  plugin: [
    (name) => name.startsWith("movscript-agent-plugin-") && name.endsWith(".zip"),
  ],
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
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "macos";
}

async function detectArchitecture() {
  const values = [
    navigator.platform,
    navigator.userAgent,
  ];

  try {
    const highEntropy = await navigator.userAgentData?.getHighEntropyValues?.(["architecture", "bitness"]);
    values.push(highEntropy?.architecture, highEntropy?.bitness);
  } catch {
    // Browser privacy settings can reject high entropy hints. Fall back to lower fidelity values.
  }

  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/\b(?:arm64|aarch64|arm)\b/.test(text)) return "arm64";
  if (/\b(?:x86_64|x64|amd64|wow64|win64|x86)\b/.test(text) || text.includes("macintel")) return "x64";
  return "";
}

async function detectDownloadTarget() {
  const platform = detectPlatform();
  const arch = await detectArchitecture();

  if (platform === "windows") {
    return "windows-x64";
  }
  if (platform === "linux") {
    return "linux-x64";
  }

  if (arch === "x64") return "macos-x64";
  return "macos-arm64";
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

function highlightDownloadTarget(target) {
  for (const link of releaseAssetLinks) {
    const selected = link.dataset.releaseAsset === target;
    link.toggleAttribute("data-recommended-download", selected);
    link.setAttribute("aria-current", selected ? "true" : "false");
  }

  const targetLink = releaseAssetLinks.find((link) => link.dataset.releaseAsset === target);
  const label = targetLink?.querySelector("span")?.textContent?.trim() || targetLink?.textContent?.trim() || "";
  for (const note of downloadRecommendations) {
    if (label) {
      note.textContent = note.closest("[lang='zh-Hans']")
        ? `已根据当前设备推荐：${label}`
        : `Recommended for this device: ${label}`;
    }
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
  const matchers = releaseAssetMatchers[platform] ?? [];
  for (const matcher of matchers) {
    const asset = release.assets?.find((candidate) => matcher(candidate.name));
    if (asset) return asset;
  }
  return null;
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
    const response = await fetch(releaseApiUrl, { cache: "no-store" });

    if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`);

    const release = await response.json();
    if (!release?.tag_name) throw new Error("Static release metadata is unavailable.");
    updateReleaseAssetLinks(release);
    setReleaseStatus("releaseReady", { version: release.tag_name ?? "latest" });
  } catch {
    setReleaseStatus("releaseFallback");
  }
}

selectLanguage(detectLanguage());
selectPlatform(detectPlatform());
detectDownloadTarget().then((target) => {
  highlightDownloadTarget(target);
  selectPlatform(target.startsWith("windows") ? "windows" : target.startsWith("linux") ? "linux" : "macos");
});
void loadLatestRelease();
