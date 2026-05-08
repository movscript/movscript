package job

import (
	"errors"
	"testing"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestRequireImageVerificationOnlyForSeedance(t *testing.T) {
	service := &Service{}
	resources := []domainjob.InputResource{{Type: "image"}}

	if err := service.requireImageVerification(&ai.ModelDef{ID: "kling:v1-5-standard-i2v"}, resources); err != nil {
		t.Fatalf("non-seedance model should not require verification: %v", err)
	}
	if err := service.requireImageVerification(&ai.ModelDef{ID: "volcengine:seedance-2-0"}, resources); !errors.Is(err, ai.ErrImageVerificationRequired) {
		t.Fatalf("seedance model error = %v, want ErrImageVerificationRequired", err)
	}
	verified := []domainjob.InputResource{{Type: "image", VerificationStatus: string(ai.ImageVerificationVerified)}}
	if err := service.requireImageVerification(&ai.ModelDef{ID: "volcengine:seedance-2-0"}, verified); err != nil {
		t.Fatalf("verified image should pass seedance verification gate: %v", err)
	}
}
