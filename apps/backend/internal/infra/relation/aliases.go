package relation

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

const (
	EntityRelationCategoryStructure = persistencemodel.EntityRelationCategoryStructure
	EntityRelationCategoryCreative  = persistencemodel.EntityRelationCategoryCreative
	EntityRelationCategoryAsset     = persistencemodel.EntityRelationCategoryAsset
	EntityRelationCategoryWorkflow  = persistencemodel.EntityRelationCategoryWorkflow
	EntityRelationCategoryDelivery  = persistencemodel.EntityRelationCategoryDelivery

	EntityRelationTypeOwns         = persistencemodel.EntityRelationTypeOwns
	EntityRelationTypeContains     = persistencemodel.EntityRelationTypeContains
	EntityRelationTypeUses         = persistencemodel.EntityRelationTypeUses
	EntityRelationTypeHasVersion   = persistencemodel.EntityRelationTypeHasVersion
	EntityRelationTypeDerivedFrom  = persistencemodel.EntityRelationTypeDerivedFrom
	EntityRelationTypeUsesPreview  = persistencemodel.EntityRelationTypeUsesPreview
	EntityRelationTypeHasAsset     = persistencemodel.EntityRelationTypeHasAsset
	EntityRelationTypeNeedsAsset   = persistencemodel.EntityRelationTypeNeedsAsset
	EntityRelationTypeUsesAsset    = persistencemodel.EntityRelationTypeUsesAsset
	EntityRelationTypeUsesResource = persistencemodel.EntityRelationTypeUsesResource
	EntityRelationTypeHasState     = persistencemodel.EntityRelationTypeHasState
	EntityRelationTypeBasedOn      = persistencemodel.EntityRelationTypeBasedOn
	EntityRelationTypeRepresents   = persistencemodel.EntityRelationTypeRepresents
	EntityRelationTypeHasKeyframe  = persistencemodel.EntityRelationTypeHasKeyframe
	EntityRelationTypeCompilesTo   = persistencemodel.EntityRelationTypeCompilesTo
	EntityRelationTypeCandidateFor = persistencemodel.EntityRelationTypeCandidateFor
	EntityRelationTypeLocks        = persistencemodel.EntityRelationTypeLocks
	EntityRelationTypeRelatedTo    = persistencemodel.EntityRelationTypeRelatedTo
	EntityRelationTypeTargets      = persistencemodel.EntityRelationTypeTargets
	EntityRelationTypeBlocks       = persistencemodel.EntityRelationTypeBlocks
	EntityRelationTypeDependsOn    = persistencemodel.EntityRelationTypeDependsOn
	EntityRelationTypeProduces     = persistencemodel.EntityRelationTypeProduces
	EntityRelationTypeDecides      = persistencemodel.EntityRelationTypeDecides
	EntityRelationTypeAppliesTo    = persistencemodel.EntityRelationTypeAppliesTo
	EntityRelationTypeReviews      = persistencemodel.EntityRelationTypeReviews
	EntityRelationTypeAttachedTo   = persistencemodel.EntityRelationTypeAttachedTo
	EntityRelationTypeExports      = persistencemodel.EntityRelationTypeExports

	EntityRelationStatusConfirmed = persistencemodel.EntityRelationStatusConfirmed
	EntityRelationSourceSystem    = persistencemodel.EntityRelationSourceSystem
)

type (
	EntityRelation = persistencemodel.EntityRelation

	User                   = persistencemodel.User
	Project                = persistencemodel.Project
	Script                 = persistencemodel.Script
	ScriptVersion          = persistencemodel.ScriptVersion
	ScriptBlock            = persistencemodel.ScriptBlock
	Production             = persistencemodel.Production
	ProductionTextBlock    = persistencemodel.ProductionTextBlock
	CreativeReference      = persistencemodel.CreativeReference
	CreativeReferenceState = persistencemodel.CreativeReferenceState
	CreativeReferenceUsage = persistencemodel.CreativeReferenceUsage
	CreativeRelationship   = persistencemodel.CreativeRelationship
	Segment                = persistencemodel.Segment
	SceneMoment            = persistencemodel.SceneMoment
	ContentUnit            = persistencemodel.ContentUnit
	AssetSlot              = persistencemodel.AssetSlot
	StoryboardScript       = persistencemodel.StoryboardScript
	StoryboardVersion      = persistencemodel.StoryboardVersion
	Keyframe               = persistencemodel.Keyframe
	PreviewTimeline        = persistencemodel.PreviewTimeline
	PreviewTimelineItem    = persistencemodel.PreviewTimelineItem
	AssetSlotCandidate     = persistencemodel.AssetSlotCandidate
	CandidateDecision      = persistencemodel.CandidateDecision
	ReviewEvent            = persistencemodel.ReviewEvent
	WorkItem               = persistencemodel.WorkItem
	WorkDependency         = persistencemodel.WorkDependency
	DeliveryVersion        = persistencemodel.DeliveryVersion
	DeliveryTimelineItem   = persistencemodel.DeliveryTimelineItem
	ExportRecord           = persistencemodel.ExportRecord
	Canvas                 = persistencemodel.Canvas
	CanvasRun              = persistencemodel.CanvasRun
	CanvasOutput           = persistencemodel.CanvasOutput
	ResourceBinding        = persistencemodel.ResourceBinding
)
