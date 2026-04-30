package scriptanalysis

import (
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/model"
)

const commonSchemaInstruction = `只返回一个JSON对象，不要使用Markdown，不要输出额外解释。

所有剧本类型都应尽量包含这些通用字段：
{
  "title": "根据剧本内容提炼的标题，短而具体",
  "description": "一句话描述剧本主题、类型、主冲突或看点",
  "summary": "剧本提纲，用条目概括主要内容",
  "characters": "人物补充说明，保留无法结构化但有用的信息",
  "character_profiles": [
    {
      "id": "c1",
      "name": "人物姓名",
      "identity": "身份",
      "traits": "性格/特征",
      "goal": "欲望/目标",
      "notes": "补充说明"
    }
  ],
  "character_relationships": [
    {
      "id": "r1",
      "source": "c1",
      "target": "c2",
      "label": "关系说明",
      "type": "alliance|family|love|conflict|secret|other"
    }
  ],
  "core_settings": ["核心设定，多条，每条描述一条规则、关系或限制"],
  "background": "时代背景，用一句尽可能短的话描述",
  "scenes_desc": [
    {
      "id": "s1",
      "name": "场景名称或地点",
      "time_of_day": "day|night|dawn|dusk|unknown",
      "period": "时期/年代",
      "description": "空间、时间、氛围、可见元素和调度重点"
    }
  ],
  "time_text": "如果是分场剧本，提取明确时间、时段或持续时间；如果是总剧本，概括故事时间跨度",
  "location_text": "如果是分场剧本，提取主要地点；如果是总剧本，概括关键地点集合",
  "structured_characters": [
    {
      "id": "c1",
      "name": "人物姓名",
      "role": "本剧本层级中的作用",
      "state": "本段/本场/全局中的状态",
      "evidence": "来源行、原文片段或证据说明"
    }
  ],
  "plot_beats": [
    {
      "id": "b1",
      "label": "开场|冲突|反转|释放|结尾|其他",
      "time": "相对时间或顺序",
      "plot": "情节事实",
      "mood": "氛围或情绪",
      "evidence": "来源行、原文片段或证据说明"
    }
  ],
  "atmosphere": "整体氛围，尽量用可指导分镜和镜头的描述",
  "entity_candidates": [
    {
      "id": "e1",
      "type": "episode|scene_script|setting|character|scene|prop|world_rule",
      "name": "候选名称",
      "summary": "候选说明",
      "description": "可作为实体描述的简短文本",
      "outline": "如果是分集剧本或分场剧本，给出可继续创作的大纲",
      "confidence": 0.0,
      "evidence": "来源行、原文片段或证据说明"
    }
  ],
  "relationship_candidates": [
    {
      "id": "r1",
      "source": "候选ID或名称",
      "target": "候选ID或名称",
      "label": "关系说明",
      "type": "alliance|family|love|conflict|secret|dependency|contains|other",
      "evidence": "来源行、原文片段或证据说明"
    }
  ],
  "props": [
    {
      "id": "pr1",
      "name": "道具名称",
      "category": "类别",
      "usage": "剧情用途",
      "visual_notes": "外观、材质、状态"
    }
  ],
  "hook": "核心钩子，最吸引观众的悬念或看点",
  "plot_summary": "剧情推演提纲，按条目交代主要情节走向",
  "planned_scene_count": 0,
  "script_points": [
    {
      "id": "p1",
      "content": "剧本正文中的一个关键点或段落摘要",
      "beat_type": "hook|reversal|conflict|release|none",
      "tags": ["标签1", "标签2"]
    }
  ]
}`

const mainScriptSchemaInstruction = commonSchemaInstruction + `

主剧本必须额外输出：
{
  "episode_scripts": [
    {
      "id": "ep1",
      "order": 1,
      "title": "分集标题",
      "description": "一句话说明本集内容和看点",
      "outline": "本集提纲，按起承转合或关键节点描述",
      "hook": "本集钩子",
      "content": "从原文拆出的本集剧本文本，保留原始顺序和关键对白/动作",
      "source_range": "原文范围、章节名、行号或可追溯位置",
      "scene_refs": ["sc1", "sc2"]
    }
  ],
  "scene_scripts": [
    {
      "id": "sc1",
      "episode_id": "ep1",
      "order": 1,
      "title": "分场标题",
      "description": "一句话说明本场目的",
      "outline": "本场提纲",
      "content": "从原文拆出的本场文本",
      "source_range": "原文范围、章节名、行号或可追溯位置",
      "time_text": "时间/时段/持续时间",
      "location_text": "场景/地点",
      "characters": ["人物A", "人物B"],
      "plot": "情节事实",
      "atmosphere": "氛围"
    }
  ],
  "settings": [
    {
      "id": "set1",
      "type": "character|scene|prop|world_rule",
      "name": "设定名称",
      "description": "设定描述",
      "content": "可沉淀为设定库的正文",
      "evidence": "来源证据"
    }
  ]
}`

const episodeScriptSchemaInstruction = commonSchemaInstruction + `

分集剧本必须额外输出：
{
  "title": "本集标题",
  "description": "一句话说明本集内容和看点",
  "summary": "本集提纲",
  "hook": "本集钩子",
  "plot_summary": "本集剧情推演",
  "planned_scene_count": 0,
  "involved_scenes": [
    {
      "id": "sc1",
      "order": 1,
      "title": "涉及的分场标题",
      "description": "分场描述",
      "outline": "分场提纲",
      "content": "如果原文中已有分场正文，拆出本场文本；否则留空",
      "time_text": "时间",
      "location_text": "场景",
      "characters": ["人物A"],
      "plot": "情节",
      "atmosphere": "氛围"
    }
  ]
}`

