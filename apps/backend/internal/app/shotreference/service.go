package shotreference

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"

	appresource "github.com/movscript/movscript/internal/app/resource"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

var (
	ErrInvalidVideo = errors.New("shot reference requires a video resource")
	ErrNotFound     = errors.New("shot reference not found")
)

const (
	StageValidateVideo = "validate_video"
	StageStoreResource = "store_resource"
	StageAnalyzeShot   = "analyze_shot"
	StagePersistResult = "persist_result"
)

type StageError struct {
	Stage string
	Err   error
}

func (e StageError) Error() string {
	return e.Err.Error()
}

func (e StageError) Unwrap() error {
	return e.Err
}

type Service struct {
	repo      repository
	resources *appresource.Service
	vectors   providercontract.VectorIndexProvider
}

func NewService(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, cacheStore ...cache.Cache) *Service {
	return NewServiceWithVectorIndex(db, store, verifier, NewLocalVectorIndexProvider(db), cacheStore...)
}

func NewServiceWithVectorIndex(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, vectors providercontract.VectorIndexProvider, cacheStore ...cache.Cache) *Service {
	if vectors == nil {
		vectors = NewLocalVectorIndexProvider(db)
	}
	return &Service{
		repo:      &gormRepository{db: db},
		resources: appresource.NewService(db, store, verifier, cacheStore...),
		vectors:   vectors,
	}
}

type UploadInput struct {
	UserID      uint
	OrgID       *uint
	Filename    string
	MimeType    string
	Size        int64
	Data        []byte
	DurationSec *float64
	Width       int
	Height      int
}

type CreateFromResourceInput struct {
	UserID      uint
	OrgID       *uint
	ResourceID  uint
	GroupID     *uint
	GroupTitle  string
	DurationSec *float64
	Width       int
	Height      int
	Shots       []domainshotreference.UpdateInput
}

type CreateGroupInput struct {
	UserID      uint
	OrgID       *uint
	ResourceID  uint
	Title       string
	Summary     string
	CutStrategy string
}

type GroupDetail struct {
	Info  domainshotreference.ShotReferenceGroup `json:"group"`
	Shots []domainshotreference.ShotReference    `json:"shots"`
	Count int                                    `json:"count"`
}

func (s *Service) UploadAndAnalyze(ctx context.Context, input UploadInput) (domainshotreference.ShotReference, error) {
	if domainresource.MimeToType(input.MimeType, input.Filename) != "video" {
		return domainshotreference.ShotReference{}, StageError{Stage: StageValidateVideo, Err: ErrInvalidVideo}
	}
	resource, err := s.resources.Upload(ctx, appresource.UploadInput{
		UserID:   input.UserID,
		OrgID:    input.OrgID,
		Filename: input.Filename,
		MimeType: input.MimeType,
		Size:     input.Size,
		Data:     input.Data,
	})
	if err != nil {
		return domainshotreference.ShotReference{}, StageError{Stage: StageStoreResource, Err: err}
	}
	if resource.Type != "video" {
		return domainshotreference.ShotReference{}, StageError{Stage: StageValidateVideo, Err: ErrInvalidVideo}
	}
	group := domainshotreference.NewGroupForResource(resource)
	if err := s.repo.CreateGroup(ctx, &group); err != nil {
		return domainshotreference.ShotReference{}, StageError{Stage: StagePersistResult, Err: err}
	}
	reference := domainshotreference.Analyze(domainshotreference.AnalysisInput{
		Resource:    resource,
		DurationSec: input.DurationSec,
		Width:       input.Width,
		Height:      input.Height,
	})
	reference.GroupID = &group.ID
	reference.Group = &group
	reference.Order = 1
	if err := s.repo.Upsert(ctx, &reference); err != nil {
		return domainshotreference.ShotReference{}, StageError{Stage: StagePersistResult, Err: err}
	}
	if err := s.indexReferenceVectors(ctx, reference); err != nil {
		return domainshotreference.ShotReference{}, StageError{Stage: StagePersistResult, Err: err}
	}
	references := []domainshotreference.ShotReference{reference}
	s.populateResourceURLs(references)
	reference = references[0]
	return reference, nil
}

