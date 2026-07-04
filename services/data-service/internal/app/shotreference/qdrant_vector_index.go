package shotreference

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type QdrantVectorIndexProvider struct {
	baseURL    string
	token      string
	collection string
	client     *http.Client
}

func NewQdrantVectorIndexProvider(baseURL string, token string, collection string) *QdrantVectorIndexProvider {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	collection = strings.TrimSpace(collection)
	if collection == "" {
		collection = "movscript_shot_vectors"
	}
	if baseURL == "" {
		return nil
	}
	return &QdrantVectorIndexProvider{
		baseURL:    baseURL,
		token:      token,
		collection: collection,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *QdrantVectorIndexProvider) Upsert(ctx context.Context, document providercontract.VectorDocument) error {
	if p == nil {
		return errors.New("qdrant vector index provider is not configured")
	}
	if strings.TrimSpace(document.ID) == "" {
		return errors.New("vector document id is required")
	}
	if err := p.ensureCollection(ctx); err != nil {
		return err
	}
	vector, err := qdrantVector(document.Text, document.Embedding)
	if err != nil {
		return err
	}
	payload := qdrantPayloadFromDocument(document)
	body := map[string]any{
		"points": []map[string]any{
			{
				"id":      qdrantPointID(document.ID),
				"vector":  vector,
				"payload": payload,
			},
		},
	}
	return p.doJSON(ctx, http.MethodPut, "/collections/"+url.PathEscape(p.collection)+"/points?wait=true", body, nil)
}

func (p *QdrantVectorIndexProvider) Delete(ctx context.Context, ref providercontract.VectorDocumentRef) error {
	if p == nil {
		return errors.New("qdrant vector index provider is not configured")
	}
	if ref.ID == "" && ref.ReferenceID == 0 && ref.SourceID == "" && ref.Namespace == "" {
		return errors.New("vector document ref requires id, reference_id, source_id, or namespace")
	}
	if err := p.ensureCollection(ctx); err != nil {
		return err
	}
	var selector any
	if ref.ID != "" {
		selector = map[string]any{"points": []string{qdrantPointID(ref.ID)}}
	} else {
		selector = map[string]any{"filter": qdrantFilterFromRef(ref)}
	}
	return p.doJSON(ctx, http.MethodPost, "/collections/"+url.PathEscape(p.collection)+"/points/delete?wait=true", selector, nil)
}

func (p *QdrantVectorIndexProvider) Search(ctx context.Context, request providercontract.VectorSearchRequest) ([]providercontract.VectorSearchResult, error) {
	if p == nil {
		return nil, errors.New("qdrant vector index provider is not configured")
	}
	if err := p.ensureCollection(ctx); err != nil {
		return nil, err
	}
	limit := request.TopK
	if limit <= 0 {
		limit = 20
	}
	vector, err := qdrantVector(request.Query, request.Embedding)
	if err != nil {
		return nil, err
	}
	body := map[string]any{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}
	if filter := qdrantFilterFromSearch(request); len(filter.Must) > 0 {
		body["filter"] = filter
	}
	var out qdrantSearchResponse
	if err := p.doJSON(ctx, http.MethodPost, "/collections/"+url.PathEscape(p.collection)+"/points/search", body, &out); err != nil {
		return nil, err
	}
	results := make([]providercontract.VectorSearchResult, 0, len(out.Result))
	for _, item := range out.Result {
		document, err := item.Payload.document()
		if err != nil {
			return nil, err
		}
		results = append(results, providercontract.VectorSearchResult{Document: document, Score: item.Score})
	}
	return results, nil
}

func (p *QdrantVectorIndexProvider) Stats(ctx context.Context) (providercontract.VectorIndexStats, error) {
	if p == nil {
		return providercontract.VectorIndexStats{}, errors.New("qdrant vector index provider is not configured")
	}
	var out qdrantCollectionResponse
	if err := p.doJSON(ctx, http.MethodGet, "/collections/"+url.PathEscape(p.collection), nil, &out); err != nil {
		return providercontract.VectorIndexStats{}, err
	}
	return providercontract.VectorIndexStats{Documents: out.Result.PointsCount}, nil
}

func (p *QdrantVectorIndexProvider) Rebuild(ctx context.Context, request providercontract.VectorRebuildRequest) (providercontract.VectorRebuildResult, error) {
	if p == nil {
		return providercontract.VectorRebuildResult{}, errors.New("qdrant vector index provider is not configured")
	}
	if request.Reset {
		err := p.doJSON(ctx, http.MethodDelete, "/collections/"+url.PathEscape(p.collection), nil, nil)
		if qdrantIsNotFound(err) {
			return providercontract.VectorRebuildResult{Accepted: true}, nil
		}
		return providercontract.VectorRebuildResult{Accepted: err == nil}, err
	}
	return providercontract.VectorRebuildResult{}, errors.New("qdrant rebuild without reset must be driven by the indexing service")
}

func (p *QdrantVectorIndexProvider) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeVectorIndex,
		Adapter:      providercontract.AdapterQdrant,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Message:      "qdrant collection is reachable",
		Capabilities: []string{"vector.upsert", "vector.search", "vector.delete", "vector.stats", "vector.rebuild", "health.probe"},
	}
	if p == nil || strings.TrimSpace(p.baseURL) == "" {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "qdrant base URL is required"
		return health
	}
	if err := p.ensureCollection(ctx); err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
	}
	return health
}

