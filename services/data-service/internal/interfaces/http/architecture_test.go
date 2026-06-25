//go:build architecture

package http_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const domainModelImport = "github.com/movscript/movscript/internal/domain/model"
const persistenceModelImport = "github.com/movscript/movscript/internal/infra/persistence/model"

func TestHandlersAndRoutersDoNotImportPersistenceModels(t *testing.T) {
	for _, root := range []string{"handler", "router", "audit", "middleware"} {
		t.Run(root, func(t *testing.T) {
			assertNoDomainModelImports(t, root)
		})
	}
}

func assertNoDomainModelImports(t *testing.T, root string) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if isRuntimeOverlayOnlyFile(path) {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range file.Imports {
			importPath := strings.Trim(imp.Path.Value, `"`)
			if importPath == domainModelImport || importPath == persistenceModelImport {
				t.Errorf("%s imports %s", path, importPath)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func isRuntimeOverlayOnlyFile(path string) bool {
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		return strings.HasPrefix(line, "//go:build runtime_overlay")
	}
	return false
}
