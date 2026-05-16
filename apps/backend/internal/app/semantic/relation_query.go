package semantic

import (
	"context"
	"encoding/json"
	"strconv"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
)

type relationIDSelection struct {
	ordered []uint
	seen    map[uint]struct{}
}

func newRelationIDSelection(ids []uint) relationIDSelection {
	selection := relationIDSelection{
		ordered: make([]uint, 0, len(ids)),
		seen:    make(map[uint]struct{}, len(ids)),
	}
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := selection.seen[id]; ok {
			continue
		}
		selection.seen[id] = struct{}{}
		selection.ordered = append(selection.ordered, id)
	}
	return selection
}

func (selection relationIDSelection) intersect(ids []uint) relationIDSelection {
	if selection.seen == nil {
		return newRelationIDSelection(ids)
	}
	next := make(map[uint]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := selection.seen[id]; ok {
			next[id] = struct{}{}
		}
	}
	out := relationIDSelection{
		ordered: make([]uint, 0, len(selection.ordered)),
		seen:    make(map[uint]struct{}, len(next)),
	}
	for _, id := range selection.ordered {
		if _, ok := next[id]; !ok {
			continue
		}
		out.seen[id] = struct{}{}
		out.ordered = append(out.ordered, id)
	}
	return out
}

func (s *Service) relatedTargetIDs(ctx context.Context, filter relationapp.EdgeFilter, targetType string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	return targetIDsFromEdges(edges, targetType, nil), nil
}

func (s *Service) relatedTargetIDsOfTypes(ctx context.Context, filter relationapp.EdgeFilter, targetType string, edgeTypes ...string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]struct{}, len(edgeTypes))
	for _, edgeType := range edgeTypes {
		if edgeType == "" {
			continue
		}
		allowed[edgeType] = struct{}{}
	}
	return targetIDsFromEdges(edges, targetType, allowed), nil
}

func targetIDsFromEdges(edges []domainrelation.Edge, targetType string, allowedTypes map[string]struct{}) []uint {
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Target.Type != targetType {
			continue
		}
		if len(allowedTypes) > 0 {
			if _, ok := allowedTypes[edge.Type]; !ok {
				continue
			}
		}
		if _, ok := seen[edge.Target.ID]; ok {
			continue
		}
		seen[edge.Target.ID] = struct{}{}
		ids = append(ids, edge.Target.ID)
	}
	return ids
}

func (s *Service) relatedSourceIDs(ctx context.Context, filter relationapp.EdgeFilter, sourceType string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Source.Type != sourceType {
			continue
		}
		if _, ok := seen[edge.Source.ID]; ok {
			continue
		}
		seen[edge.Source.ID] = struct{}{}
		ids = append(ids, edge.Source.ID)
	}
	return ids, nil
}

func structureContainsFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func structureBasedOnTargetFilter(projectID uint, targetType string, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Target:    domainrelation.NewEntityRef(targetType, targetID),
	}
}

func structureHasKeyframeFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeHasKeyframe,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func structureDerivedFromTargetFilter(projectID uint, targetType string, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeDerivedFrom,
		Target:    domainrelation.NewEntityRef(targetType, targetID),
	}
}

func deliveryDerivedFromTargetFilter(projectID uint, targetType string, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeDerivedFrom,
		Target:    domainrelation.NewEntityRef(targetType, targetID),
	}
}

func deliveryContainsFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeContains,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func deliveryExportsTargetFilter(projectID uint, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeExports,
		Target:    domainrelation.NewEntityRef("delivery_version", targetID),
	}
}

func workflowContainsFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeContains,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func assetSourceFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryAsset,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func assetCandidateForTargetFilter(projectID uint, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeCandidateFor,
		Target:    domainrelation.NewEntityRef("asset_slot", targetID),
	}
}

func creativeUsesSourceFilter(projectID uint, sourceType string, sourceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
		Source:    domainrelation.NewEntityRef(sourceType, sourceID),
	}
}

func creativeUsesTargetFilter(projectID uint, targetID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
		Target:    domainrelation.NewEntityRef("creative_reference", targetID),
	}
}

func creativeReferenceEdgeFilter(projectID uint, referenceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryCreative,
		Source:    domainrelation.NewEntityRef("creative_reference", referenceID),
	}
}

func creativeHasStateFilter(projectID uint, referenceID uint) relationapp.EdgeFilter {
	return relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeHasState,
		Source:    domainrelation.NewEntityRef("creative_reference", referenceID),
	}
}

func relationMetadataUint(metadata string, key string) uint {
	if metadata == "" || key == "" {
		return 0
	}
	values := map[string]any{}
	if err := json.Unmarshal([]byte(metadata), &values); err != nil {
		return 0
	}
	switch value := values[key].(type) {
	case float64:
		if value > 0 {
			return uint(value)
		}
	case int:
		if value > 0 {
			return uint(value)
		}
	case string:
		id, err := strconv.ParseUint(value, 10, 64)
		if err == nil {
			return uint(id)
		}
	}
	return 0
}

func entityIDString(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}
