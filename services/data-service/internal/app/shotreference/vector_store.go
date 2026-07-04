package shotreference

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"sort"
	"strings"
	"time"
	"unicode"

	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	"github.com/movscript/movscript/internal/infra/observability"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type LocalVectorStore struct {
	db *gorm.DB
}

const (
	localEmbeddingModel    = "movscript-local-hash-v1"
	externalEmbeddingModel = "external-embedding"
	localEmbeddingDim      = 384
)

type VectorStoreStats struct {
	Documents           int64            `json:"documents"`
	EmbeddedDocuments   int64            `json:"embedded_documents"`
	References          int64            `json:"references"`
	SourceReferences    int64            `json:"source_references"`
	UnindexedReferences int64            `json:"unindexed_references"`
	OrphanReferences    int64            `json:"orphan_references"`
	IndexCoverage       float64          `json:"index_coverage"`
	ByKind              map[string]int64 `json:"by_kind"`
	ByLocale            map[string]int64 `json:"by_locale"`
	ByEmbeddingModel    map[string]int64 `json:"by_embedding_model"`
	LastUpdatedAt       string           `json:"last_updated_at,omitempty"`
}

func NewLocalVectorStore(db *gorm.DB) *LocalVectorStore {
	return &LocalVectorStore{db: db}
}

type LocalVectorIndexProvider struct {
	store *LocalVectorStore
}

func NewLocalVectorIndexProvider(db *gorm.DB) *LocalVectorIndexProvider {
	return &LocalVectorIndexProvider{store: NewLocalVectorStore(db)}
}

func (p *LocalVectorIndexProvider) Upsert(ctx context.Context, document providercontract.VectorDocument) error {
	return p.store.UpsertProvider(ctx, document)
}

func (p *LocalVectorIndexProvider) Delete(ctx context.Context, ref providercontract.VectorDocumentRef) error {
	if ref.ID == "" && ref.ReferenceID == 0 && ref.SourceID == "" && ref.Namespace == "" {
		return errors.New("vector document ref requires id, reference_id, source_id, or namespace")
	}
	start := time.Now()
	q := p.store.db.WithContext(ctx).Unscoped()
	switch {
	case ref.ID != "":
		q = q.Where("document_id = ?", ref.ID)
	case ref.ReferenceID > 0:
		q = q.Where("reference_id = ?", ref.ReferenceID)
	case ref.SourceID != "":
		q = q.Where("source_id = ?", ref.SourceID)
	default:
		q = q.Where("source_id = ?", ref.Namespace)
	}
	result := q.Delete(&persistencemodel.ShotVectorDocument{})
	err := result.Error
	recordVectorStoreOperation("delete", start, int(result.RowsAffected), err)
	return err
}

func (p *LocalVectorIndexProvider) Search(ctx context.Context, request providercontract.VectorSearchRequest) ([]providercontract.VectorSearchResult, error) {
	results, err := p.store.SearchProvider(ctx, request)
	if err != nil {
		return nil, err
	}
	out := make([]providercontract.VectorSearchResult, 0, len(results))
	for _, result := range results {
		out = append(out, providercontract.VectorSearchResult{
			Document: vectorDocumentToProviderContract(result.Document),
			Score:    result.Score,
		})
	}
	return out, nil
}

func (p *LocalVectorIndexProvider) Stats(ctx context.Context) (providercontract.VectorIndexStats, error) {
	stats, err := p.store.Stats(ctx)
	if err != nil {
		return providercontract.VectorIndexStats{}, err
	}
	return providercontract.VectorIndexStats{
		Documents:          stats.Documents,
		Namespaces:         stats.ByLocale,
		EmbeddingModels:    stats.ByEmbeddingModel,
		LastIndexedUnixSec: vectorStatsLastIndexedUnix(stats.LastUpdatedAt),
	}, nil
}

func (p *LocalVectorIndexProvider) LocalStats(ctx context.Context) (VectorStoreStats, error) {
	return p.store.Stats(ctx)
}

func (p *LocalVectorIndexProvider) ReferenceIDs(ctx context.Context) ([]uint, error) {
	return p.store.ReferenceIDs(ctx)
}