func (p *QdrantVectorIndexProvider) ensureCollection(ctx context.Context) error {
	var out qdrantCollectionResponse
	err := p.doJSON(ctx, http.MethodGet, "/collections/"+url.PathEscape(p.collection), nil, &out)
	if err == nil {
		return nil
	}
	if !qdrantIsNotFound(err) {
		return err
	}
	body := map[string]any{
		"vectors": map[string]any{
			"size":     localEmbeddingDim,
			"distance": "Cosine",
		},
	}
	return p.doJSON(ctx, http.MethodPut, "/collections/"+url.PathEscape(p.collection), body, nil)
}

func (p *QdrantVectorIndexProvider) doJSON(ctx context.Context, method string, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(p.baseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if p.token != "" {
		req.Header.Set("api-key", p.token)
	}
	client := p.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return qdrantHTTPError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode qdrant response: %w", err)
	}
	return nil
}

func qdrantPointID(documentID string) string {
	sum := sha1.Sum([]byte(documentID))
	hexed := hex.EncodeToString(sum[:16])
	return hexed[0:8] + "-" + hexed[8:12] + "-" + hexed[12:16] + "-" + hexed[16:20] + "-" + hexed[20:32]
}

func qdrantVector(text string, embedding []float32) ([]float64, error) {
	return vectorEmbedding(text, embedding)
}

func qdrantPayloadFromDocument(document providercontract.VectorDocument) qdrantPayload {
	return qdrantPayload{
		DocumentID:     document.ID,
		Namespace:      document.Namespace,
		ReferenceID:    vectorMetadataReferenceID(document.Metadata),
		SourceID:       document.SourceID,
		Locale:         document.Locale,
		Kind:           document.Kind,
		Text:           document.Text,
		Metadata:       document.Metadata,
		EmbeddingModel: vectorEmbeddingModel(document.EmbeddingModel, document.Embedding),
	}
}

func qdrantFilterFromSearch(request providercontract.VectorSearchRequest) qdrantFilter {
	filter := qdrantFilter{
		Must: []qdrantCondition{qdrantMatchCondition("embedding_model", vectorSearchEmbeddingModel(request.EmbeddingModel, request.Embedding))},
	}
	if strings.TrimSpace(request.Locale) != "" {
		filter.Must = append(filter.Must, qdrantMatchCondition("locale", request.Locale))
	}
	if len(request.SourceIDs) > 0 {
		filter.Must = append(filter.Must, qdrantAnyCondition("source_id", request.SourceIDs))
	}
	for key, values := range request.Filters {
		key = strings.TrimSpace(key)
		if key == "" || len(values) == 0 {
			continue
		}
		filter.Must = append(filter.Must, qdrantAnyCondition("metadata."+key, values))
	}
	return filter
}

func qdrantFilterFromRef(ref providercontract.VectorDocumentRef) qdrantFilter {
	switch {
	case ref.ReferenceID > 0:
		return qdrantFilter{Must: []qdrantCondition{qdrantMatchCondition("reference_id", ref.ReferenceID)}}
	case ref.SourceID != "":
		return qdrantFilter{Must: []qdrantCondition{qdrantMatchCondition("source_id", ref.SourceID)}}
	default:
		return qdrantFilter{Must: []qdrantCondition{qdrantMatchCondition("namespace", ref.Namespace)}}
	}
}

func qdrantMatchCondition(key string, value any) qdrantCondition {
	return qdrantCondition{Key: key, Match: map[string]any{"value": value}}
}

func qdrantAnyCondition(key string, values []string) qdrantCondition {
	return qdrantCondition{Key: key, Match: map[string]any{"any": values}}
}

type qdrantFilter struct {
	Must []qdrantCondition `json:"must,omitempty"`
}

type qdrantCondition struct {
	Key   string         `json:"key"`
	Match map[string]any `json:"match"`
}

type qdrantSearchResponse struct {
	Result []struct {
		Score   float64       `json:"score"`
		Payload qdrantPayload `json:"payload"`
	} `json:"result"`
}

type qdrantCollectionResponse struct {
	Result struct {
		PointsCount int64 `json:"points_count"`
	} `json:"result"`
}

type qdrantPayload struct {
	DocumentID     string         `json:"document_id"`
	Namespace      string         `json:"namespace,omitempty"`
	ReferenceID    uint           `json:"reference_id,omitempty"`
	SourceID       string         `json:"source_id,omitempty"`
	Locale         string         `json:"locale,omitempty"`
	Kind           string         `json:"kind,omitempty"`
	Text           string         `json:"text,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	EmbeddingModel string         `json:"embedding_model,omitempty"`
}

func (p qdrantPayload) document() (providercontract.VectorDocument, error) {
	if strings.TrimSpace(p.DocumentID) == "" {
		return providercontract.VectorDocument{}, errors.New("qdrant payload is missing document_id")
	}
	return providercontract.VectorDocument{
		ID:        p.DocumentID,
		Namespace: p.Namespace,
		SourceID:  p.SourceID,
		Locale:    p.Locale,
		Kind:      p.Kind,
		Text:      p.Text,
		Metadata:  p.Metadata,
	}, nil
}

type qdrantHTTPError struct {
	StatusCode int
	Body       string
}

func (e qdrantHTTPError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("qdrant request failed with status %d", e.StatusCode)
	}
	return fmt.Sprintf("qdrant request failed with status %d: %s", e.StatusCode, e.Body)
}

func qdrantIsNotFound(err error) bool {
	httpErr, ok := err.(qdrantHTTPError)
	return ok && httpErr.StatusCode == http.StatusNotFound
}