func (s *Service) CreateGroup(ctx context.Context, input CreateGroupInput) (domainshotreference.ShotReferenceGroup, error) {
	resource, err := s.resources.GetVisible(ctx, input.ResourceID, input.UserID, input.OrgID)
	if err != nil {
		return domainshotreference.ShotReferenceGroup{}, StageError{Stage: StageValidateVideo, Err: err}
	}
	if resource.Type != "video" {
		return domainshotreference.ShotReferenceGroup{}, StageError{Stage: StageValidateVideo, Err: ErrInvalidVideo}
	}
	group := domainshotreference.NewGroupForResource(resource)
	if title := strings.TrimSpace(input.Title); title != "" {
		group.Title = title
	}
	if summary := strings.TrimSpace(input.Summary); summary != "" {
		group.Summary = summary
	} else if strings.TrimSpace(input.Title) != "" {
		group.Summary = group.Title + " shot reference group."
	}
	if cutStrategy := strings.TrimSpace(input.CutStrategy); cutStrategy != "" {
		group.CutStrategy = cutStrategy
	}
	if err := s.repo.CreateGroup(ctx, &group); err != nil {
		return domainshotreference.ShotReferenceGroup{}, StageError{Stage: StagePersistResult, Err: err}
	}
	if group.SourceResource != nil {
		group.SourceResource.URL = resourceProxyURL(group.SourceResource.ID)
	}
	return group, nil
}

func (s *Service) GetGroupDetail(ctx context.Context, id uint, input domainshotreference.ListInput) (GroupDetail, error) {
	group, err := s.repo.GetGroup(ctx, id, input)
	if err != nil {
		return GroupDetail{}, err
	}
	if group.SourceResource != nil {
		group.SourceResource.URL = resourceProxyURL(group.SourceResource.ID)
	}
	input.GroupID = &id
	input.Query = ""
	input.Page = 1
	input.PageSize = 10000
	shots, err := s.repo.List(ctx, input)
	if err != nil {
		return GroupDetail{}, err
	}
	s.populateResourceURLs(shots)
	return GroupDetail{
		Info:  group,
		Shots: shots,
		Count: len(shots),
	}, nil
}

func (s *Service) CreateFromResource(ctx context.Context, input CreateFromResourceInput) ([]domainshotreference.ShotReference, error) {
	resource, err := s.resources.GetVisible(ctx, input.ResourceID, input.UserID, input.OrgID)
	if err != nil {
		return nil, StageError{Stage: StageValidateVideo, Err: err}
	}
	if resource.Type != "video" {
		return nil, StageError{Stage: StageValidateVideo, Err: ErrInvalidVideo}
	}
	group := domainshotreference.NewGroupForResource(resource)
	group.CutStrategy = "manual_review"
	if title := strings.TrimSpace(input.GroupTitle); title != "" {
		group.Title = title
		group.Summary = title + " shot reference group."
	}
	if input.GroupID != nil {
		existing, err := s.repo.GetGroup(ctx, *input.GroupID, domainshotreference.ListInput{UserID: input.UserID, OrgID: input.OrgID})
		if err != nil {
			return nil, StageError{Stage: StageValidateVideo, Err: err}
		}
		group = existing
	} else if err := s.repo.CreateGroup(ctx, &group); err != nil {
		return nil, StageError{Stage: StagePersistResult, Err: err}
	}
	shotInputs := input.Shots
	if len(shotInputs) == 0 {
		shotInputs = []domainshotreference.UpdateInput{{}}
	}
	baseOrder, err := s.repo.NextGroupOrder(ctx, group.ID, domainshotreference.ListInput{UserID: input.UserID, OrgID: input.OrgID})
	if err != nil {
		return nil, StageError{Stage: StagePersistResult, Err: err}
	}
	references := make([]domainshotreference.ShotReference, 0, len(shotInputs))
	for index, shotInput := range shotInputs {
		reference := domainshotreference.Analyze(domainshotreference.AnalysisInput{
			Resource:    resource,
			DurationSec: input.DurationSec,
			Width:       input.Width,
			Height:      input.Height,
		})
		reference.GroupID = &group.ID
		reference.Group = &group
		reference.Order = baseOrder + index
		reference = domainshotreference.ApplyUpdate(reference, shotInput)
		if err := s.repo.Upsert(ctx, &reference); err != nil {
			return nil, StageError{Stage: StagePersistResult, Err: err}
		}
		if err := s.indexReferenceVectors(ctx, reference); err != nil {
			return nil, StageError{Stage: StagePersistResult, Err: err}
		}
		references = append(references, reference)
	}
	s.populateResourceURLs(references)
	return references, nil
}