const sceneScriptSchemaInstruction = commonSchemaInstruction + `

分场剧本必须额外输出并重点保证准确：
{
  "title": "分场标题",
  "description": "一句话说明本场目的",
  "summary": "本场提纲",
  "time_text": "明确时间、时段、持续时间或相对时间",
  "location_text": "明确场景/地点",
  "structured_characters": [
    {
      "id": "c1",
      "name": "人物姓名",
      "role": "本场作用",
      "state": "本场状态",
      "emotion": "本场情绪",
      "purpose": "本场目标",
      "evidence": "来源证据"
    }
  ],
  "plot_beats": [
    {
      "id": "b1",
      "label": "开场|冲突|反转|释放|结尾|其他",
      "plot": "情节事实",
      "mood": "氛围或情绪",
      "evidence": "来源证据"
    }
  ],
  "atmosphere": "本场氛围，可指导分镜和镜头"
}`

func BuildSinglePassPrompt(script model.Script, content string) string {
	instruction := schemaInstructionForScript(script)
	focus := focusInstructionForScript(script.ScriptType)
	return fmt.Sprintf(`请分析以下剧本内容，提取关键信息并以结构化JSON返回。

%s

剧本元信息：
- 标题：%s
- 类型：%s
- 版本：%d

%s

剧本内容：
%s`, focus, script.Title, script.ScriptType, script.Version, instruction, content)
}

func BuildChunkPrompt(script model.Script, chunk Chunk) string {
	instruction := schemaInstructionForScript(script)
	focus := focusInstructionForScript(script.ScriptType)
	return fmt.Sprintf(`请分析剧本分片，提取该分片中明确出现的信息。不要虚构未出现的内容。

%s

如果是主剧本分片，必须重点识别该分片中可拆出的分集剧本、分场剧本和设定，并保留可追溯的文本拆分内容。

剧本元信息：
- 标题：%s
- 类型：%s
- 分片：%d/%d

%s

剧本分片内容：
%s`, focus, script.Title, script.ScriptType, chunk.Index, chunk.Total, instruction, chunk.Text)
}

func BuildReducePrompt(script model.Script, partials []map[string]interface{}) string {
	raw := make([]string, 0, len(partials))
	for i, partial := range partials {
		raw = append(raw, fmt.Sprintf("分片%d：%s", i+1, ToJSON(partial)))
	}
	return fmt.Sprintf(`请合并以下多个剧本分片分析结果，去重、修正编号引用，并输出一份面向整部剧本的最终结构化JSON。

剧本元信息：
- 标题：%s
- 类型：%s

合并要求：
- 相同人物、场景、道具、设定要合并，不要重复。
- 输出最终 title、description、summary。
- 如果是主剧本，episode_scripts 必须包含完整分集拆分，scene_scripts 必须包含完整分场拆分，settings 必须包含人物、场景、世界规则等设定。
- entity_candidates 必须尽量包含分集剧本 episode、分场剧本 scene_script、设定 setting/character/scene/prop/world_rule 三类候选，并与 episode_scripts、scene_scripts、settings 对齐。
- 如果是分集剧本，只输出设定、场次、钩子、提纲、描述和 involved_scenes，不输出 planned_character_count。
- 如果是分场剧本，time_text、location_text、structured_characters、plot_beats、atmosphere 必须尽量填写。
- character_relationships 中 source/target 必须优先使用最终 character_profiles 的 id。
- summary、plot_summary、hook 要覆盖整体剧本，不是简单拼接。
- planned_scene_count 应基于合并后的分场结果估算。

%s

分片分析结果：
%s`, script.Title, script.ScriptType, schemaInstructionForScript(script), strings.Join(raw, "\n\n"))
}

func schemaInstructionForScript(script model.Script) string {
	switch script.ScriptType {
	case "main":
		return mainScriptSchemaInstruction
	case "episode":
		return episodeScriptSchemaInstruction
	case "scene":
		return sceneScriptSchemaInstruction
	default:
		return commonSchemaInstruction
	}
}

func focusInstructionForScript(scriptType string) string {
	switch scriptType {
	case "main":
		return `主剧本分析目标：
- 拆出分集剧本：episode_scripts 中必须有标题、描述、提纲、钩子、正文文本拆分和涉及分场。
- 拆出分场剧本：scene_scripts 中必须有标题、描述、提纲、正文文本拆分、时间、人物、场景、情节、氛围。
- 拆出设定：settings、character_profiles、scenes_desc、core_settings 中沉淀人物、场景、世界规则、道具等设定。
- 同步生成 entity_candidates，分集剧本用 type="episode"，分场剧本用 type="scene_script"，设定用 type="setting" 或 character/scene/prop/world_rule。`
	case "episode":
		return `分集剧本分析目标：
- 填写标题、描述、提纲、钩子、剧情推演。
- 提取本集核心设定 core_settings，并估算 planned_scene_count。
- 输出涉及到的分场 involved_scenes，并在 entity_candidates 中同步为 type="scene_script"。
- 只做分集级结构，不要把整部剧或单个镜头的细节混入本集结构。`
	case "scene":
		return `分场剧本分析目标：
- 填写标题、描述、提纲。
- 精确提取时间、人物、场景、情节、氛围。
- structured_characters 只写本场出现或被明确提及的人物状态，plot_beats 只写本场情节。`
	default:
		return `通用剧本分析目标：提取标题、描述、提纲、人物、场景、设定、钩子和剧情关键点。`
	}
}
