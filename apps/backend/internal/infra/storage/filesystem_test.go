package storage

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileSystemStoragePutGetDelete(t *testing.T) {
	store, err := NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}

	ctx := context.Background()
	if err := store.Put(ctx, "raw/1_clip.txt", strings.NewReader("hello local"), int64(len("hello local")), "text/plain"); err != nil {
		t.Fatalf("Put: %v", err)
	}

	rc, size, contentType, err := store.GetObject(ctx, "raw/1_clip.txt", -1, -1)
	if err != nil {
		t.Fatalf("GetObject: %v", err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(data) != "hello local" {
		t.Fatalf("data = %q, want %q", string(data), "hello local")
	}
	if size != int64(len("hello local")) {
		t.Fatalf("size = %d, want %d", size, len("hello local"))
	}
	if contentType != "text/plain" {
		t.Fatalf("contentType = %q, want text/plain", contentType)
	}

	if err := store.Delete(ctx, "raw/1_clip.txt"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, _, _, err := store.GetObject(ctx, "raw/1_clip.txt", -1, -1); err == nil {
		t.Fatal("GetObject after Delete returned nil error")
	}
}

func TestFileSystemStorageRangeRead(t *testing.T) {
	store, err := NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}

	ctx := context.Background()
	if err := store.Put(ctx, "clip.bin", bytes.NewReader([]byte("0123456789")), 10, "application/octet-stream"); err != nil {
		t.Fatalf("Put: %v", err)
	}

	rc, size, _, err := store.GetObject(ctx, "clip.bin", 2, 5)
	if err != nil {
		t.Fatalf("GetObject range: %v", err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(data) != "2345" {
		t.Fatalf("range data = %q, want 2345", string(data))
	}
	if size != 10 {
		t.Fatalf("size = %d, want 10", size)
	}
}

func TestFileSystemStorageRejectsEscapingKeys(t *testing.T) {
	store, err := NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}

	badKeys := []string{
		"../outside.txt",
		"/absolute.txt",
		`C:\outside.txt`,
		`C:/outside.txt`,
		`..\outside.txt`,
		"nested/../../outside.txt",
	}
	for _, key := range badKeys {
		if err := store.Put(context.Background(), key, strings.NewReader("x"), 1, "text/plain"); err == nil {
			t.Fatalf("Put(%q) returned nil error", key)
		}
	}
}

func TestFileSystemStorageAcceptsBackslashSeparatedRelativeKeys(t *testing.T) {
	root := t.TempDir()
	store, err := NewFileSystemStorage(root)
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}

	ctx := context.Background()
	key := `canvas\1\clip.txt`
	if err := store.Put(ctx, key, strings.NewReader("windows key"), int64(len("windows key")), "text/plain"); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "canvas", "1", "clip.txt")); err != nil {
		t.Fatalf("stored file stat: %v", err)
	}

	rc, _, _, err := store.GetObject(ctx, "canvas/1/clip.txt", -1, -1)
	if err != nil {
		t.Fatalf("GetObject with slash key: %v", err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(data) != "windows key" {
		t.Fatalf("data = %q, want windows key", string(data))
	}
}

func TestFileSystemStorageDirectURLIsEmpty(t *testing.T) {
	store, err := NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}
	url, err := store.DirectURL(context.Background(), "clip.txt")
	if err != nil {
		t.Fatalf("DirectURL: %v", err)
	}
	if url != "" {
		t.Fatalf("DirectURL = %q, want empty string", url)
	}
}
