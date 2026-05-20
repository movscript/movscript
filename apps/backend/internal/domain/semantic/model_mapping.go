package semantic

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func SegmentFromModel(segment persistencemodel.Segment) Segment {
	return Segment{
		ID:              segment.ID,
		ProjectID:       segment.ProjectID,
		ProductionID:    segment.ProductionID,
		TextBlockID:     segment.TextBlockID,
		ScriptBlockID:   segment.ScriptBlockID,
		ParentSegmentID: segment.ParentSegmentID,
		Kind:            segment.Kind,
		Order:           segment.Order,
		Title:           segment.Title,
		Summary:         segment.Summary,
		Content:         segment.Content,
		Status:          segment.Status,
		MetadataJSON:    segment.MetadataJSON,
		CreatedAt:       segment.CreatedAt,
		UpdatedAt:       segment.UpdatedAt,
	}
}

func (segment Segment) ToModel() persistencemodel.Segment {
	var target persistencemodel.Segment
	segment.ApplyToModel(&target)
	return target
}

func (segment Segment) ApplyToModel(target *persistencemodel.Segment) {
	target.Model.ID = segment.ID
	target.ProjectID = segment.ProjectID
	target.ProductionID = segment.ProductionID
	target.TextBlockID = segment.TextBlockID
	target.ScriptBlockID = segment.ScriptBlockID
	target.ParentSegmentID = segment.ParentSegmentID
	target.Kind = segment.Kind
	target.Order = segment.Order
	target.Title = segment.Title
	target.Summary = segment.Summary
	target.Content = segment.Content
	target.Status = segment.Status
	target.MetadataJSON = segment.MetadataJSON
	target.CreatedAt = segment.CreatedAt
	target.UpdatedAt = segment.UpdatedAt
}

func ProductionTextBlockFromModel(block persistencemodel.ProductionTextBlock) ProductionTextBlock {
	return ProductionTextBlock{
		ID:            block.ID,
		ProjectID:     block.ProjectID,
		ProductionID:  block.ProductionID,
		ParentBlockID: block.ParentBlockID,
		Kind:          block.Kind,
		Order:         block.Order,
		Title:         block.Title,
		Content:       block.Content,
		Summary:       block.Summary,
		SourceType:    block.SourceType,
		Status:        block.Status,
		MetadataJSON:  block.MetadataJSON,
		CreatedAt:     block.CreatedAt,
		UpdatedAt:     block.UpdatedAt,
	}
}

func (block ProductionTextBlock) ToModel() persistencemodel.ProductionTextBlock {
	var target persistencemodel.ProductionTextBlock
	block.ApplyToModel(&target)
	return target
}

func (block ProductionTextBlock) ApplyToModel(target *persistencemodel.ProductionTextBlock) {
	target.Model.ID = block.ID
	target.ProjectID = block.ProjectID
	target.ProductionID = block.ProductionID
	target.ParentBlockID = block.ParentBlockID
	target.Kind = block.Kind
	target.Order = block.Order
	target.Title = block.Title
	target.Content = block.Content
	target.Summary = block.Summary
	target.SourceType = block.SourceType
	target.Status = block.Status
	target.MetadataJSON = block.MetadataJSON
	target.CreatedAt = block.CreatedAt
	target.UpdatedAt = block.UpdatedAt
}

func SceneMomentFromModel(moment persistencemodel.SceneMoment) SceneMoment {
	return SceneMoment{
		ID:            moment.ID,
		ProjectID:     moment.ProjectID,
		ProductionID:  moment.ProductionID,
		SegmentID:     moment.SegmentID,
		ScriptBlockID: moment.ScriptBlockID,
		SceneCode:     moment.SceneCode,
		Order:         moment.Order,
		Title:         moment.Title,
		Description:   moment.Description,
		TimeText:      moment.TimeText,
		LocationText:  moment.LocationText,
		ConditionText: moment.ConditionText,
		ActionText:    moment.ActionText,
		Mood:          moment.Mood,
		Status:        moment.Status,
		MetadataJSON:  moment.MetadataJSON,
		CreatedAt:     moment.CreatedAt,
		UpdatedAt:     moment.UpdatedAt,
	}
}

func (moment SceneMoment) ToModel() persistencemodel.SceneMoment {
	var target persistencemodel.SceneMoment
	moment.ApplyToModel(&target)
	return target
}

func (moment SceneMoment) ApplyToModel(target *persistencemodel.SceneMoment) {
	target.Model.ID = moment.ID
	target.ProjectID = moment.ProjectID
	target.ProductionID = moment.ProductionID
	target.SegmentID = moment.SegmentID
	target.ScriptBlockID = moment.ScriptBlockID
	target.SceneCode = moment.SceneCode
	target.Order = moment.Order
	target.Title = moment.Title
	target.Description = moment.Description
	target.TimeText = moment.TimeText
	target.LocationText = moment.LocationText
	target.ConditionText = moment.ConditionText
	target.ActionText = moment.ActionText
	target.Mood = moment.Mood
	target.Status = moment.Status
	target.MetadataJSON = moment.MetadataJSON
	target.CreatedAt = moment.CreatedAt
	target.UpdatedAt = moment.UpdatedAt
}

func WritingExpressionFromModel(expression persistencemodel.WritingExpression) WritingExpression {
	return WritingExpression{
		ID:            expression.ID,
		ProjectID:     expression.ProjectID,
		SceneMomentID: expression.SceneMomentID,
		ScriptBlockID: expression.ScriptBlockID,
		Order:         expression.Order,
		Kind:          expression.Kind,
		Speaker:       expression.Speaker,
		Text:          expression.Text,
		Note:          expression.Note,
		Intent:        expression.Intent,
		MetadataJSON:  expression.MetadataJSON,
		CreatedAt:     expression.CreatedAt,
		UpdatedAt:     expression.UpdatedAt,
	}
}

func (expression WritingExpression) ToModel() persistencemodel.WritingExpression {
	var target persistencemodel.WritingExpression
	expression.ApplyToModel(&target)
	return target
}

