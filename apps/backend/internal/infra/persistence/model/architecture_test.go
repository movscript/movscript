//go:build architecture

package model

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

const legacyDomainModelImport = "github.com/movscript/movscript/internal/domain/model"

func TestPersistenceSchemasDoNotImportLegacyDomainModel(t *testing.T) {
	walkPersistenceModelFiles(t, func(path string, file *ast.File) {
		for _, imp := range file.Imports {
			if strings.Trim(imp.Path.Value, `"`) == legacyDomainModelImport {
				t.Errorf("%s imports %s", path, legacyDomainModelImport)
			}
		}
	})
}

func TestPersistenceSchemasDoNotAliasLegacyDomainModel(t *testing.T) {
	walkPersistenceModelFiles(t, func(path string, file *ast.File) {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || typeSpec.Assign == token.NoPos {
					continue
				}
				if selectorReferencesImport(file, typeSpec.Type, legacyDomainModelImport) {
					t.Errorf("%s aliases %s through %s", path, typeSpec.Name.Name, legacyDomainModelImport)
				}
			}
		}
	})
}

func walkPersistenceModelFiles(t *testing.T, visit func(path string, file *ast.File)) {
	t.Helper()
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		visit(path, file)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func selectorReferencesImport(file *ast.File, expr ast.Expr, importPath string) bool {
	names := importedNames(file, importPath)
	if len(names) == 0 {
		return false
	}
	found := false
	ast.Inspect(expr, func(node ast.Node) bool {
		if found {
			return false
		}
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		ident, ok := selector.X.(*ast.Ident)
		if !ok {
			return true
		}
		_, found = names[ident.Name]
		return !found
	})
	return found
}

func importedNames(file *ast.File, importPath string) map[string]struct{} {
	names := map[string]struct{}{}
	for _, imp := range file.Imports {
		if strings.Trim(imp.Path.Value, `"`) != importPath {
			continue
		}
		name := "model"
		if imp.Name != nil {
			name = imp.Name.Name
		}
		names[name] = struct{}{}
	}
	return names
}
