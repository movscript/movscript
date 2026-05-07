package model

import domainmodel "github.com/movscript/movscript/internal/domain/model"

const (
	EntityRelationCategoryStructure = domainmodel.EntityRelationCategoryStructure
	EntityRelationCategoryCreative  = domainmodel.EntityRelationCategoryCreative
	EntityRelationCategoryAsset     = domainmodel.EntityRelationCategoryAsset
	EntityRelationCategoryWorkflow  = domainmodel.EntityRelationCategoryWorkflow
	EntityRelationCategoryDelivery  = domainmodel.EntityRelationCategoryDelivery

	EntityRelationTypeOwns         = domainmodel.EntityRelationTypeOwns
	EntityRelationTypeContains     = domainmodel.EntityRelationTypeContains
	EntityRelationTypeUses         = domainmodel.EntityRelationTypeUses
	EntityRelationTypeHasVersion   = domainmodel.EntityRelationTypeHasVersion
	EntityRelationTypeDerivedFrom  = domainmodel.EntityRelationTypeDerivedFrom
	EntityRelationTypeUsesPreview  = domainmodel.EntityRelationTypeUsesPreview
	EntityRelationTypeHasAsset     = domainmodel.EntityRelationTypeHasAsset
	EntityRelationTypeNeedsAsset   = domainmodel.EntityRelationTypeNeedsAsset
	EntityRelationTypeUsesAsset    = domainmodel.EntityRelationTypeUsesAsset
	EntityRelationTypeUsesResource = domainmodel.EntityRelationTypeUsesResource
	EntityRelationTypeHasState     = domainmodel.EntityRelationTypeHasState
	EntityRelationTypeBasedOn      = domainmodel.EntityRelationTypeBasedOn
	EntityRelationTypeRepresents   = domainmodel.EntityRelationTypeRepresents
	EntityRelationTypeHasKeyframe  = domainmodel.EntityRelationTypeHasKeyframe
	EntityRelationTypeCompilesTo   = domainmodel.EntityRelationTypeCompilesTo
	EntityRelationTypeCandidateFor = domainmodel.EntityRelationTypeCandidateFor
	EntityRelationTypeLocks        = domainmodel.EntityRelationTypeLocks
	EntityRelationTypeRelatedTo    = domainmodel.EntityRelationTypeRelatedTo
	EntityRelationTypeTargets      = domainmodel.EntityRelationTypeTargets
	EntityRelationTypeBlocks       = domainmodel.EntityRelationTypeBlocks
	EntityRelationTypeDependsOn    = domainmodel.EntityRelationTypeDependsOn
	EntityRelationTypeProduces     = domainmodel.EntityRelationTypeProduces
	EntityRelationTypeDecides      = domainmodel.EntityRelationTypeDecides
	EntityRelationTypeAppliesTo    = domainmodel.EntityRelationTypeAppliesTo
	EntityRelationTypeReviews      = domainmodel.EntityRelationTypeReviews
	EntityRelationTypeAttachedTo   = domainmodel.EntityRelationTypeAttachedTo
	EntityRelationTypeExports      = domainmodel.EntityRelationTypeExports

	EntityRelationStatusConfirmed = domainmodel.EntityRelationStatusConfirmed
	EntityRelationSourceSystem    = domainmodel.EntityRelationSourceSystem
)

type EntityRelation = domainmodel.EntityRelation
