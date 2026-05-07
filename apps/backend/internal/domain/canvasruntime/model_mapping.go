package canvasruntime

import (
	"time"

	"github.com/movscript/movscript/internal/domain/model"
)

func CanvasFromModel(canvas model.Canvas) Canvas {
	return Canvas{
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
	}
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
}

func CanvasNodeFromModel(node model.CanvasNode) CanvasNode {
	return CanvasNode{
		ID:       node.ID,
		CanvasID: node.CanvasID,
		NodeID:   node.NodeID,
		Type:     node.Type,
		Label:    node.Label,
		PosX:     node.PosX,
		PosY:     node.PosY,
		Data:     node.Data,
	}
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
}

func CanvasEdgeFromModel(edge model.CanvasEdge) CanvasEdge {
	return CanvasEdge{
		ID:           edge.ID,
		CanvasID:     edge.CanvasID,
		EdgeID:       edge.EdgeID,
		Source:       edge.Source,
		Target:       edge.Target,
		SourceHandle: edge.SourceHandle,
		TargetHandle: edge.TargetHandle,
	}
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
}

func EntityWriteAuditFromModel(audit model.CanvasEntityWriteAudit) EntityWriteAudit {
	return EntityWriteAudit{
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
	}
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
}

func CanvasRunFromModel(run model.CanvasRun) CanvasRun {
	return CanvasRun{
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
	}
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
}

func CanvasTaskFromModel(task model.CanvasTask) CanvasTask {
	return CanvasTask{
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
	}
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