func (p *LocalVectorIndexProvider) Rebuild(ctx context.Context, request providercontract.VectorRebuildRequest) (providercontract.VectorRebuildResult, error) {
	if request.Reset {
		if err := p.store.DeleteAll(ctx); err != nil {
			return providercontract.VectorRebuildResult{}, err
		}
		return providercontract.VectorRebuildResult{Accepted: true}, nil
	}
	if err := p.store.Reindex(ctx, domainshotreference.VectorReindexScope{SourceIDs: request.SourceIDs}); err != nil {
		return providercontract.VectorRebuildResult{}, err
	}
	return providercontract.VectorRebuildResult{Accepted: true}, nil
}

func (s *LocalVectorStore) Upsert(ctx context.Context, document domainshotreference.VectorDocument) error {
	return s.UpsertProvider(ctx, vectorDocumentToProviderContract(document))
}

func (s *LocalVectorStore) UpsertProvider(ctx context.Context, document providercontract.VectorDocument) error {
	start := time.Now()
	metadata, err := json.Marshal(document.Metadata)
	if err != nil {
		recordVectorStoreOperation("upsert", start, 0, err)
		return err
	}
	embedding, err := vectorEmbedding(document.Text, document.Embedding)
	if err != nil {
		recordVectorStoreOperation("upsert", start, 0, err)
		return err
	}
	embeddingJSON, err := json.Marshal(embedding)
	if err != nil {
		recordVectorStoreOperation("upsert", start, 0, err)
		return err
	}
	row := persistencemodel.ShotVectorDocument{
		DocumentID:     document.ID,
		SourceID:       document.SourceID,
		Locale:         document.Locale,
		Kind:           string(document.Kind),
		Text:           document.Text,
		Metadata:       string(metadata),
		ReferenceID:    vectorMetadataReferenceID(document.Metadata),
		EmbeddingModel: vectorEmbeddingModel(document.EmbeddingModel, document.Embedding),
		EmbeddingDim:   len(embedding),
		Embedding:      string(embeddingJSON),
	}
	err = s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "document_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"reference_id",
			"source_id",
			"locale",
			"kind",
			"text",
			"metadata",
			"embedding_model",
			"embedding_dim",
			"embedding",
			"updated_at",
		}),
	}).Create(&row).Error
	recordVectorStoreOperation("upsert", start, 1, err)
	return err
}

func (s *LocalVectorStore) Search(ctx context.Context, request domainshotreference.VectorSearchRequest) ([]domainshotreference.VectorSearchResult, error) {
	return s.SearchProvider(ctx, providercontract.VectorSearchRequest{
		Query:     request.Query,
		Locale:    request.Locale,
		SourceIDs: request.SourceIDs,
		Filters:   request.Filters,
		TopK:      request.TopK,
	})
}

func (s *LocalVectorStore) SearchProvider(ctx context.Context, request providercontract.VectorSearchRequest) ([]domainshotreference.VectorSearchResult, error) {
	start := time.Now()
	q := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{})
	if len(request.SourceIDs) > 0 {
		q = q.Where("source_id IN ?", request.SourceIDs)
	}
	if request.Locale != "" {
		q = q.Where("locale = ?", request.Locale)
	}
	rows := []persistencemodel.ShotVectorDocument{}
	if err := q.Find(&rows).Error; err != nil {
		recordVectorStoreOperation("search", start, 0, err)
		return nil, err
	}
	results := []domainshotreference.VectorSearchResult{}
	terms := vectorSearchTerms(request.Query)
	queryEmbedding, err := vectorEmbedding(request.Query, request.Embedding)
	if err != nil {
		recordVectorStoreOperation("search", start, len(results), err)
		return nil, err
	}
	queryModel := vectorSearchEmbeddingModel(request.EmbeddingModel, request.Embedding)
	for _, row := range rows {
		if !vectorEmbeddingModelMatches(row.EmbeddingModel, queryModel) {
			continue
		}
		document, err := vectorDocumentFromModel(row)
		if err != nil {
			recordVectorStoreOperation("search", start, len(results), err)
			return nil, err
		}
		if !vectorDocumentMatchesFilters(document, request.Filters) {
			continue
		}
		embedding, err := vectorEmbeddingFromModel(row)
		if err != nil {
			recordVectorStoreOperation("search", start, len(results), err)
			return nil, err
		}
		score := scoreVectorDocument(document, terms, queryEmbedding, embedding)
		if strings.TrimSpace(request.Query) != "" && score <= 0 {
			continue
		}
		results = append(results, domainshotreference.VectorSearchResult{
			Document: document,
			Score:    score,
		})
	}
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Score == results[j].Score {
			return results[i].Document.ID < results[j].Document.ID
		}
		return results[i].Score > results[j].Score
	})
	if request.TopK > 0 && len(results) > request.TopK {
		results = results[:request.TopK]
	}
	recordVectorStoreOperation("search", start, len(results), nil)
	return results, nil
}

