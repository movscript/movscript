# Provider Generated Artifact Trust

Use this reference when a Seedance/Seedream generation or reference workflow depends on whether a RawResource is a trusted provider-generated artifact.

## Trust Scopes

| scope | trusted artifact range | effective from | valid for |
| --- | --- | --- | --- |
| `seedance2_face_video` | Seedance 2.0 generated video with human faces | 2026-03-11 | 30 days from generation time |
| `seedance2_face_video_tail_frame` | Tail-frame image derived from a Seedance 2.0 generated video with human faces | 2026-04-16 | 30 days from source video generation time |
| `seedream5_lite_face_image` | Seedream 5.0 lite text-to-image output with human faces | 2026-04-16 | 30 days from generation time |

## Storage Contract

RawResource stores provider-generated provenance in `provider_generated_artifact` with schema `movscript.provider_generated_artifact.v1`.

Important fields:

- `source_kind`: `generation_job`, `derived_resource`, `upload`, `manual`, or `unknown`.
- `source_job_id`, `source_resource_id`, `source_candidate_id`: auditable source pointers when known.
- `provider`, `model_id`, `model_family`: normalized source identity. Current trust families are `seedance2` and `seedream5_lite`.
- `output_kind`: `image` or `video` for these trust scopes.
- `generated_at`: provider artifact generation time.
- `face_content`: `contains_face`, `no_face`, or `unknown`.
- `derivation.operation`: use `video_tail_frame` for trusted Seedance tail-frame images.
- `trust_claim.scope`, `effective_from`, `validity_days`, `expires_at`, `status`.

`provider_asset_certifications` is separate. It records official provider asset-library registration, not artifact trust provenance.

## Reference Gate

Before using a RawResource as a provider-trusted reference:

1. Read the RawResource metadata from the resource library or generation/job output.
2. Require `provider_generated_artifact.schema == "movscript.provider_generated_artifact.v1"`.
3. Require a matching `trust_claim.scope`.
4. Require `generated_at` to be on or after `effective_from`.
5. Require the current time to be on or before `expires_at`.
6. Require `face_content == "contains_face"` or an explicit workflow/user confirmation that the artifact contains a face.
7. For `seedance2_face_video_tail_frame`, require `source_kind == "derived_resource"`, `derivation.operation == "video_tail_frame"`, and a traceable source Seedance video.

If any check fails, use the resource only as an ordinary RawResource reference unless the user explicitly accepts an unstable/non-trusted draft.

## Seedance Face Reference Paths

Before generating Seedance video that relies on a stable human face or human identity, choose one upstream path and make it explicit:

1. Certified virtual portrait
   Use a generated/owned virtual-person portrait RawResource that has been stabilized as an `asset_ref` candidate, adopted/selected, and certified into the provider asset library with `provider_asset_certifications.<provider_id>`.

2. Certified real-person portrait
   Use a real-person portrait RawResource only when the workflow/user has confirmed the required rights/consent and the portrait has been stabilized as an `asset_ref` candidate, adopted/selected, and certified into the provider asset library with `provider_asset_certifications.<provider_id>`.

3. Seedream 5.0 lite generated identity image
   Generate the character/person identity first with Seedream 5.0 lite text-to-image, record it as an `asset_ref` candidate, adopt/select it, and require valid `provider_generated_artifact.trust_claim.scope == "seedream5_lite_face_image"` before using it as a Seedance face reference.

If none of these exists, stop normal Seedance downstream video generation. Create or certify the upstream portrait asset first, then continue with `{{asset::id}}` or the selected RawResource as the reference. Continue without this gate only when the user explicitly asks for an unstable/non-trusted draft.

Do not treat a generic uploaded photo, an unselected candidate, or a Seedance output tail frame as a reusable character identity merely because it looks usable. Tail-frame images are useful as continuity/reference evidence only when their `provider_generated_artifact` proves the source video and 30-day trust window.

## Agent Behavior

- Do not infer trust from filename, prompt text, or model name alone.
- Do not treat a selected candidate as trusted unless its output RawResource has valid `provider_generated_artifact`.
- Do not extend the 30-day window when an asset is adopted, selected, moved to a folder, or certified into the provider asset library.
- Tail-frame validity starts from the source video generation time, not from the frame extraction time.
- When the metadata says `needs_face_confirmation`, ask for confirmation or run the available face/content verification workflow before relying on trusted-reference behavior.
- For Seedance human/face video, prefer stabilizing and certifying the portrait asset before writing the downstream video prompt.
