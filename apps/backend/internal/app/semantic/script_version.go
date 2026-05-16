package semantic

import (
	"context"
	"errors"
	"strconv"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]domainsemantic.ScriptVersion, error) {
	return s.repo.ListScriptVersions(ctx, filter)
}

func (s *Service) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (domainsemantic.ScriptVersion, error) {
	if err := s.validateScriptVersionOwners(ctx, projectID, input); err != nil {
		return domainsemantic.ScriptVersion{}, err
	}
	versionNumber := s.nextScriptVersionNumber(ctx, projectID, input.ScriptID)
	var item domainsemantic.ScriptVersion
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		item, err = txSvc.repo.CreateScriptVersion(ctx, projectID, input, versionNumber, createdByID)
		if err != nil {
			return err
		}
		return txSvc.upsertScriptVersionRelations(ctx, item)
	})
	if err != nil {
		return item, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return item, nil
}

func (s *Service) PatchScriptVersion(ctx context.Context, projectID uint, id string) (domainsemantic.ScriptVersion, error) {
	return domainsemantic.ScriptVersion{}, ErrForbidden{Message: "剧本版本创建后不可修改，请新建一个新版本"}
}

func (s *Service) ListScriptVersionLines(ctx context.Context, projectID uint, id string) ([]ScriptVersionLine, error) {
	version, err := s.repo.LoadScriptVersion(ctx, projectID, id)
	if err != nil {
		return nil, err
	}
	source := scriptVersionSourceText(version)
	if strings.TrimSpace(source) == "" {
		return []ScriptVersionLine{}, nil
	}
	rawLines := strings.Split(source, "\n")
	lines := make([]ScriptVersionLine, 0, len(rawLines))
	for index, line := range rawLines {
		lines = append(lines, ScriptVersionLine{
			LineNumber: index + 1,
			Content:    line,
			StartChar:  0,
			EndChar:    len([]rune(line)),
		})
	}
	return lines, nil
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	return s.repo.NextScriptVersionNumber(ctx, projectID, scriptID)
}

func (s *Service) ListScriptBlocks(ctx context.Context, filter ScriptBlockFilter) ([]domainsemantic.ScriptBlock, error) {
	return s.repo.ListScriptBlocks(ctx, filter)
}