func (s *LocalVectorStore) DeleteByReference(ctx context.Context, referenceID uint) error {
	start := time.Now()
	result := s.db.WithContext(ctx).
		Unscoped().
		Where("reference_id = ?", referenceID).
		Delete(&persistencemodel.ShotVectorDocument{})
	err := result.Error
	recordVectorStoreOperation("delete_by_reference", start, int(result.RowsAffected), err)
	return err
}

func (s *LocalVectorStore) DeleteAll(ctx context.Context) error {
	start := time.Now()
	result := s.db.WithContext(ctx).
		Unscoped().
		Where("1 = 1").
		Delete(&persistencemodel.ShotVectorDocument{})
	err := result.Error
	recordVectorStoreOperation("delete_all", start, int(result.RowsAffected), err)
	return err
}

func (s *LocalVectorStore) Reindex(ctx context.Context, scope domainshotreference.VectorReindexScope) error {
	start := time.Now()
	q := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{})
	if len(scope.ReferenceIDs) > 0 {
		q = q.Where("reference_id IN ?", scope.ReferenceIDs)
	}
	if len(scope.SourceIDs) > 0 {
		q = q.Where("source_id IN ?", scope.SourceIDs)
	}
	err := q.Count(new(int64)).Error
	recordVectorStoreOperation("reindex", start, 0, err)
	return err
}

