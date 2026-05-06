package chat

import (
	"context"

	"github.com/movscript/movscript/internal/infra/ai"
)

type Service struct {
	ai *ai.AIService
}

func NewService(aiService *ai.AIService) *Service {
	return &Service{ai: aiService}
}

type Message struct {
	Role    string
	Content string
}

type Input struct {
	UserID        uint
	OrgID         *uint
	ModelConfigID uint
	Messages      []Message
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type Response struct {
	Content string `json:"content"`
	Usage   Usage  `json:"usage"`
}

func (s *Service) Chat(ctx context.Context, input Input) (Response, error) {
	msgs := make([]ai.Message, len(input.Messages))
	for i, m := range input.Messages {
		msgs[i] = ai.Message{Role: m.Role, Content: m.Content}
	}
	resp, err := s.ai.CallTextWithBilling(ctx, input.UserID, input.ModelConfigID, ai.TextRequest{
		PromptName:  ai.FeatureBrainstorm,
		Messages:    msgs,
		Temperature: -1,
	}, ai.BillingContext{OrgID: input.OrgID})
	if err != nil {
		return Response{}, err
	}
	return Response{
		Content: resp.Content,
		Usage: Usage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
		},
	}, nil
}