func (s *Service) CreateScriptBlock(ctx context.Context, projectID uint, input CreateScriptBlockInput) (domainsemantic.ScriptBlock, error) {
	version, err := s.validateScriptBlockOwners(ctx, projectID, input.ScriptID, input.ScriptVersionID, input.ParentBlockID)
	if err != nil {
		return domainsemantic.ScriptBlock{}, err
	}
	content, startLine, endLine, startChar, endChar, err := scriptBlockSourceFromVersion(version, input)
	if err != nil {
		return domainsemantic.ScriptBlock{}, err
	}
	item := domainsemantic.NewScriptBlock(domainsemantic.ScriptBlockSpec{
		ProjectID:       projectID,
		ScriptID:        input.ScriptID,
		ScriptVersionID: input.ScriptVersionID,
		ParentBlockID:   input.ParentBlockID,
		Order:           input.Order,
		Kind:            input.Kind,
		Speaker:         input.Speaker,
		Content:         content,
		StartLine:       startLine,
		EndLine:         endLine,
		StartChar:       startChar,
		EndChar:         endChar,
		Status:          input.Status,
		MetadataJSON:    input.MetadataJSON,
	})
	var created domainsemantic.ScriptBlock
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateScriptBlock(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertScriptBlockRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchScriptBlock(ctx context.Context, projectID uint, id string, input PatchScriptBlockInput) (domainsemantic.ScriptBlock, error) {
	item, err := s.repo.LoadScriptBlock(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ParentBlockID != nil {
		if _, err := s.validateScriptBlockOwners(ctx, projectID, item.ScriptID, item.ScriptVersionID, input.ParentBlockID); err != nil {
			return item, err
		}
	}
	patch := domainsemantic.ScriptBlockPatch{
		ParentBlockID: input.ParentBlockID,
		Order:         input.Order,
		Kind:          input.Kind,
		Speaker:       input.Speaker,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
	var patched domainsemantic.ScriptBlock
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchScriptBlock(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertScriptBlockRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertScriptVersionRelations(ctx context.Context, item domainsemantic.ScriptVersion) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasVersion,
		Target:    domainrelation.NewEntityRef("script_version", item.ID),
	}); err != nil {
		return err
	}
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("script_version", item.ID),
	}); err != nil {
		return err
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("script", item.ScriptID),
		Target:    domainrelation.NewEntityRef("script_version", item.ID),
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
			Source:    domainrelation.NewEntityRef("script_version", item.ID),
			Target:    domainrelation.NewEntityRef("script_version", *item.ParentVersionID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeDerivedFrom,
			Order:     item.VersionNumber,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) upsertScriptBlockRelations(ctx context.Context, item domainsemantic.ScriptBlock) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("script_block", item.ID),
	}); err != nil {
		return err
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("script_version", item.ScriptVersionID),
		Target:    domainrelation.NewEntityRef("script_block", item.ID),
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Order:     item.Order,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	if item.ParentBlockID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("script_block", *item.ParentBlockID),
			Target:    domainrelation.NewEntityRef("script_block", item.ID),
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeContains,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

type ScriptBlockUsages struct {
	Segments     []domainsemantic.Segment     `json:"segments"`
	SceneMoments []domainsemantic.SceneMoment `json:"scene_moments"`
	ContentUnits []domainsemantic.ContentUnit `json:"content_units"`
}

type ScriptBlockUsageMap map[uint]ScriptBlockUsages

func (s *Service) ListScriptBlockUsages(ctx context.Context, projectID uint, id string) (ScriptBlockUsages, error) {
	block, err := s.repo.LoadScriptBlock(ctx, projectID, id)
	if err != nil {
		return ScriptBlockUsages{}, err
	}
	return s.scriptBlockUsagesFromRelations(ctx, projectID, block.ID)
}

func (s *Service) ListScriptBlockUsageMap(ctx context.Context, projectID uint, scriptVersionID uint) (ScriptBlockUsageMap, error) {
	if scriptVersionID == 0 {
		return ScriptBlockUsageMap{}, ErrInvalidInput{Err: errors.New("script_version_id is required")}
	}
	if _, err := s.repo.LoadScriptVersion(ctx, projectID, strconv.FormatUint(uint64(scriptVersionID), 10)); err != nil {
		return ScriptBlockUsageMap{}, err
	}
	blockIDs, err := s.scriptVersionBlockIDsFromRelations(ctx, projectID, scriptVersionID)
	if err != nil {
		return ScriptBlockUsageMap{}, err
	}
	result := ScriptBlockUsageMap{}
	for _, blockID := range blockIDs {
		result[blockID] = ScriptBlockUsages{}
	}
	if len(blockIDs) == 0 {
		return result, nil
	}
	for _, blockID := range blockIDs {
		usages, err := s.scriptBlockUsagesFromRelations(ctx, projectID, blockID)
		if err != nil {
			return ScriptBlockUsageMap{}, err
		}
		result[blockID] = usages
	}
	return result, nil
}

func (s *Service) scriptVersionBlockIDsFromRelations(ctx context.Context, projectID uint, scriptVersionID uint) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Source:    domainrelation.NewEntityRef("script_version", scriptVersionID),
	})
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{})
	for _, edge := range edges {
		if edge.Target.Type != "script_block" {
			continue
		}
		if _, ok := seen[edge.Target.ID]; ok {
			continue
		}
		seen[edge.Target.ID] = struct{}{}
		ids = append(ids, edge.Target.ID)
	}
	return ids, nil
}

func (s *Service) scriptBlockUsagesFromRelations(ctx context.Context, projectID uint, scriptBlockID uint) (ScriptBlockUsages, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Target:    domainrelation.NewEntityRef("script_block", scriptBlockID),
	})
	if err != nil {
		return ScriptBlockUsages{}, err
	}
	usages := ScriptBlockUsages{}
	seenSegments := make(map[uint]struct{})
	seenMoments := make(map[uint]struct{})
	seenUnits := make(map[uint]struct{})
	for _, edge := range edges {
		switch edge.Source.Type {
		case "segment":
			if _, ok := seenSegments[edge.Source.ID]; ok {
				continue
			}
			segment, err := s.repo.LoadSegment(ctx, projectID, strconv.FormatUint(uint64(edge.Source.ID), 10))
			if err != nil {
				return ScriptBlockUsages{}, err
			}
			seenSegments[edge.Source.ID] = struct{}{}
			usages.Segments = append(usages.Segments, segment)
		case "scene_moment":
			if _, ok := seenMoments[edge.Source.ID]; ok {
				continue
			}
			moment, err := s.repo.LoadSceneMoment(ctx, projectID, strconv.FormatUint(uint64(edge.Source.ID), 10))
			if err != nil {
				return ScriptBlockUsages{}, err
			}
			seenMoments[edge.Source.ID] = struct{}{}
			usages.SceneMoments = append(usages.SceneMoments, moment)
		case "content_unit":
			if _, ok := seenUnits[edge.Source.ID]; ok {
				continue
			}
			unit, err := s.repo.LoadContentUnit(ctx, projectID, strconv.FormatUint(uint64(edge.Source.ID), 10))
			if err != nil {
				return ScriptBlockUsages{}, err
			}
			seenUnits[edge.Source.ID] = struct{}{}
			usages.ContentUnits = append(usages.ContentUnits, unit)
		}
	}
	return usages, nil
}

