package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
)

type FileSystemStorage struct {
	root string
}

func NewFileSystemStorage(root string) (*FileSystemStorage, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, errors.New("filesystem storage root is required")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve filesystem storage root: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("create filesystem storage root: %w", err)
	}
	return &FileSystemStorage{root: abs}, nil
}

func (s *FileSystemStorage) Put(ctx context.Context, key string, r io.Reader, _ int64, mimeType string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.pathForKey(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create object parent directory: %w", err)
	}

	tmp, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return fmt.Errorf("create temporary object: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := io.Copy(tmp, r); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write object %q: %w", key, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close object %q: %w", key, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("commit object %q: %w", key, err)
	}
	if mimeType != "" {
		_ = os.WriteFile(path+".content-type", []byte(mimeType), 0o644)
	}
	return nil
}

func (s *FileSystemStorage) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.pathForKey(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete object %q: %w", key, err)
	}
	if err := os.Remove(path + ".content-type"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete object metadata %q: %w", key, err)
	}
	return nil
}

func (s *FileSystemStorage) DirectURL(_ context.Context, _ string) (string, error) {
	return "", nil
}

func (s *FileSystemStorage) GetObject(ctx context.Context, key string, start, end int64) (io.ReadCloser, int64, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, 0, "", err
	}
	path, err := s.pathForKey(key)
	if err != nil {
		return nil, 0, "", err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, "", fmt.Errorf("open object %q: %w", key, err)
	}

	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, 0, "", fmt.Errorf("stat object %q: %w", key, err)
	}
	totalSize := info.Size()
	contentType := s.contentType(path)

	if start < 0 {
		return f, totalSize, contentType, nil
	}
	if start >= totalSize {
		_ = f.Close()
		return nil, 0, "", fmt.Errorf("range start %d exceeds object size %d", start, totalSize)
	}
	actualEnd := end
	if actualEnd < 0 || actualEnd >= totalSize {
		actualEnd = totalSize - 1
	}
	if actualEnd < start {
		_ = f.Close()
		return nil, 0, "", fmt.Errorf("range end %d precedes start %d", actualEnd, start)
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		_ = f.Close()
		return nil, 0, "", fmt.Errorf("seek object %q: %w", key, err)
	}
	return struct {
		io.Reader
		io.Closer
	}{Reader: io.LimitReader(f, actualEnd-start+1), Closer: f}, totalSize, contentType, nil
}

func (s *FileSystemStorage) Backend() string { return "filesystem" }

func (s *FileSystemStorage) pathForKey(key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", errors.New("storage key is required")
	}
	if strings.Contains(key, "\x00") {
		return "", errors.New("storage key contains null byte")
	}
	clean := filepath.Clean(filepath.FromSlash(key))
	if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || clean == ".." {
		return "", fmt.Errorf("invalid storage key %q", key)
	}
	path := filepath.Join(s.root, clean)
	rel, err := filepath.Rel(s.root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("storage key escapes root: %q", key)
	}
	return path, nil
}

func (s *FileSystemStorage) contentType(path string) string {
	if b, err := os.ReadFile(path + ".content-type"); err == nil {
		if value := strings.TrimSpace(string(b)); value != "" {
			return value
		}
	}
	if extType := mime.TypeByExtension(filepath.Ext(path)); extType != "" {
		return extType
	}
	return "application/octet-stream"
}
