package canvas

import (
	"testing"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
)

// 真人认证当前留空：所有模型都不触发，等后续按白名单具体填入。
func TestRequireImageVerificationDisabled(t *testing.T) {
	service := &Service{}
	resources := []domainresource.RawResource{{Type: "image"}}

	cases := []string{
		"kling:v1-5-standard-i2v",
		"volcengine:seedance-2-0",
		"doubao-seedance-1-5-pro-251215",
	}
	for _, id := range cases {
		if err := service.requireImageVerification(&ai.ModelDef{ID: id}, resources); err != nil {
			t.Fatalf("%s should not require verification while gate is empty: %v", id, err)
		}
	}
}
