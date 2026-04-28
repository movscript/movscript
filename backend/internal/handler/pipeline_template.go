package handler

import (
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type templateNodeDef struct {
	Type        string
	ContentType string
	Name        string
	PosX        float64
	PosY        float64
}

type templateDef struct {
	Nodes []templateNodeDef
	// Edges as index pairs into Nodes slice: [fromIdx, toIdx]
	Edges [][2]int
}

var pipelineTemplates = map[string]templateDef{
	"full_production": {
		Nodes: []templateNodeDef{
			{Type: "raw_script", ContentType: "script", Name: "底稿写作", PosX: 100, PosY: 200},
			{Type: "main_script", ContentType: "script", Name: "主剧本", PosX: 320, PosY: 200},
			{Type: "episode_writing", ContentType: "script", Name: "分集剧本创作", PosX: 540, PosY: 200},
			{Type: "episode_script", ContentType: "script", Name: "分集剧本", PosX: 760, PosY: 200},
			{Type: "scene_writing", ContentType: "script", Name: "分场剧本创作", PosX: 980, PosY: 200},
			{Type: "scene_script", ContentType: "script", Name: "分场剧本", PosX: 1200, PosY: 200},
			{Type: "storyboard_creation", ContentType: "storyboard", Name: "分镜创作", PosX: 1420, PosY: 200},
			{Type: "storyboard_script", ContentType: "storyboard", Name: "分镜脚本", PosX: 1640, PosY: 200},
			{Type: "shot_production", ContentType: "shot", Name: "镜头生产", PosX: 1860, PosY: 200},
			{Type: "shot", ContentType: "shot", Name: "镜头产物", PosX: 2080, PosY: 200},
			{Type: "episode_edit", ContentType: "episode", Name: "剧集剪辑", PosX: 2300, PosY: 200},
			{Type: "episode", ContentType: "episode", Name: "成片剧集", PosX: 2520, PosY: 200},
		},
		Edges: [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 5}, {5, 6}, {6, 7}, {7, 8}, {8, 9}, {9, 10}, {10, 11}},
	},
	"from_script": {
		Nodes: []templateNodeDef{
			{Type: "main_script", ContentType: "script", Name: "主剧本", PosX: 100, PosY: 200},
			{Type: "episode_writing", ContentType: "script", Name: "分集剧本创作", PosX: 320, PosY: 200},
			{Type: "episode_script", ContentType: "script", Name: "分集剧本", PosX: 540, PosY: 200},
			{Type: "scene_writing", ContentType: "script", Name: "分场剧本创作", PosX: 760, PosY: 200},
			{Type: "scene_script", ContentType: "script", Name: "分场剧本", PosX: 980, PosY: 200},
			{Type: "storyboard_creation", ContentType: "storyboard", Name: "分镜创作", PosX: 1200, PosY: 200},
			{Type: "storyboard_script", ContentType: "storyboard", Name: "分镜脚本", PosX: 1420, PosY: 200},
			{Type: "shot_production", ContentType: "shot", Name: "镜头生产", PosX: 1640, PosY: 200},
			{Type: "shot", ContentType: "shot", Name: "镜头产物", PosX: 1860, PosY: 200},
			{Type: "episode_edit", ContentType: "episode", Name: "剧集剪辑", PosX: 2080, PosY: 200},
			{Type: "episode", ContentType: "episode", Name: "成片剧集", PosX: 2300, PosY: 200},
		},
		Edges: [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 5}, {5, 6}, {6, 7}, {7, 8}, {8, 9}, {9, 10}},
	},
	"from_storyboard": {
		Nodes: []templateNodeDef{
			{Type: "storyboard_script", ContentType: "storyboard", Name: "分镜脚本", PosX: 100, PosY: 200},
			{Type: "shot_production", ContentType: "shot", Name: "镜头生产", PosX: 320, PosY: 200},
			{Type: "shot", ContentType: "shot", Name: "镜头产物", PosX: 540, PosY: 200},
			{Type: "episode_edit", ContentType: "episode", Name: "剧集剪辑", PosX: 760, PosY: 200},
			{Type: "episode", ContentType: "episode", Name: "成片剧集", PosX: 980, PosY: 200},
		},
		Edges: [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}},
	},
	"custom": {
		Nodes: []templateNodeDef{},
		Edges: [][2]int{},
	},
}

// createPipelineFromTemplate creates PipelineNode and PipelineEdge records for a project
// based on the named template. It is idempotent only if called once after project creation.
func createPipelineFromTemplate(db *gorm.DB, projectID uint, template string) {
	def, ok := pipelineTemplates[template]
	if !ok {
		def = pipelineTemplates["custom"]
	}
	if len(def.Nodes) == 0 {
		return
	}

	created := make([]model.PipelineNode, len(def.Nodes))
	for i, nd := range def.Nodes {
		node := model.PipelineNode{
			ProjectID:   projectID,
			Type:        nd.Type,
			ContentType: pipelineContentTypeForNode(nd.Type),
			Name:        nd.Name,
			Status:      "draft",
			PosX:        nd.PosX,
			PosY:        nd.PosY,
		}
		db.Create(&node)
		created[i] = node
	}

	for _, e := range def.Edges {
		edge := model.PipelineEdge{
			ProjectID:  projectID,
			FromNodeID: created[e[0]].ID,
			ToNodeID:   created[e[1]].ID,
		}
		db.Create(&edge)
	}
}
