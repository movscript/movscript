import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const releaseWorkflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/release.yml'), 'utf8')
const pagesRefreshWorkflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/pages-refresh.yml'), 'utf8')

test('release workflow packages every desktop target through split parameterized commands', () => {
  assert.match(releaseWorkflow, /pnpm run release -- prepare-desktop-package --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  assert.match(releaseWorkflow, /Diagnostic typecheck frontend desktop bundle on target runner/)
  assert.match(releaseWorkflow, /continue-on-error:\s+true/)
  assert.match(releaseWorkflow, /pnpm run release -- typecheck-desktop-bundle --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- build-desktop-bundle --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- build-desktop-artifact --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- verify-desktop-package --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  assert.match(releaseWorkflow, /MOVSCRIPT_ELECTRON_VITE_DEBUG:\s+\$\{\{\s*matrix\.package-platform == 'win32' && '1' \|\| '0'\s*\}\}/)
  for (const pair of [
    ['package-platform: darwin', 'package-arch: arm64'],
    ['package-platform: darwin', 'package-arch: x64'],
    ['package-platform: win32', 'package-arch: x64'],
  ]) {
    assert.match(releaseWorkflow, new RegExp(pair[0]))
    assert.match(releaseWorkflow, new RegExp(pair[1]))
  }
  assert.match(releaseWorkflow, /name: macos-x64\s+os: macos-14\s+package-platform: darwin\s+package-arch: x64/)
  assert.doesNotMatch(releaseWorkflow, /name: windows-arm64/)
  assert.doesNotMatch(releaseWorkflow, /package-platform: win32\s+package-arch: arm64/)
  assert.doesNotMatch(releaseWorkflow, /package-platform: linux/)
})

test('release workflow downloads ffmpeg for each desktop package job', () => {
  for (const pair of [
    ['ffmpeg-platform: darwin', 'ffmpeg-arch: arm64'],
    ['ffmpeg-platform: darwin', 'ffmpeg-arch: x64'],
    ['ffmpeg-platform: win32', 'ffmpeg-arch: x64'],
  ]) {
    assert.match(releaseWorkflow, new RegExp(pair[0]))
    assert.match(releaseWorkflow, new RegExp(pair[1]))
  }
  assert.doesNotMatch(releaseWorkflow, /ffmpeg-platform: linux/)
  assert.match(releaseWorkflow, /release -- download-ffmpeg-static --platform=\$\{\{\s*matrix\.ffmpeg-platform\s*\}\} --arch=\$\{\{\s*matrix\.ffmpeg-arch\s*\}\}/)
  assert.doesNotMatch(releaseWorkflow, /Download Windows ARM64 ffmpeg release binary/)
  assert.doesNotMatch(releaseWorkflow, /tordona\/ffmpeg-win-arm64/)
  assert.doesNotMatch(releaseWorkflow, /stage-ffmpeg --platform=win32 --arch=arm64/)
})

test('release workflow uploads architecture-specific desktop artifact names', () => {
  for (const artifact of [
    'movscript-desktop-macos-arm64',
    'movscript-desktop-macos-x64',
    'movscript-desktop-windows-x64',
  ]) {
    assert.match(releaseWorkflow, new RegExp(`artifact: ${artifact}`))
  }
  assert.doesNotMatch(releaseWorkflow, /artifact: movscript-desktop-windows-arm64/)
  assert.doesNotMatch(releaseWorkflow, /artifact: movscript-desktop-linux-/)
})

test('release workflow installs locked dependencies without mutating package specs', () => {
  assert.doesNotMatch(releaseWorkflow, /movscript-lang-deps\.mjs latest/)
  assert.doesNotMatch(releaseWorkflow, /pnpm install --no-frozen-lockfile/)
  assert.match(releaseWorkflow, /pnpm install --frozen-lockfile/)
})

test('release workflow verifies readiness before packaging and smoke-tests runnable packages', () => {
  assert.match(releaseWorkflow, /^\s+release-checks:\s*$/m)
  assert.match(releaseWorkflow, /^\s+package:\s*$/m)
  assert.match(releaseWorkflow, /needs:\s+\[release-checks]/)
  assert.match(releaseWorkflow, /pnpm run release -- check/)
  assert.match(releaseWorkflow, /pnpm run release -- verify-release-readiness --tag="\$RELEASE_TAG" --platform=\$\{\{\s*matrix\.package-platform\s*\}\}/)
  assert.match(releaseWorkflow, /release_channel:/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_ALLOW_TEST_TAG:\s+\$\{\{\s*\(\(github\.event_name == 'workflow_dispatch' && inputs\.release_channel == 'test'\) \|\| contains\(github\.ref_name, '-test\.'\)\) && '1' \|\| '0'\s*\}\}/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_REQUIRE_SIGNING:\s+'0'/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_SIGNING_MODE:\s+unsigned/)
  assert.match(releaseWorkflow, /pnpm run release -- smoke-desktop-package --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
})

test('release workflow materializes Apple signing secrets as temporary files for macOS packaging', () => {
  assert.match(releaseWorkflow, /name: Prepare Apple signing files/)
  assert.match(releaseWorkflow, /if: matrix\.package-platform == 'darwin'/)
  assert.match(releaseWorkflow, /APPLE_API_KEY_CONTENT:\s+\$\{\{\s*secrets\.APPLE_API_KEY\s*\}\}/)
  assert.match(releaseWorkflow, /APPLE_API_KEY_PATH="\$RUNNER_TEMP\/AuthKey_\$\{\{\s*secrets\.APPLE_API_KEY_ID\s*\}\}\.p8"/)
  assert.match(releaseWorkflow, /echo "APPLE_API_KEY=\$APPLE_API_KEY_PATH" >> "\$GITHUB_ENV"/)
  assert.match(releaseWorkflow, /CSC_LINK_CONTENT:\s+\$\{\{\s*secrets\.CSC_LINK\s*\}\}/)
  assert.match(releaseWorkflow, /CSC_KEY_PASSWORD:\s+\$\{\{\s*secrets\.CSC_KEY_PASSWORD\s*\}\}/)
  assert.match(releaseWorkflow, /CSC_LINK_PATH="\$RUNNER_TEMP\/developer-id-application\.p12"/)
  assert.match(releaseWorkflow, /security list-keychains -d user -s "\$KEYCHAIN_PATH"/)
  assert.match(releaseWorkflow, /security default-keychain -d user -s "\$KEYCHAIN_PATH"/)
  assert.match(releaseWorkflow, /security import "\$CSC_LINK_PATH" -k "\$KEYCHAIN_PATH" -P "\$CSC_KEY_PASSWORD"/)
  assert.match(releaseWorkflow, /IDENTITY_NAME="\$\(security find-identity -p codesigning -v "\$KEYCHAIN_PATH"/)
  assert.match(releaseWorkflow, /Developer ID Application: \*\\\(\[\^"\]\*\\\)/)
  assert.match(releaseWorkflow, /No Developer ID Application signing identity was imported from CSC_LINK/)
  assert.match(releaseWorkflow, /echo "CSC_LINK=\$CSC_LINK_PATH" >> "\$GITHUB_ENV"/)
  assert.match(releaseWorkflow, /echo "CSC_KEYCHAIN=\$KEYCHAIN_PATH" >> "\$GITHUB_ENV"/)
  assert.match(releaseWorkflow, /echo "CSC_NAME=\$IDENTITY_NAME" >> "\$GITHUB_ENV"/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_REQUIRE_SIGNING:\s+\$\{\{\s*matrix\.package-platform == 'darwin' && '1' \|\| '0'\s*\}\}/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_SIGNING_MODE:\s+\$\{\{\s*matrix\.package-platform == 'darwin' && 'signed' \|\| 'unsigned'\s*\}\}/)
  assert.match(releaseWorkflow, /CSC_LINK:\s+''/)
})

test('release workflow does not build or download app-server binaries for GitHub packages', () => {
  assert.doesNotMatch(releaseWorkflow, /^\s+app-server-deps:\s*$/m)
  assert.doesNotMatch(releaseWorkflow, /Build app-server deps/)
  assert.doesNotMatch(releaseWorkflow, /create-github-app-token@v1/)
  assert.doesNotMatch(releaseWorkflow, /build-app-server-deps/)
  assert.doesNotMatch(releaseWorkflow, /app-server-deps-\$\{\{\s*matrix\.package-platform/)
  assert.doesNotMatch(releaseWorkflow, /release-binary-deps\/\$\{\{\s*matrix\.package-platform/)
  assert.doesNotMatch(releaseWorkflow, /needs:\s+\[app-server-deps]/)
  assert.doesNotMatch(releaseWorkflow, /Download app-server dependency artifacts/)
})

test('release workflow omits Windows ARM64 until a stable ffmpeg source is available', () => {
  assert.doesNotMatch(releaseWorkflow, /package-platform: win32\s+package-arch: arm64/)
  assert.doesNotMatch(releaseWorkflow, /artifact: movscript-desktop-windows-arm64/)
  assert.doesNotMatch(releaseWorkflow, /FFMPEG_WIN_ARM64_SHA256/)
})

test('release workflow collects package artifacts without plugin duplicates', () => {
  assert.match(releaseWorkflow, /MOVSCRIPT_COLLECT_PLUGINS:\s+'0'/)
  assert.match(releaseWorkflow, /MOVSCRIPT_ARTIFACT_PREFIX:\s+\$\{\{\s*matrix\.artifact\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- collect/)
  assert.match(releaseWorkflow, /pattern:\s+movscript-desktop-\*/)
  assert.match(releaseWorkflow, /merge-multiple:\s+true/)
  assert.match(releaseWorkflow, /find downloaded-artifacts -maxdepth 1 -type f -name '\*SHA256SUMS\.txt' -delete/)
})

test('release workflow does not run a standalone plugin artifact job', () => {
  assert.doesNotMatch(releaseWorkflow, /^\s+plugins:\s*$/m)
  assert.doesNotMatch(releaseWorkflow, /Package plugins/)
  assert.doesNotMatch(releaseWorkflow, /movscript-plugins/)
  assert.doesNotMatch(releaseWorkflow, /--filter "\.\/plugins\/\*" build/)
  assert.match(releaseWorkflow, /needs:\s+\[package]/)
})

test('release workflow creates attestations and uses the checked-in release notes file', () => {
  assert.match(releaseWorkflow, /id-token:\s+write/)
  assert.match(releaseWorkflow, /attestations:\s+write/)
  assert.match(releaseWorkflow, /uses:\s+actions\/attest-build-provenance@v2/)
  assert.match(releaseWorkflow, /--notes-file \.github\/release-workspace-notes\.md/)
  assert.doesNotMatch(releaseWorkflow, /release-draft-notes\.md/)
})

test('release workflow marks test releases as prereleases', () => {
  assert.match(releaseWorkflow, /echo "is_test=true" >> "\$GITHUB_OUTPUT"/)
  assert.match(releaseWorkflow, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+-test\\\.\[0-9\]\+\$/)
  assert.match(releaseWorkflow, /IS_TEST_RELEASE:\s+\$\{\{\s*steps\.release\.outputs\.is_test\s*\}\}/)
  assert.match(releaseWorkflow, /RELEASE_FLAGS="--draft --prerelease"/)
  assert.match(releaseWorkflow, /RELEASE_FLAGS=""/)
  assert.match(releaseWorkflow, /gh release create "\$RELEASE_TAG" \$RELEASE_FLAGS --title "\$RELEASE_TAG" --notes-file \.github\/release-workspace-notes\.md/)
  assert.match(releaseWorkflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/tags\/\$\{RELEASE_TAG\}" --jq \.id/)
  assert.match(releaseWorkflow, /gh api -X PATCH "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/\$\{RELEASE_ID\}" -F draft=false -F prerelease=false/)
})

test('pages refresh workflow dispatches pages without requiring a local git checkout', () => {
  assert.doesNotMatch(pagesRefreshWorkflow, /actions\/checkout/)
  assert.match(pagesRefreshWorkflow, /gh workflow run pages\.yml --repo "\$GITHUB_REPOSITORY" --ref main/)
})
