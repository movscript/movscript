package app_test

import (
	"go/ast"
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

func TestPublicAppServiceContractsDoNotExposePersistenceModels(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		persistenceNames := importedNames(file, domainModelImport, persistenceModelImport)
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || !fn.Name.IsExported() || !hasServiceReceiver(fn) {
				continue
			}
			if fieldListReferencesNames(fn.Type.Params, persistenceNames) || fieldListReferencesNames(fn.Type.Results, persistenceNames) {
				t.Errorf("%s: exported Service method %s exposes persistence models", path, fn.Name.Name)
			}
		}
	})
}

func TestPublicAppServiceContractsAvoidUntypedAny(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, _ map[string]struct{}) {
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || !fn.Name.IsExported() || !hasServiceReceiver(fn) {
				continue
			}
			if fieldListReferencesUntypedAny(fn.Type.Params) || fieldListReferencesUntypedAny(fn.Type.Results) {
				t.Errorf("%s: exported Service method %s exposes untyped any/interface{}", path, fn.Name.Name)
			}
		}
	})
}

func TestExportedAppStructsDoNotExposePersistenceModels(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		persistenceNames := importedNames(file, domainModelImport, persistenceModelImport)
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
				if !ok || !fieldListReferencesNames(structType.Fields, persistenceNames) {
					continue
				}
				t.Errorf("%s: exported struct %s exposes persistence models", path, typeSpec.Name.Name)
			}
		}
	})
}

func TestAppServicesDoNotImportDomainModel(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, modelNames map[string]struct{}) {
		if len(modelNames) == 0 || !strings.HasSuffix(filepath.Base(path), "service.go") {
			return
		}
		t.Errorf("%s imports %s from an app service file", path, domainModelImport)
	})
}

func TestAppDoesNotImportDomainModel(t *testing.T) {
	walkAppFiles(t, func(path string, _ *ast.File, modelNames map[string]struct{}) {
		if len(modelNames) == 0 {
			return
		}
		t.Errorf("%s imports %s; use internal/infra/persistence/model at persistence boundaries", path, domainModelImport)
	})
}

func TestMigratedAppRepositoriesDoNotImportDomainModel(t *testing.T) {
	migratedRoots := []string{"aiadmin", "artifactref", "audit", "auth", "cloudfileconfig", "debug", "entitlement", "feature", "hub", "job", "modelgateway", "org", "plugin", "preview", "project", "resource", "resourceadmin", "resourcebinding", "resourcefolder", "script", "semantic", "user", "workflowio", "workflowmarket"}
	for _, root := range migratedRoots {
		t.Run(root, func(t *testing.T) {
			walkAppFiles(t, func(path string, _ *ast.File, modelNames map[string]struct{}) {
				if !strings.HasPrefix(path, root+"/") || len(modelNames) == 0 {
					return
				}
				t.Errorf("%s imports %s after migration to infra persistence model", path, domainModelImport)
			})
		})
	}
}

func TestAppRepositoryInterfacesDoNotExposePersistenceModels(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, _ map[string]struct{}) {
		persistenceNames := importedNames(file, persistenceModelImport)
		if len(persistenceNames) == 0 {
			return
		}
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || typeSpec.Name.Name != "repository" {
					continue
				}
				if exprReferencesNames(typeSpec.Type, persistenceNames) {
					t.Errorf("%s: repository interface exposes persistence models", path)
				}
			}
		}
	})
}

func TestAppRepositoryInterfacesAvoidUntypedAny(t *testing.T) {
	walkAppFiles(t, func(path string, file *ast.File, _ map[string]struct{}) {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || typeSpec.Name.Name != "repository" {
					continue
				}
				if exprReferencesUntypedAny(typeSpec.Type) {
					t.Errorf("%s: repository interface exposes untyped any/interface{}", path)
				}
			}
		}
	})
}

func TestCommunityCodeDoesNotUseStaleCommercialBoundaryNames(t *testing.T) {
	terms := []string{
		"edition",
		"Edition",
		"paid",
		"Paid",
		"commercial",
		"Commercial",
		"enterprise",
		"Enterprise",
		"GatewayAPIKey" + "Edition",
		"APIKey" + "Edition",
		"register" + "Edition",
		"edition" + "_flags",
		"MOVSCRIPT_ADMIN_" + "EDITION",
		"admin-" + "edition",
	}
	roots := []string{
		"..",
		"../../../../apps/admin/src",
		"../../../../apps/admin/vite.config.ts",
		"../../../../apps/admin/tsconfig.json",
	}
	for _, root := range roots {
		walkTextFiles(t, root, func(path string, content string) {
			for _, term := range terms {
				if strings.Contains(content, term) {
					t.Errorf("%s contains stale commercial boundary name %q", path, term)
				}
			}
		})
	}
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
		if isRuntimeOverlayOnlyFile(path) {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		modelNames := importedModelNames(file)
		visit(path, file, modelNames)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func walkTextFiles(t *testing.T, root string, visit func(path string, content string)) {
	t.Helper()
	info, err := os.Stat(root)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		content, err := os.ReadFile(root)
		if err != nil {
			t.Fatal(err)
		}
		visit(root, string(content))
		return
	}
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case "dist", "node_modules", "vendor", "bin":
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		switch filepath.Ext(path) {
		case ".go", ".ts", ".tsx", ".json":
		default:
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		visit(path, string(content))
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

func importedModelNames(file *ast.File) map[string]struct{} {
	return importedNames(file, domainModelImport)
}

func importedNames(file *ast.File, importPaths ...string) map[string]struct{} {
	names := map[string]struct{}{}
	for _, imp := range file.Imports {
		importPath := strings.Trim(imp.Path.Value, `"`)
		for _, wanted := range importPaths {
			if importPath != wanted {
				continue
			}
			name := "model"
			if imp.Name != nil {
				name = imp.Name.Name
			}
			names[name] = struct{}{}
		}
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

func fieldListReferencesUntypedAny(fields *ast.FieldList) bool {
	if fields == nil {
		return false
	}
	for _, field := range fields.List {
		if exprReferencesUntypedAny(field.Type) {
			return true
		}
	}
	return false
}

func exprReferencesUntypedAny(expr ast.Expr) bool {
	found := false
	ast.Inspect(expr, func(node ast.Node) bool {
		if found {
			return false
		}
		switch value := node.(type) {
		case *ast.Ident:
			found = value.Name == "any"
		case *ast.InterfaceType:
			found = value.Methods == nil || len(value.Methods.List) == 0
		}
		return !found
	})
	return found
}

func selectorNamesForIdent(file *ast.File, identName string) []string {
	names := []string{}
	ast.Inspect(file, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		ident, ok := selector.X.(*ast.Ident)
		if !ok || ident.Name != identName {
			return true
		}
		names = append(names, selector.Sel.Name)
		return true
	})
	return names
}
