package handler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsGitHTTPBackendBinaryAcceptsWindowsExe(t *testing.T) {
	t.Parallel()

	if !isGitHTTPBackendBinary("git-http-backend.exe") {
		t.Fatal("expected git-http-backend.exe to be accepted")
	}
	if !isGitHTTPBackendBinary("git-http-backend") {
		t.Fatal("expected git-http-backend to be accepted")
	}
	if isGitHTTPBackendBinary("git.exe") {
		t.Fatal("did not expect git.exe to be treated as git-http-backend")
	}
}

func TestIsExecutableFileForGOOSAcceptsWindowsFilesWithoutUnixExecuteBits(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "git-http-backend.exe")
	if err := os.WriteFile(path, []byte("binary"), 0o644); err != nil {
		t.Fatal(err)
	}

	if !isExecutableFileForGOOS(path, "windows") {
		t.Fatal("expected Windows executable check to accept a regular file")
	}
	if isExecutableFileForGOOS(path, "linux") {
		t.Fatal("expected Linux executable check to require execute bits")
	}
}
