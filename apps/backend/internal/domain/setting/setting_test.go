package setting

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestNormalizeSettingTrimsNameAndDefaultsStatus(t *testing.T) {
	item := model.Setting{Name: " Castle ", Status: " "}
	NormalizeSetting(&item)
	if item.Name != "Castle" || item.Status != "default" {
		t.Fatalf("unexpected setting: %+v", item)
	}
}

func TestNormalizeRelationshipDefaultsSourceAndCategory(t *testing.T) {
	item := model.SettingRelationship{}
	NormalizeRelationship(&item)
	if item.Source != "manual" || item.Category != "relationship" {
		t.Fatalf("unexpected relationship: %+v", item)
	}
}
