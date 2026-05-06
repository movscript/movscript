package workflowio

import domainworkflow "github.com/movscript/movscript/internal/domain/workflow"

const EntitySchemaVersion = domainworkflow.EntitySchemaVersion
const EntitySemanticSchemaVersion = domainworkflow.EntitySemanticSchemaVersion

type EntitySchema = domainworkflow.EntitySchema
type EntitySchemaField = domainworkflow.EntitySchemaField
type EntitySchemaSection = domainworkflow.EntitySchemaSection
type EntitySemanticSchema = domainworkflow.EntitySemanticSchema
type EntitySemanticField = domainworkflow.EntitySemanticField
type EntitySemanticSection = domainworkflow.EntitySemanticSection
type EntityMigration = domainworkflow.EntityMigration

var EntitySchemas = domainworkflow.EntitySchemas
var EntitySchemaForKind = domainworkflow.EntitySchemaForKind
var EntityFieldForPort = domainworkflow.EntityFieldForPort
var EntitySemanticSchemas = domainworkflow.EntitySemanticSchemas
var EntitySemanticSchemaForKind = domainworkflow.EntitySemanticSchemaForKind
var EntityWorkflowPortID = domainworkflow.EntityWorkflowPortID
