package shotreference

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

const pgVectorDocumentsTable = "shot_vector_documents_pgvector"

type PgVectorIndexProvider struct {
	db *gorm.DB
}

func NewPgVectorIndexProvider(db *gorm.DB) *PgVectorIndexProvider {
	return &PgVectorIndexProvider{db: db}
}

func (p *PgVectorIndexProvider) Upsert(ctx context.Context, document providercontract.VectorDocument) error {
	if p == nil || p.db == nil {
		return errors.New("pgvector database connection is required")
	}
	if strings.TrimSpace(document.ID) == "" {
		return errors.New("vector document id is required")
	}
	if err := p.ensureSchema(ctx); err != nil {
		return err
	}
	vectorValue, err := pgVector(document.Text, document.Embedding)
	if err != nil {
		return err
	}
	vector, err := pgVectorLiteral(vectorValue)
	if err != nil {
		return err
	}
	metadataJSON, err := pgVectorMetadataJSON(document.Metadata)
	if err != nil {
		return err
	}
	referenceID := vectorMetadataReferenceID(document.Metadata)
	sourceID := firstNonEmpty(document.SourceID, document.Namespace)
	return p.db.WithContext(ctx).Exec(`
		INSERT INTO shot_vector_documents_pgvector (
			document_id, reference_id, source_id, locale, kind, text, metadata, embedding_model, embedding, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::vector, NOW(), NOW())
		ON CONFLICT (document_id) DO UPDATE SET
			reference_id = EXCLUDED.reference_id,
			source_id = EXCLUDED.source_id,
			locale = EXCLUDED.locale,
			kind = EXCLUDED.kind,
			text = EXCLUDED.text,
			metadata = EXCLUDED.metadata,
			embedding_model = EXCLUDED.embedding_model,
			embedding = EXCLUDED.embedding,
			updated_at = NOW()
	`, document.ID, referenceID, sourceID, document.Locale, document.Kind, document.Text, metadataJSON, vectorEmbeddingModel(document.EmbeddingModel, document.Embedding), vector).Error
}

func (p *PgVectorIndexProvider) Delete(ctx context.Context, ref providercontract.VectorDocumentRef) error {
	if p == nil || p.db == nil {
		return errors.New("pgvector database connection is required")
	}
	if ref.ID == "" && ref.ReferenceID == 0 && ref.SourceID == "" && ref.Namespace == "" {
		return errors.New("vector document ref requires id, reference_id, source_id, or namespace")
	}
	if err := p.ensureSchema(ctx); err != nil {
		return err
	}
	where, args := pgVectorWhereFromRef(ref)
	return p.db.WithContext(ctx).Exec("DELETE FROM "+pgVectorDocumentsTable+" "+where, args...).Error
}

