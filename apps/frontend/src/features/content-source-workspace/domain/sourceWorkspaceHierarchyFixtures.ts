import type { HierarchyNode } from './sourceWorkspaceTypes'

export const hierarchyTree: HierarchyNode[] = [
  {
    id: 'settings_root',
    type: 'group',
    title: 'Settings',
    path: 'settings/',
    children: [
          {
            id: 'setting/rain_rooftop',
            type: 'setting',
            title: '雨夜天台',
            path: 'settings/rain_rooftop/setting.json',
            children: [
              {
                id: 'state/rain_rooftop/night_rain',
                type: 'state',
                title: '夜雨状态',
                path: 'settings/rain_rooftop/states/night_rain.json',
                shotId: 'shot_phone_press',
                momentId: 'm1',
                children: [
                  { id: 'asset/phone_screen', type: 'asset', title: '手机屏幕 UI', path: 'assets/phone_screen/asset.json', state: 'locked', shotId: 'shot_phone_press', momentId: 'm1' },
                  { id: 'asset/wet_hand_ref', type: 'asset', title: '湿发手部参考', path: 'assets/wet_hand_ref/asset.json', shotId: 'shot_phone_press', momentId: 'm1' },
                ],
              },
              {
                id: 'state/rain_rooftop/city_backlight',
                type: 'state',
                title: '城市远景冷光',
                path: 'settings/rain_rooftop/states/city_backlight.json',
                state: 'changed',
                shotId: 'shot_phone_press',
                momentId: 'm1',
                children: [
                  { id: 'asset/headlight_beam', type: 'asset', title: '车灯光束参考', path: 'assets/headlight_beam/asset.json', state: 'missing', shotId: 'shot_headlights_back', momentId: 'm1' },
                ],
              },
            ],
          },
          {
            id: 'setting/hotel_elevator',
            type: 'setting',
            title: '酒店电梯',
            path: 'settings/hotel_elevator/setting.json',
            children: [
              {
                id: 'state/hotel_elevator/warm_corridor',
                type: 'state',
                title: '暖色走廊光位',
                path: 'settings/hotel_elevator/states/warm_corridor.json',
                state: 'changed',
                shotId: 'shot_elevator_gap',
                momentId: 'm2',
                children: [
                  { id: 'asset/elevator_metal', type: 'asset', title: '电梯金属反射', path: 'assets/elevator_metal/asset.json', shotId: 'shot_elevator_gap', momentId: 'm2' },
                  { id: 'asset/evening_dress', type: 'asset', title: '礼服材质', path: 'assets/evening_dress/asset.json', state: 'missing', shotId: 'shot_elevator_gap', momentId: 'm2' },
                ],
              },
            ],
          },
          {
            id: 'setting/morning_kitchen',
            type: 'setting',
            title: '清晨厨房',
            path: 'settings/morning_kitchen/setting.json',
            children: [
              {
                id: 'state/morning_kitchen/window_backlight',
                type: 'state',
                title: '窗帘逆光',
                path: 'settings/morning_kitchen/states/window_backlight.json',
                shotId: 'shot_coffee_tremble',
                momentId: 'm3',
                children: [
                  { id: 'asset/coffee_cup', type: 'asset', title: '咖啡杯道具', path: 'assets/coffee_cup/asset.json', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                  { id: 'asset/notes_stack', type: 'asset', title: '手写笔记', path: 'assets/notes_stack/asset.json', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                ],
              },
            ],
          },
    ],
  },
  {
    id: 'productions_group',
    type: 'group',
    title: 'Productions',
    path: 'productions',
    children: [
  {
    id: 'production_pilot',
    type: 'production',
    title: 'Production 1 · 短剧试播集',
    path: 'productions/pilot/production.json',
    state: 'selected',
    children: [
      {
        id: 'segment_opening',
        type: 'segment',
        title: '开场钩子',
        path: 'productions/pilot/segments/opening/segment.json',
        state: 'selected',
        children: [
          {
            id: 'm1',
            type: 'scene_moment',
            title: '雨夜电话打断告白',
            path: 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json',
            state: 'selected',
            momentId: 'm1',
            children: [
              {
                id: 'm1_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                children: [
                  {
                    id: 'shot_phone_press',
                    type: 'shot',
                    title: '女主手指停在拨号键上',
                    path: '.../shots/shot_phone_press/shot.json',
                    state: 'selected',
                    shotId: 'shot_phone_press',
                    momentId: 'm1',
                    children: [
                      {
                        id: 'shot_phone_press_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_phone_press',
                        momentId: 'm1',
                        children: [
                          { id: 'storyboard/phone_press_board', type: 'storyboard', title: '三格分镜', path: '.../storyboards/phone_press_board/storyboard.json', state: 'selected', shotId: 'shot_phone_press', momentId: 'm1' },
                        ],
                      },
                      {
                        id: 'shot_phone_press_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_phone_press',
                        momentId: 'm1',
                        children: [
                          { id: 'kf_phone_hover', type: 'keyframe', title: '手指悬停', path: '.../keyframes/kf_phone_hover/keyframe.json', state: 'selected', shotId: 'shot_phone_press', momentId: 'm1' },
                          { id: 'kf_rain_on_screen', type: 'keyframe', title: '雨滴落在屏幕', path: '.../keyframes/kf_rain_on_screen/keyframe.json', state: 'candidate', shotId: 'shot_phone_press', momentId: 'm1' },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'shot_headlights_back',
                    type: 'shot',
                    title: '男主背影被车灯切开',
                    path: '.../shots/shot_headlights_back/shot.json',
                    state: 'needs_candidate',
                    shotId: 'shot_headlights_back',
                    momentId: 'm1',
                    children: [
                      {
                        id: 'shot_headlights_back_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_headlights_back',
                        momentId: 'm1',
                        children: [
                          { id: 'storyboard/headlights_back_board', type: 'storyboard', title: '两格危险靠近', path: '.../storyboards/headlights_back_board/storyboard.json', state: 'draft', shotId: 'shot_headlights_back', momentId: 'm1' },
                        ],
                      },
                      {
                        id: 'shot_headlights_back_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_headlights_back',
                        momentId: 'm1',
                        children: [
                          { id: 'kf_back_silhouette', type: 'keyframe', title: '背影静止', path: '.../keyframes/kf_back_silhouette/keyframe.json', state: 'selected', shotId: 'shot_headlights_back', momentId: 'm1' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm1_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                children: [
                  { id: 'expr_rain_call_hesitation', type: 'expression_unit', title: '迟疑', path: '.../expression_units/expr_rain_call_hesitation/expression_unit.json', state: 'selected', momentId: 'm1', shotId: 'shot_phone_press' },
                  { id: 'expr_rain_call_misread', type: 'expression_unit', title: '误会逼近', path: '.../expression_units/expr_rain_call_misread/expression_unit.json', state: 'candidate', momentId: 'm1', shotId: 'shot_headlights_back' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'segment_escalation',
        type: 'segment',
        title: '关系升级',
        path: 'productions/pilot/segments/escalation/segment.json',
        state: 'stale',
        children: [
          {
            id: 'm2',
            type: 'scene_moment',
            title: '电梯门合上前的对视',
            path: 'productions/pilot/segments/escalation/scene_moments/elevator_look/scene_moment.json',
            state: 'stale',
            momentId: 'm2',
            children: [
              {
                id: 'm2_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                momentId: 'm2',
                children: [
                  {
                    id: 'shot_elevator_gap',
                    type: 'shot',
                    title: '电梯缝隙里的双人对视',
                    path: '.../shots/shot_elevator_gap/shot.json',
                    state: 'stale',
                    shotId: 'shot_elevator_gap',
                    momentId: 'm2',
                    children: [
                      {
                        id: 'shot_elevator_gap_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_elevator_gap',
                        momentId: 'm2',
                        children: [
                          { id: 'storyboard/elevator_gap_board', type: 'storyboard', title: '门缝宽中窄三段', path: '.../storyboards/elevator_gap_board/storyboard.json', state: 'stale', shotId: 'shot_elevator_gap', momentId: 'm2' },
                        ],
                      },
                      {
                        id: 'shot_elevator_gap_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_elevator_gap',
                        momentId: 'm2',
                        children: [
                          { id: 'kf_eye_contact', type: 'keyframe', title: '眼神相遇', path: '.../keyframes/kf_eye_contact/keyframe.json', state: 'stale', shotId: 'shot_elevator_gap', momentId: 'm2' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm2_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                momentId: 'm2',
                children: [
                  { id: 'expr_elevator_eye_lock', type: 'expression_unit', title: '眼神锁定', path: '.../expression_units/expr_elevator_eye_lock/expression_unit.json', state: 'stale', momentId: 'm2', shotId: 'shot_elevator_gap' },
                  { id: 'expr_elevator_withhold', type: 'expression_unit', title: '克制不说', path: '.../expression_units/expr_elevator_withhold/expression_unit.json', state: 'candidate', momentId: 'm2', shotId: 'shot_elevator_gap' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'segment_aftermath',
        type: 'segment',
        title: '余波',
        path: 'productions/pilot/segments/aftermath/segment.json',
        state: 'ready',
        children: [
          {
            id: 'm3',
            type: 'scene_moment',
            title: '清晨厨房里的假装平静',
            path: 'productions/pilot/segments/aftermath/scene_moments/morning_kitchen/scene_moment.json',
            state: 'ready',
            momentId: 'm3',
            children: [
              {
                id: 'm3_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                momentId: 'm3',
                children: [
                  {
                    id: 'shot_coffee_tremble',
                    type: 'shot',
                    title: '咖啡杯边缘轻微颤动',
                    path: '.../shots/shot_coffee_tremble/shot.json',
                    state: 'ready',
                    shotId: 'shot_coffee_tremble',
                    momentId: 'm3',
                    children: [
                      {
                        id: 'shot_coffee_tremble_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_coffee_tremble',
                        momentId: 'm3',
                        children: [
                          { id: 'storyboard/coffee_tremble_board', type: 'storyboard', title: '杯面动作分镜', path: '.../storyboards/coffee_tremble_board/storyboard.json', state: 'draft', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                        ],
                      },
                      {
                        id: 'shot_coffee_tremble_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_coffee_tremble',
                        momentId: 'm3',
                        children: [
                          { id: 'kf_cup_still', type: 'keyframe', title: '杯沿静止', path: '.../keyframes/kf_cup_still/keyframe.json', state: 'candidate', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm3_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                momentId: 'm3',
                children: [
                  { id: 'expr_morning_contained_break', type: 'expression_unit', title: '假装平静', path: '.../expression_units/expr_morning_contained_break/expression_unit.json', state: 'ready', momentId: 'm3', shotId: 'shot_coffee_tremble' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'production_followup',
    type: 'production',
    title: 'Production 2 · 第二集草案',
    path: 'productions/followup/production.json',
    children: [
      {
        id: 'segment_followup_cold_open',
        type: 'segment',
        title: '冷开场',
        path: 'productions/followup/segments/cold_open/segment.json',
        children: [
          {
            id: 'm_followup_shadow',
            type: 'scene_moment',
            title: '门外影子停住',
            path: 'productions/followup/segments/cold_open/scene_moments/door_shadow/scene_moment.json',
            children: [
              {
                id: 'm_followup_shadow_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                children: [
                  {
                    id: 'shot_followup_shadow',
                    type: 'shot',
                    title: '门缝下的影子',
                    path: '.../shots/shot_followup_shadow/shot.json',
                    state: 'draft',
                    children: [
                      {
                        id: 'shot_followup_shadow_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        children: [],
                      },
                      {
                        id: 'shot_followup_shadow_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm_followup_shadow_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                children: [
                  { id: 'expr_followup_suspense', type: 'expression_unit', title: '悬念停顿', path: '.../expression_units/expr_followup_suspense/expression_unit.json', state: 'draft' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
    ],
  },
]
