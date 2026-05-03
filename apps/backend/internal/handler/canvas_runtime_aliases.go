package handler

import (
	"github.com/movscript/movscript/internal/canvasruntime"
	"github.com/movscript/movscript/internal/canvasservice"
	"github.com/movscript/movscript/internal/model"
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

func buildCanvasRunSnapshot(cv model.Canvas) (string, string, int, int) {
	return canvasruntime.BuildRunSnapshot(cv)
}

func canvasFromRunSnapshot(canvasID uint, raw string) (model.Canvas, error) {
	return canvasruntime.CanvasFromRunSnapshot(canvasID, raw)
}

func buildCanvasExecutionPlan(cv model.Canvas) (canvasExecutionPlan, error) {
	return canvasruntime.BuildExecutionPlan(cv)
}

func canvasNodeRequiresWorkflowTask(cv model.Canvas, node *model.CanvasNode) bool {
	return canvasruntime.CanvasNodeRequiresWorkflowTask(cv, node)
}

func validateCanvasRequiredInputs(cv model.Canvas, inputValues map[string]canvasPortValue) error {
	return canvasruntime.ValidateRequiredInputs(cv, inputValues)
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

func staticCanvasNodePortValue(node *model.CanvasNode, nd nodeData) canvasPortValue {
	return canvasruntime.StaticNodePortValue(node, nd)
}

func firstNonEmptyString(values ...string) string {
	return canvasruntime.FirstNonEmptyString(values...)
}

func isCanvasEntityNode(nodeType string) bool {
	return canvasruntime.IsCanvasEntityNode(nodeType)
}

func topoSort(nodes []model.CanvasNode, edges []model.CanvasEdge) ([]string, error) {
	return canvasruntime.TopoSort(nodes, edges)
}

func normalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	canvasservice.NormalizeCanvasTaskForResponse(dbTask, nodeType)
}

func pluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
	return canvasservice.PluginHTTPOutputs(raw)
}

func registerWorkflowOutput(outputs map[string]canvasPortValue, node *model.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
	canvasservice.RegisterWorkflowOutput(outputs, node, nd, nodeOutputs)
}

func canvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	return canvasservice.CanvasRunTaskFailureSummary(tasks)
}

func validateCanvasProductionEntityWrite(kind string, portInputs canvasPortInputMap) error {
	return canvasservice.ValidateCanvasProductionEntityWrite(kind, portInputs)
}

func marshalParamsForPreflight(params map[string]any) string {
	return canvasservice.MarshalParamsForPreflight(params)
}
