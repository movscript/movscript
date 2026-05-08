package canvas

import (
	"errors"
	"testing"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestRequireImageVerificationOnlyForSeedance(t *testing.T) {
	service := &Service{}
	resources := []domainresource.RawResource{{Type: "image"}}

	if err := service.requireImageVerification(&ai.ModelDef{ID: "kling:v1-5-standard-i2v"}, resources); err != nil {
		t.Fatalf("non-seedance model should not require verification: %v", err)
	}
	if err := service.requireImageVerification(&ai.ModelDef{ID: "volcengine:seedance-2-0"}, resources); !errors.Is(err, ai.ErrImageVerificationRequired) {
		t.Fatalf("seedance model error = %v, want ErrImageVerificationRequired", err)
	}
	verified := []domainresource.RawResource{{Type: "image", VerificationStatus: string(ai.ImageVerificationVerified)}}
	if err := service.requireImageVerification(&ai.ModelDef{ID: "volcengine:seedance-2-0"}, verified); err != nil {
		t.Fatalf("verified image should pass seedance verification gate: %v", err)
	}
}
