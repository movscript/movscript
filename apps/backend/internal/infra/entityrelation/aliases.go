package entityrelation

import "github.com/movscript/movscript/internal/domain/model"

const (
	EntityRelationCategoryStructure = model.EntityRelationCategoryStructure
	EntityRelationCategoryCreative  = model.EntityRelationCategoryCreative
	EntityRelationCategoryAsset     = model.EntityRelationCategoryAsset
	EntityRelationCategoryWorkflow  = model.EntityRelationCategoryWorkflow
	EntityRelationCategoryDelivery  = model.EntityRelationCategoryDelivery

	EntityRelationTypeOwns         = model.EntityRelationTypeOwns
	EntityRelationTypeContains     = model.EntityRelationTypeContains
	EntityRelationTypeUses         = model.EntityRelationTypeUses
	EntityRelationTypeHasVersion   = model.EntityRelationTypeHasVersion
	EntityRelationTypeDerivedFrom  = model.EntityRelationTypeDerivedFrom
	EntityRelationTypeUsesPreview  = model.EntityRelationTypeUsesPreview
	EntityRelationTypeHasAsset     = model.EntityRelationTypeHasAsset
	EntityRelationTypeNeedsAsset   = model.EntityRelationTypeNeedsAsset
	EntityRelationTypeUsesAsset    = model.EntityRelationTypeUsesAsset
	EntityRelationTypeUsesResource = model.EntityRelationTypeUsesResource
	EntityRelationTypeHasState     = model.EntityRelationTypeHasState
	EntityRelationTypeBasedOn      = model.EntityRelationTypeBasedOn
	EntityRelationTypeRepresents   = model.EntityRelationTypeRepresents
	EntityRelationTypeHasKeyframe  = model.EntityRelationTypeHasKeyframe
	EntityRelationTypeCompilesTo   = model.EntityRelationTypeCompilesTo
	EntityRelationTypeCandidateFor = model.EntityRelationTypeCandidateFor
	EntityRelationTypeLocks        = model.EntityRelationTypeLocks
	EntityRelationTypeRelatedTo    = model.EntityRelationTypeRelatedTo
	EntityRelationTypeTargets      = model.EntityRelationTypeTargets
	EntityRelationTypeBlocks       = model.EntityRelationTypeBlocks
	EntityRelationTypeDependsOn    = model.EntityRelationTypeDependsOn
	EntityRelationTypeProduces     = model.EntityRelationTypeProduces
	EntityRelationTypeDecides      = model.EntityRelationTypeDecides
	EntityRelationTypeAppliesTo    = model.EntityRelationTypeAppliesTo
	EntityRelationTypeReviews      = model.EntityRelationTypeReviews
	EntityRelationTypeAttachedTo   = model.EntityRelationTypeAttachedTo
	EntityRelationTypeExports      = model.EntityRelationTypeExports

	EntityRelationStatusConfirmed = model.EntityRelationStatusConfirmed
	EntityRelationSourceSystem    = model.EntityRelationSourceSystem
)

type (
	EntityRelation = model.EntityRelation

	User                   = model.User
	Project                = model.Project
	Script                 = model.Script
	ScriptVersion          = model.ScriptVersion
	Production             = model.Production
	ProductionTextBlock    = model.ProductionTextBlock
	CreativeReference      = model.CreativeReference
	CreativeReferenceState = model.CreativeReferenceState
	CreativeReferenceUsage = model.CreativeReferenceUsage
	CreativeRelationship   = model.CreativeRelationship
	Segment                = model.Segment
	SceneMoment            = model.SceneMoment
	ContentUnit            = model.ContentUnit
	AssetSlot              = model.AssetSlot
	StoryboardScript       = model.StoryboardScript
	StoryboardVersion      = model.StoryboardVersion
	StoryboardLine         = model.StoryboardLine
	Keyframe               = model.Keyframe
	PreviewTimeline        = model.PreviewTimeline
	PreviewTimelineItem    = model.PreviewTimelineItem
	AssetSlotCandidate     = model.AssetSlotCandidate
	CandidateDecision      = model.CandidateDecision
	ReviewEvent            = model.ReviewEvent
	WorkItem               = model.WorkItem
	WorkDependency         = model.WorkDependency
	DeliveryVersion        = model.DeliveryVersion
	DeliveryTimelineItem   = model.DeliveryTimelineItem
	ExportRecord           = model.ExportRecord
	Canvas                 = model.Canvas
	CanvasRun              = model.CanvasRun
	CanvasOutput           = model.CanvasOutput
	ResourceBinding        = model.ResourceBinding
)
