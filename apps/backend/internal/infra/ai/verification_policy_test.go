package ai

import "testing"

func TestModelDefRequiresImageVerificationOnlyForSeedance(t *testing.T) {
	tests := []struct {
		name string
		def  *ModelDef
		want bool
	}{
		{name: "seedance preset", def: &ModelDef{ID: "volcengine:seedance-2-0"}, want: true},
		{name: "seedance api model id", def: &ModelDef{ID: "doubao-seedance-1-5-pro-251215"}, want: true},
		{name: "kling i2v", def: &ModelDef{ID: "kling:v1-5-standard-i2v"}, want: false},
		{name: "grok video", def: &ModelDef{ID: "xai:grok-imagine-video"}, want: false},
		{name: "nil", def: nil, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.def.RequiresImageVerification(); got != tt.want {
				t.Fatalf("RequiresImageVerification() = %v, want %v", got, tt.want)
			}
		})
	}
}
