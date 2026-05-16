package semantic

import (
	"context"
	"errors"
	"strconv"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type StoryboardScriptFilter struct {
	ProjectID       uint
	ScriptVersionID uint
	Status          string
}

type StoryboardScriptInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Status          string `json:"status"`
	IsPrimary       bool   `json:"is_primary"`
	MetadataJSON    string `json:"metadata_json"`
}

type StoryboardVersionFilter struct {
	ProjectID          uint
	StoryboardScriptID uint
	Status             string
}

type StoryboardVersionInput struct {
	StoryboardScriptID uint   `json:"storyboard_script_id" binding:"required"`
	ParentVersionID    *uint  `json:"parent_version_id"`
	Title              string `json:"title"`
	Source             string `json:"source"`
	Status             string `json:"status"`
	SnapshotJSON       string `json:"snapshot_json"`
	MetadataJSON       string `json:"metadata_json"`
}

func (s *Service) ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]domainsemantic.StoryboardScript, error) {
	return s.repo.ListStoryboardScripts(ctx, filter)
}

func (s *Service) CreateStoryboardScript(ctx context.Context, projectID uint, input StoryboardScriptInput) (domainsemantic.StoryboardScript, error) {
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return domainsemantic.StoryboardScript{}, err
		}
	}
	item := domainsemantic.NewStoryboardScript(domainsemantic.StoryboardScriptSpec{
		ProjectID:       projectID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Description:     input.Description,
		Status:          input.Status,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	})
	var created domainsemantic.StoryboardScript
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateStoryboardScript(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertStoryboardScriptRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchStoryboardScript(ctx context.Context, projectID uint, id string, input StoryboardScriptInput) (domainsemantic.StoryboardScript, error) {
	item, err := s.repo.LoadStoryboardScript(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return item, err
		}
	}
	if err := s.ensureStoryboardScriptSourceCanChange(ctx, projectID, item, input); err != nil {
		return item, err
	}
	patch := domainsemantic.StoryboardScriptPatch{
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Description:     input.Description,
		Status:          input.Status,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	var patched domainsemantic.StoryboardScript
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchStoryboardScript(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertStoryboardScriptRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertStoryboardScriptRelations(ctx context.Context, item domainsemantic.StoryboardScript) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("storyboard_script", item.ID),
	}); err != nil {
		return err
	}
	if item.ScriptVersionID == nil {
		return nil
	}
	return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("storyboard_script", item.ID),
		Target:    domainrelation.NewEntityRef("script_version", *item.ScriptVersionID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Status:    semanticRelationStatus(item.Status),
	})
}

func (s *Service) ensureStoryboardScriptSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.StoryboardScript, input StoryboardScriptInput) error {
	if optionalUintPatchPreserves(item.ScriptVersionID, input.ScriptVersionID) {
		return nil
	}
	status, err := s.storyboardScriptSourceLockStatus(ctx, projectID, item)
	if err != nil {
		return err
	}
	return status.ErrSourceChangeLocked("storyboard script source cannot be changed after storyboard versions are created")
}

func (s *Service) ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]domainsemantic.StoryboardVersion, error) {
	return s.repo.ListStoryboardVersions(ctx, filter)
}

func (s *Service) CreateStoryboardVersion(ctx context.Context, projectID uint, input StoryboardVersionInput) (domainsemantic.StoryboardVersion, error) {
	if err := s.ensureOwnerInProject(ctx, projectID, "storyboard_script", input.StoryboardScriptID); err != nil {
		return domainsemantic.StoryboardVersion{}, err
	}
	if err := s.validateStoryboardParentVersion(ctx, projectID, input.StoryboardScriptID, input.ParentVersionID); err != nil {
		return domainsemantic.StoryboardVersion{}, err
	}
	versionNumber := s.nextStoryboardVersionNumber(ctx, projectID, input.StoryboardScriptID)
	item := domainsemantic.NewStoryboardVersion(domainsemantic.StoryboardVersionSpec{
		ProjectID:          projectID,
		StoryboardScriptID: input.StoryboardScriptID,
		ParentVersionID:    input.ParentVersionID,
		VersionNumber:      versionNumber,
		Title:              input.Title,
		Source:             input.Source,
		Status:             input.Status,
		SnapshotJSON:       input.SnapshotJSON,
		MetadataJSON:       input.MetadataJSON,
	})
	var created domainsemantic.StoryboardVersion
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateStoryboardVersion(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertStoryboardVersionRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) upsertStoryboardVersionRelations(ctx context.Context, item domainsemantic.StoryboardVersion) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasVersion,
		Target:    domainrelation.NewEntityRef("storyboard_version", item.ID),
	}); err != nil {
		return err
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("storyboard_version", item.ID),
	}); err != nil {
		return err
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("storyboard_script", item.StoryboardScriptID),
		Target:    domainrelation.NewEntityRef("storyboard_version", item.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasVersion,
		Order:     item.VersionNumber,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	if item.ParentVersionID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("storyboard_version", item.ID),
			Target:    domainrelation.NewEntityRef("storyboard_version", *item.ParentVersionID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeDerivedFrom,
			Order:     item.VersionNumber,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) PatchStoryboardVersion(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardVersion, error) {
	return domainsemantic.StoryboardVersion{}, ErrForbidden{Message: "分镜版本创建后不可修改，请新建一个新版本"}
}

func optionalUintPatchPreserves(existing *uint, patch *uint) bool {
	if patch == nil {
		return true
	}
	if existing == nil {
		return false
	}
	return *existing == *patch
}

func (s *Service) validateStoryboardParentVersion(ctx context.Context, projectID uint, storyboardScriptID uint, parentVersionID *uint) error {
	if parentVersionID == nil {
		return nil
	}
	parent, err := s.repo.LoadStoryboardVersion(ctx, projectID, strconv.FormatUint(uint64(*parentVersionID), 10))
	if err != nil {
		return err
	}
	if parent.StoryboardScriptID != storyboardScriptID {
		return ErrInvalidInput{Err: errors.New("parent storyboard version must belong to the same storyboard script")}
	}
	return nil
}

func (s *Service) nextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	return s.repo.NextStoryboardVersionNumber(ctx, projectID, storyboardScriptID)
}
