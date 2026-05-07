package http_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

const domainModelImport = "github.com/movscript/movscript/internal/domain/model"

func TestHandlersAndRoutersDoNotImportPersistenceModels(t *testing.T) {
	for _, root := range []string{"handler", "router", "auditlog", "middleware"} {
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
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range file.Imports {
			if strings.Trim(imp.Path.Value, `"`) == domainModelImport {
				t.Errorf("%s imports %s", path, domainModelImport)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
