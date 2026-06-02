package model

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/testutil"
)

func TestRawResourceContentIdentityIsImmutableAfterCreate(t *testing.T) {
	db := testutil.OpenSQLite(t, "raw_resource_immutability.db", &RawResource{})
	resource := RawResource{
		OwnerID:        1,
		Type:           "image",
		Name:           "hero.png",
		FilePath:       "stored:blobs/original",
		StorageBackend: "local",
		StorageKey:     "blobs/original",
		Size:           10,
		MimeType:       "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	for field, value := range map[string]any{
		"file_path":       "stored:blobs/changed",
		"storage_backend": "minio",
		"storage_key":     "blobs/changed",
		"type":            "video",
		"mime_type":       "video/mp4",
		"size":            int64(99),
	} {
		err := db.Model(&resource).Update(field, value).Error
		if err == nil || !strings.Contains(err.Error(), "resource content identity is immutable") {
			t.Fatalf("Update(%q) error = %v, want immutable content identity error", field, err)
		}
	}

	if err := db.Model(&resource).Update("name", "renamed.png").Error; err != nil {
		t.Fatalf("update editable name: %v", err)
	}

	var stored RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("reload resource: %v", err)
	}
	if stored.FilePath != "stored:blobs/original" || stored.StorageBackend != "local" || stored.StorageKey != "blobs/original" {
		t.Fatalf("storage locator changed: filePath=%q backend=%q key=%q", stored.FilePath, stored.StorageBackend, stored.StorageKey)
	}
	if stored.Type != "image" || stored.MimeType != "image/png" || stored.Size != 10 {
		t.Fatalf("content identity changed: type=%q mime=%q size=%d", stored.Type, stored.MimeType, stored.Size)
	}
	if stored.Name != "renamed.png" {
		t.Fatalf("name = %q, want renamed.png", stored.Name)
	}
}

func TestResourceBlobContentIdentityIsImmutableAfterCreate(t *testing.T) {
	db := testutil.OpenSQLite(t, "resource_blob_immutability.db", &ResourceBlob{})
	blob := ResourceBlob{
		Hash:           "abc123",
		StorageBackend: "local",
		StorageKey:     "blobs/abc123",
		Size:           10,
		MimeType:       "image/png",
		RefCount:       1,
	}
	if err := db.Create(&blob).Error; err != nil {
		t.Fatalf("create blob: %v", err)
	}

	for field, value := range map[string]any{
		"hash":            "def456",
		"storage_backend": "minio",
		"storage_key":     "blobs/def456",
		"size":            int64(99),
		"mime_type":       "video/mp4",
	} {
		err := db.Model(&blob).Update(field, value).Error
		if err == nil || !strings.Contains(err.Error(), "resource blob content identity is immutable") {
			t.Fatalf("Update(%q) error = %v, want immutable blob content identity error", field, err)
		}
	}

	if err := db.Model(&blob).Update("ref_count", 2).Error; err != nil {
		t.Fatalf("update ref count: %v", err)
	}

	var stored ResourceBlob
	if err := db.First(&stored, blob.ID).Error; err != nil {
		t.Fatalf("reload blob: %v", err)
	}
	if stored.Hash != "abc123" || stored.StorageBackend != "local" || stored.StorageKey != "blobs/abc123" {
		t.Fatalf("blob storage identity changed: hash=%q backend=%q key=%q", stored.Hash, stored.StorageBackend, stored.StorageKey)
	}
	if stored.MimeType != "image/png" || stored.Size != 10 {
		t.Fatalf("blob content metadata changed: mime=%q size=%d", stored.MimeType, stored.Size)
	}
	if stored.RefCount != 2 {
		t.Fatalf("ref count = %d, want 2", stored.RefCount)
	}
}

func TestResourceStorageLocatorIsNotDirectlyUpdatedInProductionCode(t *testing.T) {
	internalRoot := filepath.Clean(filepath.Join("..", "..", ".."))
	fset := token.NewFileSet()
	var violations []string

	if err := filepath.WalkDir(internalRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "node_modules", "vendor":
				return filepath.SkipDir
			default:
				return nil
			}
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		ast.Inspect(file, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			columns := directStorageLocatorUpdateColumns(sel.Sel.Name, call.Args)
			if len(columns) == 0 {
				return true
			}
			pos := fset.Position(call.Lparen)
			for _, column := range columns {
				violations = append(violations, fmt.Sprintf("%s:%d direct %s of immutable resource column %q", pos.Filename, pos.Line, sel.Sel.Name, column))
			}
			return true
		})
		return nil
	}); err != nil {
		t.Fatalf("scan production code: %v", err)
	}

	if len(violations) > 0 {
		t.Fatalf("resource storage locator fields must not be directly updated after create:\n%s", strings.Join(violations, "\n"))
	}
}

func directStorageLocatorUpdateColumns(method string, args []ast.Expr) []string {
	switch method {
	case "Update", "UpdateColumn":
		if len(args) == 0 {
			return nil
		}
		column, ok := stringLiteralValue(args[0])
		if ok && isResourceStorageLocatorColumn(column) {
			return []string{column}
		}
	case "Updates", "UpdateColumns":
		if len(args) == 0 {
			return nil
		}
		return storageLocatorColumnsInCompositeMap(args[0])
	}
	return nil
}

func storageLocatorColumnsInCompositeMap(expr ast.Expr) []string {
	lit, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil
	}
	var columns []string
	for _, element := range lit.Elts {
		kv, ok := element.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		column, ok := stringLiteralValue(kv.Key)
		if ok && isResourceStorageLocatorColumn(column) {
			columns = append(columns, column)
		}
	}
	return columns
}

func stringLiteralValue(expr ast.Expr) (string, bool) {
	lit, ok := expr.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	value, err := strconv.Unquote(lit.Value)
	return value, err == nil
}

func isResourceStorageLocatorColumn(column string) bool {
	switch column {
	case "file_path", "storage_backend", "storage_key":
		return true
	default:
		return false
	}
}