func (expression WritingExpression) ApplyToModel(target *persistencemodel.WritingExpression) {
	target.Model.ID = expression.ID
	target.ProjectID = expression.ProjectID
	target.SceneMomentID = expression.SceneMomentID
	target.ScriptBlockID = expression.ScriptBlockID
	target.Order = expression.Order
	target.Kind = expression.Kind
	target.Speaker = expression.Speaker
	target.Text = expression.Text
	target.Note = expression.Note
	target.Intent = expression.Intent
	target.MetadataJSON = expression.MetadataJSON
	target.CreatedAt = expression.CreatedAt
	target.UpdatedAt = expression.UpdatedAt
}

func ContentUnitFromModel(unit persistencemodel.ContentUnit) ContentUnit {
	return ContentUnit{
		ID:               unit.ID,
		ProjectID:        unit.ProjectID,
		ProductionID:     unit.ProductionID,
		SegmentID:        unit.SegmentID,
		SceneMomentID:    unit.SceneMomentID,
		ScriptBlockID:    unit.ScriptBlockID,
		Kind:             unit.Kind,
		UnitCode:         unit.UnitCode,
		Order:            unit.Order,
		Title:            unit.Title,
		Description:      unit.Description,
		Prompt:           unit.Prompt,
		DurationSec:      unit.DurationSec,
		ShotSize:         unit.ShotSize,
		CameraAngle:      unit.CameraAngle,
		CameraHeight:     unit.CameraHeight,
		CameraMotion:     unit.CameraMotion,
		MotionIntensity:  unit.MotionIntensity,
		CameraSpeed:      unit.CameraSpeed,
		Lens:             unit.Lens,
		FocalLength:      unit.FocalLength,
		FocusSubject:     unit.FocusSubject,
		CompositionStart: unit.CompositionStart,
		CompositionEnd:   unit.CompositionEnd,
		Stabilization:    unit.Stabilization,
		CameraParamsJSON: unit.CameraParamsJSON,
		CameraNotes:      unit.CameraNotes,
		Status:           unit.Status,
		MetadataJSON:     unit.MetadataJSON,
		CreatedAt:        unit.CreatedAt,
		UpdatedAt:        unit.UpdatedAt,
	}
}

func (unit ContentUnit) ToModel() persistencemodel.ContentUnit {
	var target persistencemodel.ContentUnit
	unit.ApplyToModel(&target)
	return target
}

func (unit ContentUnit) ApplyToModel(target *persistencemodel.ContentUnit) {
	target.Model.ID = unit.ID
	target.ProjectID = unit.ProjectID
	target.ProductionID = unit.ProductionID
	target.SegmentID = unit.SegmentID
	target.SceneMomentID = unit.SceneMomentID
	target.ScriptBlockID = unit.ScriptBlockID
	target.Kind = unit.Kind
	target.UnitCode = unit.UnitCode
	target.Order = unit.Order
	target.Title = unit.Title
	target.Description = unit.Description
	target.Prompt = unit.Prompt
	target.DurationSec = unit.DurationSec
	target.ShotSize = unit.ShotSize
	target.CameraAngle = unit.CameraAngle
	target.CameraHeight = unit.CameraHeight
	target.CameraMotion = unit.CameraMotion
	target.MotionIntensity = unit.MotionIntensity
	target.CameraSpeed = unit.CameraSpeed
	target.Lens = unit.Lens
	target.FocalLength = unit.FocalLength
	target.FocusSubject = unit.FocusSubject
	target.CompositionStart = unit.CompositionStart
	target.CompositionEnd = unit.CompositionEnd
	target.Stabilization = unit.Stabilization
	target.CameraParamsJSON = unit.CameraParamsJSON
	target.CameraNotes = unit.CameraNotes
	target.Status = unit.Status
	target.MetadataJSON = unit.MetadataJSON
	target.CreatedAt = unit.CreatedAt
	target.UpdatedAt = unit.UpdatedAt
}

func PreviewTimelineItemFromModel(item persistencemodel.PreviewTimelineItem) PreviewTimelineItem {
	return PreviewTimelineItem{
		ID:                item.ID,
		ProjectID:         item.ProjectID,
		PreviewTimelineID: item.PreviewTimelineID,
		SegmentID:         item.SegmentID,
		SceneMomentID:     item.SceneMomentID,
		ContentUnitID:     item.ContentUnitID,
		KeyframeID:        item.KeyframeID,
		Kind:              item.Kind,
		Order:             item.Order,
		StartSec:          item.StartSec,
		DurationSec:       item.DurationSec,
		Label:             item.Label,
		Status:            item.Status,
		MetadataJSON:      item.MetadataJSON,
		CreatedAt:         item.CreatedAt,
		UpdatedAt:         item.UpdatedAt,
	}
}

func (item PreviewTimelineItem) ToModel() persistencemodel.PreviewTimelineItem {
	var target persistencemodel.PreviewTimelineItem
	item.ApplyToModel(&target)
	return target
}

func (item PreviewTimelineItem) ApplyToModel(target *persistencemodel.PreviewTimelineItem) {
	target.Model.ID = item.ID
	target.ProjectID = item.ProjectID
	target.PreviewTimelineID = item.PreviewTimelineID
	target.SegmentID = item.SegmentID
	target.SceneMomentID = item.SceneMomentID
	target.ContentUnitID = item.ContentUnitID
	target.KeyframeID = item.KeyframeID
	target.Kind = item.Kind
	target.Order = item.Order
	target.StartSec = item.StartSec
	target.DurationSec = item.DurationSec
	target.Label = item.Label
	target.Status = item.Status
	target.MetadataJSON = item.MetadataJSON
	target.CreatedAt = item.CreatedAt
	target.UpdatedAt = item.UpdatedAt
}

func AssetSlotFromModel(slot persistencemodel.AssetSlot) AssetSlot {
	return AssetSlot{
		ID:                       slot.ID,
		ProjectID:                slot.ProjectID,
		ProductionID:             slot.ProductionID,
		CreativeReferenceID:      slot.CreativeReferenceID,
		CreativeReferenceStateID: slot.CreativeReferenceStateID,
		OwnerType:                slot.OwnerType,
		OwnerID:                  slot.OwnerID,
		Kind:                     slot.Kind,
		Name:                     slot.Name,
		Description:              slot.Description,
		SlotKey:                  slot.SlotKey,
		PromptHint:               slot.PromptHint,
		Status:                   slot.Status,
		Priority:                 slot.Priority,
		ResourceID:               slot.ResourceID,
		LockedAssetSlotID:        slot.LockedAssetSlotID,
		MetadataJSON:             slot.MetadataJSON,
		CreatedAt:                slot.CreatedAt,
		UpdatedAt:                slot.UpdatedAt,
	}
}

