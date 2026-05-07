package canvasruntime

import (
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
)

func CanvasFromModel(canvas model.Canvas) Canvas {
	domainCanvas := Canvas{
		ID:           canvas.ID,
		OwnerID:      canvas.OwnerID,
		OrgID:        canvas.OrgID,
		Name:         canvas.Name,
		Description:  canvas.Description,
		CanvasType:   canvas.CanvasType,
		ProjectID:    canvas.ProjectID,
		Stage:        canvas.Stage,
		RefType:      canvas.RefType,
		RefID:        canvas.RefID,
		Visibility:   canvas.Visibility,
		WorkflowKey:  canvas.WorkflowKey,
		WorkflowTags: canvas.WorkflowTags,
		PublishedAt:  canvas.PublishedAt,
		CreatedAt:    canvas.CreatedAt,
		UpdatedAt:    canvas.UpdatedAt,
	}
	if canvas.DeletedAt.Valid {
		deletedAt := canvas.DeletedAt.Time
		domainCanvas.DeletedAt = &deletedAt
	}
	if len(canvas.Nodes) > 0 {
		domainCanvas.Nodes = CanvasNodesFromModels(canvas.Nodes)
	}
	if len(canvas.Edges) > 0 {
		domainCanvas.Edges = CanvasEdgesFromModels(canvas.Edges)
	}
	return domainCanvas
}

func (canvas Canvas) ToModel() model.Canvas {
	var target model.Canvas
	canvas.ApplyToModel(&target)
	return target
}

func (canvas Canvas) ApplyToModel(target *model.Canvas) {
	target.Model.ID = canvas.ID
	target.OwnerID = canvas.OwnerID
	target.OrgID = canvas.OrgID
	target.Name = canvas.Name
	target.Description = canvas.Description
	target.CanvasType = canvas.CanvasType
	target.ProjectID = canvas.ProjectID
	target.Stage = canvas.Stage
	target.RefType = canvas.RefType
	target.RefID = canvas.RefID
	target.Visibility = canvas.Visibility
	target.WorkflowKey = canvas.WorkflowKey
	target.WorkflowTags = canvas.WorkflowTags
	target.PublishedAt = canvas.PublishedAt
	target.CreatedAt = canvas.CreatedAt
	target.UpdatedAt = canvas.UpdatedAt
	if canvas.DeletedAt != nil {
		target.DeletedAt.Time = *canvas.DeletedAt
		target.DeletedAt.Valid = true
	}
	if len(canvas.Nodes) > 0 {
		target.Nodes = make([]model.CanvasNode, 0, len(canvas.Nodes))
		for _, node := range canvas.Nodes {
			target.Nodes = append(target.Nodes, node.ToModel())
		}
	}
	if len(canvas.Edges) > 0 {
		target.Edges = make([]model.CanvasEdge, 0, len(canvas.Edges))
		for _, edge := range canvas.Edges {
			target.Edges = append(target.Edges, edge.ToModel())
		}
	}
}

func CanvasNodeFromModel(node model.CanvasNode) CanvasNode {
	domainNode := CanvasNode{
		ID:        node.ID,
		CanvasID:  node.CanvasID,
		NodeID:    node.NodeID,
		Type:      node.Type,
		Label:     node.Label,
		PosX:      node.PosX,
		PosY:      node.PosY,
		Data:      node.Data,
		CreatedAt: node.CreatedAt,
		UpdatedAt: node.UpdatedAt,
	}
	if node.DeletedAt.Valid {
		deletedAt := node.DeletedAt.Time
		domainNode.DeletedAt = &deletedAt
	}
	return domainNode
}

func (node CanvasNode) ToModel() model.CanvasNode {
	var target model.CanvasNode
	node.ApplyToModel(&target)
	return target
}

