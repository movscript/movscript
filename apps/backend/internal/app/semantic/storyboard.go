package semantic

import (
	"context"
	"errors"
	"strconv"

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

type StoryboardLineFilter struct {
	ProjectID           uint
	StoryboardScriptID  uint
	StoryboardVersionID uint
	SegmentID           uint
	SceneMomentID       uint
	ScriptBlockID       uint
	ScriptBlockIDs      []uint
	Status              string
}

type StoryboardLineInput struct {
	StoryboardScriptID  uint    `json:"storyboard_script_id" binding:"required"`
	StoryboardVersionID *uint   `json:"storyboard_version_id"`
	SegmentID           *uint   `json:"segment_id"`
	SceneMomentID       *uint   `json:"scene_moment_id"`
	ScriptBlockID       *uint   `json:"script_block_id"`
	Order               int     `json:"order"`
	Kind                string  `json:"kind"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Dialogue            string  `json:"dialogue"`
	VisualIntent        string  `json:"visual_intent"`
	DurationSec         float64 `json:"duration_sec"`
	Status              string  `json:"status"`
	MetadataJSON        string  `json:"metadata_json"`
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
	return s.repo.CreateStoryboardScript(ctx, item)
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
	return s.repo.PatchStoryboardScript(ctx, item, patch)
}

func (s *Service) ensureStoryboardScriptSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.StoryboardScript, input StoryboardScriptInput) error {
	if optionalUintPatchPreserves(item.ScriptVersionID, input.ScriptVersionID) {
		return nil
	}
	versions, err := s.repo.ListStoryboardVersions(ctx, StoryboardVersionFilter{ProjectID: projectID, StoryboardScriptID: item.ID})
	if err != nil {
		return err
	}
	if len(versions) > 0 {
		return ErrInvalidInput{Err: errors.New("storyboard script source cannot be changed after storyboard versions are created")}
	}
	lines, err := s.repo.ListStoryboardLines(ctx, StoryboardLineFilter{ProjectID: projectID, StoryboardScriptID: item.ID})
	if err != nil {
		return err
	}
	if len(lines) > 0 {
		return ErrInvalidInput{Err: errors.New("storyboard script source cannot be changed after storyboard lines are created")}
	}
	return nil
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
	return s.repo.CreateStoryboardVersion(ctx, item)
}

func (s *Service) PatchStoryboardVersion(ctx context.Context, projectID uint, id string) (domainsemantic.StoryboardVersion, error) {
	return domainsemantic.StoryboardVersion{}, ErrForbidden{Message: "分镜版本创建后不可修改，请新建一个新版本"}
}

func (s *Service) ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]domainsemantic.StoryboardLine, error) {
	return s.repo.ListStoryboardLines(ctx, filter)
}

func (s *Service) CreateStoryboardLine(ctx context.Context, projectID uint, input StoryboardLineInput) (domainsemantic.StoryboardLine, error) {
	resolvedScriptBlockID, err := s.resolveStoryboardLineScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return domainsemantic.StoryboardLine{}, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return domainsemantic.StoryboardLine{}, err
	}
	item := storyboardLineFromInput(projectID, input)
	return s.repo.CreateStoryboardLine(ctx, item)
}

func (s *Service) PatchStoryboardLine(ctx context.Context, projectID uint, id string, input StoryboardLineInput) (domainsemantic.StoryboardLine, error) {
	item, err := s.repo.LoadStoryboardLine(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	resolvedScriptBlockID, err := s.resolveStoryboardLineScriptBlock(ctx, projectID, input.SegmentID, input.SceneMomentID, input.ScriptBlockID)
	if err != nil {
		return item, err
	}
	input.ScriptBlockID = resolvedScriptBlockID
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.ensureStoryboardLineSourceCanChange(ctx, projectID, item, input); err != nil {
		return item, err
	}
	patch := domainsemantic.StoryboardLinePatch{
		StoryboardScriptID:  input.StoryboardScriptID,
		StoryboardVersionID: input.StoryboardVersionID,
		SegmentID:           input.SegmentID,
		SceneMomentID:       input.SceneMomentID,
		ScriptBlockID:       input.ScriptBlockID,
		Order:               input.Order,
		Kind:                input.Kind,
		Title:               input.Title,
		Description:         input.Description,
		Dialogue:            input.Dialogue,
		VisualIntent:        input.VisualIntent,
		DurationSec:         input.DurationSec,
		Status:              input.Status,
		MetadataJSON:        input.MetadataJSON,
	}
	return s.repo.PatchStoryboardLine(ctx, item, patch)
}

func (s *Service) ensureStoryboardLineSourceCanChange(ctx context.Context, projectID uint, item domainsemantic.StoryboardLine, input StoryboardLineInput) error {
	if storyboardLineSourcePreserved(item, input) {
		return nil
	}
	units, err := s.repo.ListContentUnits(ctx, ContentUnitFilter{ProjectID: projectID, StoryboardLineID: item.ID})
	if err != nil {
		return err
	}
	if len(units) > 0 {
		return ErrInvalidInput{Err: errors.New("storyboard line source cannot be changed after content units are created")}
	}
	return nil
}

func storyboardLineSourcePreserved(item domainsemantic.StoryboardLine, input StoryboardLineInput) bool {
	return item.StoryboardScriptID == input.StoryboardScriptID &&
		optionalUintPatchPreserves(item.StoryboardVersionID, input.StoryboardVersionID) &&
		optionalUintPatchPreserves(item.SegmentID, input.SegmentID) &&
		optionalUintPatchPreserves(item.SceneMomentID, input.SceneMomentID) &&
		optionalUintPatchPreserves(item.ScriptBlockID, input.ScriptBlockID)
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

func (s *Service) validateStoryboardLineOwners(ctx context.Context, projectID uint, input StoryboardLineInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "storyboard_script", input.StoryboardScriptID); err != nil {
		return err
	}
	if input.StoryboardVersionID != nil {
		version, err := s.repo.LoadStoryboardVersion(ctx, projectID, strconv.FormatUint(uint64(*input.StoryboardVersionID), 10))
		if err != nil {
			return err
		}
		if version.StoryboardScriptID != input.StoryboardScriptID {
			return ErrOwnerWrongProject
		}
	}
	if err := s.validateScopedOwner(ctx, projectID, "segment", input.SegmentID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "scene_moment", input.SceneMomentID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "script_block", input.ScriptBlockID); err != nil {
		return err
	}
	return s.validateContentUnitScriptSource(ctx, projectID, input.SegmentID, input.SceneMomentID, nil, input.ScriptBlockID)
}

func (s *Service) resolveStoryboardLineScriptBlock(ctx context.Context, projectID uint, segmentID *uint, sceneMomentID *uint, scriptBlockID *uint) (*uint, error) {
	return s.resolveContentUnitScriptBlock(ctx, projectID, segmentID, sceneMomentID, scriptBlockID)
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

func storyboardLineFromInput(projectID uint, input StoryboardLineInput) domainsemantic.StoryboardLine {
	return domainsemantic.NewStoryboardLine(domainsemantic.StoryboardLineSpec{
		ProjectID:           projectID,
		StoryboardScriptID:  input.StoryboardScriptID,
		StoryboardVersionID: input.StoryboardVersionID,
		SegmentID:           input.SegmentID,
		SceneMomentID:       input.SceneMomentID,
		ScriptBlockID:       input.ScriptBlockID,
		Order:               input.Order,
		Kind:                input.Kind,
		Title:               input.Title,
		Description:         input.Description,
		Dialogue:            input.Dialogue,
		VisualIntent:        input.VisualIntent,
		DurationSec:         input.DurationSec,
		Status:              input.Status,
		MetadataJSON:        input.MetadataJSON,
	})
}

func (s *Service) nextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	return s.repo.NextStoryboardVersionNumber(ctx, projectID, storyboardScriptID)
}
