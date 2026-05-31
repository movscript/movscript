package shotreference

import (
	"context"
	"fmt"
	"strings"
)

type VectorDocumentKind string

const (
	VectorDocumentCombined        VectorDocumentKind = "combined"
	VectorDocumentTags            VectorDocumentKind = "tags"
	VectorDocumentVisual          VectorDocumentKind = "visual"
	VectorDocumentNarrative       VectorDocumentKind = "narrative"
	VectorDocumentReusablePattern VectorDocumentKind = "reusable_pattern"
	VectorDocumentProduction      VectorDocumentKind = "production"
)

type VectorDocument struct {
	ID          string                 `json:"id"`
	ReferenceID uint                   `json:"reference_id"`
	SourceID    string                 `json:"source_id"`
	Locale      string                 `json:"locale"`
	Kind        VectorDocumentKind     `json:"kind"`
	Text        string                 `json:"text"`
	Metadata    map[string]interface{} `json:"metadata"`
}

type VectorSearchRequest struct {
	Query     string              `json:"query"`
	Locale    string              `json:"locale"`
	SourceIDs []string            `json:"source_ids,omitempty"`
	Filters   map[string][]string `json:"filters,omitempty"`
	TopK      int                 `json:"top_k,omitempty"`
}

type VectorSearchResult struct {
	Document VectorDocument `json:"document"`
	Score    float64        `json:"score"`
}

type VectorReindexScope struct {
	SourceIDs    []string `json:"source_ids,omitempty"`
	ReferenceIDs []uint   `json:"reference_ids,omitempty"`
}

type VectorStore interface {
	Upsert(ctx context.Context, document VectorDocument) error
	Search(ctx context.Context, request VectorSearchRequest) ([]VectorSearchResult, error)
	DeleteByReference(ctx context.Context, referenceID uint) error
	Reindex(ctx context.Context, scope VectorReindexScope) error
}

func BuildVectorDocuments(reference ShotReference, sourceID string, locale string) []VectorDocument {
	if sourceID == "" {
		sourceID = "default"
	}
	if locale == "" {
		locale = "und"
	}
	index := buildSearchIndex(searchIndexInputFromReference(reference))
	metadata := map[string]interface{}{
		"reference_id":        reference.ID,
		"source_id":           sourceID,
		"title":               reference.Title,
		"tags":                index.Tags,
		"visual_facets":       index.VisualFacets,
		"narrative_facets":    index.NarrativeFacets,
		"emotion_facets":      index.EmotionFacets,
		"pattern_facets":      index.PatternFacets,
		"production_facets":   index.ProductionFacets,
		"analysis_status":     reference.AnalysisStatus,
		"analysis_source":     reference.AnalysisSource,
		"resource_id":         reference.ResourceID,
		"shot_reference_id":   reference.ID,
		"shot_reference_kind": "shot_reference",
	}
	docs := []VectorDocument{}
	appendDoc := func(kind VectorDocumentKind, values []string) {
		text := strings.Join(unique(compact(values)), " ")
		if text == "" {
			return
		}
		docMetadata := map[string]interface{}{}
		for key, value := range metadata {
			docMetadata[key] = value
		}
		docMetadata["kind"] = string(kind)
		docs = append(docs, VectorDocument{
			ID:          vectorDocumentID(sourceID, reference.ID, locale, kind),
			ReferenceID: reference.ID,
			SourceID:    sourceID,
			Locale:      locale,
			Kind:        kind,
			Text:        text,
			Metadata:    docMetadata,
		})
	}

	appendDoc(VectorDocumentCombined, []string{
		buildRetrievalText(reference),
		index.SearchText,
		strings.Join(index.NaturalLanguageQueries, " "),
		reference.ReusablePattern.Principle,
		reference.ExecutionDetails.Blocking,
	})
	appendDoc(VectorDocumentTags, index.Tags)
	appendDoc(VectorDocumentVisual, index.VisualFacets)
	appendDoc(VectorDocumentNarrative, append([]string{
		reference.NarrativeFunction.Primary,
		reference.NarrativeFunction.InformationState,
		reference.NarrativeFunction.SequencePosition,
		reference.NarrativeFunction.RelationToPrevious,
		reference.NarrativeFunction.RelationToNext,
	}, reference.NarrativeFunction.Secondary...))
	appendDoc(VectorDocumentReusablePattern, append(append(append([]string{
		reference.ReusablePattern.Principle,
	}, reference.ReusablePattern.PatternIDs...), reference.ReusablePattern.WorksWhen...), append(reference.ReusablePattern.AvoidWhen, stringMapValues(reference.ReusablePattern.Variables)...)...))
	appendDoc(VectorDocumentProduction, append([]string{
		reference.ExecutionDetails.AspectRatio,
		reference.ExecutionDetails.Resolution,
		reference.ExecutionDetails.TransitionIn,
		reference.ExecutionDetails.TransitionOut,
		reference.ExecutionDetails.CoverageRole,
		reference.ExecutionDetails.Difficulty,
		reference.ExecutionDetails.Blocking,
	}, reference.ExecutionDetails.Requirements...))

	return docs
}

func searchIndexInputFromReference(reference ShotReference) SearchIndexInput {
	resourceName := ""
	if reference.Resource != nil {
		resourceName = reference.Resource.Name
	}
	return SearchIndexInput{
		Title:             reference.Title,
		Summary:           reference.Summary,
		ResourceName:      resourceName,
		Intent:            reference.Intent,
		Pattern:           reference.Pattern,
		ShotFunction:      reference.ShotFunction,
		VisualPreference:  reference.VisualPreference,
		EmotionalEffect:   reference.EmotionalEffect,
		VisualAnalysis:    reference.VisualAnalysis,
		SceneSemantics:    reference.SceneSemantics,
		NarrativeFunction: reference.NarrativeFunction,
		EmotionalProfile:  reference.EmotionalProfile,
		ReusablePattern:   reference.ReusablePattern,
		ExecutionDetails:  reference.ExecutionDetails,
	}
}

func vectorDocumentID(sourceID string, referenceID uint, locale string, kind VectorDocumentKind) string {
	return fmt.Sprintf("%s:%d:%s:%s", sourceID, referenceID, locale, kind)
}

func stringMapValues(values map[string]string) []string {
	result := []string{}
	for key, value := range values {
		result = append(result, key, value)
	}
	return result
}
