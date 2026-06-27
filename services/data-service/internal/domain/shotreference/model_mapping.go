package shotreference

import (
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func FromModel(input persistencemodel.ShotReference) ShotReference {
	var resource *domainresource.RawResource
	if input.Resource.ID != 0 {
		r := domainresource.RawResourceFromModel(input.Resource)
		resource = &r
	}
	reference := ShotReference{
		ID:                 input.ID,
		OwnerID:            input.OwnerID,
		OrgID:              input.OrgID,
		GroupID:            input.GroupID,
		Group:              groupFromModel(input.Group),
		ResourceID:         input.ResourceID,
		Resource:           resource,
		Order:              input.Order,
		StartSec:           input.StartSec,
		EndSec:             input.EndSec,
		Title:              input.Title,
		Summary:            input.Summary,
		AnalysisStatus:     input.AnalysisStatus,
		AnalysisSource:     input.AnalysisSource,
		Intent:             readStringArray(input.IntentJSON),
		Pattern:            readStringArray(input.PatternJSON),
		ShotFunction:       readStringArray(input.ShotFunctionJSON),
		VisualPreference:   readStringArray(input.VisualPrefJSON),
		EmotionalEffect:    readStringArray(input.EmotionalJSON),
		ExecutionDetails:   readExecutionDetails(input.ExecutionJSON),
		VisualAnalysis:     readVisualAnalysis(input.VisualAnalysisJSON),
		SceneSemantics:     readSceneSemantics(input.SceneSemanticsJSON),
		NarrativeFunction:  readNarrativeFunction(input.NarrativeJSON),
		EmotionalProfile:   readEmotionalProfile(input.EmotionalProfileJSON),
		ReusablePattern:    readReusablePattern(input.ReusablePatternJSON),
		SearchIndex:        readSearchIndex(input.SearchIndexJSON),
		RetrievalText:      input.RetrievalText,
		MachineDescription: input.MachineDesc,
		ReusablePrinciple:  input.ReusablePrinciple,
		CreatedAt:          input.CreatedAt,
		UpdatedAt:          input.UpdatedAt,
	}
	return EnsureDerivedFields(reference)
}

func (reference ShotReference) ToModel() persistencemodel.ShotReference {
	model := persistencemodel.ShotReference{
		OwnerID:              reference.OwnerID,
		OrgID:                reference.OrgID,
		GroupID:              reference.GroupID,
		ResourceID:           reference.ResourceID,
		Order:                reference.Order,
		StartSec:             reference.StartSec,
		EndSec:               reference.EndSec,
		Title:                reference.Title,
		Summary:              reference.Summary,
		AnalysisStatus:       reference.AnalysisStatus,
		AnalysisSource:       defaultAnalysisSource(reference.AnalysisSource),
		IntentJSON:           writeJSON(reference.Intent, "[]"),
		PatternJSON:          writeJSON(reference.Pattern, "[]"),
		ShotFunctionJSON:     writeJSON(reference.ShotFunction, "[]"),
		VisualPrefJSON:       writeJSON(reference.VisualPreference, "[]"),
		EmotionalJSON:        writeJSON(reference.EmotionalEffect, "[]"),
		ExecutionJSON:        writeJSON(reference.ExecutionDetails, "{}"),
		VisualAnalysisJSON:   writeJSON(reference.VisualAnalysis, "{}"),
		SceneSemanticsJSON:   writeJSON(reference.SceneSemantics, "{}"),
		NarrativeJSON:        writeJSON(reference.NarrativeFunction, "{}"),
		EmotionalProfileJSON: writeJSON(reference.EmotionalProfile, "{}"),
		ReusablePatternJSON:  writeJSON(reference.ReusablePattern, "{}"),
		SearchIndexJSON:      writeJSON(reference.SearchIndex, "{}"),
		RetrievalText:        reference.RetrievalText,
		MachineDesc:          reference.MachineDescription,
		ReusablePrinciple:    reference.ReusablePrinciple,
	}
	model.Model.ID = reference.ID
	return model
}

func GroupFromModel(input persistencemodel.ShotReferenceGroup) ShotReferenceGroup {
	var resource *domainresource.RawResource
	if input.SourceResource.ID != 0 {
		r := domainresource.RawResourceFromModel(input.SourceResource)
		resource = &r
	}
	return ShotReferenceGroup{
		ID:               input.ID,
		OwnerID:          input.OwnerID,
		OrgID:            input.OrgID,
		SourceResourceID: input.SourceResourceID,
		SourceResource:   resource,
		Title:            input.Title,
		Summary:          input.Summary,
		AnalysisStatus:   input.AnalysisStatus,
		CutStrategy:      input.CutStrategy,
		CreatedAt:        input.CreatedAt,
		UpdatedAt:        input.UpdatedAt,
	}
}

func (group ShotReferenceGroup) ToModel() persistencemodel.ShotReferenceGroup {
	model := persistencemodel.ShotReferenceGroup{
		OwnerID:          group.OwnerID,
		OrgID:            group.OrgID,
		SourceResourceID: group.SourceResourceID,
		Title:            group.Title,
		Summary:          group.Summary,
		AnalysisStatus:   group.AnalysisStatus,
		CutStrategy:      group.CutStrategy,
	}
	model.Model.ID = group.ID
	return model
}

func groupFromModel(input *persistencemodel.ShotReferenceGroup) *ShotReferenceGroup {
	if input == nil || input.ID == 0 {
		return nil
	}
	group := GroupFromModel(*input)
	return &group
}
