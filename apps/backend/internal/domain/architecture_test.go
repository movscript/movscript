package domain_test

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
const gormImport = "gorm.io/gorm"

func TestDomainPackagesDoNotImportPersistenceModels(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path == "model" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if isRuntimeOverlayOnlyFile(path) {
			return nil
		}
		if filepath.Base(path) == "model_mapping.go" {
			return nil
		}

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range file.Imports {
			importPath := strings.Trim(imp.Path.Value, `"`)
			if importPath == domainModelImport || importPath == persistenceModelImport {
				t.Errorf("%s imports %s outside model_mapping.go", path, importPath)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestDomainPackagesDoNotImportGormOutsidePersistenceSchemas(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path == "model" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if isRuntimeOverlayOnlyFile(path) {
			return nil
		}
		if filepath.Base(path) == "model_mapping.go" {
			return nil
		}

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range file.Imports {
			if strings.Trim(imp.Path.Value, `"`) == gormImport {
				t.Errorf("%s imports %s outside model package or model_mapping.go", path, gormImport)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestDomainPackagesDoNotImportInfraOutsideModelMappings(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path == "model" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if isRuntimeOverlayOnlyFile(path) {
			return nil
		}
		if filepath.Base(path) == "model_mapping.go" {
			return nil
		}

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range file.Imports {
			importPath := strings.Trim(imp.Path.Value, `"`)
			if strings.HasPrefix(importPath, "github.com/movscript/movscript/internal/infra/") {
				t.Errorf("%s imports infra package %s outside model_mapping.go", path, importPath)
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