func (node CanvasNode) ApplyToModel(target *model.CanvasNode) {
	target.Model.ID = node.ID
	target.CanvasID = node.CanvasID
	target.NodeID = node.NodeID
	target.Type = node.Type
	target.Label = node.Label
	target.PosX = node.PosX
	target.PosY = node.PosY
	target.Data = node.Data
	target.CreatedAt = node.CreatedAt
	target.UpdatedAt = node.UpdatedAt
	if node.DeletedAt != nil {
		target.DeletedAt.Time = *node.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func CanvasEdgeFromModel(edge model.CanvasEdge) CanvasEdge {
	domainEdge := CanvasEdge{
		ID:           edge.ID,
		CanvasID:     edge.CanvasID,
		EdgeID:       edge.EdgeID,
		Source:       edge.Source,
		Target:       edge.Target,
		SourceHandle: edge.SourceHandle,
		TargetHandle: edge.TargetHandle,
		CreatedAt:    edge.CreatedAt,
		UpdatedAt:    edge.UpdatedAt,
	}
	if edge.DeletedAt.Valid {
		deletedAt := edge.DeletedAt.Time
		domainEdge.DeletedAt = &deletedAt
	}
	return domainEdge
}

func (edge CanvasEdge) ToModel() model.CanvasEdge {
	var target model.CanvasEdge
	edge.ApplyToModel(&target)
	return target
}

func (edge CanvasEdge) ApplyToModel(target *model.CanvasEdge) {
	target.Model.ID = edge.ID
	target.CanvasID = edge.CanvasID
	target.EdgeID = edge.EdgeID
	target.Source = edge.Source
	target.Target = edge.Target
	target.SourceHandle = edge.SourceHandle
	target.TargetHandle = edge.TargetHandle
	target.CreatedAt = edge.CreatedAt
	target.UpdatedAt = edge.UpdatedAt
	if edge.DeletedAt != nil {
		target.DeletedAt.Time = *edge.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func EntityWriteAuditFromModel(audit model.CanvasEntityWriteAudit) EntityWriteAudit {
	domainAudit := EntityWriteAudit{
		ID:                 audit.ID,
		CanvasID:           audit.CanvasID,
		CanvasRunID:        audit.CanvasRunID,
		CanvasNodeID:       audit.CanvasNodeID,
		PortID:             audit.PortID,
		EntityKind:         audit.EntityKind,
		EntityID:           audit.EntityID,
		UserID:             audit.UserID,
		OldValueJSON:       audit.OldValueJSON,
		NewValueJSON:       audit.NewValueJSON,
		ResourceBindingIDs: audit.ResourceBindingIDs,
		CreatedAt:          audit.CreatedAt,
		UpdatedAt:          audit.UpdatedAt,
	}
	if audit.DeletedAt.Valid {
		deletedAt := audit.DeletedAt.Time
		domainAudit.DeletedAt = &deletedAt
	}
	return domainAudit
}

func (audit EntityWriteAudit) ToModel() model.CanvasEntityWriteAudit {
	var target model.CanvasEntityWriteAudit
	audit.ApplyToModel(&target)
	return target
}

func (audit EntityWriteAudit) ApplyToModel(target *model.CanvasEntityWriteAudit) {
	target.Model.ID = audit.ID
	target.CanvasID = audit.CanvasID
	target.CanvasRunID = audit.CanvasRunID
	target.CanvasNodeID = audit.CanvasNodeID
	target.PortID = audit.PortID
	target.EntityKind = audit.EntityKind
	target.EntityID = audit.EntityID
	target.UserID = audit.UserID
	target.OldValueJSON = audit.OldValueJSON
	target.NewValueJSON = audit.NewValueJSON
	target.ResourceBindingIDs = audit.ResourceBindingIDs
	target.CreatedAt = audit.CreatedAt
	target.UpdatedAt = audit.UpdatedAt
	if audit.DeletedAt != nil {
		target.DeletedAt.Time = *audit.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func CanvasRunFromModel(run model.CanvasRun) CanvasRun {
	domainRun := CanvasRun{
		ID:                run.ID,
		CanvasID:          run.CanvasID,
		Status:            run.Status,
		InputValues:       run.InputValues,
		OutputValues:      run.OutputValues,
		Error:             run.Error,
		GraphSnapshot:     run.GraphSnapshot,
		SnapshotHash:      run.SnapshotHash,
		SnapshotNodeCount: run.SnapshotNodeCount,
		SnapshotEdgeCount: run.SnapshotEdgeCount,
		StartedAt:         run.StartedAt,
		FinishedAt:        run.FinishedAt,
		CreatedAt:         run.CreatedAt,
		UpdatedAt:         run.UpdatedAt,
	}
	if run.DeletedAt.Valid {
		deletedAt := run.DeletedAt.Time
		domainRun.DeletedAt = &deletedAt
	}
	if len(run.Tasks) > 0 {
		domainRun.Tasks = CanvasTasksFromModels(run.Tasks)
	}
	return domainRun
}

func (run CanvasRun) ToModel() model.CanvasRun {
	var target model.CanvasRun
	run.ApplyToModel(&target)
	return target
}

func (run CanvasRun) ApplyToModel(target *model.CanvasRun) {
	target.Model.ID = run.ID
	target.CanvasID = run.CanvasID
	target.Status = run.Status
	target.InputValues = run.InputValues
	target.OutputValues = run.OutputValues
	target.Error = run.Error
	target.GraphSnapshot = run.GraphSnapshot
	target.SnapshotHash = run.SnapshotHash
	target.SnapshotNodeCount = run.SnapshotNodeCount
	target.SnapshotEdgeCount = run.SnapshotEdgeCount
	target.StartedAt = run.StartedAt
	target.FinishedAt = run.FinishedAt
	target.CreatedAt = run.CreatedAt
	target.UpdatedAt = run.UpdatedAt
	if run.DeletedAt != nil {
		target.DeletedAt.Time = *run.DeletedAt
		target.DeletedAt.Valid = true
	}
	if len(run.Tasks) > 0 {
		target.Tasks = make([]model.CanvasTask, 0, len(run.Tasks))
		for _, task := range run.Tasks {
			target.Tasks = append(target.Tasks, task.ToModel())
		}
	}
}

func CanvasTaskFromModel(task model.CanvasTask) CanvasTask {
	domainTask := CanvasTask{
		ID:             task.ID,
		CanvasNodeID:   task.CanvasNodeID,
		CanvasRunID:    task.CanvasRunID,
		NodeID:         task.NodeID,
		NodeLabel:      task.NodeLabel,
		NodeType:       task.NodeType,
		Status:         task.Status,
		ProviderTaskID: task.ProviderTaskID,
		Error:          task.Error,
		InputValues:    task.InputValues,
		OutputValues:   task.OutputValues,
		ResourceID:     task.ResourceID,
		CreatedAt:      task.CreatedAt,
		UpdatedAt:      task.UpdatedAt,
	}
	if task.DeletedAt.Valid {
		deletedAt := task.DeletedAt.Time
		domainTask.DeletedAt = &deletedAt
	}
	if task.Resource != nil {
		resource := domainresource.RawResourceFromModel(*task.Resource)
		domainTask.Resource = &resource
	}
	return domainTask
}

func (task CanvasTask) ToModel() model.CanvasTask {
	var target model.CanvasTask
	task.ApplyToModel(&target)
	return target
}

func (task CanvasTask) ApplyToModel(target *model.CanvasTask) {
	target.Model.ID = task.ID
	target.CanvasNodeID = task.CanvasNodeID
	target.CanvasRunID = task.CanvasRunID
	target.NodeID = task.NodeID
	target.NodeLabel = task.NodeLabel
	target.NodeType = task.NodeType
	target.Status = task.Status
	target.ProviderTaskID = task.ProviderTaskID
	target.Error = task.Error
	target.InputValues = task.InputValues
	target.OutputValues = task.OutputValues
	target.ResourceID = task.ResourceID
	target.CreatedAt = task.CreatedAt
	target.UpdatedAt = task.UpdatedAt
	if task.DeletedAt != nil {
		target.DeletedAt.Time = *task.DeletedAt
		target.DeletedAt.Valid = true
	}
	if task.Resource != nil {
		resource := task.Resource.ToModel()
		target.Resource = &resource
	}
}

func CanvasesFromModels(canvases []model.Canvas) []Canvas {
	out := make([]Canvas, 0, len(canvases))
	for _, canvas := range canvases {
		out = append(out, CanvasFromModel(canvas))
	}
	return out
}

func CanvasNodesFromModels(nodes []model.CanvasNode) []CanvasNode {
	out := make([]CanvasNode, 0, len(nodes))
	for _, node := range nodes {
		out = append(out, CanvasNodeFromModel(node))
	}
	return out
}

func CanvasEdgesFromModels(edges []model.CanvasEdge) []CanvasEdge {
	out := make([]CanvasEdge, 0, len(edges))
	for _, edge := range edges {
		out = append(out, CanvasEdgeFromModel(edge))
	}
	return out
}

func CanvasRunsFromModels(runs []model.CanvasRun) []CanvasRun {
	out := make([]CanvasRun, 0, len(runs))
	for _, run := range runs {
		out = append(out, CanvasRunFromModel(run))
	}
	return out
}

func CanvasTasksFromModels(tasks []model.CanvasTask) []CanvasTask {
	out := make([]CanvasTask, 0, len(tasks))
	for _, task := range tasks {
		out = append(out, CanvasTaskFromModel(task))
	}
	return out
}

func EntityWriteAuditsFromModels(audits []model.CanvasEntityWriteAudit) []EntityWriteAudit {
	out := make([]EntityWriteAudit, 0, len(audits))
	for _, audit := range audits {
		out = append(out, EntityWriteAuditFromModel(audit))
	}
	return out
}

func CanvasGraphFromModel(cv model.Canvas) CanvasGraph {
	nodes := make([]CanvasNode, 0, len(cv.Nodes))
	for _, node := range cv.Nodes {
		nodes = append(nodes, CanvasNodeFromModel(node))
	}
	edges := make([]CanvasEdge, 0, len(cv.Edges))
	for _, edge := range cv.Edges {
		edges = append(edges, CanvasEdgeFromModel(edge))
	}
	return CanvasGraph{
		Canvas: CanvasFromModel(cv),
		Nodes:  nodes,
		Edges:  edges,
	}
}

func (cv CanvasGraph) ToModel() model.Canvas {
	target := cv.Canvas.ToModel()
	target.Nodes = make([]model.CanvasNode, 0, len(cv.Nodes))
	for _, node := range cv.Nodes {
		target.Nodes = append(target.Nodes, node.ToModel())
	}
	target.Edges = make([]model.CanvasEdge, 0, len(cv.Edges))
	for _, edge := range cv.Edges {
		target.Edges = append(target.Edges, edge.ToModel())
	}
	return target
}

func CanvasOutputFromModel(output model.CanvasOutput) CanvasOutput {
	return CanvasOutput{
		ID:          output.ID,
		CanvasID:    output.CanvasID,
		CanvasRunID: output.CanvasRunID,
		ResourceID:  output.ResourceID,
		ValueJSON:   output.ValueJSON,
		Status:      output.Status,
	}
}

func (output CanvasOutput) ToModel() model.CanvasOutput {
	var target model.CanvasOutput
	output.ApplyToModel(&target)
	return target
}

func (output CanvasOutput) ApplyToModel(target *model.CanvasOutput) {
	target.Model.ID = output.ID
	target.CanvasID = output.CanvasID
	target.CanvasRunID = output.CanvasRunID
	target.ResourceID = output.ResourceID
	target.ValueJSON = output.ValueJSON
	target.Status = output.Status
}

func NewCanvasRun(cv model.Canvas, inputValues any, startedAt time.Time) CanvasRun {
	return NewRun(CanvasGraphFromModel(cv), inputValues, startedAt)
}

func NewCanvasTask(node model.CanvasNode, runID *uint, inputValues string) CanvasTask {
	return NewTask(CanvasNodeFromModel(node), runID, inputValues)
}

func StartCanvasRun(run *model.CanvasRun, startedAt time.Time) {
	domainRun := CanvasRunFromModel(*run)
	StartRun(&domainRun, startedAt)
	domainRun.ApplyToModel(run)
}

func CompleteCanvasRun(run *model.CanvasRun, finishedAt time.Time) {
	domainRun := CanvasRunFromModel(*run)
	CompleteRun(&domainRun, finishedAt)
	domainRun.ApplyToModel(run)
}

func FailCanvasRun(run *model.CanvasRun, errMsg string, finishedAt time.Time) {
	domainRun := CanvasRunFromModel(*run)
	FailRun(&domainRun, errMsg, finishedAt)
	domainRun.ApplyToModel(run)
}

func ApplyCanvasRunTaskStatus(run *model.CanvasRun, tasks []model.CanvasTask, finishedAt time.Time) bool {
	domainRun := CanvasRunFromModel(*run)
	domainTasks := make([]CanvasTask, 0, len(tasks))
	for _, task := range tasks {
		domainTasks = append(domainTasks, CanvasTaskFromModel(task))
	}
	ok := ApplyRunTaskStatus(&domainRun, domainTasks, finishedAt)
	domainRun.ApplyToModel(run)
	return ok
}

func StartCanvasTask(task *model.CanvasTask, nd *NodeData) map[string]any {
	domainTask := CanvasTaskFromModel(*task)
	updates := StartTask(&domainTask, nd)
	domainTask.ApplyToModel(task)
	return updates
}

func CompleteCanvasTask(task *model.CanvasTask, nd *NodeData, resourceID *uint) map[string]any {
	domainTask := CanvasTaskFromModel(*task)
	updates := CompleteTask(&domainTask, nd, resourceID)
	domainTask.ApplyToModel(task)
	return updates
}

func FailCanvasTask(task *model.CanvasTask, nd *NodeData, errMsg string) {
	domainTask := CanvasTaskFromModel(*task)
	FailTask(&domainTask, nd, errMsg)
	domainTask.ApplyToModel(task)
}

func AttachCanvasOutput(output *model.CanvasOutput, runID uint, resourceID uint, valueJSON string) {
	domainOutput := CanvasOutputFromModel(*output)
	AttachOutput(&domainOutput, runID, resourceID, valueJSON)
	domainOutput.ApplyToModel(output)
}

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	domainTasks := make([]CanvasTask, 0, len(tasks))
	for _, task := range tasks {
		domainTasks = append(domainTasks, CanvasTaskFromModel(task))
	}
	return TaskFailureSummary(domainTasks)
}

func CanvasFromRunSnapshot(canvasID uint, raw string) (model.Canvas, error) {
	graph, err := CanvasGraphFromRunSnapshot(canvasID, raw)
	if err != nil {
		return model.Canvas{}, err
	}
	return graph.ToModel(), nil
}

func BuildExecutionPlan(cv model.Canvas) (ExecutionPlan, error) {
	return BuildGraphExecutionPlan(CanvasGraphFromModel(cv))
}

func ValidateRequiredInputs(cv model.Canvas, inputValues map[string]PortValue) error {
	return ValidateGraphRequiredInputs(CanvasGraphFromModel(cv), inputValues)
}

func StaticNodePortValue(node *model.CanvasNode, nd NodeData) PortValue {
	if node == nil {
		return PortValue{}
	}
	domainNode := CanvasNodeFromModel(*node)
	return StaticGraphNodePortValue(&domainNode, nd)
}
