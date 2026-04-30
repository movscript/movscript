package scriptanalysis

import (
	"context"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
)

type TextCaller interface {
	CallText(ctx context.Context, userID, modelConfigID uint, req ai.TextRequest) (ai.TextResponse, error)
}

type TextStreamCaller interface {
	TextCaller
	CallTextStream(ctx context.Context, userID, modelConfigID uint, req ai.TextRequest) (<-chan ai.TextStreamEvent, error)
}

type Analyzer struct {
	caller TextCaller
}

type Result struct {
	Payload      map[string]interface{}
	Prompt       string
	RawResponse  string
	PartialCount int
}

type StreamEvent struct {
	Kind  string
	Delta string
	Label string
}

func NewAnalyzer(caller TextCaller) *Analyzer {
	return &Analyzer{caller: caller}
}

type Request struct {
	UserID        uint
	ModelConfigID uint
	Script        model.Script
	Content       string
}