func (slot AssetSlot) ToModel() persistencemodel.AssetSlot {
	var target persistencemodel.AssetSlot
	slot.ApplyToModel(&target)
	return target
}

func (slot AssetSlot) ApplyToModel(target *persistencemodel.AssetSlot) {
	target.Model.ID = slot.ID
	target.ProjectID = slot.ProjectID
	target.ProductionID = slot.ProductionID
	target.CreativeReferenceID = slot.CreativeReferenceID
	target.CreativeReferenceStateID = slot.CreativeReferenceStateID
	target.OwnerType = slot.OwnerType
	target.OwnerID = slot.OwnerID
	target.Kind = slot.Kind
	target.Name = slot.Name
	target.Description = slot.Description
	target.SlotKey = slot.SlotKey
	target.PromptHint = slot.PromptHint
	target.Status = slot.Status
	target.Priority = slot.Priority
	target.ResourceID = slot.ResourceID
	target.LockedAssetSlotID = slot.LockedAssetSlotID
	target.MetadataJSON = slot.MetadataJSON
	target.CreatedAt = slot.CreatedAt
	target.UpdatedAt = slot.UpdatedAt
}

func AssetSlotCandidateFromModel(candidate persistencemodel.AssetSlotCandidate) AssetSlotCandidate {
	return AssetSlotCandidate{
		ID:                   candidate.ID,
		ProjectID:            candidate.ProjectID,
		AssetSlotID:          candidate.AssetSlotID,
		CandidateAssetSlotID: candidate.CandidateAssetSlotID,
		SourceType:           candidate.SourceType,
		SourceID:             candidate.SourceID,
		Score:                candidate.Score,
		Status:               candidate.Status,
		Note:                 candidate.Note,
		CreatedAt:            candidate.CreatedAt,
		UpdatedAt:            candidate.UpdatedAt,
	}
}

func MarkAssetSlotCandidate(slot *persistencemodel.AssetSlot) {
	domainSlot := AssetSlotFromModel(*slot)
	MarkSlotCandidate(&domainSlot)
	domainSlot.ApplyToModel(slot)
}

func MarkAssetSlotLockedToCandidate(slot *persistencemodel.AssetSlot, candidate persistencemodel.AssetSlotCandidate) {
	domainSlot := AssetSlotFromModel(*slot)
	domainCandidate := AssetSlotCandidateFromModel(candidate)
	LockSlotToCandidate(&domainSlot, domainCandidate, nil)
	domainSlot.ApplyToModel(slot)
}

func SelectAssetSlotCandidate(candidate *persistencemodel.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	SelectCandidate(&domainCandidate)
	domainCandidate.ApplyToModel(candidate)
}

func RejectAssetSlotCandidate(candidate *persistencemodel.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	RejectCandidate(&domainCandidate)
	domainCandidate.ApplyToModel(candidate)
}

func NormalizeAssetSlotCandidate(candidate *persistencemodel.AssetSlotCandidate) {
	domainCandidate := AssetSlotCandidateFromModel(*candidate)
	NormalizeCandidate(&domainCandidate)
	domainCandidate.ApplyToModel(candidate)
}

func (candidate AssetSlotCandidate) ToModel() persistencemodel.AssetSlotCandidate {
	var target persistencemodel.AssetSlotCandidate
	candidate.ApplyToModel(&target)
	return target
}

func (candidate AssetSlotCandidate) ApplyToModel(target *persistencemodel.AssetSlotCandidate) {
	target.Model.ID = candidate.ID
	target.ProjectID = candidate.ProjectID
	target.AssetSlotID = candidate.AssetSlotID
	target.CandidateAssetSlotID = candidate.CandidateAssetSlotID
	target.SourceType = candidate.SourceType
	target.SourceID = candidate.SourceID
	target.Score = candidate.Score
	target.Status = candidate.Status
	target.Note = candidate.Note
	target.CreatedAt = candidate.CreatedAt
	target.UpdatedAt = candidate.UpdatedAt
}

func CandidateDecisionFromModel(decision persistencemodel.CandidateDecision) CandidateDecision {
	return CandidateDecision{
		ID:                decision.ID,
		ProjectID:         decision.ProjectID,
		CandidateType:     decision.CandidateType,
		CandidateID:       decision.CandidateID,
		CandidateClientID: decision.CandidateClientID,
		TargetType:        decision.TargetType,
		TargetID:          decision.TargetID,
		Decision:          decision.Decision,
		Status:            decision.Status,
		Reason:            decision.Reason,
		Note:              decision.Note,
		Source:            decision.Source,
		DecidedByID:       decision.DecidedByID,
		AppliedAt:         decision.AppliedAt,
		MetadataJSON:      decision.MetadataJSON,
		CreatedAt:         decision.CreatedAt,
		UpdatedAt:         decision.UpdatedAt,
	}
}

func (decision CandidateDecision) ToModel() persistencemodel.CandidateDecision {
	var target persistencemodel.CandidateDecision
	decision.ApplyToModel(&target)
	return target
}

func (decision CandidateDecision) ApplyToModel(target *persistencemodel.CandidateDecision) {
	target.Model.ID = decision.ID
	target.ProjectID = decision.ProjectID
	target.CandidateType = decision.CandidateType
	target.CandidateID = decision.CandidateID
	target.CandidateClientID = decision.CandidateClientID
	target.TargetType = decision.TargetType
	target.TargetID = decision.TargetID
	target.Decision = decision.Decision
	target.Status = decision.Status
	target.Reason = decision.Reason
	target.Note = decision.Note
	target.Source = decision.Source
	target.DecidedByID = decision.DecidedByID
	target.AppliedAt = decision.AppliedAt
	target.MetadataJSON = decision.MetadataJSON
	target.CreatedAt = decision.CreatedAt
	target.UpdatedAt = decision.UpdatedAt
}

