import type { AudioCue, ExpressionUnit } from './sourceWorkspaceTypes'

export const expressionUnitsByMoment: Record<string, ExpressionUnit[]> = {
  m1: [
    { id: 'expr_rain_call_hesitation', title: '迟疑', path: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_rain_call_hesitation/expression_unit.json', kind: 'micro_expression', text: '迟疑', summary: '手指悬停时的犹豫和恐惧，约束 shot_phone_press 的表演节奏。', sceneMomentId: 'm1' },
    { id: 'expr_rain_call_misread', title: '误会逼近', path: 'productions/pilot/segments/opening/scene_moments/rain_call/expression_units/expr_rain_call_misread/expression_unit.json', kind: 'dramatic_pressure', text: '误会逼近', summary: '车灯和背影制造危险靠近，约束 shot_headlights_back 的情绪方向。', sceneMomentId: 'm1' },
  ],
  m2: [
    { id: 'expr_elevator_eye_lock', title: '眼神锁定', path: 'productions/pilot/segments/escalation/scene_moments/elevator_look/expression_units/expr_elevator_eye_lock/expression_unit.json', kind: 'relationship_beat', text: '眼神锁定', summary: '门缝收窄前两人的眼神互相确认，影响 keyframe 和 storyboard 选择。', sceneMomentId: 'm2' },
    { id: 'expr_elevator_withhold', title: '克制不说', path: 'productions/pilot/segments/escalation/scene_moments/elevator_look/expression_units/expr_elevator_withhold/expression_unit.json', kind: 'subtext', text: '克制不说', summary: '台词缺席时用呼吸和停顿表达未说出口的关系变化。', sceneMomentId: 'm2' },
  ],
  m3: [
    { id: 'expr_morning_contained_break', title: '假装平静', path: 'productions/pilot/segments/aftermath/scene_moments/morning_kitchen/expression_units/expr_morning_contained_break/expression_unit.json', kind: 'internal_state', text: '假装平静', summary: '人物不动，杯面轻颤承担情绪外化。', sceneMomentId: 'm3' },
  ],
}

export const audioCuesByMoment: Record<string, AudioCue[]> = {}
