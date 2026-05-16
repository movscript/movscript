package relation

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func EdgeFromModel(edge persistencemodel.EntityRelation) Edge {
	return Edge{
		ID:          edge.ID,
		ProjectID:   edge.ProjectID,
		Source:      NewEntityRef(edge.SourceType, edge.SourceID),
		Target:      NewEntityRef(edge.TargetType, edge.TargetID),
		Category:    edge.Category,
		Type:        edge.Type,
		Label:       edge.Label,
		Scope:       NewEntityRef(edge.ScopeType, scopeID(edge.ScopeID)),
		Direction:   edge.Direction,
		Order:       edge.Order,
		Weight:      edge.Weight,
		Status:      edge.Status,
		Origin:      edge.Source,
		Evidence:    edge.Evidence,
		Metadata:    edge.MetadataJSON,
		CreatedByID: edge.CreatedByID,
		ValidFrom:   edge.ValidFrom,
		ValidTo:     edge.ValidTo,
		Revision:    edge.Revision,
		PreviousID:  edge.PreviousID,
		CreatedAt:   edge.CreatedAt,
		UpdatedAt:   edge.UpdatedAt,
	}
}

func EdgesFromModels(edges []persistencemodel.EntityRelation) []Edge {
	result := make([]Edge, 0, len(edges))
	for _, edge := range edges {
		result = append(result, EdgeFromModel(edge))
	}
	return result
}

func scopeID(id *uint) uint {
	if id == nil {
		return 0
	}
	return *id
}