func ReviewEventFromModel(event persistencemodel.ReviewEvent) ReviewEvent {
	return ReviewEvent{
		ID:              event.ID,
		ProjectID:       event.ProjectID,
		SubjectType:     event.SubjectType,
		SubjectID:       event.SubjectID,
		SubjectClientID: event.SubjectClientID,
		EventType:       event.EventType,
		FromStatus:      event.FromStatus,
		ToStatus:        event.ToStatus,
		Comment:         event.Comment,
		Reason:          event.Reason,
		Source:          event.Source,
		ActorID:         event.ActorID,
		MetadataJSON:    event.MetadataJSON,
		CreatedAt:       event.CreatedAt,
		UpdatedAt:       event.UpdatedAt,
	}
}

func (event ReviewEvent) ToModel() persistencemodel.ReviewEvent {
	var target persistencemodel.ReviewEvent
	event.ApplyToModel(&target)
	return target
}

func (event ReviewEvent) ApplyToModel(target *persistencemodel.ReviewEvent) {
	target.Model.ID = event.ID
	target.ProjectID = event.ProjectID
	target.SubjectType = event.SubjectType
	target.SubjectID = event.SubjectID
	target.SubjectClientID = event.SubjectClientID
	target.EventType = event.EventType
	target.FromStatus = event.FromStatus
	target.ToStatus = event.ToStatus
	target.Comment = event.Comment
	target.Reason = event.Reason
	target.Source = event.Source
	target.ActorID = event.ActorID
	target.MetadataJSON = event.MetadataJSON
	target.CreatedAt = event.CreatedAt
	target.UpdatedAt = event.UpdatedAt
}

func ExportRecordFromModel(record persistencemodel.ExportRecord) ExportRecord {
	return ExportRecord{
		ID:                record.ID,
		ProjectID:         record.ProjectID,
		DeliveryVersionID: record.DeliveryVersionID,
		ResourceID:        record.ResourceID,
		Status:            record.Status,
		Format:            record.Format,
		Preset:            record.Preset,
		Error:             record.Error,
		MetadataJSON:      record.MetadataJSON,
		CreatedAt:         record.CreatedAt,
		UpdatedAt:         record.UpdatedAt,
	}
}

func (record ExportRecord) ToModel() persistencemodel.ExportRecord {
	var target persistencemodel.ExportRecord
	record.ApplyToModel(&target)
	return target
}

func (record ExportRecord) ApplyToModel(target *persistencemodel.ExportRecord) {
	target.Model.ID = record.ID
	target.ProjectID = record.ProjectID
	target.DeliveryVersionID = record.DeliveryVersionID
	target.ResourceID = record.ResourceID
	target.Status = record.Status
	target.Format = record.Format
	target.Preset = record.Preset
	target.Error = record.Error
	target.MetadataJSON = record.MetadataJSON
	target.CreatedAt = record.CreatedAt
	target.UpdatedAt = record.UpdatedAt
}

func CanvasOutputFromModel(output persistencemodel.CanvasOutput) CanvasOutput {
	return CanvasOutput{
		ID:           output.ID,
		ProjectID:    output.ProjectID,
		CanvasID:     output.CanvasID,
		CanvasRunID:  output.CanvasRunID,
		CanvasNodeID: output.CanvasNodeID,
		PortID:       output.PortID,
		OwnerType:    output.OwnerType,
		OwnerID:      output.OwnerID,
		OutputType:   output.OutputType,
		ResourceID:   output.ResourceID,
		TargetField:  output.TargetField,
		ValueJSON:    output.ValueJSON,
		Status:       output.Status,
		MetadataJSON: output.MetadataJSON,
		CreatedAt:    output.CreatedAt,
		UpdatedAt:    output.UpdatedAt,
	}
}

func (output CanvasOutput) ToModel() persistencemodel.CanvasOutput {
	var target persistencemodel.CanvasOutput
	output.ApplyToModel(&target)
	return target
}

func (output CanvasOutput) ApplyToModel(target *persistencemodel.CanvasOutput) {
	target.Model.ID = output.ID
	target.ProjectID = output.ProjectID
	target.CanvasID = output.CanvasID
	target.CanvasRunID = output.CanvasRunID
	target.CanvasNodeID = output.CanvasNodeID
	target.PortID = output.PortID
	target.OwnerType = output.OwnerType
	target.OwnerID = output.OwnerID
	target.OutputType = output.OutputType
	target.ResourceID = output.ResourceID
	target.TargetField = output.TargetField
	target.ValueJSON = output.ValueJSON
	target.Status = output.Status
	target.MetadataJSON = output.MetadataJSON
	target.CreatedAt = output.CreatedAt
	target.UpdatedAt = output.UpdatedAt
}

func WorkReviewFromModel(review persistencemodel.WorkReview) WorkReview {
	return WorkReview{
		ID:           review.ID,
		ProjectID:    review.ProjectID,
		WorkItemID:   review.WorkItemID,
		ReviewerID:   review.ReviewerID,
		Status:       review.Status,
		Comment:      review.Comment,
		MetadataJSON: review.MetadataJSON,
		CreatedAt:    review.CreatedAt,
		UpdatedAt:    review.UpdatedAt,
	}
}

func (review WorkReview) ToModel() persistencemodel.WorkReview {
	var target persistencemodel.WorkReview
	review.ApplyToModel(&target)
	return target
}

func (review WorkReview) ApplyToModel(target *persistencemodel.WorkReview) {
	target.Model.ID = review.ID
	target.ProjectID = review.ProjectID
	target.WorkItemID = review.WorkItemID
	target.ReviewerID = review.ReviewerID
	target.Status = review.Status
	target.Comment = review.Comment
	target.MetadataJSON = review.MetadataJSON
	target.CreatedAt = review.CreatedAt
	target.UpdatedAt = review.UpdatedAt
}