func (s *LocalVectorStore) ReferenceIDs(ctx context.Context) ([]uint, error) {
	var ids []uint
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Distinct("reference_id").Pluck("reference_id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *LocalVectorStore) Stats(ctx context.Context) (VectorStoreStats, error) {
	stats := VectorStoreStats{
		ByKind:           map[string]int64{},
		ByLocale:         map[string]int64{},
		ByEmbeddingModel: map[string]int64{},
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Count(&stats.Documents).Error; err != nil {
		return stats, err
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Where("embedding_dim > 0 AND embedding <> '' AND embedding <> '[]'").Count(&stats.EmbeddedDocuments).Error; err != nil {
		return stats, err
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Distinct("reference_id").Count(&stats.References).Error; err != nil {
		return stats, err
	}
	var kindRows []struct {
		Kind  string
		Count int64
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Select("kind, count(*) as count").Group("kind").Scan(&kindRows).Error; err != nil {
		return stats, err
	}
	for _, row := range kindRows {
		stats.ByKind[row.Kind] = row.Count
	}
	var localeRows []struct {
		Locale string
		Count  int64
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Select("locale, count(*) as count").Group("locale").Scan(&localeRows).Error; err != nil {
		return stats, err
	}
	for _, row := range localeRows {
		stats.ByLocale[row.Locale] = row.Count
	}
	var embeddingRows []struct {
		EmbeddingModel string
		Count          int64
	}
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ShotVectorDocument{}).Select("embedding_model, count(*) as count").Group("embedding_model").Scan(&embeddingRows).Error; err != nil {
		return stats, err
	}
	for _, row := range embeddingRows {
		if strings.TrimSpace(row.EmbeddingModel) == "" {
			stats.ByEmbeddingModel["missing"] = row.Count
		} else {
			stats.ByEmbeddingModel[row.EmbeddingModel] = row.Count
		}
	}
	var latest persistencemodel.ShotVectorDocument
	if err := s.db.WithContext(ctx).Order("updated_at desc").First(&latest).Error; err == nil {
		stats.LastUpdatedAt = latest.UpdatedAt.Format(time.RFC3339Nano)
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return stats, err
	}
	return stats, nil
}

func vectorEmbeddingFromModel(row persistencemodel.ShotVectorDocument) ([]float64, error) {
	if strings.TrimSpace(row.Embedding) == "" || strings.TrimSpace(row.Embedding) == "[]" {
		return embedVectorText(row.Text), nil
	}
	var embedding []float64
	if err := json.Unmarshal([]byte(row.Embedding), &embedding); err != nil {
		return nil, err
	}
	if len(embedding) == 0 {
		return embedVectorText(row.Text), nil
	}
	if row.EmbeddingDim > 0 && len(embedding) != row.EmbeddingDim {
		return nil, fmt.Errorf("stored vector dimension = %d, want metadata dimension %d", len(embedding), row.EmbeddingDim)
	}
	return embedding, nil
}

func vectorDocumentFromModel(row persistencemodel.ShotVectorDocument) (domainshotreference.VectorDocument, error) {
	metadata := map[string]interface{}{}
	if strings.TrimSpace(row.Metadata) != "" {
		if err := json.Unmarshal([]byte(row.Metadata), &metadata); err != nil {
			return domainshotreference.VectorDocument{}, err
		}
	}
	return domainshotreference.VectorDocument{
		ID:          row.DocumentID,
		ReferenceID: row.ReferenceID,
		SourceID:    row.SourceID,
		Locale:      row.Locale,
		Kind:        domainshotreference.VectorDocumentKind(row.Kind),
		Text:        row.Text,
		Metadata:    metadata,
	}, nil
}

func vectorDocumentFromProviderContract(document providercontract.VectorDocument) domainshotreference.VectorDocument {
	return domainshotreference.VectorDocument{
		ID:          document.ID,
		ReferenceID: vectorMetadataReferenceID(document.Metadata),
		SourceID:    firstNonEmpty(document.SourceID, document.Namespace),
		Locale:      document.Locale,
		Kind:        domainshotreference.VectorDocumentKind(document.Kind),
		Text:        document.Text,
		Metadata:    document.Metadata,
	}
}

func vectorDocumentToProviderContract(document domainshotreference.VectorDocument) providercontract.VectorDocument {
	metadata := map[string]any{}
	for key, value := range document.Metadata {
		metadata[key] = value
	}
	metadata["reference_id"] = document.ReferenceID
	return providercontract.VectorDocument{
		ID:        document.ID,
		Namespace: document.SourceID,
		SourceID:  document.SourceID,
		Locale:    document.Locale,
		Kind:      string(document.Kind),
		Text:      document.Text,
		Metadata:  metadata,
	}
}

func vectorEmbedding(text string, embedding []float32) ([]float64, error) {
	if len(embedding) == 0 {
		return embedVectorText(text), nil
	}
	if len(embedding) != localEmbeddingDim {
		return nil, fmt.Errorf("vector embedding dimension = %d, want %d", len(embedding), localEmbeddingDim)
	}
	vector := make([]float64, len(embedding))
	for index, value := range embedding {
		vector[index] = float64(value)
	}
	return vector, nil
}

func vectorEmbeddingModel(model string, embedding []float32) string {
	model = strings.TrimSpace(model)
	if model != "" {
		return model
	}
	if len(embedding) > 0 {
		return externalEmbeddingModel
	}
	return localEmbeddingModel
}

func vectorSearchEmbeddingModel(model string, embedding []float32) string {
	return vectorEmbeddingModel(model, embedding)
}

func vectorEmbeddingModelMatches(stored string, query string) bool {
	stored = strings.TrimSpace(stored)
	if stored == "" {
		stored = localEmbeddingModel
	}
	query = strings.TrimSpace(query)
	if query == "" {
		query = localEmbeddingModel
	}
	return stored == query
}

func vectorMetadataReferenceID(metadata map[string]any) uint {
	switch value := metadata["reference_id"].(type) {
	case uint:
		return value
	case int:
		if value > 0 {
			return uint(value)
		}
	case int64:
		if value > 0 {
			return uint(value)
		}
	case float64:
		if value > 0 {
			return uint(value)
		}
	case json.Number:
		parsed, _ := value.Int64()
		if parsed > 0 {
			return uint(parsed)
		}
	}
	return 0
}

func vectorStatsLastIndexedUnix(value string) int64 {
	if strings.TrimSpace(value) == "" {
		return 0
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return 0
	}
	return parsed.Unix()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func vectorSearchTerms(query string) []string {
	clean := normalizeVectorText(query)
	terms := []string{}
	for _, term := range strings.Fields(clean) {
		if usefulSearchTerm(term) && !stringSliceContains(terms, term) {
			terms = append(terms, term)
		}
	}
	return terms
}

func scoreVectorDocument(document domainshotreference.VectorDocument, terms []string, queryEmbedding []float64, documentEmbedding []float64) float64 {
	vectorScore := cosineSimilarity(queryEmbedding, documentEmbedding)
	text := normalizeVectorText(document.Text)
	keywordScore := 0.0
	for _, term := range terms {
		if strings.Contains(text, term) {
			keywordScore += 1
		}
	}
	score := vectorScore
	if keywordScore > 0 {
		score += math.Log1p(keywordScore) * 0.08
	}
	switch document.Kind {
	case domainshotreference.VectorDocumentCombined:
		score *= 1.15
	case domainshotreference.VectorDocumentTags:
		score *= 1.1
	case domainshotreference.VectorDocumentNarrative:
		score *= 1.05
	}
	return score
}

func embedVectorText(text string) []float64 {
	vector := make([]float64, localEmbeddingDim)
	features := vectorEmbeddingFeatures(text)
	if len(features) == 0 {
		return vector
	}
	for _, feature := range features {
		hash := hashVectorFeature(feature)
		index := int(hash % uint64(localEmbeddingDim))
		weight := 1.0
		if (hash>>63)&1 == 1 {
			weight = -1
		}
		vector[index] += weight
	}
	normalizeVector(vector)
	return vector
}

func vectorEmbeddingFeatures(text string) []string {
	clean := normalizeVectorText(text)
	if clean == "" {
		return nil
	}
	seen := map[string]struct{}{}
	features := []string{}
	add := func(feature string) {
		feature = strings.TrimSpace(feature)
		if feature == "" {
			return
		}
		if _, ok := seen[feature]; ok {
			return
		}
		seen[feature] = struct{}{}
		features = append(features, feature)
	}
	for _, term := range strings.Fields(clean) {
		if usefulSearchTerm(term) {
			add("tok:" + term)
		}
		runes := []rune(term)
		for size := 3; size <= 5; size++ {
			for i := 0; i+size <= len(runes); i++ {
				add("sub:" + string(runes[i:i+size]))
			}
		}
	}
	runes := compactEmbeddingRunes(clean)
	for size := 2; size <= 3; size++ {
		for i := 0; i+size <= len(runes); i++ {
			add("ng:" + string(runes[i:i+size]))
		}
	}
	return features
}

func compactEmbeddingRunes(text string) []rune {
	runes := []rune{}
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			runes = append(runes, r)
		}
	}
	return runes
}

func hashVectorFeature(feature string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(feature))
	return h.Sum64()
}

func normalizeVector(vector []float64) {
	var sum float64
	for _, value := range vector {
		sum += value * value
	}
	if sum == 0 {
		return
	}
	norm := math.Sqrt(sum)
	for i := range vector {
		vector[i] = vector[i] / norm
	}
}

func cosineSimilarity(a []float64, b []float64) float64 {
	if len(a) == 0 || len(b) == 0 || len(a) != len(b) {
		return 0
	}
	var score float64
	for i := range a {
		score += a[i] * b[i]
	}
	return score
}

func normalizeVectorText(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = searchPunctuationPattern.ReplaceAllString(clean, " ")
	return strings.Join(strings.Fields(clean), " ")
}

func vectorDocumentMatchesFilters(document domainshotreference.VectorDocument, filters map[string][]string) bool {
	if len(filters) == 0 {
		return true
	}
	for category, selected := range filters {
		if len(selected) == 0 {
			continue
		}
		values := metadataStrings(document.Metadata[vectorFilterMetadataKey(category)])
		for _, value := range selected {
			if !stringSliceContains(values, value) {
				return false
			}
		}
	}
	return true
}

func vectorFilterMetadataKey(category string) string {
	switch category {
	case "visual":
		return "visual_facets"
	case "narrative":
		return "narrative_facets"
	case "emotion":
		return "emotion_facets"
	case "pattern":
		return "pattern_facets"
	case "production":
		return "production_facets"
	default:
		return category
	}
}

func metadataStrings(value interface{}) []string {
	items, ok := value.([]interface{})
	if !ok {
		return nil
	}
	result := []string{}
	for _, item := range items {
		if text, ok := item.(string); ok {
			result = append(result, text)
		}
	}
	return result
}

func recordVectorStoreOperation(operation string, start time.Time, documents int, err error) {
	status := "success"
	if err != nil {
		status = "error"
	}
	observability.DefaultVectorMetrics().Record(observability.VectorOperationSample{
		Operation: operation,
		Status:    status,
		Duration:  time.Since(start),
		Documents: documents,
	})
}
