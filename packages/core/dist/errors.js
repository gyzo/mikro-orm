"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.MetadataError = exports.OptimisticLockError = exports.CursorError = exports.ValidationError = void 0;
const node_util_1 = require("node:util");
class ValidationError extends Error {
    entity;
    constructor(message, entity) {
        super(message);
        this.entity = entity;
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.message = message;
    }
    /**
     * Gets instance of entity that caused this error.
     */
    getEntity() {
        return this.entity;
    }
    static fromWrongPropertyType(entity, property, expectedType, givenType, givenValue) {
        const entityName = entity.constructor.name;
        const msg = `Trying to set ${entityName}.${property} of type '${expectedType}' to ${(0, node_util_1.inspect)(givenValue)} of type '${givenType}'`;
        return new ValidationError(msg);
    }
    static fromWrongRepositoryType(entityName, repoType, method) {
        const msg = `Trying to use EntityRepository.${method}() with '${entityName}' entity while the repository is of type '${repoType}'`;
        return new ValidationError(msg);
    }
    static fromCollectionNotInitialized(entity, prop) {
        const entityName = entity.constructor.name;
        const msg = `${entityName}.${prop.name} is not initialized, define it as '${prop.name} = new Collection<${prop.type}>(this);'`;
        return new ValidationError(msg);
    }
    static fromMergeWithoutPK(meta) {
        return new ValidationError(`You cannot merge entity '${meta.className}' without identifier!`);
    }
    static transactionRequired() {
        return new ValidationError('An open transaction is required for this operation');
    }
    static entityNotManaged(entity) {
        return new ValidationError(`Entity ${entity.constructor.name} is not managed. An entity is managed if its fetched from the database or registered as new through EntityManager.persist()`);
    }
    static notEntity(owner, prop, data) {
        const type = Object.prototype.toString.call(data).match(/\[object (\w+)]/)[1].toLowerCase();
        return new ValidationError(`Entity of type ${prop.type} expected for property ${owner.constructor.name}.${prop.name}, ${(0, node_util_1.inspect)(data)} of type ${type} given. If you are using Object.assign(entity, data), use em.assign(entity, data) instead.`);
    }
    static notDiscoveredEntity(data, meta, action = 'persist') {
        /* istanbul ignore next */
        const type = meta?.className ?? Object.prototype.toString.call(data).match(/\[object (\w+)]/)[1].toLowerCase();
        let err = `Trying to ${action} not discovered entity of type ${type}.`;
        /* istanbul ignore else */
        if (meta) {
            err += ` Entity with this name was discovered, but not the prototype you are passing to the ORM. If using EntitySchema, be sure to point to the implementation via \`class\`.`;
        }
        return new ValidationError(err);
    }
    static invalidPropertyName(entityName, invalid) {
        return new ValidationError(`Entity '${entityName}' does not have property '${invalid}'`);
    }
    static invalidType(type, value, mode) {
        const valueType = Object.prototype.toString.call(value).match(/\[object (\w+)]/)[1].toLowerCase();
        if (value instanceof Date) {
            value = value.toISOString();
        }
        return new ValidationError(`Could not convert ${mode} value '${value}' of type '${valueType}' to type ${type.name}`);
    }
    static propertyRequired(entity, property) {
        const entityName = entity.__meta.className;
        return new ValidationError(`Value for ${entityName}.${property.name} is required, '${entity[property.name]}' found\nentity: ${(0, node_util_1.inspect)(entity)}`, entity);
    }
    static cannotModifyInverseCollection(owner, property) {
        const inverseCollection = `${owner.constructor.name}.${property.name}`;
        const ownerCollection = `${property.type}.${property.mappedBy}`;
        const error = `You cannot modify inverse side of M:N collection ${inverseCollection} when the owning side is not initialized. `
            + `Consider working with the owning side instead (${ownerCollection}).`;
        return new ValidationError(error, owner);
    }
    static cannotModifyReadonlyCollection(owner, property) {
        return new ValidationError(`You cannot modify collection ${owner.constructor.name}.${property.name} as it is marked as readonly.`, owner);
    }
    static cannotRemoveFromCollectionWithoutOrphanRemoval(owner, property) {
        const options = [
            ' - add `orphanRemoval: true` to the collection options',
            ' - add `deleteRule: \'cascade\'` to the owning side options',
            ' - add `nullable: true` to the owning side options',
        ].join('\n');
        return new ValidationError(`Removing items from collection ${owner.constructor.name}.${property.name} without \`orphanRemoval: true\` would break non-null constraint on the owning side. You have several options: \n${options}`, owner);
    }
    static invalidCompositeIdentifier(meta) {
        return new ValidationError(`Composite key required for entity ${meta.className}.`);
    }
    static cannotCommit() {
        return new ValidationError('You cannot call em.flush() from inside lifecycle hook handlers');
    }
    static cannotUseGlobalContext() {
        return new ValidationError('Using global EntityManager instance methods for context specific actions is disallowed. If you need to work with the global instance\'s identity map, use `allowGlobalContext` configuration option or `fork()` instead.');
    }
    static cannotUseOperatorsInsideEmbeddables(className, propName, payload) {
        return new ValidationError(`Using operators inside embeddables is not allowed, move the operator above. (property: ${className}.${propName}, payload: ${(0, node_util_1.inspect)(payload)})`);
    }
    static invalidEmbeddableQuery(className, propName, embeddableType) {
        return new ValidationError(`Invalid query for entity '${className}', property '${propName}' does not exist in embeddable '${embeddableType}'`);
    }
}
exports.ValidationError = ValidationError;
class CursorError extends ValidationError {
    static entityNotPopulated(entity, prop) {
        return new CursorError(`Cannot create cursor, value for '${entity.constructor.name}.${prop}' is missing.`);
    }
    static missingValue(entityName, prop) {
        return new CursorError(`Invalid cursor condition, value for '${entityName}.${prop}' is missing.`);
    }
}
exports.CursorError = CursorError;
class OptimisticLockError extends ValidationError {
    static notVersioned(meta) {
        return new OptimisticLockError(`Cannot obtain optimistic lock on unversioned entity ${meta.className}`);
    }
    static lockFailed(entityOrName) {
        const name = typeof entityOrName === 'string' ? entityOrName : entityOrName.constructor.name;
        const entity = typeof entityOrName === 'string' ? undefined : entityOrName;
        return new OptimisticLockError(`The optimistic lock on entity ${name} failed`, entity);
    }
    static lockFailedVersionMismatch(entity, expectedLockVersion, actualLockVersion) {
        expectedLockVersion = expectedLockVersion instanceof Date ? expectedLockVersion.getTime() : expectedLockVersion;
        actualLockVersion = actualLockVersion instanceof Date ? actualLockVersion.getTime() : actualLockVersion;
        return new OptimisticLockError(`The optimistic lock failed, version ${expectedLockVersion} was expected, but is actually ${actualLockVersion}`, entity);
    }
}
exports.OptimisticLockError = OptimisticLockError;
class MetadataError extends ValidationError {
    static fromMissingPrimaryKey(meta) {
        return new MetadataError(`${meta.className} entity is missing @PrimaryKey()`);
    }
    static fromWrongReference(meta, prop, key, owner) {
        if (owner) {
            return MetadataError.fromMessage(meta, prop, `has wrong '${key}' reference type: ${owner.type} instead of ${meta.className}`);
        }
        return MetadataError.fromMessage(meta, prop, `has unknown '${key}' reference: ${prop.type}.${prop[key]}`);
    }
    static fromWrongForeignKey(meta, prop, key) {
        return MetadataError.fromMessage(meta, prop, `requires explicit '${key}' option, since the 'joinColumns' are not matching the length.`);
    }
    static fromWrongTypeDefinition(meta, prop) {
        if (!prop.type) {
            return MetadataError.fromMessage(meta, prop, `is missing type definition`);
        }
        return MetadataError.fromMessage(meta, prop, `has unknown type: ${prop.type}`);
    }
    static fromWrongOwnership(meta, prop, key) {
        const type = key === 'inversedBy' ? 'owning' : 'inverse';
        const other = key === 'inversedBy' ? 'mappedBy' : 'inversedBy';
        return new MetadataError(`Both ${meta.className}.${prop.name} and ${prop.type}.${prop[key]} are defined as ${type} sides, use '${other}' on one of them`);
    }
    static fromWrongReferenceKind(meta, owner, prop) {
        return new MetadataError(`${meta.className}.${prop.name} is of type ${prop.kind} which is incompatible with its owning side ${prop.type}.${owner.name} of type ${owner.kind}`);
    }
    static fromInversideSidePrimary(meta, owner, prop) {
        return new MetadataError(`${meta.className}.${prop.name} cannot be primary key as it is defined as inverse side. Maybe you should swap the use of 'inversedBy' and 'mappedBy'.`);
    }
    /* istanbul ignore next */
    static entityNotFound(name, path) {
        return new MetadataError(`Entity '${name}' not found in ${path}`);
    }
    static unknownIndexProperty(meta, prop, type) {
        return new MetadataError(`Entity ${meta.className} has wrong ${type} definition: '${prop}' does not exist. You need to use property name, not column name.`);
    }
    static multipleVersionFields(meta, fields) {
        return new MetadataError(`Entity ${meta.className} has multiple version properties defined: '${fields.join('\', \'')}'. Only one version property is allowed per entity.`);
    }
    static invalidVersionFieldType(meta) {
        const prop = meta.properties[meta.versionProperty];
        return new MetadataError(`Version property ${meta.className}.${prop.name} has unsupported type '${prop.type}'. Only 'number' and 'Date' are allowed.`);
    }
    static fromUnknownEntity(className, source) {
        return new MetadataError(`Entity '${className}' was not discovered, please make sure to provide it in 'entities' array when initializing the ORM (used in ${source})`);
    }
    static noEntityDiscovered() {
        return new MetadataError('No entities were discovered');
    }
    static onlyAbstractEntitiesDiscovered() {
        return new MetadataError('Only abstract entities were discovered, maybe you forgot to use @Entity() decorator? This can also happen when you have multiple `@mikro-orm/core` packages installed side by side.');
    }
    static duplicateEntityDiscovered(paths, subject = 'entity names') {
        return new MetadataError(`Duplicate ${subject} are not allowed: ${paths.join(', ')}`);
    }
    static duplicateFieldName(className, names) {
        return new MetadataError(`Duplicate fieldNames are not allowed: ${names.map(n => `${className}.${n[0]} (fieldName: '${n[1]}')`).join(', ')}`);
    }
    static multipleDecorators(entityName, propertyName) {
        return new MetadataError(`Multiple property decorators used on '${entityName}.${propertyName}' property`);
    }
    static missingMetadata(entity) {
        return new MetadataError(`Metadata for entity ${entity} not found`);
    }
    static invalidPrimaryKey(meta, prop, requiredName) {
        return this.fromMessage(meta, prop, `has wrong field name, '${requiredName}' is required in current driver`);
    }
    static invalidManyToManyWithPivotEntity(meta1, prop1, meta2, prop2) {
        const p1 = `${meta1.className}.${prop1.name}`;
        const p2 = `${meta2.className}.${prop2.name}`;
        return new MetadataError(`${p1} and ${p2} use the same 'pivotEntity', but don't form a bidirectional relation. Specify 'inversedBy' or 'mappedBy' to link them.`);
    }
    static targetIsAbstract(meta, prop) {
        return this.fromMessage(meta, prop, `targets abstract entity ${prop.type}. Maybe you forgot to put @Entity() decorator on the ${prop.type} class?`);
    }
    static nonPersistentCompositeProp(meta, prop) {
        return this.fromMessage(meta, prop, `is non-persistent relation which targets composite primary key. This is not supported and will cause issues, 'persist: false' should be added to the properties representing single columns instead.`);
    }
    static propertyTargetsEntityType(meta, prop, target) {
        /* istanbul ignore next */
        const suggestion = target.embeddable ? 'Embedded' : 'ManyToOne';
        return this.fromMessage(meta, prop, `is defined as scalar @Property(), but its type is a discovered entity ${target.className}. Maybe you want to use @${suggestion}() decorator instead?`);
    }
    static fromMissingOption(meta, prop, option) {
        return this.fromMessage(meta, prop, `is missing '${option}' option`);
    }
    static fromMessage(meta, prop, message) {
        return new MetadataError(`${meta.className}.${prop.name} ${message}`);
    }
}
exports.MetadataError = MetadataError;
class NotFoundError extends ValidationError {
    static findOneFailed(name, where) {
        return new NotFoundError(`${name} not found (${(0, node_util_1.inspect)(where)})`);
    }
    static findExactlyOneFailed(name, where) {
        return new NotFoundError(`Wrong number of ${name} entities found for query ${(0, node_util_1.inspect)(where)}, expected exactly one`);
    }
}
exports.NotFoundError = NotFoundError;