func WorkItemFromModel(item persistencemodel.WorkItem) WorkItem {
	return WorkItem{
		ID:             item.ID,
		ProjectID:      item.ProjectID,
		ProductionID:   item.ProductionID,
		TargetType:     item.TargetType,
		TargetID:       item.TargetID,
		Kind:           item.Kind,
		Title:          item.Title,
		Description:    item.Description,
		Status:         item.Status,
		Priority:       item.Priority,
		AssigneeID:     item.AssigneeID,
		SourceJobID:    item.SourceJobID,
		SourceCanvasID: item.SourceCanvasID,
		ResultType:     item.ResultType,
		ResultJSON:     item.ResultJSON,
		ApplyStatus:    item.ApplyStatus,
		AppliedAt:      item.AppliedAt,
		ApplyError:     item.ApplyError,
		MetadataJSON:   item.MetadataJSON,
		CreatedAt:      item.CreatedAt,
		UpdatedAt:      item.UpdatedAt,
	}
}

func (item WorkItem) ToModel() persistencemodel.WorkItem {
	var target persistencemodel.WorkItem
	item.ApplyToModel(&target)
	return target
}

func (item WorkItem) ApplyToModel(target *persistencemodel.WorkItem) {
	target.Model.ID = item.ID
	target.ProjectID = item.ProjectID
	target.ProductionID = item.ProductionID
	target.TargetType = item.TargetType
	target.TargetID = item.TargetID
	target.Kind = item.Kind
	target.Title = item.Title
	target.Description = item.Description
	target.Status = item.Status
	target.Priority = item.Priority
	target.AssigneeID = item.AssigneeID
	target.SourceJobID = item.SourceJobID
	target.SourceCanvasID = item.SourceCanvasID
	target.ResultType = item.ResultType
	target.ResultJSON = item.ResultJSON
	target.ApplyStatus = item.ApplyStatus
	target.AppliedAt = item.AppliedAt
	target.ApplyError = item.ApplyError
	target.MetadataJSON = item.MetadataJSON
	target.CreatedAt = item.CreatedAt
	target.UpdatedAt = item.UpdatedAt
}

func WorkDependencyFromModel(dependency persistencemodel.WorkDependency) WorkDependency {
	return WorkDependency{
		ID:                  dependency.ID,
		ProjectID:           dependency.ProjectID,
		WorkItemID:          dependency.WorkItemID,
		DependsOnWorkItemID: dependency.DependsOnWorkItemID,
		DependencyType:      dependency.DependencyType,
		CreatedAt:           dependency.CreatedAt,
		UpdatedAt:           dependency.UpdatedAt,
	}
}

func (dependency WorkDependency) ToModel() persistencemodel.WorkDependency {
	var target persistencemodel.WorkDependency
	dependency.ApplyToModel(&target)
	return target
}

func (dependency WorkDependency) ApplyToModel(target *persistencemodel.WorkDependency) {
	target.Model.ID = dependency.ID
	target.ProjectID = dependency.ProjectID
	target.WorkItemID = dependency.WorkItemID
	target.DependsOnWorkItemID = dependency.DependsOnWorkItemID
	target.DependencyType = dependency.DependencyType
	target.CreatedAt = dependency.CreatedAt
	target.UpdatedAt = dependency.UpdatedAt
}

func UserRefFromModelPointer(user any) *UserRef {
	return UserRefFromModel(user)
}

func UserRefFromModel(input any) *UserRef {
	user := userRefFields(input)
	if user.id == 0 {
		return nil
	}
	return &UserRef{
		ID:           user.id,
		Username:     user.username,
		SystemRole:   user.systemRole,
		PrimaryEmail: user.primaryEmail,
		PrimaryPhone: user.primaryPhone,
		DisplayName:  user.displayName,
		AvatarURL:    user.avatarURL,
		Locale:       user.locale,
		Status:       user.status,
	}
}

type userRefSnapshot struct {
	id           uint
	username     string
	systemRole   string
	primaryEmail *string
	primaryPhone *string
	displayName  string
	avatarURL    string
	locale       string
	status       string
}

func userRefFields(input any) userRefSnapshot {
	switch user := input.(type) {
	case persistencemodel.User:
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, primaryPhone: user.PrimaryPhone, displayName: user.DisplayName, avatarURL: user.AvatarURL, locale: user.Locale, status: user.Status}
	case *persistencemodel.User:
		if user == nil {
			return userRefSnapshot{}
		}
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, primaryPhone: user.PrimaryPhone, displayName: user.DisplayName, avatarURL: user.AvatarURL, locale: user.Locale, status: user.Status}
	default:
		return userRefSnapshot{}
	}
}

func CreativeReferenceFromModel(ref persistencemodel.CreativeReference) CreativeReference {
	return CreativeReference{
		ID:               ref.ID,
		ProjectID:        ref.ProjectID,
		ProposalClientID: ref.ProposalClientID,
		SourceScriptID:   ref.SourceScriptID,
		SourceAnalysisID: ref.SourceAnalysisID,
		Kind:             ref.Kind,
		Name:             ref.Name,
		Alias:            ref.Alias,
		Description:      ref.Description,
		Content:          ref.Content,
		Importance:       ref.Importance,
		Status:           ref.Status,
		ProfileJSON:      ref.ProfileJSON,
		TagsJSON:         ref.TagsJSON,
		CreatedAt:        ref.CreatedAt,
		UpdatedAt:        ref.UpdatedAt,
	}
}

func (ref CreativeReference) ToModel() persistencemodel.CreativeReference {
	var target persistencemodel.CreativeReference
	ref.ApplyToModel(&target)
	return target
}

func (ref CreativeReference) ApplyToModel(target *persistencemodel.CreativeReference) {
	target.Model.ID = ref.ID
	target.ProjectID = ref.ProjectID
	target.ProposalClientID = ref.ProposalClientID
	target.SourceScriptID = ref.SourceScriptID
	target.SourceAnalysisID = ref.SourceAnalysisID
	target.Kind = ref.Kind
	target.Name = ref.Name
	target.Alias = ref.Alias
	target.Description = ref.Description
	target.Content = ref.Content
	target.Importance = ref.Importance
	target.Status = ref.Status
	target.ProfileJSON = ref.ProfileJSON
	target.TagsJSON = ref.TagsJSON
	target.CreatedAt = ref.CreatedAt
	target.UpdatedAt = ref.UpdatedAt
}

