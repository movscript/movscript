package ai

import "testing"

func TestBuildVolcenChatRequestClampsMaxTokens(t *testing.T) {
	req := buildVolcenChatRequest(TextRequest{
		Model:     "doubao-test",
		MaxTokens: DefaultTextMaxTokens,
		Messages:  []Message{{Role: "user", Content: "hello"}},
	})
	if req.MaxTokens == nil {
		t.Fatalf("MaxTokens = nil, want %d", volcenTextMaxTokensLimit)
	}
	if *req.MaxTokens != volcenTextMaxTokensLimit {
		t.Fatalf("MaxTokens = %d, want %d", *req.MaxTokens, volcenTextMaxTokensLimit)
	}
}