func (s *Service) Update(ctx context.Context, id uint, scope domainshotreference.ListInput, input domainshotreference.UpdateInput) (domainshotreference.ShotReference, error) {
	reference, err := s.repo.Get(ctx, id, scope)
	if err != nil {
		return domainshotreference.ShotReference{}, err
	}
	reference = domainshotreference.ApplyUpdate(reference, input)
	if err := s.repo.Update(ctx, &reference); err != nil {
		return domainshotreference.ShotReference{}, err
	}
	if err := s.indexReferenceVectors(ctx, reference); err != nil {
		return domainshotreference.ShotReference{}, err
	}
	references := []domainshotreference.ShotReference{reference}
	s.populateResourceURLs(references)
	return references[0], nil
}

func (s *Service) List(ctx context.Context, input domainshotreference.ListInput) (domainshotreference.Page, error) {
	references, err := s.repo.List(ctx, input)
	if err != nil {
		return domainshotreference.Page{}, err
	}
	filtered := applySearch(references, input.Query)
	pageSpec := domainresource.NormalizePage(domainresource.PageInput{Page: input.Page, PageSize: input.PageSize})
	start := pageSpec.Offset
	if start > len(filtered) {
		start = len(filtered)
	}
	end := start + pageSpec.PageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	items := filtered[start:end]
	s.populateResourceURLs(items)
	return domainshotreference.Page{
		Total:    int64(len(filtered)),
		Items:    items,
		Page:     pageSpec.Page,
		PageSize: pageSpec.PageSize,
	}, nil
}

