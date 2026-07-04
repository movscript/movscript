package shotreference

import (
	"context"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type VectorEmbeddingResolver interface {
	EmbedDocuments(ctx context.Context, documents []providercontract.VectorDocument) ([]providercontract.VectorDocument, error)
	EmbedSearch(ctx context.Context, request providercontract.VectorSearchRequest) (providercontract.VectorSearchRequest, error)
}

type AIEmbeddingResolver struct {
	Service        *ai.AIService
	UserID         uint
	Route          ai.ModelRoute
	Usage          ai.UsageContext
	Dimensions     int
	EncodingFormat string
}

func (r AIEmbeddingResolver) EmbedDocuments(ctx context.Context, documents []providercontract.VectorDocument) ([]providercontract.VectorDocument, error) {
	if len(documents) == 0 {
		return documents, nil
	}
	texts := make([]string, 0, len(documents))
	for _, document := range documents {
		texts = append(texts, document.Text)
	}
	resp, err := r.createEmbeddings(ctx, texts)
	if err != nil {
		return nil, err
	}
	byIndex := map[int][]float32{}
	for _, item := range resp.Data {
		if item.Index >= 0 && item.Index < len(documents) {
			byIndex[item.Index] = item.Embedding
		}
	}
	model := firstNonEmptyShotString(resp.Model, r.Route.ProviderModelID)
	out := make([]providercontract.VectorDocument, len(documents))
	copy(out, documents)
	for index := range out {
		embedding, ok := byIndex[index]
		if !ok || len(embedding) == 0 {
			return nil, fmt.Errorf("embedding response missing vector for document index %d", index)
		}
		out[index].Embedding = embedding
		out[index].EmbeddingModel = model
	}
	return out, nil
}

func (r AIEmbeddingResolver) EmbedSearch(ctx context.Context, request providercontract.VectorSearchRequest) (providercontract.VectorSearchRequest, error) {
	if strings.TrimSpace(request.Query) == "" || len(request.Embedding) > 0 {
		return request, nil
	}
	resp, err := r.createEmbeddings(ctx, []string{request.Query})
	if err != nil {
		return providercontract.VectorSearchRequest{}, err
	}
	if len(resp.Data) == 0 || len(resp.Data[0].Embedding) == 0 {
		return providercontract.VectorSearchRequest{}, fmt.Errorf("embedding response missing query vector")
	}
	request.Embedding = resp.Data[0].Embedding
	request.EmbeddingModel = firstNonEmptyShotString(resp.Model, r.Route.ProviderModelID)
	return request, nil
}

func (r AIEmbeddingResolver) createEmbeddings(ctx context.Context, inputs []string) (ai.EmbeddingResponse, error) {
	if r.Service == nil {
		return ai.EmbeddingResponse{}, fmt.Errorf("shot reference embedding resolver requires AI service")
	}
	if strings.TrimSpace(r.Route.ProviderModelID) == "" {
		return ai.EmbeddingResponse{}, fmt.Errorf("shot reference embedding resolver requires provider model id")
	}
	req := ai.EmbeddingRequest{
		Inputs:         inputs,
		Dimensions:     r.embeddingDimensions(),
		EncodingFormat: r.EncodingFormat,
	}
	return r.Service.CallEmbeddingWithRouteUsage(ctx, r.UserID, r.Route, req, r.Usage)
}

func (r AIEmbeddingResolver) embeddingDimensions() int {
	if r.Dimensions > 0 {
		return r.Dimensions
	}
	return localEmbeddingDim
}

func firstNonEmptyShotString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
