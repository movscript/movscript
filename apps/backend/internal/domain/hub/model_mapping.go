package hub

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func HubPackageFromModel(pkg persistencemodel.HubPackage) HubPackage {
	return HubPackage{
		ID:              pkg.ID,
		PackageID:       pkg.PackageID,
		Title:           pkg.Title,
		Kind:            pkg.Kind,
		Category:        pkg.Category,
		Creator:         pkg.Creator,
		License:         pkg.License,
		Signal:          pkg.Signal,
		Summary:         pkg.Summary,
		Tags:            pkg.Tags,
		Downloads:       pkg.Downloads,
		Rating:          pkg.Rating,
		Version:         pkg.Version,
		FileSizeBytes:   pkg.FileSizeBytes,
		FileName:        pkg.FileName,
		ContentType:     pkg.ContentType,
		Compatibility:   pkg.Compatibility,
		Repository:      pkg.Repository,
		Status:          pkg.Status,
		SubmittedBy:     pkg.SubmittedBy,
		ReviewedBy:      pkg.ReviewedBy,
		ReviewNote:      pkg.ReviewNote,
		StagingProvider: pkg.StagingProvider,
		StagingKey:      pkg.StagingKey,
		PublicProvider:  pkg.PublicProvider,
		PublicKey:       pkg.PublicKey,
		PublishedAt:     pkg.PublishedAt,
		TakenDownAt:     pkg.TakenDownAt,
		CreatedAt:       pkg.CreatedAt,
		UpdatedAt:       pkg.UpdatedAt,
	}
}

func (pkg HubPackage) ToModel() persistencemodel.HubPackage {
	var target persistencemodel.HubPackage
	pkg.ApplyToModel(&target)
	return target
}

func (pkg HubPackage) ApplyToModel(target *persistencemodel.HubPackage) {
	target.Model.ID = pkg.ID
	target.Model.CreatedAt = pkg.CreatedAt
	target.Model.UpdatedAt = pkg.UpdatedAt
	target.PackageID = pkg.PackageID
	target.Title = pkg.Title
	target.Kind = pkg.Kind
	target.Category = pkg.Category
	target.Creator = pkg.Creator
	target.License = pkg.License
	target.Signal = pkg.Signal
	target.Summary = pkg.Summary
	target.Tags = pkg.Tags
	target.Downloads = pkg.Downloads
	target.Rating = pkg.Rating
	target.Version = pkg.Version
	target.FileSizeBytes = pkg.FileSizeBytes
	target.FileName = pkg.FileName
	target.ContentType = pkg.ContentType
	target.Compatibility = pkg.Compatibility
	target.Repository = pkg.Repository
	target.Status = pkg.Status
	target.SubmittedBy = pkg.SubmittedBy
	target.ReviewedBy = pkg.ReviewedBy
	target.ReviewNote = pkg.ReviewNote
	target.StagingProvider = pkg.StagingProvider
	target.StagingKey = pkg.StagingKey
	target.PublicProvider = pkg.PublicProvider
	target.PublicKey = pkg.PublicKey
	target.PublishedAt = pkg.PublishedAt
	target.TakenDownAt = pkg.TakenDownAt
}