func CreativeReferenceStateFromModel(state persistencemodel.CreativeReferenceState) CreativeReferenceState {
	return CreativeReferenceState{
		ID:                  state.ID,
		ProjectID:           state.ProjectID,
		CreativeReferenceID: state.CreativeReferenceID,
		ScopeType:           state.ScopeType,
		ScopeID:             state.ScopeID,
		Name:                state.Name,
		Description:         state.Description,
		VisualNotes:         state.VisualNotes,
		Emotion:             state.Emotion,
		Costume:             state.Costume,
		Props:               state.Props,
		Status:              state.Status,
		TagsJSON:            state.TagsJSON,
		MetadataJSON:        state.MetadataJSON,
		CreatedAt:           state.CreatedAt,
		UpdatedAt:           state.UpdatedAt,
	}
}

func (state CreativeReferenceState) ToModel() persistencemodel.CreativeReferenceState {
	var target persistencemodel.CreativeReferenceState
	state.ApplyToModel(&target)
	return target
}

func (state CreativeReferenceState) ApplyToModel(target *persistencemodel.CreativeReferenceState) {
	target.Model.ID = state.ID
	target.ProjectID = state.ProjectID
	target.CreativeReferenceID = state.CreativeReferenceID
	target.ScopeType = state.ScopeType
	target.ScopeID = state.ScopeID
	target.Name = state.Name
	target.Description = state.Description
	target.VisualNotes = state.VisualNotes
	target.Emotion = state.Emotion
	target.Costume = state.Costume
	target.Props = state.Props
	target.Status = state.Status
	target.TagsJSON = state.TagsJSON
	target.MetadataJSON = state.MetadataJSON
	target.CreatedAt = state.CreatedAt
	target.UpdatedAt = state.UpdatedAt
}

func CreativeReferenceUsageFromModel(usage persistencemodel.CreativeReferenceUsage) CreativeReferenceUsage {
	return CreativeReferenceUsage{
		ID:                       usage.ID,
		ProjectID:                usage.ProjectID,
		OwnerType:                usage.OwnerType,
		OwnerID:                  usage.OwnerID,
		CreativeReferenceID:      usage.CreativeReferenceID,
		CreativeReferenceStateID: usage.CreativeReferenceStateID,
		Role:                     usage.Role,
		Order:                    usage.Order,
		Evidence:                 usage.Evidence,
		Source:                   usage.Source,
		Status:                   usage.Status,
		MetadataJSON:             usage.MetadataJSON,
		CreatedAt:                usage.CreatedAt,
		UpdatedAt:                usage.UpdatedAt,
	}
}

func (usage CreativeReferenceUsage) ToModel() persistencemodel.CreativeReferenceUsage {
	var target persistencemodel.CreativeReferenceUsage
	usage.ApplyToModel(&target)
	return target
}

func (usage CreativeReferenceUsage) ApplyToModel(target *persistencemodel.CreativeReferenceUsage) {
	target.Model.ID = usage.ID
	target.ProjectID = usage.ProjectID
	target.OwnerType = usage.OwnerType
	target.OwnerID = usage.OwnerID
	target.CreativeReferenceID = usage.CreativeReferenceID
	target.CreativeReferenceStateID = usage.CreativeReferenceStateID
	target.Role = usage.Role
	target.Order = usage.Order
	target.Evidence = usage.Evidence
	target.Source = usage.Source
	target.Status = usage.Status
	target.MetadataJSON = usage.MetadataJSON
	target.CreatedAt = usage.CreatedAt
	target.UpdatedAt = usage.UpdatedAt
}

func CreativeRelationshipFromModel(relationship persistencemodel.CreativeRelationship) CreativeRelationship {
	return CreativeRelationship{
		ID:                        relationship.ID,
		ProjectID:                 relationship.ProjectID,
		SourceCreativeReferenceID: relationship.SourceCreativeReferenceID,
		TargetCreativeReferenceID: relationship.TargetCreativeReferenceID,
		ScopeType:                 relationship.ScopeType,
		ScopeID:                   relationship.ScopeID,
		Category:                  relationship.Category,
		Type:                      relationship.Type,
		Label:                     relationship.Label,
		Description:               relationship.Description,
		Source:                    relationship.Source,
		Status:                    relationship.Status,
		Evidence:                  relationship.Evidence,
		MetadataJSON:              relationship.MetadataJSON,
		CreatedAt:                 relationship.CreatedAt,
		UpdatedAt:                 relationship.UpdatedAt,
	}
}

func (relationship CreativeRelationship) ToModel() persistencemodel.CreativeRelationship {
	var target persistencemodel.CreativeRelationship
	relationship.ApplyToModel(&target)
	return target
}

func (relationship CreativeRelationship) ApplyToModel(target *persistencemodel.CreativeRelationship) {
	target.Model.ID = relationship.ID
	target.ProjectID = relationship.ProjectID
	target.SourceCreativeReferenceID = relationship.SourceCreativeReferenceID
	target.TargetCreativeReferenceID = relationship.TargetCreativeReferenceID
	target.ScopeType = relationship.ScopeType
	target.ScopeID = relationship.ScopeID
	target.Category = relationship.Category
	target.Type = relationship.Type
	target.Label = relationship.Label
	target.Description = relationship.Description
	target.Source = relationship.Source
	target.Status = relationship.Status
	target.Evidence = relationship.Evidence
	target.MetadataJSON = relationship.MetadataJSON
	target.CreatedAt = relationship.CreatedAt
	target.UpdatedAt = relationship.UpdatedAt
}

func ProductionFromModel(production persistencemodel.Production) Production {
	return Production{
		ID:                production.ID,
		ProjectID:         production.ProjectID,
		ScriptVersionID:   production.ScriptVersionID,
		PreviewTimelineID: production.PreviewTimelineID,
		Name:              production.Name,
		Description:       production.Description,
		Status:            production.Status,
		SourceType:        production.SourceType,
		OwnerLabel:        production.OwnerLabel,
		Progress:          production.Progress,
		MetadataJSON:      production.MetadataJSON,
		CreatedAt:         production.CreatedAt,
		UpdatedAt:         production.UpdatedAt,
	}
}

