package shotreference

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var _ providercontract.VectorIndexProvider = (*QdrantVectorIndexProvider)(nil)
var _ providercontract.HealthChecker = (*QdrantVectorIndexProvider)(nil)

func TestQdrantVectorIndexProviderUpsertEnsuresCollectionAndWritesPayload(t *testing.T) {
	var requests []string
	var sawToken bool
	var upsertBody map[string]any
	provider := NewQdrantVectorIndexProvider("http://qdrant.local", "qdrant-token", "shot_vectors")
	if provider == nil {
		t.Fatal("provider is nil")
	}
	provider.client = &http.Client{Transport: shotRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.RequestURI())
		sawToken = sawToken || r.Header.Get("api-key") == "qdrant-token"
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /collections/shot_vectors":
			return shotJSONResponse(http.StatusNotFound, `{"status":"not found"}`), nil
		case "PUT /collections/shot_vectors":
			return shotJSONResponse(http.StatusOK, `{"result":true}`), nil
		case "PUT /collections/shot_vectors/points?wait=true":
			if err := json.NewDecoder(r.Body).Decode(&upsertBody); err != nil {
				t.Fatalf("decode upsert body: %v", err)
			}
			return shotJSONResponse(http.StatusOK, `{"result":{"operation_id":1}}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
	})}

	err := provider.Upsert(context.Background(), providercontract.VectorDocument{
		ID:        "default:42:zh-CN:combined",
		Namespace: "default",
		SourceID:  "default",
		Locale:    "zh-CN",
		Kind:      "combined",
		Text:      "delayed reveal",
		Metadata:  map[string]any{"mood": "quiet", "reference_id": 42},
	})

	if err != nil {
		t.Fatalf("Upsert returned error: %v", err)
	}
	if !sawToken {
		t.Fatal("expected qdrant api-key header")
	}
	assertShotRequestSequence(t, requests, []string{
		"GET /collections/shot_vectors",
		"PUT /collections/shot_vectors",
		"PUT /collections/shot_vectors/points?wait=true",
	})
	points, _ := upsertBody["points"].([]any)
	if len(points) != 1 {
		t.Fatalf("upsert points = %#v, want one point", upsertBody["points"])
	}
	point, _ := points[0].(map[string]any)
	if point["id"] == "default:42:zh-CN:combined" {
		t.Fatalf("qdrant point id must be UUID-safe, got raw document id")
	}
	vector, _ := point["vector"].([]any)
	if len(vector) != localEmbeddingDim {
		t.Fatalf("vector dimension = %d, want %d", len(vector), localEmbeddingDim)
	}
	payload, _ := point["payload"].(map[string]any)
	if payload["document_id"] != "default:42:zh-CN:combined" || payload["locale"] != "zh-CN" || payload["kind"] != "combined" {
		t.Fatalf("payload = %#v, want document identity", payload)
	}
}

func TestQdrantVectorIndexProviderSearchMapsPayloadToContract(t *testing.T) {
	var searchBody map[string]any
	provider := NewQdrantVectorIndexProvider("http://qdrant.local", "", "shot_vectors")
	if provider == nil {
		t.Fatal("provider is nil")
	}
	provider.client = &http.Client{Transport: shotRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /collections/shot_vectors":
			return shotJSONResponse(http.StatusOK, `{"result":{"points_count":1}}`), nil
		case "POST /collections/shot_vectors/points/search":
			if err := json.NewDecoder(r.Body).Decode(&searchBody); err != nil {
				t.Fatalf("decode search body: %v", err)
			}
			return shotJSONResponse(http.StatusOK, `{"result":[{"score":0.91,"payload":{"document_id":"default:42:zh-CN:combined","namespace":"default","reference_id":42,"source_id":"default","locale":"zh-CN","kind":"combined","text":"delayed reveal","metadata":{"mood":"quiet"}}}]}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
	})}

	results, err := provider.Search(context.Background(), providercontract.VectorSearchRequest{
		Query:     "delayed reveal",
		Locale:    "zh-CN",
		SourceIDs: []string{"default"},
		Filters:   map[string][]string{"mood": {"quiet"}},
		TopK:      3,
	})

	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(results) != 1 || results[0].Document.ID != "default:42:zh-CN:combined" || results[0].Score != 0.91 {
		t.Fatalf("results = %+v, want mapped document", results)
	}
	if searchBody["limit"] != float64(3) {
		t.Fatalf("search limit = %#v, want 3", searchBody["limit"])
	}
	if _, ok := searchBody["filter"].(map[string]any); !ok {
		t.Fatalf("search body missing filter: %#v", searchBody)
	}
}

