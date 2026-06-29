package ai

import "testing"

func TestEffectiveRouteBaseURL(t *testing.T) {
	tests := []struct {
		name            string
		providerBaseURL string
		config          routeEndpointConfig
		want            string
	}{
		{
			name:            "replace provider path for yunwu alibaba dashscope route",
			providerBaseURL: "https://yunwu.ai/v1",
			config: routeEndpointConfig{
				PathPrefix: "/alibailian/api/v1",
				Mode:       RouteEndpointModeReplacePath,
			},
			want: "https://yunwu.ai/alibailian/api/v1",
		},
		{
			name:            "replace route base path without duplicating v1",
			providerBaseURL: "https://api.example.test/openai/v1",
			config: routeEndpointConfig{
				BaseURL:    "https://api.example.test/v1",
				PathPrefix: "v1",
				Mode:       RouteEndpointModeReplacePath,
			},
			want: "https://api.example.test/v1",
		},
		{
			name:            "append inherited path prefix once",
			providerBaseURL: "https://router.example.test",
			config: routeEndpointConfig{
				PathPrefix: "/api/v1",
			},
			want: "https://router.example.test/api/v1",
		},
		{
			name:            "avoid appending duplicate inherited path prefix",
			providerBaseURL: "https://router.example.test/api/v1",
			config: routeEndpointConfig{
				PathPrefix: "/api/v1",
			},
			want: "https://router.example.test/api/v1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := effectiveRouteBaseURL(tt.providerBaseURL, tt.config); got != tt.want {
				t.Fatalf("effectiveRouteBaseURL() = %q, want %q", got, tt.want)
			}
		})
	}
}