func (p *PgVectorIndexProvider) Search(ctx context.Context, request providercontract.VectorSearchRequest) ([]providercontract.VectorSearchResult, error) {
	if p == nil || p.db == nil {
		return nil, errors.New("pgvector database connection is required")
	}
	if err := p.ensureSchema(ctx); err != nil {
		return nil, err
	}
	limit := request.TopK
	if limit <= 0 {
		limit = 20
	}
	vectorValue, err := pgVector(request.Query, request.Embedding)
	if err != nil {
		return nil, err
	}
	vector, err := pgVectorLiteral(vectorValue)
	if err != nil {
		return nil, err
	}
	request.EmbeddingModel = vectorSearchEmbeddingModel(request.EmbeddingModel, request.Embedding)
	where, args, err := pgVectorWhereFromSearch(request)
	if err != nil {
		return nil, err
	}
	queryArgs := append([]any{vector}, args...)
	queryArgs = append(queryArgs, vector, limit)
	rows := []pgVectorSearchRow{}
	if err := p.db.WithContext(ctx).Raw(`
		SELECT
			document_id,
			reference_id,
			source_id,
			locale,
			kind,
			text,
			metadata::text AS metadata,
			embedding_model,
			1 - (embedding <=> ?::vector) AS score
		FROM shot_vector_documents_pgvector
		`+where+`
		ORDER BY embedding <=> ?::vector ASC, document_id ASC
		LIMIT ?
	`, queryArgs...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	results := make([]providercontract.VectorSearchResult, 0, len(rows))
	for _, row := range rows {
		document, err := row.document()
		if err != nil {
			return nil, err
		}
		results = append(results, providercontract.VectorSearchResult{Document: document, Score: row.Score})
	}
	return results, nil
}

func (p *PgVectorIndexProvider) Stats(ctx context.Context) (providercontract.VectorIndexStats, error) {
	if p == nil || p.db == nil {
		return providercontract.VectorIndexStats{}, errors.New("pgvector database connection is required")
	}
	if err := p.ensureSchema(ctx); err != nil {
		return providercontract.VectorIndexStats{}, err
	}
	stats := providercontract.VectorIndexStats{
		Namespaces:      map[string]int64{},
		EmbeddingModels: map[string]int64{},
	}
	if err := p.db.WithContext(ctx).Raw("SELECT count(*) FROM " + pgVectorDocumentsTable).Scan(&stats.Documents).Error; err != nil {
		return stats, err
	}
	var namespaceRows []struct {
		SourceID string
		Count    int64
	}
	if err := p.db.WithContext(ctx).Raw("SELECT source_id, count(*) AS count FROM " + pgVectorDocumentsTable + " GROUP BY source_id").Scan(&namespaceRows).Error; err != nil {
		return stats, err
	}
	for _, row := range namespaceRows {
		stats.Namespaces[row.SourceID] = row.Count
	}
	var modelRows []struct {
		EmbeddingModel string
		Count          int64
	}
	if err := p.db.WithContext(ctx).Raw("SELECT embedding_model, count(*) AS count FROM " + pgVectorDocumentsTable + " GROUP BY embedding_model").Scan(&modelRows).Error; err != nil {
		return stats, err
	}
	for _, row := range modelRows {
		model := strings.TrimSpace(row.EmbeddingModel)
		if model == "" {
			model = "missing"
		}
		stats.EmbeddingModels[model] = row.Count
	}
	var lastIndexed int64
	if err := p.db.WithContext(ctx).Raw("SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at))::bigint, 0) FROM " + pgVectorDocumentsTable).Scan(&lastIndexed).Error; err != nil {
		return stats, err
	}
	stats.LastIndexedUnixSec = lastIndexed
	return stats, nil
}

func (p *PgVectorIndexProvider) Rebuild(ctx context.Context, request providercontract.VectorRebuildRequest) (providercontract.VectorRebuildResult, error) {
	if p == nil || p.db == nil {
		return providercontract.VectorRebuildResult{}, errors.New("pgvector database connection is required")
	}
	if !request.Reset {
		return providercontract.VectorRebuildResult{}, errors.New("pgvector rebuild without reset must be driven by the indexing service")
	}
	if err := p.ensureSchema(ctx); err != nil {
		return providercontract.VectorRebuildResult{}, err
	}
	search := providercontract.VectorSearchRequest{Namespace: request.Namespace, SourceIDs: request.SourceIDs}
	where, args, err := pgVectorWhereFromSearch(search)
	if err != nil {
		return providercontract.VectorRebuildResult{}, err
	}
	if where == "WHERE TRUE" {
		if err := p.db.WithContext(ctx).Exec("TRUNCATE TABLE " + pgVectorDocumentsTable).Error; err != nil {
			return providercontract.VectorRebuildResult{}, err
		}
		return providercontract.VectorRebuildResult{Accepted: true}, nil
	}
	result := p.db.WithContext(ctx).Exec("DELETE FROM "+pgVectorDocumentsTable+" "+where, args...)
	if result.Error != nil {
		return providercontract.VectorRebuildResult{}, result.Error
	}
	return providercontract.VectorRebuildResult{Accepted: true, Processed: int(result.RowsAffected)}, nil
}

func (p *PgVectorIndexProvider) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeVectorIndex,
		Adapter:      providercontract.AdapterPgVector,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Message:      "pgvector table is reachable",
		Capabilities: []string{"vector.upsert", "vector.search", "vector.delete", "vector.stats", "vector.rebuild", "health.probe"},
	}
	if p == nil || p.db == nil {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "postgres database connection is required"
		return health
	}
	if p.db.Dialector == nil || p.db.Dialector.Name() != "postgres" {
		health.Status = providercontract.HealthStatusError
		health.Message = "pgvector requires postgres"
		return health
	}
	if err := p.ensureSchema(ctx); err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return health
	}
	var count int64
	if err := p.db.WithContext(ctx).Raw("SELECT count(*) FROM " + pgVectorDocumentsTable).Scan(&count).Error; err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
	}
	return health
}

