package handler

import (
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
)

type canvasRunSnapshot = canvasdomain.RunSnapshot
type canvasExecutionPlan = canvasdomain.ExecutionPlan
type canvasTaskPlan = canvasdomain.TaskPlan
type nodeData = canvasdomain.NodeData
type canvasPortDef = canvasdomain.PortDef
type canvasExecutableSpec = canvasdomain.ExecutableSpec
type canvasPortValue = canvasdomain.PortValue
type canvasPortInputMap = canvasdomain.PortInputMap

func canvasPortValueFromResource(rid *uint, valueType string) canvasPortValue {
	return canvasdomain.PortValueFromResource(rid, valueType)
}

func canvasPortValueFromText(valueType string, text string) canvasPortValue {
	return canvasdomain.PortValueFromText(valueType, text)
}

func canvasPortValueFromAny(value any) canvasPortValue {
	return canvasdomain.PortValueFromAny(value)
}

func canvasPortValueText(value canvasPortValue) string {
	return canvasdomain.PortValueText(value)
}

func canvasPortValueEmpty(value canvasPortValue) bool {
	return canvasdomain.PortValueEmpty(value)
}

func marshalCanvasPortInputs(inputs canvasPortInputMap) string {
	return canvasdomain.MarshalPortInputs(inputs)
}

func marshalCanvasPortOutputs(outputs map[string]canvasPortValue) string {
	return canvasdomain.MarshalPortOutputs(outputs)
}

func decodeCanvasPortOutputs(raw string) map[string]canvasPortValue {
	return canvasdomain.DecodePortOutputs(raw)
}

func decodeCanvasRunOutputValues(raw string) map[string]canvasPortValue {
	return canvasdomain.DecodePortOutputs(raw)
}

func decodeCanvasRunInputValues(raw string) map[string]canvasPortValue {
	return canvasdomain.DecodeRunInputValues(raw)
}

func buildCanvasRunSnapshot(cv canvasdomain.Canvas) (string, string, int, int) {
	return canvasdomain.BuildRunSnapshot(canvasdomain.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges})
}

func canvasFromRunSnapshot(canvasID uint, raw string) (canvasdomain.Canvas, error) {
	cv, err := canvasdomain.CanvasFromRunSnapshot(canvasID, raw)
	return canvasdomain.CanvasFromModel(cv), err
}

func buildCanvasExecutionPlan(cv canvasdomain.Canvas) (canvasExecutionPlan, error) {
	return canvasdomain.BuildGraphExecutionPlan(canvasdomain.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges})
}

func canvasNodeRequiresWorkflowTask(cv canvasdomain.Canvas, node *canvasdomain.CanvasNode) bool {
	if node == nil {
		return false
	}
	return canvasdomain.GraphNodeRequiresWorkflowTask(canvasdomain.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges}, node)
}

func validateCanvasRequiredInputs(cv canvasdomain.Canvas, inputValues map[string]canvasPortValue) error {
	return canvasdomain.ValidateGraphRequiredInputs(canvasdomain.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges}, inputValues)
}

func canvasPortValuesPresent(values []canvasPortValue) bool {
	return canvasdomain.PortValuesPresent(values)
}

func defaultCanvasSourceHandle(nodeType string) string {
	return canvasdomain.DefaultSourceHandle(nodeType)
}

func defaultCanvasSourceHandleForNode(nodeType string, nd nodeData) string {
	return canvasdomain.DefaultSourceHandleForNode(nodeType, nd)
}

func defaultCanvasPortValueTypeForNode(nodeType string, nd nodeData) string {
	return canvasdomain.DefaultPortValueTypeForNode(nodeType, nd)
}

func staticCanvasNodePortValue(node *canvasdomain.CanvasNode, nd nodeData) canvasPortValue {
	return canvasdomain.StaticGraphNodePortValue(node, nd)
}

func firstNonEmptyString(values ...string) string {
	return canvasdomain.FirstNonEmptyString(values...)
}

func isCanvasEntityNode(nodeType string) bool {
	return canvasdomain.IsCanvasEntityNode(nodeType)
}

func topoSort(nodes []canvasdomain.CanvasNode, edges []canvasdomain.CanvasEdge) ([]string, error) {
	return canvasdomain.TopoSort(nodes, edges)
}

func normalizeCanvasTaskForResponse(task canvasdomain.CanvasTask, nodeType string) canvasdomain.CanvasTask {
	return canvasservice.NormalizeCanvasTaskForResponse(task, nodeType)
}

func pluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
	return canvasservice.PluginHTTPOutputs(raw)
}

func registerWorkflowOutput(outputs map[string]canvasPortValue, node *canvasdomain.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
	canvasservice.RegisterWorkflowOutput(outputs, node, nd, nodeOutputs)
}

func canvasRunTaskFailureSummary(tasks []canvasdomain.CanvasTask) string {
	return canvasdomain.TaskFailureSummary(tasks)
}

func validateCanvasProductionEntityWrite(kind string, portInputs canvasPortInputMap) error {
	return canvasservice.ValidateCanvasProductionEntityWrite(kind, portInputs)
}

func marshalParamsForPreflight(params map[string]any) string {
	return canvasservice.MarshalParamsForPreflight(params)
}
