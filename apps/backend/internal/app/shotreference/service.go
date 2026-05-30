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
}

func NewService(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, cacheStore ...cache.Cache) *Service {
	return &Service{
		repo:      &gormRepository{db: db},
		resources: appresource.NewService(db, store, verifier, cacheStore...),
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
	DurationSec *float64
	Width       int
	Height      int
	Shots       []domainshotreference.UpdateInput
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
	references := []domainshotreference.ShotReference{reference}
	s.populateResourceURLs(references)
	reference = references[0]
	return reference, nil
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
	terms := strings.Fields(strings.ToLower(strings.TrimSpace(query)))
	if len(terms) == 0 {
		return items
	}
	scored := make([]scoredReference, 0, len(items))
	for _, item := range items {
		score := scoreReference(item, terms)
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

func scoreReference(reference domainshotreference.ShotReference, terms []string) int {
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
	}
	if reference.Resource != nil {
		haystacks = append(haystacks, struct {
			text   string
			weight int
		}{reference.Resource.Name, 3})
	}
	score := 0
	for _, term := range terms {
		for _, item := range haystacks {
			if strings.Contains(strings.ToLower(item.text), term) {
				score += item.weight
			}
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
