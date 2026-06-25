package shotreference

import (
	"strings"
	"testing"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
)

func TestBuildVectorDocumentsEmitsTypedEmbeddingInputs(t *testing.T) {
	duration := 9.2
	reference := Analyze(AnalysisInput{
		Resource: domainresource.RawResource{
			ID:        10,
			OwnerID:   7,
			Type:      "video",
			Name:      "slow_push_reveal.mp4",
			URL:       "/api/v1/resources/10/file",
			Size:      4096,
			MimeType:  "video/mp4",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		DurationSec: &duration,
		Width:       1920,
		Height:      1080,
	})
	reference.ID = 10

	documents := BuildVectorDocuments(reference, "default", "zh-CN")
	if len(documents) < 5 {
		t.Fatalf("vector document count = %d, want at least 5", len(documents))
	}
	byKind := map[VectorDocumentKind]VectorDocument{}
	for _, document := range documents {
		byKind[document.Kind] = document
		if !strings.HasPrefix(document.ID, "default:10:zh-CN:") {
			t.Fatalf("document id = %q, want source/reference/locale prefix", document.ID)
		}
		if document.ReferenceID != reference.ID || document.SourceID != "default" || document.Locale != "zh-CN" {
			t.Fatalf("document scope = %+v, want reference/source/locale", document)
		}
		if document.Metadata["reference_id"] != reference.ID {
			t.Fatalf("metadata reference_id = %#v, want %d", document.Metadata["reference_id"], reference.ID)
		}
	}
	if !strings.Contains(byKind[VectorDocumentCombined].Text, "delayed reveal before discovery") {
		t.Fatalf("combined vector text = %q, want natural-language query", byKind[VectorDocumentCombined].Text)
	}
	if !strings.Contains(byKind[VectorDocumentVisual].Text, "push_in") {
		t.Fatalf("visual vector text = %q, want visual facet", byKind[VectorDocumentVisual].Text)
	}
	if !strings.Contains(byKind[VectorDocumentNarrative].Text, "delayed_reveal") {
		t.Fatalf("narrative vector text = %q, want narrative function", byKind[VectorDocumentNarrative].Text)
	}
	if !strings.Contains(byKind[VectorDocumentReusablePattern].Text, "slow_push_in") {
		t.Fatalf("reusable pattern vector text = %q, want pattern id", byKind[VectorDocumentReusablePattern].Text)
	}
}
