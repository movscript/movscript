package script

import "github.com/movscript/movscript/internal/domain/model"

func ScriptSnapshotFromModel(script model.Script) ScriptSnapshot {
	return ScriptSnapshot{
		ID:                     script.ID,
		ProjectID:              script.ProjectID,
		Title:                  script.Title,
		Description:            script.Description,
		Content:                script.Content,
		RawSource:              script.RawSource,
		ScriptType:             script.ScriptType,
		SourceType:             script.SourceType,
		Version:                script.Version,
		ParentScriptID:         script.ParentScriptID,
		AnalysisStatus:         script.AnalysisStatus,
		AssigneeID:             script.AssigneeID,
		AuthorID:               script.AuthorID,
		Summary:                script.Summary,
		Characters:             script.Characters,
		CharacterProfiles:      script.CharacterProfiles,
		CharacterRelationships: script.CharacterRelationships,
		CoreSettings:           script.CoreSettings,
		Background:             script.Background,
		ScenesDesc:             script.ScenesDesc,
		Hook:                   script.Hook,
		PlotSummary:            script.PlotSummary,
		ScriptPoints:           script.ScriptPoints,
		PlannedSceneCount:      script.PlannedSceneCount,
		PlannedCharacterCount:  script.PlannedCharacterCount,
		TimeText:               script.TimeText,
		LocationText:           script.LocationText,
		StructuredCharacters:   script.StructuredCharacters,
		PlotBeats:              script.PlotBeats,
		Atmosphere:             script.Atmosphere,
		StructureJSON:          script.StructureJSON,
		EntityCandidates:       script.EntityCandidates,
		RelationshipCandidates: script.RelationshipCandidates,
		Order:                  script.Order,
		CreatedAt:              script.CreatedAt,
		UpdatedAt:              script.UpdatedAt,
	}
}

func (script ScriptSnapshot) ToModel() model.Script {
	var target model.Script
	script.ApplyToModel(&target)
	return target
}

func (script ScriptSnapshot) ApplyToModel(target *model.Script) {
	target.Model.ID = script.ID
	target.ProjectID = script.ProjectID
	target.Title = script.Title
	target.Description = script.Description
	target.Content = script.Content
	target.RawSource = script.RawSource
	target.ScriptType = script.ScriptType
	target.SourceType = script.SourceType
	target.Version = script.Version
	target.ParentScriptID = script.ParentScriptID
	target.AnalysisStatus = script.AnalysisStatus
	target.AssigneeID = script.AssigneeID
	target.AuthorID = script.AuthorID
	target.Summary = script.Summary
	target.Characters = script.Characters
	target.CharacterProfiles = script.CharacterProfiles
	target.CharacterRelationships = script.CharacterRelationships
	target.CoreSettings = script.CoreSettings
	target.Background = script.Background
	target.ScenesDesc = script.ScenesDesc
	target.Hook = script.Hook
	target.PlotSummary = script.PlotSummary
	target.ScriptPoints = script.ScriptPoints
	target.PlannedSceneCount = script.PlannedSceneCount
	target.PlannedCharacterCount = script.PlannedCharacterCount
	target.TimeText = script.TimeText
	target.LocationText = script.LocationText
	target.StructuredCharacters = script.StructuredCharacters
	target.PlotBeats = script.PlotBeats
	target.Atmosphere = script.Atmosphere
	target.StructureJSON = script.StructureJSON
	target.EntityCandidates = script.EntityCandidates
	target.RelationshipCandidates = script.RelationshipCandidates
	target.Order = script.Order
	target.CreatedAt = script.CreatedAt
	target.UpdatedAt = script.UpdatedAt
}

func ScriptVersionFromModel(version model.ScriptVersion) ScriptVersion {
	return ScriptVersion{
		ID:              version.ID,
		ProjectID:       version.ProjectID,
		ScriptID:        version.ScriptID,
		ParentVersionID: version.ParentVersionID,
		VersionNumber:   version.VersionNumber,
		Title:           version.Title,
		SourceType:      version.SourceType,
		Content:         version.Content,
		RawSource:       version.RawSource,
		Summary:         version.Summary,
		Status:          version.Status,
		CreatedByID:     version.CreatedByID,
		CreatedAt:       version.CreatedAt,
		UpdatedAt:       version.UpdatedAt,
	}
}

func (version ScriptVersion) ToModel() model.ScriptVersion {
	var target model.ScriptVersion
	version.ApplyToModel(&target)
	return target
}

func (version ScriptVersion) ApplyToModel(target *model.ScriptVersion) {
	target.Model.ID = version.ID
	target.ProjectID = version.ProjectID
	target.ScriptID = version.ScriptID
	target.ParentVersionID = version.ParentVersionID
	target.VersionNumber = version.VersionNumber
	target.Title = version.Title
	target.SourceType = version.SourceType
	target.Content = version.Content
	target.RawSource = version.RawSource
	target.Summary = version.Summary
	target.Status = version.Status
	target.CreatedByID = version.CreatedByID
	target.CreatedAt = version.CreatedAt
	target.UpdatedAt = version.UpdatedAt
}