func (production Production) ToModel() persistencemodel.Production {
	var target persistencemodel.Production
	production.ApplyToModel(&target)
	return target
}

func (production Production) ApplyToModel(target *persistencemodel.Production) {
	target.Model.ID = production.ID
	target.ProjectID = production.ProjectID
	target.ScriptVersionID = production.ScriptVersionID
	target.PreviewTimelineID = production.PreviewTimelineID
	target.Name = production.Name
	target.Description = production.Description
	target.Status = production.Status
	target.SourceType = production.SourceType
	target.OwnerLabel = production.OwnerLabel
	target.Progress = production.Progress
	target.MetadataJSON = production.MetadataJSON
	target.CreatedAt = production.CreatedAt
	target.UpdatedAt = production.UpdatedAt
}

func KeyframeFromModel(keyframe persistencemodel.Keyframe) Keyframe {
	return Keyframe{
		ID:            keyframe.ID,
		ProjectID:     keyframe.ProjectID,
		ProductionID:  keyframe.ProductionID,
		SceneMomentID: keyframe.SceneMomentID,
		ContentUnitID: keyframe.ContentUnitID,
		ResourceID:    keyframe.ResourceID,
		CanvasID:      keyframe.CanvasID,
		Title:         keyframe.Title,
		Description:   keyframe.Description,
		Prompt:        keyframe.Prompt,
		Order:         keyframe.Order,
		Status:        keyframe.Status,
		MetadataJSON:  keyframe.MetadataJSON,
		CreatedAt:     keyframe.CreatedAt,
		UpdatedAt:     keyframe.UpdatedAt,
	}
}

func (keyframe Keyframe) ToModel() persistencemodel.Keyframe {
	var target persistencemodel.Keyframe
	keyframe.ApplyToModel(&target)
	return target
}

func (keyframe Keyframe) ApplyToModel(target *persistencemodel.Keyframe) {
	target.Model.ID = keyframe.ID
	target.ProjectID = keyframe.ProjectID
	target.ProductionID = keyframe.ProductionID
	target.SceneMomentID = keyframe.SceneMomentID
	target.ContentUnitID = keyframe.ContentUnitID
	target.ResourceID = keyframe.ResourceID
	target.CanvasID = keyframe.CanvasID
	target.Title = keyframe.Title
	target.Description = keyframe.Description
	target.Prompt = keyframe.Prompt
	target.Order = keyframe.Order
	target.Status = keyframe.Status
	target.MetadataJSON = keyframe.MetadataJSON
	target.CreatedAt = keyframe.CreatedAt
	target.UpdatedAt = keyframe.UpdatedAt
}

func PreviewTimelineFromModel(timeline persistencemodel.PreviewTimeline) PreviewTimeline {
	return PreviewTimeline{
		ID:              timeline.ID,
		ProjectID:       timeline.ProjectID,
		ProductionID:    timeline.ProductionID,
		ScriptVersionID: timeline.ScriptVersionID,
		Name:            timeline.Name,
		Status:          timeline.Status,
		DurationSec:     timeline.DurationSec,
		IsPrimary:       timeline.IsPrimary,
		MetadataJSON:    timeline.MetadataJSON,
		CreatedAt:       timeline.CreatedAt,
		UpdatedAt:       timeline.UpdatedAt,
	}
}

func (timeline PreviewTimeline) ToModel() persistencemodel.PreviewTimeline {
	var target persistencemodel.PreviewTimeline
	timeline.ApplyToModel(&target)
	return target
}

func (timeline PreviewTimeline) ApplyToModel(target *persistencemodel.PreviewTimeline) {
	target.Model.ID = timeline.ID
	target.ProjectID = timeline.ProjectID
	target.ProductionID = timeline.ProductionID
	target.ScriptVersionID = timeline.ScriptVersionID
	target.Name = timeline.Name
	target.Status = timeline.Status
	target.DurationSec = timeline.DurationSec
	target.IsPrimary = timeline.IsPrimary
	target.MetadataJSON = timeline.MetadataJSON
	target.CreatedAt = timeline.CreatedAt
	target.UpdatedAt = timeline.UpdatedAt
}

func DeliveryVersionFromModel(version persistencemodel.DeliveryVersion) DeliveryVersion {
	return DeliveryVersion{
		ID:                version.ID,
		ProjectID:         version.ProjectID,
		ProductionID:      version.ProductionID,
		PreviewTimelineID: version.PreviewTimelineID,
		Name:              version.Name,
		Description:       version.Description,
		Status:            version.Status,
		IsPrimary:         version.IsPrimary,
		DurationSec:       version.DurationSec,
		MetadataJSON:      version.MetadataJSON,
		CreatedAt:         version.CreatedAt,
		UpdatedAt:         version.UpdatedAt,
	}
}

func (version DeliveryVersion) ToModel() persistencemodel.DeliveryVersion {
	var target persistencemodel.DeliveryVersion
	version.ApplyToModel(&target)
	return target
}

func (version DeliveryVersion) ApplyToModel(target *persistencemodel.DeliveryVersion) {
	target.Model.ID = version.ID
	target.ProjectID = version.ProjectID
	target.ProductionID = version.ProductionID
	target.PreviewTimelineID = version.PreviewTimelineID
	target.Name = version.Name
	target.Description = version.Description
	target.Status = version.Status
	target.IsPrimary = version.IsPrimary
	target.DurationSec = version.DurationSec
	target.MetadataJSON = version.MetadataJSON
	target.CreatedAt = version.CreatedAt
	target.UpdatedAt = version.UpdatedAt
}

func DeliveryTimelineItemFromModel(item persistencemodel.DeliveryTimelineItem) DeliveryTimelineItem {
	return DeliveryTimelineItem{
		ID:                item.ID,
		ProjectID:         item.ProjectID,
		DeliveryVersionID: item.DeliveryVersionID,
		ContentUnitID:     item.ContentUnitID,
		AssetSlotID:       item.AssetSlotID,
		ResourceID:        item.ResourceID,
		Kind:              item.Kind,
		Order:             item.Order,
		StartSec:          item.StartSec,
		DurationSec:       item.DurationSec,
		Label:             item.Label,
		Status:            item.Status,
		MetadataJSON:      item.MetadataJSON,
		CreatedAt:         item.CreatedAt,
		UpdatedAt:         item.UpdatedAt,
	}
}