func (s *Service) validateScriptVersionOwners(ctx context.Context, projectID uint, input CreateScriptVersionInput) error {
	if input.ScriptID == 0 {
		return ErrInvalidInput{Err: errors.New("script_id is required")}
	}
	if _, err := s.repo.LoadScriptForProject(ctx, projectID, input.ScriptID); err != nil {
		return err
	}
	if input.ParentVersionID == nil {
		return nil
	}
	parent, err := s.repo.LoadScriptVersion(ctx, projectID, strconv.FormatUint(uint64(*input.ParentVersionID), 10))
	if err != nil {
		return err
	}
	if parent.ScriptID != input.ScriptID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) validateScriptBlockOwners(ctx context.Context, projectID uint, scriptID uint, scriptVersionID uint, parentBlockID *uint) (domainsemantic.ScriptVersion, error) {
	if scriptID == 0 || scriptVersionID == 0 {
		return domainsemantic.ScriptVersion{}, ErrInvalidInput{Err: errors.New("script_id and script_version_id are required")}
	}
	version, err := s.repo.LoadScriptVersion(ctx, projectID, strconv.FormatUint(uint64(scriptVersionID), 10))
	if err != nil {
		return domainsemantic.ScriptVersion{}, err
	}
	if version.ScriptID != scriptID {
		return domainsemantic.ScriptVersion{}, ErrOwnerWrongProject
	}
	if parentBlockID != nil {
		parent, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*parentBlockID), 10))
		if err != nil {
			return domainsemantic.ScriptVersion{}, err
		}
		if parent.ScriptID != scriptID || parent.ScriptVersionID != scriptVersionID {
			return domainsemantic.ScriptVersion{}, ErrOwnerWrongProject
		}
	}
	return version, nil
}

func scriptVersionSourceText(version domainsemantic.ScriptVersion) string {
	source := normalizeScriptSource(version.Content)
	if strings.TrimSpace(source) == "" {
		source = normalizeScriptSource(version.RawSource)
	}
	return source
}

func scriptBlockSourceFromVersion(version domainsemantic.ScriptVersion, input CreateScriptBlockInput) (string, int, int, int, int, error) {
	source := scriptVersionSourceText(version)
	if strings.TrimSpace(source) == "" {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script version has no source text")}
	}
	lines := strings.Split(source, "\n")
	startLine := input.StartLine
	endLine := input.EndLine
	if startLine <= 0 || endLine <= 0 || startLine > endLine || startLine > len(lines) || endLine > len(lines) {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block line range is outside script version")}
	}
	if input.StartChar < 0 || input.EndChar < 0 {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block character range is invalid")}
	}

	startChar := input.StartChar
	endChar := input.EndChar
	if startChar == 0 && endChar == 0 {
		precise, preciseErr := extractScriptBlockText(lines, startLine, endLine, startChar, endChar)
		if preciseErr == nil && input.Content != "" && normalizeScriptSource(input.Content) == precise {
			if strings.TrimSpace(precise) == "" {
				return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block source text is empty")}
			}
			return precise, startLine, endLine, startChar, endChar, nil
		}
		startChar = 0
		endChar = len([]rune(lines[endLine-1]))
	}

	content, err := extractScriptBlockText(lines, startLine, endLine, startChar, endChar)
	if err != nil {
		return "", 0, 0, 0, 0, err
	}
	if strings.TrimSpace(content) == "" {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block source text is empty")}
	}
	return content, startLine, endLine, startChar, endChar, nil
}

func normalizeScriptSource(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	return strings.ReplaceAll(text, "\r", "\n")
}

func extractScriptBlockText(lines []string, startLine int, endLine int, startChar int, endChar int) (string, error) {
	first := []rune(lines[startLine-1])
	last := []rune(lines[endLine-1])
	if startChar > len(first) || endChar > len(last) {
		return "", ErrInvalidInput{Err: errors.New("script block character range is outside script version line")}
	}
	if startLine == endLine {
		if startChar >= endChar {
			return "", ErrInvalidInput{Err: errors.New("script block character range is empty")}
		}
		return string(first[startChar:endChar]), nil
	}

	parts := make([]string, 0, endLine-startLine+1)
	parts = append(parts, string(first[startChar:]))
	for line := startLine + 1; line < endLine; line++ {
		parts = append(parts, lines[line-1])
	}
	parts = append(parts, string(last[:endChar]))
	return strings.Join(parts, "\n"), nil
}