func TestQdrantVectorIndexProviderUsesExplicitEmbeddings(t *testing.T) {
	var upsertBody map[string]any
	var searchBody map[string]any
	provider := NewQdrantVectorIndexProvider("http://qdrant.local", "", "shot_vectors")
	if provider == nil {
		t.Fatal("provider is nil")
	}
	provider.client = &http.Client{Transport: shotRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /collections/shot_vectors":
			return shotJSONResponse(http.StatusOK, `{"result":{"points_count":1}}`), nil
		case "PUT /collections/shot_vectors/points?wait=true":
			if err := json.NewDecoder(r.Body).Decode(&upsertBody); err != nil {
				t.Fatalf("decode upsert body: %v", err)
			}
			return shotJSONResponse(http.StatusOK, `{"result":{"operation_id":1}}`), nil
		case "POST /collections/shot_vectors/points/search":
			if err := json.NewDecoder(r.Body).Decode(&searchBody); err != nil {
				t.Fatalf("decode search body: %v", err)
			}
			return shotJSONResponse(http.StatusOK, `{"result":[]}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
	})}

	if err := provider.Upsert(context.Background(), providercontract.VectorDocument{
		ID:        "doc-explicit",
		Text:      "ignored text",
		Embedding: []float32{0.25, 0.5, 0.75},
	}); err != nil {
		t.Fatalf("Upsert returned error: %v", err)
	}
	if _, err := provider.Search(context.Background(), providercontract.VectorSearchRequest{
		Query:     "ignored query",
		Embedding: []float32{0.125, 0.625},
	}); err != nil {
		t.Fatalf("Search returned error: %v", err)
	}

	points, _ := upsertBody["points"].([]any)
	point, _ := points[0].(map[string]any)
	upsertVector, _ := point["vector"].([]any)
	if len(upsertVector) != 3 || upsertVector[0] != 0.25 || upsertVector[2] != 0.75 {
		t.Fatalf("upsert vector = %#v, want explicit embedding", point["vector"])
	}
	searchVector, _ := searchBody["vector"].([]any)
	if len(searchVector) != 2 || searchVector[0] != 0.125 || searchVector[1] != 0.625 {
		t.Fatalf("search vector = %#v, want explicit embedding", searchBody["vector"])
	}
}

func TestQdrantVectorIndexProviderDeleteByReferenceUsesFilter(t *testing.T) {
	var deleteBody map[string]any
	provider := NewQdrantVectorIndexProvider("http://qdrant.local", "", "shot_vectors")
	if provider == nil {
		t.Fatal("provider is nil")
	}
	provider.client = &http.Client{Transport: shotRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /collections/shot_vectors":
			return shotJSONResponse(http.StatusOK, `{"result":{"points_count":1}}`), nil
		case "POST /collections/shot_vectors/points/delete?wait=true":
			if err := json.NewDecoder(r.Body).Decode(&deleteBody); err != nil {
				t.Fatalf("decode delete body: %v", err)
			}
			return shotJSONResponse(http.StatusOK, `{"result":{"operation_id":1}}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
	})}

	if err := provider.Delete(context.Background(), providercontract.VectorDocumentRef{ReferenceID: 42}); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	filter, _ := deleteBody["filter"].(map[string]any)
	must, _ := filter["must"].([]any)
	if len(must) != 1 {
		t.Fatalf("delete filter = %#v, want one must condition", deleteBody)
	}
	condition, _ := must[0].(map[string]any)
	if condition["key"] != "reference_id" {
		t.Fatalf("delete condition = %#v, want reference_id", condition)
	}
}

func TestQdrantVectorIndexProviderHealthEnsuresCollection(t *testing.T) {
	provider := NewQdrantVectorIndexProvider("http://qdrant.local", "", "shot_vectors")
	if provider == nil {
		t.Fatal("provider is nil")
	}
	provider.client = &http.Client{Transport: shotRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		return shotJSONResponse(http.StatusOK, `{"result":{"points_count":7}}`), nil
	})}

	health := provider.Health(context.Background())

	if health.Status != providercontract.HealthStatusOK {
		t.Fatalf("health = %+v, want ok", health)
	}
	if !strings.Contains(health.Message, "reachable") {
		t.Fatalf("health message = %q, want reachable", health.Message)
	}
}

func shotJSONResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func assertShotRequestSequence(t *testing.T, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("requests = %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("requests = %#v, want %#v", got, want)
		}
	}
}

type shotRoundTripFunc func(*http.Request) (*http.Response, error)

func (f shotRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
