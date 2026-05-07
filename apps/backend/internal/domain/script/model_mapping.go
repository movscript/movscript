package script

import "github.com/movscript/movscript/internal/domain/model"

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
}
