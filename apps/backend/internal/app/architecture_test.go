package app_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

const domainModelImport = "github.com/movscript/movscript/internal/domain/model"

func TestPublicAppServiceContractsDoNotExposePersistenceModels(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || !fn.Name.IsExported() || !hasServiceReceiver(fn) {
				continue
			}
			if fieldListReferencesNames(fn.Type.Params, modelNames) || fieldListReferencesNames(fn.Type.Results, modelNames) {
				t.Errorf("%s: exported Service method %s exposes %s", path, fn.Name.Name, domainModelImport)
			}
		}
	})
}

func TestExportedAppStructsDoNotExposePersistenceModels(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || !typeSpec.Name.IsExported() {
					continue
				}
				structType, ok := typeSpec.Type.(*ast.StructType)
				if !ok || !fieldListReferencesNames(structType.Fields, modelNames) {
					continue
				}
				t.Errorf("%s: exported struct %s exposes %s", path, typeSpec.Name.Name, domainModelImport)
			}
		}
	})
}

func TestAppServicesDoNotImportPersistenceModelsOutsideCanvasExecution(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		if len(modelNames) == 0 || !strings.HasSuffix(filepath.Base(path), "service.go") {
			return
		}
		if strings.HasPrefix(path, "canvas/") {
			return
		}
		t.Errorf("%s imports %s from an app service file", path, domainModelImport)
	})
}

func walkAppFiles(t *testing.T, visit func(path string, file *ast.File, modelNames map[string]struct{})) {
	t.Helper()
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		modelNames := importedModelNames(file)
		if len(modelNames) == 0 {
			return nil
		}
		visit(path, file, modelNames)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func importedModelNames(file *ast.File) map[string]struct{} {
	names := map[string]struct{}{}
	for _, imp := range file.Imports {
		if strings.Trim(imp.Path.Value, `"`) != domainModelImport {
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

func hasServiceReceiver(fn *ast.FuncDecl) bool {
	if fn.Recv == nil || len(fn.Recv.List) == 0 {
		return false
	}
	return receiverName(fn.Recv.List[0].Type) == "Service"
}

func receiverName(expr ast.Expr) string {
	switch value := expr.(type) {
	case *ast.Ident:
		return value.Name
	case *ast.StarExpr:
		return receiverName(value.X)
	default:
		return ""
	}
}

func fieldListReferencesNames(fields *ast.FieldList, names map[string]struct{}) bool {
	if fields == nil {
		return false
	}
	for _, field := range fields.List {
		if exprReferencesNames(field.Type, names) {
			return true
		}
	}
	return false
}

func exprReferencesNames(expr ast.Expr, names map[string]struct{}) bool {
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
