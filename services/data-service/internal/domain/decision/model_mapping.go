package decision

import (
	"encoding/json"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func ContextFromModel(row persistencemodel.DecisionContext) Context {
	return Context{
		ID:         row.ID,
		ProjectID:  row.ProjectID,
		TargetKind: row.TargetKind,
		TargetRef:  row.TargetRef,
		Candidates: decodeRawArray(row.CandidatesJSON),
		Selection:  decodeRawObject(row.SelectionJSON),
		Status:     row.Status,
		CreatedBy:  row.CreatedBy,
		UpdatedBy:  row.UpdatedBy,
		CreatedAt:  row.CreatedAt,
		UpdatedAt:  row.UpdatedAt,
	}
}

func ContextToModel(ctx Context) persistencemodel.DecisionContext {
	candidates, _ := json.Marshal(ctx.Candidates)
	selection := []byte("{}")
	if len(ctx.Selection) > 0 {
		selection = ctx.Selection
	}
	return persistencemodel.DecisionContext{
		ProjectID:      ctx.ProjectID,
		TargetKind:     ctx.TargetKind,
		TargetRef:      ctx.TargetRef,
		CandidatesJSON: string(candidates),
		SelectionJSON:  string(selection),
		Status:         ctx.Status,
		CreatedBy:      ctx.CreatedBy,
		UpdatedBy:      ctx.UpdatedBy,
	}
}

func decodeRawArray(value string) []json.RawMessage {
	var out []json.RawMessage
	if err := json.Unmarshal([]byte(value), &out); err != nil || out == nil {
		return []json.RawMessage{}
	}
	return out
}

func decodeRawObject(value string) json.RawMessage {
	var raw json.RawMessage
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		return nil
	}
	if string(raw) == "{}" || string(raw) == "null" {
		return nil
	}
	return raw
}
