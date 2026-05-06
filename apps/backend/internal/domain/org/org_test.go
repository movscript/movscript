package org

import (
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestGenerateJoinCodeUsesReadableAlphabet(t *testing.T) {
	code, err := GenerateJoinCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 10 {
		t.Fatalf("code length = %d, want 10", len(code))
	}
	if strings.ContainsAny(code, "IO01") {
		t.Fatalf("code contains ambiguous character: %q", code)
	}
}

func TestNormalizeJoinCode(t *testing.T) {
	if got := NormalizeJoinCode(" ab-cd "); got != "ABCD" {
		t.Fatalf("code = %q, want ABCD", got)
	}
}

func TestNewPersonalOrgUsesStableSlugFallback(t *testing.T) {
	user := model.User{Username: "alice"}
	user.ID = 7
	org := NewPersonalOrg(user, true)
	if org.Slug != "alice-7" || !org.IsPersonal || org.CreatedBy != 7 {
		t.Fatalf("unexpected personal org: %+v", org)
	}
}
