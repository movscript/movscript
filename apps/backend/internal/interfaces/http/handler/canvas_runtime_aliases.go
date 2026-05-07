package handler

import (
	canvasservice "github.com/movscript/movscript/internal/app/canvas"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
)

type canvasRunSnapshot = canvasruntime.RunSnapshot
type canvasExecutionPlan = canvasruntime.ExecutionPlan
type canvasTaskPlan = canvasruntime.TaskPlan
type nodeData = canvasruntime.NodeData
type canvasPortDef = canvasruntime.PortDef
type canvasExecutableSpec = canvasruntime.ExecutableSpec
type canvasPortValue = canvasruntime.PortValue
type canvasPortInputMap = canvasruntime.PortInputMap

func canvasPortValueFromResource(rid *uint, valueType string) canvasPortValue {
	return canvasruntime.PortValueFromResource(rid, valueType)
}

func canvasPortValueFromText(valueType string, text string) canvasPortValue {
	return canvasruntime.PortValueFromText(valueType, text)
}

func canvasPortValueFromAny(value any) canvasPortValue {
	return canvasruntime.PortValueFromAny(value)
}

func canvasPortValueText(value canvasPortValue) string {
	return canvasruntime.PortValueText(value)
}

func canvasPortValueEmpty(value canvasPortValue) bool {
	return canvasruntime.PortValueEmpty(value)
}

func marshalCanvasPortInputs(inputs canvasPortInputMap) string {
	return canvasruntime.MarshalPortInputs(inputs)
}

func marshalCanvasPortOutputs(outputs map[string]canvasPortValue) string {
	return canvasruntime.MarshalPortOutputs(outputs)
}

func decodeCanvasPortOutputs(raw string) map[string]canvasPortValue {
	return canvasruntime.DecodePortOutputs(raw)
}

func decodeCanvasRunOutputValues(raw string) map[string]canvasPortValue {
	return canvasruntime.DecodePortOutputs(raw)
}

func decodeCanvasRunInputValues(raw string) map[string]canvasPortValue {
	return canvasruntime.DecodeRunInputValues(raw)
}

func buildCanvasRunSnapshot(cv canvasruntime.Canvas) (string, string, int, int) {
	return canvasruntime.BuildRunSnapshot(canvasruntime.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges})
}

func canvasFromRunSnapshot(canvasID uint, raw string) (canvasruntime.Canvas, error) {
	cv, err := canvasruntime.CanvasFromRunSnapshot(canvasID, raw)
	return canvasruntime.CanvasFromModel(cv), err
}

func buildCanvasExecutionPlan(cv canvasruntime.Canvas) (canvasExecutionPlan, error) {
	return canvasruntime.BuildGraphExecutionPlan(canvasruntime.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges})
}

func canvasNodeRequiresWorkflowTask(cv canvasruntime.Canvas, node *canvasruntime.CanvasNode) bool {
	if node == nil {
		return false
	}
	return canvasruntime.GraphNodeRequiresWorkflowTask(canvasruntime.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges}, node)
}

func validateCanvasRequiredInputs(cv canvasruntime.Canvas, inputValues map[string]canvasPortValue) error {
	return canvasruntime.ValidateGraphRequiredInputs(canvasruntime.CanvasGraph{Canvas: cv, Nodes: cv.Nodes, Edges: cv.Edges}, inputValues)
}

func canvasPortValuesPresent(values []canvasPortValue) bool {
	return canvasruntime.PortValuesPresent(values)
}

func defaultCanvasSourceHandle(nodeType string) string {
	return canvasruntime.DefaultSourceHandle(nodeType)
}

func defaultCanvasSourceHandleForNode(nodeType string, nd nodeData) string {
	return canvasruntime.DefaultSourceHandleForNode(nodeType, nd)
}

func defaultCanvasPortValueTypeForNode(nodeType string, nd nodeData) string {
	return canvasruntime.DefaultPortValueTypeForNode(nodeType, nd)
}

func staticCanvasNodePortValue(node *canvasruntime.CanvasNode, nd nodeData) canvasPortValue {
	return canvasruntime.StaticGraphNodePortValue(node, nd)
}

func firstNonEmptyString(values ...string) string {
	return canvasruntime.FirstNonEmptyString(values...)
}

func isCanvasEntityNode(nodeType string) bool {
	return canvasruntime.IsCanvasEntityNode(nodeType)
}

func topoSort(nodes []canvasruntime.CanvasNode, edges []canvasruntime.CanvasEdge) ([]string, error) {
	return canvasruntime.TopoSort(nodes, edges)
}

func normalizeCanvasTaskForResponse(task canvasruntime.CanvasTask, nodeType string) canvasruntime.CanvasTask {
	return canvasservice.NormalizeCanvasTaskForResponse(task, nodeType)
}

func pluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
	return canvasservice.PluginHTTPOutputs(raw)
}

func registerWorkflowOutput(outputs map[string]canvasPortValue, node *canvasruntime.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
	canvasservice.RegisterWorkflowOutput(outputs, node, nd, nodeOutputs)
}

func canvasRunTaskFailureSummary(tasks []canvasruntime.CanvasTask) string {
	return canvasruntime.TaskFailureSummary(tasks)
}

func validateCanvasProductionEntityWrite(kind string, portInputs canvasPortInputMap) error {
	return canvasservice.ValidateCanvasProductionEntityWrite(kind, portInputs)
}

func marshalParamsForPreflight(params map[string]any) string {
	return canvasservice.MarshalParamsForPreflight(params)
}