func (item DeliveryTimelineItem) ToModel() persistencemodel.DeliveryTimelineItem {
	var target persistencemodel.DeliveryTimelineItem
	item.ApplyToModel(&target)
	return target
}

func (item DeliveryTimelineItem) ApplyToModel(target *persistencemodel.DeliveryTimelineItem) {
	target.Model.ID = item.ID
	target.ProjectID = item.ProjectID
	target.DeliveryVersionID = item.DeliveryVersionID
	target.ContentUnitID = item.ContentUnitID
	target.AssetSlotID = item.AssetSlotID
	target.ResourceID = item.ResourceID
	target.Kind = item.Kind
	target.Order = item.Order
	target.StartSec = item.StartSec
	target.DurationSec = item.DurationSec
	target.Label = item.Label
	target.Status = item.Status
	target.MetadataJSON = item.MetadataJSON
	target.CreatedAt = item.CreatedAt
	target.UpdatedAt = item.UpdatedAt
}

func StoryboardScriptFromModel(script persistencemodel.StoryboardScript) StoryboardScript {
	return StoryboardScript{
		ID:              script.ID,
		ProjectID:       script.ProjectID,
		ScriptVersionID: script.ScriptVersionID,
		Name:            script.Name,
		Description:     script.Description,
		Status:          script.Status,
		IsPrimary:       script.IsPrimary,
		MetadataJSON:    script.MetadataJSON,
		CreatedAt:       script.CreatedAt,
		UpdatedAt:       script.UpdatedAt,
	}
}

func (script StoryboardScript) ToModel() persistencemodel.StoryboardScript {
	var target persistencemodel.StoryboardScript
	script.ApplyToModel(&target)
	return target
}

func (script StoryboardScript) ApplyToModel(target *persistencemodel.StoryboardScript) {
	target.Model.ID = script.ID
	target.ProjectID = script.ProjectID
	target.ScriptVersionID = script.ScriptVersionID
	target.Name = script.Name
	target.Description = script.Description
	target.Status = script.Status
	target.IsPrimary = script.IsPrimary
	target.MetadataJSON = script.MetadataJSON
	target.CreatedAt = script.CreatedAt
	target.UpdatedAt = script.UpdatedAt
}

func StoryboardVersionFromModel(version persistencemodel.StoryboardVersion) StoryboardVersion {
	return StoryboardVersion{
		ID:                 version.ID,
		ProjectID:          version.ProjectID,
		StoryboardScriptID: version.StoryboardScriptID,
		ParentVersionID:    version.ParentVersionID,
		VersionNumber:      version.VersionNumber,
		Title:              version.Title,
		Source:             version.Source,
		Status:             version.Status,
		SnapshotJSON:       version.SnapshotJSON,
		MetadataJSON:       version.MetadataJSON,
		CreatedAt:          version.CreatedAt,
		UpdatedAt:          version.UpdatedAt,
	}
}

func (version StoryboardVersion) ToModel() persistencemodel.StoryboardVersion {
	var target persistencemodel.StoryboardVersion
	version.ApplyToModel(&target)
	return target
}

func (version StoryboardVersion) ApplyToModel(target *persistencemodel.StoryboardVersion) {
	target.Model.ID = version.ID
	target.ProjectID = version.ProjectID
	target.StoryboardScriptID = version.StoryboardScriptID
	target.ParentVersionID = version.ParentVersionID
	target.VersionNumber = version.VersionNumber
	target.Title = version.Title
	target.Source = version.Source
	target.Status = version.Status
	target.SnapshotJSON = version.SnapshotJSON
	target.MetadataJSON = version.MetadataJSON
	target.CreatedAt = version.CreatedAt
	target.UpdatedAt = version.UpdatedAt
}

func ScriptVersionFromModel(version persistencemodel.ScriptVersion) ScriptVersion {
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

func (version ScriptVersion) ToModel() persistencemodel.ScriptVersion {
	var target persistencemodel.ScriptVersion
	version.ApplyToModel(&target)
	return target
}

func (version ScriptVersion) ApplyToModel(target *persistencemodel.ScriptVersion) {
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

func ScriptBlockFromModel(block persistencemodel.ScriptBlock) ScriptBlock {
	return ScriptBlock{
		ID:              block.ID,
		ProjectID:       block.ProjectID,
		ScriptID:        block.ScriptID,
		ScriptVersionID: block.ScriptVersionID,
		ParentBlockID:   block.ParentBlockID,
		Order:           block.Order,
		Kind:            block.Kind,
		Speaker:         block.Speaker,
		Content:         block.Content,
		StartLine:       block.StartLine,
		EndLine:         block.EndLine,
		StartChar:       block.StartChar,
		EndChar:         block.EndChar,
		Status:          block.Status,
		MetadataJSON:    block.MetadataJSON,
		CreatedAt:       block.CreatedAt,
		UpdatedAt:       block.UpdatedAt,
	}
}

func (block ScriptBlock) ToModel() persistencemodel.ScriptBlock {
	var target persistencemodel.ScriptBlock
	block.ApplyToModel(&target)
	return target
}

func (block ScriptBlock) ApplyToModel(target *persistencemodel.ScriptBlock) {
	target.Model.ID = block.ID
	target.ProjectID = block.ProjectID
	target.ScriptID = block.ScriptID
	target.ScriptVersionID = block.ScriptVersionID
	target.ParentBlockID = block.ParentBlockID
	target.Order = block.Order
	target.Kind = block.Kind
	target.Speaker = block.Speaker
	target.Content = block.Content
	target.StartLine = block.StartLine
	target.EndLine = block.EndLine
	target.StartChar = block.StartChar
	target.EndChar = block.EndChar
	target.Status = block.Status
	target.MetadataJSON = block.MetadataJSON
	target.CreatedAt = block.CreatedAt
	target.UpdatedAt = block.UpdatedAt
}