func (p *PgVectorIndexProvider) ensureSchema(ctx context.Context) error {
	if p == nil || p.db == nil {
		return errors.New("pgvector database connection is required")
	}
	if p.db.Dialector == nil || p.db.Dialector.Name() != "postgres" {
		return errors.New("pgvector requires postgres")
	}
	statements := []string{
		"CREATE EXTENSION IF NOT EXISTS vector",
		`CREATE TABLE IF NOT EXISTS shot_vector_documents_pgvector (
			id BIGSERIAL PRIMARY KEY,
			document_id TEXT NOT NULL UNIQUE,
			reference_id BIGINT NOT NULL DEFAULT 0,
			source_id TEXT NOT NULL DEFAULT '',
			locale TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL DEFAULT '',
			text TEXT NOT NULL DEFAULT '',
			metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
			embedding_model TEXT NOT NULL DEFAULT '',
			embedding vector(384) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		"CREATE INDEX IF NOT EXISTS idx_shot_vector_documents_pgvector_reference_id ON shot_vector_documents_pgvector (reference_id)",
		"CREATE INDEX IF NOT EXISTS idx_shot_vector_documents_pgvector_source_id ON shot_vector_documents_pgvector (source_id)",
		"CREATE INDEX IF NOT EXISTS idx_shot_vector_documents_pgvector_locale ON shot_vector_documents_pgvector (locale)",
		"CREATE INDEX IF NOT EXISTS idx_shot_vector_documents_pgvector_kind ON shot_vector_documents_pgvector (kind)",
		"CREATE INDEX IF NOT EXISTS idx_shot_vector_documents_pgvector_metadata ON shot_vector_documents_pgvector USING GIN (metadata)",
	}
	for _, statement := range statements {
		if err := p.db.WithContext(ctx).Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}

type pgVectorSearchRow struct {
	DocumentID     string
	ReferenceID    uint
	SourceID       string
	Locale         string
	Kind           string
	Text           string
	Metadata       string
	EmbeddingModel string
	Score          float64
}

func (r pgVectorSearchRow) document() (providercontract.VectorDocument, error) {
	if strings.TrimSpace(r.DocumentID) == "" {
		return providercontract.VectorDocument{}, errors.New("pgvector row is missing document_id")
	}
	metadata := map[string]any{}
	if strings.TrimSpace(r.Metadata) != "" {
		if err := json.Unmarshal([]byte(r.Metadata), &metadata); err != nil {
			return providercontract.VectorDocument{}, err
		}
	}
	metadata["reference_id"] = r.ReferenceID
	return providercontract.VectorDocument{
		ID:        r.DocumentID,
		Namespace: r.SourceID,
		SourceID:  r.SourceID,
		Locale:    r.Locale,
		Kind:      r.Kind,
		Text:      r.Text,
		Metadata:  metadata,
	}, nil
}

func pgVector(text string, embedding []float32) ([]float64, error) {
	return vectorEmbedding(text, embedding)
}

func pgVectorLiteral(vector []float64) (string, error) {
	if len(vector) != localEmbeddingDim {
		return "", fmt.Errorf("pgvector embedding dimension = %d, want %d", len(vector), localEmbeddingDim)
	}
	values := make([]string, 0, len(vector))
	for _, value := range vector {
		values = append(values, strconv.FormatFloat(value, 'f', -1, 64))
	}
	return "[" + strings.Join(values, ",") + "]", nil
}

func pgVectorMetadataJSON(metadata map[string]any) (string, error) {
	if metadata == nil {
		metadata = map[string]any{}
	}
	data, err := json.Marshal(metadata)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func pgVectorWhereFromRef(ref providercontract.VectorDocumentRef) (string, []any) {
	switch {
	case strings.TrimSpace(ref.ID) != "":
		return "WHERE document_id = ?", []any{ref.ID}
	case ref.ReferenceID > 0:
		return "WHERE reference_id = ?", []any{ref.ReferenceID}
	case strings.TrimSpace(ref.SourceID) != "":
		return "WHERE source_id = ?", []any{ref.SourceID}
	default:
		return "WHERE source_id = ?", []any{ref.Namespace}
	}
}

func pgVectorWhereFromSearch(request providercontract.VectorSearchRequest) (string, []any, error) {
	clauses := []string{"TRUE"}
	args := []any{}
	if strings.TrimSpace(request.Namespace) != "" {
		clauses = append(clauses, "source_id = ?")
		args = append(args, request.Namespace)
	}
	if strings.TrimSpace(request.EmbeddingModel) != "" {
		clauses = append(clauses, "embedding_model = ?")
		args = append(args, strings.TrimSpace(request.EmbeddingModel))
	}
	if len(request.SourceIDs) > 0 {
		placeholders := make([]string, 0, len(request.SourceIDs))
		for _, sourceID := range request.SourceIDs {
			if strings.TrimSpace(sourceID) == "" {
				continue
			}
			placeholders = append(placeholders, "?")
			args = append(args, sourceID)
		}
		if len(placeholders) > 0 {
			clauses = append(clauses, "source_id IN ("+strings.Join(placeholders, ", ")+")")
		}
	}
	if strings.TrimSpace(request.Locale) != "" {
		clauses = append(clauses, "locale = ?")
		args = append(args, request.Locale)
	}
	for key, values := range request.Filters {
		key = strings.TrimSpace(key)
		if key == "" || len(values) == 0 {
			continue
		}
		filterClauses := []string{}
		for _, value := range values {
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			scalar, err := pgVectorMetadataJSON(map[string]any{key: value})
			if err != nil {
				return "", nil, err
			}
			array, err := pgVectorMetadataJSON(map[string]any{key: []string{value}})
			if err != nil {
				return "", nil, err
			}
			filterClauses = append(filterClauses, "metadata @> ?::jsonb", "metadata @> ?::jsonb")
			args = append(args, scalar, array)
		}
		if len(filterClauses) > 0 {
			clauses = append(clauses, "("+strings.Join(filterClauses, " OR ")+")")
		}
	}
	return "WHERE " + strings.Join(clauses, " AND "), args, nil
}
