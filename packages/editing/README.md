# @movscript/editing

OpenCut-compatible editing protocol and in-process service for MovScript.

The package keeps the editing core protocol centered on OpenCut concepts:
project, scene, track, element, and timeline commands. MovScript-specific
objects such as `scene_moment`, `content_unit`, candidates, and RawResources are
mapped through adapter helpers instead of becoming the service core contract.

`OpenCut/` source is intentionally not modified by this package. Future OpenCut
upstream code can be connected behind this protocol boundary or synchronized
through a tracked upstream strategy.

