export function sourceDocuments() {
  return sourceFileEntries().map(([path, content]) => ({
    path,
    data: path.endsWith('.json') ? JSON.parse(content) : content,
  }))
}

export function sourceFileEntries() {
  return [
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['project_standards.json', JSON.stringify({ schema: 'movscript.project_standards.v1', kind: 'project_standards', id: 'project_standards', visual_style: 'Cold rainy suspense realism.' })],
    ['scripts/main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/main/script.md', 'INT. APARTMENT - NIGHT\nRain hits the window.\n'],
    ['settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Hero' })],
    ['settings/hero/states/rain/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'rain', title: 'Rain' })],
    ['settings/hero/states/rain/assets/wet_hair/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      slot: 'character_state_reference',
      prompt_hint: 'Wet hair and rain on the hero face.',
    })],
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
      transition: { out: 'hold_then_cut' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/shot.json', JSON.stringify({
      schema: 'movscript.shot.v1',
      kind: 'shot',
      id: 'phone',
      title: 'Phone close-up',
      order: 1,
      shot_size: 'close_up',
    })],
    ['content_units/cu_scene_anchor_keyframe_ref/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_scene_anchor_keyframe_ref',
      title: 'Scene anchor keyframe',
      content_unit_type: 'keyframe_ref',
      output_kind: 'image',
      keyframe_ref: 'scene_anchor',
      edit_prompt: {
        text: 'Create the scene anchor keyframe.',
        negative_text: 'cartoon',
      },
      model_intent: { capability: 'image', aspect_ratio: '16:9' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/keyframes/scene_anchor/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
      title: 'Scene anchor',
      visual_intent: 'Rainy apartment scene anchor.',
      reference_asset_refs: ['wet_hair'],
      continuity: { hair: 'wet and stuck to forehead', lighting: 'cold phone glow' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
      order: 1,
      timeline: { caption: 'Phone glow returns.', gap_after_sec: 0.4 },
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain', role: 'subject' }],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/audio_cues/phone_vibration/audio_cue.json', JSON.stringify({
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      order: 1,
      scope_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      shot_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main',
      timing: { start: 'after_action', duration_sec: 1.2 },
      prompt_hint: 'Rain low, phone vibration sharp.',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/caption_1/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'caption_1',
      expression_kind: 'caption',
      text: 'Unknown number lights up again.',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      shot_ref: 'phone',
      edit_prompt: {
        text: 'Cold phone light on frightened face. Use selected visual reference {{asset:wet_hair}}.',
        negative_text: 'cartoon',
      },
      model_intent: { capability: 'video', duration_sec: 4 },
    })],
    ['content_units/cu_wet_hair_ref/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair visual reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: {
        text: 'Cold phone light reference for wet hair continuity.',
        negative_text: 'cartoon',
      },
      model_intent: { capability: 'image', aspect_ratio: '1:1' },
    })],
  ]
}

export function memoryWorkspaceFileRepository(files) {
  return {
    async list(input = {}) {
      const root = normalizeMemoryPath(input.path ?? '')
      const children = new Map()
      for (const path of files.keys()) {
        if (root && path !== root && !path.startsWith(`${root}/`)) continue
        const rest = root ? path.slice(root.length).replace(/^\//, '') : path
        if (!rest) continue
        const [name, ...tail] = rest.split('/')
        const childPath = root ? `${root}/${name}` : name
        children.set(childPath, {
          path: childPath,
          kind: tail.length > 0 ? 'directory' : 'file',
          size: tail.length > 0 ? undefined : files.get(path).length,
        })
      }
      return {
        path: root,
        entries: [...children.values()].sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
          return left.path.localeCompare(right.path)
        }),
      }
    },
    async read(input) {
      const path = normalizeMemoryPath(input.path)
      const content = files.get(path)
      if (content === undefined) throw new Error(`missing file: ${path}`)
      return { path, content, size: content.length }
    },
    async write(input) {
      const path = normalizeMemoryPath(input.path)
      files.set(path, input.content)
      return { path, content: input.content, size: input.content.length }
    },
    async delete(input) {
      files.delete(normalizeMemoryPath(input.path))
    },
  }
}

function normalizeMemoryPath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
