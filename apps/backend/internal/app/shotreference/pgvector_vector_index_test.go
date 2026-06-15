package shotreference

import (
	"context"
	"strings"
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var _ providercontract.VectorIndexProvider = (*PgVectorIndexProvider)(nil)
var _ providercontract.HealthChecker = (*PgVectorIndexProvider)(nil)

func TestPgVectorLiteralRequiresConfiguredDimension(t *testing.T) {
	vector := make([]float64, localEmbeddingDim)
	vector[0] = 0.25
	vector[1] = -0.5

	literal, err := pgVectorLiteral(vector)

	if err != nil {
		t.Fatalf("pgVectorLiteral returned error: %v", err)
	}
	if !strings.HasPrefix(literal, "[0.25,-0.5,") || !strings.HasSuffix(literal, "]") {
		t.Fatalf("pgVectorLiteral = %q, want pgvector array literal", literal)
	}
	if _, err := pgVectorLiteral([]float64{0.1, 0.2}); err == nil {
		t.Fatal("pgVectorLiteral accepted wrong dimension")
	}
}

func TestPgVectorWhereFromSearchBuildsSafeFilters(t *testing.T) {
	where, args, err := pgVectorWhereFromSearch(providercontract.VectorSearchRequest{
		Namespace: "project-a",
		Locale:    "zh-CN",
		SourceIDs: []string{"source-1", "source-2"},
		Filters: map[string][]string{
			"mood": {"quiet"},
		},
	})

	if err != nil {
		t.Fatalf("pgVectorWhereFromSearch returned error: %v", err)
	}
	for _, want := range []string{
		"source_id = ?",
		"source_id IN (?, ?)",
		"locale = ?",
		"metadata @> ?::jsonb",
	} {
		if !strings.Contains(where, want) {
			t.Fatalf("where = %q, want %q", where, want)
		}
	}
	if len(args) != 6 {
		t.Fatalf("args = %#v, want namespace, two sources, locale, scalar filter, array filter", args)
	}
}

func TestPgVectorSearchRowMapsReferenceIDIntoMetadata(t *testing.T) {
	row := pgVectorSearchRow{
		DocumentID:  "default:42:zh-CN:combined",
		ReferenceID: 42,
		SourceID:    "default",
		Locale:      "zh-CN",
		Kind:        "combined",
		Text:        "delayed reveal",
		Metadata:    `{"mood":"quiet"}`,
	}

	document, err := row.document()

	if err != nil {
		t.Fatalf("document returned error: %v", err)
	}
	if document.ID != row.DocumentID || document.Namespace != "default" || document.Metadata["reference_id"] != uint(42) {
		t.Fatalf("document = %+v, want mapped pgvector row", document)
	}
}

func TestPgVectorHealthRequiresDatabaseConnection(t *testing.T) {
	health := NewPgVectorIndexProvider(nil).Health(context.Background())

	if health.Status != providercontract.HealthStatusMissingConfig {
		t.Fatalf("health = %+v, want missing config", health)
	}
}