func (s *Service) Delete(ctx context.Context, id uint, input domainshotreference.ListInput) error {
	deleted, err := s.repo.Delete(ctx, id, input)
	if err != nil {
		return err
	}
	if !deleted {
		return ErrNotFound
	}
	if s.vectors != nil {
		if err := s.vectors.Delete(ctx, providercontract.VectorDocumentRef{ReferenceID: id}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) SearchVectorDocuments(ctx context.Context, request domainshotreference.VectorSearchRequest) ([]domainshotreference.VectorSearchResult, error) {
	if s.vectors == nil {
		return nil, nil
	}
	results, err := s.vectors.Search(ctx, providercontract.VectorSearchRequest{
		Query:     request.Query,
		Locale:    request.Locale,
		SourceIDs: request.SourceIDs,
		Filters:   request.Filters,
		TopK:      request.TopK,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domainshotreference.VectorSearchResult, 0, len(results))
	for _, result := range results {
		out = append(out, domainshotreference.VectorSearchResult{
			Document: vectorDocumentFromProviderContract(result.Document),
			Score:    result.Score,
		})
	}
	return out, nil
}

func (s *Service) VectorStats(ctx context.Context) (VectorStoreStats, error) {
	stats := VectorStoreStats{ByKind: map[string]int64{}, ByLocale: map[string]int64{}, ByEmbeddingModel: map[string]int64{}}
	if provider, ok := s.vectors.(interface {
		LocalStats(context.Context) (VectorStoreStats, error)
	}); ok {
		provided, err := provider.LocalStats(ctx)
		if err != nil {
			return stats, err
		}
		stats = provided
	} else if s.vectors != nil {
		provided, err := s.vectors.Stats(ctx)
		if err != nil {
			return stats, err
		}
		stats.Documents = provided.Documents
		stats.ByLocale = provided.Namespaces
		stats.ByEmbeddingModel = provided.EmbeddingModels
	}
	if stats.ByKind == nil {
		stats.ByKind = map[string]int64{}
	}
	if stats.ByLocale == nil {
		stats.ByLocale = map[string]int64{}
	}
	if stats.ByEmbeddingModel == nil {
		stats.ByEmbeddingModel = map[string]int64{}
	}
	references, err := s.repo.ListAll(ctx)
	if err != nil {
		return stats, err
	}
	stats.SourceReferences = int64(len(references))
	sourceIDs := map[uint]struct{}{}
	for _, reference := range references {
		sourceIDs[reference.ID] = struct{}{}
	}
	indexedIDs := map[uint]struct{}{}
	if provider, ok := s.vectors.(interface {
		ReferenceIDs(context.Context) ([]uint, error)
	}); ok {
		ids, err := provider.ReferenceIDs(ctx)
		if err != nil {
			return stats, err
		}
		for _, id := range ids {
			indexedIDs[id] = struct{}{}
		}
	} else {
		stats.UnindexedReferences = stats.SourceReferences - stats.References
		if stats.UnindexedReferences < 0 {
			stats.UnindexedReferences = 0
		}
		if stats.SourceReferences > 0 {
			stats.IndexCoverage = float64(stats.SourceReferences-stats.UnindexedReferences) / float64(stats.SourceReferences)
		}
		return stats, nil
	}
	var indexedSourceReferences int64
	for id := range sourceIDs {
		if _, ok := indexedIDs[id]; ok {
			indexedSourceReferences++
		} else {
			stats.UnindexedReferences++
		}
	}
	for id := range indexedIDs {
		if _, ok := sourceIDs[id]; !ok {
			stats.OrphanReferences++
		}
	}
	if stats.SourceReferences > 0 {
		stats.IndexCoverage = float64(indexedSourceReferences) / float64(stats.SourceReferences)
	}
	return stats, nil
}

func (s *Service) ReindexVectorDocuments(ctx context.Context, input domainshotreference.ListInput) (int, error) {
	references, err := s.repo.List(ctx, input)
	if err != nil {
		return 0, err
	}
	for _, reference := range references {
		if err := s.indexReferenceVectors(ctx, reference); err != nil {
			return 0, err
		}
	}
	return len(references), nil
}

func (s *Service) AdminReindexVectorDocuments(ctx context.Context) (int, error) {
	references, err := s.repo.ListAll(ctx)
	if err != nil {
		return 0, err
	}
	if s.vectors != nil {
		if _, err := s.vectors.Rebuild(ctx, providercontract.VectorRebuildRequest{Reset: true}); err != nil {
			return 0, err
		}
	}
	for _, reference := range references {
		if err := s.indexReferenceVectors(ctx, reference); err != nil {
			return 0, err
		}
	}
	return len(references), nil
}

func (s *Service) indexReferenceVectors(ctx context.Context, reference domainshotreference.ShotReference) error {
	if s.vectors == nil {
		return nil
	}
	if err := s.vectors.Delete(ctx, providercontract.VectorDocumentRef{ReferenceID: reference.ID}); err != nil {
		return err
	}
	for _, document := range domainshotreference.BuildVectorDocuments(reference, "default", "zh-CN") {
		if err := s.vectors.Upsert(ctx, vectorDocumentToProviderContract(document)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) populateResourceURLs(items []domainshotreference.ShotReference) {
	for i := range items {
		if items[i].Resource == nil {
		} else {
			items[i].Resource.URL = resourceProxyURL(items[i].Resource.ID)
		}
		if items[i].Group != nil && items[i].Group.SourceResource != nil {
			items[i].Group.SourceResource.URL = resourceProxyURL(items[i].Group.SourceResource.ID)
		}
	}
}

func applySearch(items []domainshotreference.ShotReference, query string) []domainshotreference.ShotReference {
	translation := translateShotQuery(query)
	if len(translation.Terms) == 0 {
		return items
	}
	scored := make([]scoredReference, 0, len(items))
	for _, item := range items {
		score := scoreReference(item, translation)
		if score > 0 {
			scored = append(scored, scoredReference{reference: item, score: score})
		}
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score == scored[j].score {
			return scored[i].reference.UpdatedAt.After(scored[j].reference.UpdatedAt)
		}
		return scored[i].score > scored[j].score
	})
	result := make([]domainshotreference.ShotReference, 0, len(scored))
	for _, item := range scored {
		result = append(result, item.reference)
	}
	return result
}

type scoredReference struct {
	reference domainshotreference.ShotReference
	score     int
}

func scoreReference(reference domainshotreference.ShotReference, translation shotQueryTranslation) int {
	haystacks := []struct {
		text   string
		weight int
	}{
		{reference.Title, 6},
		{reference.Summary, 4},
		{reference.RetrievalText, 2},
		{strings.Join(reference.Intent, " "), 5},
		{strings.Join(reference.Pattern, " "), 5},
		{strings.Join(reference.ShotFunction, " "), 4},
		{strings.Join(reference.VisualPreference, " "), 3},
		{strings.Join(reference.EmotionalEffect, " "), 3},
		{reference.SearchIndex.SearchText, 5},
		{strings.Join(reference.SearchIndex.NaturalLanguageQueries, " "), 6},
		{strings.Join(reference.SearchIndex.VisualFacets, " "), 4},
		{strings.Join(reference.SearchIndex.NarrativeFacets, " "), 5},
		{strings.Join(reference.SearchIndex.EmotionFacets, " "), 5},
		{strings.Join(reference.SearchIndex.PatternFacets, " "), 5},
		{strings.Join(reference.SearchIndex.ProductionFacets, " "), 3},
		{reference.VisualAnalysis.ShotSize, 3},
		{strings.Join(reference.VisualAnalysis.Composition, " "), 4},
		{strings.Join(reference.VisualAnalysis.Framing, " "), 4},
		{reference.VisualAnalysis.CameraMovement.Type, 4},
		{reference.VisualAnalysis.CameraMovement.Motivation, 4},
		{reference.VisualAnalysis.Focus.Behavior, 3},
		{reference.NarrativeFunction.Primary, 5},
		{reference.NarrativeFunction.InformationState, 4},
		{reference.EmotionalProfile.ViewerPosition, 4},
		{reference.ReusablePattern.Principle, 4},
	}
	if reference.Resource != nil {
		haystacks = append(haystacks, struct {
			text   string
			weight int
		}{reference.Resource.Name, 3})
	}
	score := 0
	score += scoreCanonicalTagMatches(reference, translation)
	for _, term := range translation.Terms {
		for _, item := range haystacks {
			if strings.Contains(strings.ToLower(item.text), term) {
				score += item.weight
			}
		}
	}
	return score
}

func scoreCanonicalTagMatches(reference domainshotreference.ShotReference, translation shotQueryTranslation) int {
	score := 0
	score += scoreCanonicalValues(reference.Intent, translation.CanonicalTags["intent"], 10)
	score += scoreCanonicalValues(reference.Pattern, translation.CanonicalTags["pattern"], 10)
	score += scoreCanonicalValues(reference.ShotFunction, translation.CanonicalTags["shotFunction"], 8)
	score += scoreCanonicalValues(reference.VisualPreference, translation.CanonicalTags["visualPreference"], 6)
	score += scoreCanonicalValues(reference.EmotionalEffect, translation.CanonicalTags["emotionalEffect"], 6)
	score += scoreCanonicalValues(referenceFacetValues(reference, "visual"), translation.CanonicalTags["visual"], 5)
	score += scoreCanonicalValues(referenceFacetValues(reference, "narrative"), translation.CanonicalTags["narrative"], 8)
	score += scoreCanonicalValues(referenceFacetValues(reference, "emotion"), translation.CanonicalTags["emotion"], 5)
	score += scoreCanonicalValues(referenceFacetValues(reference, "pattern"), translation.CanonicalTags["pattern"], 6)
	score += scoreCanonicalValues(referenceFacetValues(reference, "production"), translation.CanonicalTags["production"], 4)
	return score
}

func scoreCanonicalValues(referenceValues []string, queryValues []string, weight int) int {
	score := 0
	for _, value := range queryValues {
		if stringSliceContains(referenceValues, value) {
			score += weight
		}
	}
	return score
}

func resourceProxyURL(id uint) string {
	return "/api/v1/resources/" + strconvFormatUint(id) + "/file"
}

func strconvFormatUint(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}
