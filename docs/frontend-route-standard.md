# Frontend Route Standard

This document defines the route vocabulary for `apps/frontend`. The route constants in `apps/frontend/src/routes/projectRoutes.ts` are the source of truth.

## Principles

- Project-scoped screens live under `/project/*`.
- Routes name business surfaces, not implementation history. Avoid generic `workbench`, verbs such as `orchestrate`, and retired entity-only routes as primary page URLs.
- Query parameters represent view state, filters, or review context. They must not be the only signal that identifies the page.
- Legacy routes remain as redirect-only compatibility entries in `LEGACY_ROUTES`.

## Canonical Project Routes

| Route | Meaning | Current page component |
| --- | --- | --- |
| `/project/overview` | Project overview and next action surface | `ProjectOverviewPage` |
| `/project/standards` | Project standards and global rules | `ProjectStandardsPage` |
| `/project/pre-production` | Settings, references, asset needs, and review | `PreProductionPage` |
| `/project/scripts` | Scripts and script-derived structure | `ScriptsPage` |
| `/project/segments` | Production segments | `SegmentsPage` |
| `/project/scene-moments` | Scene moments | `SceneMomentsPage` |
| `/project/content-units` | Content unit source of truth | `ContentUnitsPage` |
| `/project/content-units/workbench` | Content unit generation and adoption workbench | `WorkbenchPage` production mode |
| `/project/production` | Production center | `ProductionPage` |
| `/project/production/orchestration` | Production orchestration tree | `ProductionOrchestrationPage` |
| `/project/production/preview` | Production preview workspace | `WorkbenchPage` preview mode |
| `/project/tasks` | Work items and collaboration tasks | `TasksPage` |
| `/project/delivery` | Delivery center | `DeliveryPage` |
| `/project/delivery/workbench` | Delivery package and export workbench | `DeliveryWorkbenchPage` |
| `/project/reference-relations` | Reference relation source of truth | `ReferenceRelationsPage` |
| `/project/reference-relations/workbench` | Reference relation correction workbench | `WorkbenchPage` relation mode |

## Naming Direction

Route component file names should use the business surface names:

| Retired name | Current name |
| --- | --- |
| `ProjectHomePage` | `ProjectOverviewPage` |
| `ProjectWorkspacePage` | `ProjectStandardsPage` |
| `ProductionFramePage` | `ProductionPage` |
| `ProductionOrchestratePage` | `ProductionOrchestrationPage` |
| `ContentsPage` | `ContentUnitsPage` |
| `CollaborationPage` | `TasksPage` |
| `FinalVideosPage` | `DeliveryPage` |
| `FinalVideosWorkspacePage` | `DeliveryWorkbenchPage` |
| generic `WorkbenchPage` modes | split into named workbench pages when the implementation is small enough |

Do not introduce new links to legacy paths. Use `ROUTES` and route helpers instead.
