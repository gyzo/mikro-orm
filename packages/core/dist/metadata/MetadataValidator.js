"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataValidator = void 0;
const utils_1 = require("../utils");
const errors_1 = require("../errors");
const enums_1 = require("../enums");
/**
 * @internal
 */
class MetadataValidator {
    /**
     * Validate there is only one property decorator. This disallows using `@Property()` together with e.g. `@ManyToOne()`
     * on the same property. One should use only `@ManyToOne()` in such case.
     * We allow the existence of the property in metadata if the reference type is the same, this should allow things like HMR to work.
     */
    static validateSingleDecorator(meta, propertyName, reference) {
        if (meta.properties[propertyName] && meta.properties[propertyName].kind !== reference) {
            throw errors_1.MetadataError.multipleDecorators(meta.className, propertyName);
        }
    }
    validateEntityDefinition(metadata, name, options) {
        const meta = metadata.get(name);
        if (meta.virtual || meta.expression) {
            for (const prop of utils_1.Utils.values(meta.properties)) {
                if (![enums_1.ReferenceKind.SCALAR, enums_1.ReferenceKind.EMBEDDED, enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
                    throw new errors_1.MetadataError(`Only scalars, embedded properties and to-many relations are allowed inside virtual entity. Found '${prop.kind}' in ${meta.className}.${prop.name}`);
                }
                if (prop.primary) {
                    throw new errors_1.MetadataError(`Virtual entity ${meta.className} cannot have primary key ${meta.className}.${prop.name}`);
                }
            }
            return;
        }
        // entities have PK
        if (!meta.embeddable && (!meta.primaryKeys || meta.primaryKeys.length === 0)) {
            throw errors_1.MetadataError.fromMissingPrimaryKey(meta);
        }
        this.validateVersionField(meta);
        this.validateDuplicateFieldNames(meta, options);
        this.validateIndexes(meta, meta.indexes ?? [], 'index');
        this.validateIndexes(meta, meta.uniques ?? [], 'unique');
        for (const prop of utils_1.Utils.values(meta.properties)) {
            if (prop.kind !== enums_1.ReferenceKind.SCALAR) {
                this.validateReference(meta, prop, metadata, options);
                this.validateBidirectional(meta, prop, metadata);
            }
            else if (metadata.has(prop.type)) {
                throw errors_1.MetadataError.propertyTargetsEntityType(meta, prop, metadata.get(prop.type));
            }
        }
    }
    validateDiscovered(discovered, options) {
        if (discovered.length === 0 && options.warnWhenNoEntities) {
            throw errors_1.MetadataError.noEntityDiscovered();
        }
        const duplicates = utils_1.Utils.findDuplicates(discovered.map(meta => meta.className));
        if (duplicates.length > 0 && options.checkDuplicateEntities) {
            throw errors_1.MetadataError.duplicateEntityDiscovered(duplicates);
        }
        const tableNames = discovered.filter(meta => !meta.abstract && meta === meta.root && (meta.tableName || meta.collection) && meta.schema !== '*');
        const duplicateTableNames = utils_1.Utils.findDuplicates(tableNames.map(meta => {
            const tableName = meta.tableName || meta.collection;
            return (meta.schema ? '.' + meta.schema : '') + tableName;
        }));
        if (duplicateTableNames.length > 0 && options.checkDuplicateTableNames && options.checkDuplicateEntities) {
            throw errors_1.MetadataError.duplicateEntityDiscovered(duplicateTableNames, 'table names');
        }
        // validate we found at least one entity (not just abstract/base entities)
        if (discovered.filter(meta => meta.name).length === 0 && options.warnWhenNoEntities) {
            throw errors_1.MetadataError.onlyAbstractEntitiesDiscovered();
        }
        const unwrap = (type) => type
            .replace(/Array<(.*)>/, '$1') // unwrap array
            .replace(/\[]$/, '') // remove array suffix
            .replace(/\((.*)\)/, '$1'); // unwrap union types
        const name = (p) => {
            if (typeof p === 'function') {
                return utils_1.Utils.className(p());
            }
            return utils_1.Utils.className(p);
        };
        const pivotProps = new Map();
        // check for not discovered entities
        discovered.forEach(meta => Object.values(meta.properties).forEach(prop => {
            if (prop.kind !== enums_1.ReferenceKind.SCALAR && !unwrap(prop.type).split(/ ?\| ?/).every(type => discovered.find(m => m.className === type))) {
                throw errors_1.MetadataError.fromUnknownEntity(prop.type, `${meta.className}.${prop.name}`);
            }
            if (prop.pivotEntity) {
                const props = pivotProps.get(name(prop.pivotEntity)) ?? [];
                props.push({ meta, prop });
                pivotProps.set(name(prop.pivotEntity), props);
            }
        }));
        pivotProps.forEach(props => {
            // if the pivot entity is used in more than one property, check if they are linked
            if (props.length > 1 && props.every(p => !p.prop.mappedBy && !p.prop.inversedBy)) {
                throw errors_1.MetadataError.invalidManyToManyWithPivotEntity(props[0].meta, props[0].prop, props[1].meta, props[1].prop);
            }
        });
    }
    validateReference(meta, prop, metadata, options) {
        // references do have types
        if (!prop.type) {
            throw errors_1.MetadataError.fromWrongTypeDefinition(meta, prop);
        }
        // references do have type of known entity
        if (!metadata.find(prop.type)) {
            throw errors_1.MetadataError.fromWrongTypeDefinition(meta, prop);
        }
        if (metadata.find(prop.type).abstract && !metadata.find(prop.type).discriminatorColumn) {
            throw errors_1.MetadataError.targetIsAbstract(meta, prop);
        }
        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && prop.persist === false && metadata.find(prop.type).compositePK && options.checkNonPersistentCompositeProps) {
            throw errors_1.MetadataError.nonPersistentCompositeProp(meta, prop);
        }
    }
    validateBidirectional(meta, prop, metadata) {
        if (prop.inversedBy) {
            const inverse = metadata.get(prop.type).properties[prop.inversedBy];
            this.validateOwningSide(meta, prop, inverse, metadata);
        }
        else if (prop.mappedBy) {
            const inverse = metadata.get(prop.type).properties[prop.mappedBy];
            this.validateInverseSide(meta, prop, inverse, metadata);
        }
        else {
            // 1:m property has `mappedBy`
            if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY && !prop.mappedBy) {
                throw errors_1.MetadataError.fromMissingOption(meta, prop, 'mappedBy');
            }
        }
    }
    validateOwningSide(meta, prop, inverse, metadata) {
        // has correct `inversedBy` on owning side
        if (!inverse) {
            throw errors_1.MetadataError.fromWrongReference(meta, prop, 'inversedBy');
        }
        const targetClassName = metadata.find(inverse.type)?.root.className;
        // has correct `inversedBy` reference type
        if (inverse.type !== meta.className && targetClassName !== meta.root.className) {
            throw errors_1.MetadataError.fromWrongReference(meta, prop, 'inversedBy', inverse);
        }
        // inverse side is not defined as owner
        if (inverse.inversedBy || inverse.owner) {
            throw errors_1.MetadataError.fromWrongOwnership(meta, prop, 'inversedBy');
        }
    }
    validateInverseSide(meta, prop, owner, metadata) {
        // has correct `mappedBy` on inverse side
        if (prop.mappedBy && !owner) {
            throw errors_1.MetadataError.fromWrongReference(meta, prop, 'mappedBy');
        }
        // has correct `mappedBy` reference type
        if (owner.type !== meta.className && metadata.find(owner.type)?.root.className !== meta.root.className) {
            throw errors_1.MetadataError.fromWrongReference(meta, prop, 'mappedBy', owner);
        }
        // owning side is not defined as inverse
        if (owner.mappedBy) {
            throw errors_1.MetadataError.fromWrongOwnership(meta, prop, 'mappedBy');
        }
        // owning side is not defined as inverse
        const valid = [
            { owner: enums_1.ReferenceKind.MANY_TO_ONE, inverse: enums_1.ReferenceKind.ONE_TO_MANY },
            { owner: enums_1.ReferenceKind.MANY_TO_MANY, inverse: enums_1.ReferenceKind.MANY_TO_MANY },
            { owner: enums_1.ReferenceKind.ONE_TO_ONE, inverse: enums_1.ReferenceKind.ONE_TO_ONE },
        ];
        if (!valid.find(spec => spec.owner === owner.kind && spec.inverse === prop.kind)) {
            throw errors_1.MetadataError.fromWrongReferenceKind(meta, owner, prop);
        }
        if (prop.primary) {
            throw errors_1.MetadataError.fromInversideSidePrimary(meta, owner, prop);
        }
    }
    validateIndexes(meta, indexes, type) {
        for (const index of indexes) {
            for (const propName of utils_1.Utils.asArray(index.properties)) {
                const prop = meta.root.properties[propName];
                if (!prop && !Object.values(meta.root.properties).some(p => propName.startsWith(p.name + '.'))) {
                    throw errors_1.MetadataError.unknownIndexProperty(meta, propName, type);
                }
            }
        }
    }
    validateDuplicateFieldNames(meta, options) {
        const candidates = Object.values(meta.properties)
            .filter(prop => prop.persist !== false && !prop.inherited && prop.fieldNames?.length === 1 && (prop.kind !== enums_1.ReferenceKind.EMBEDDED || prop.object))
            .map(prop => prop.fieldNames[0]);
        const duplicates = utils_1.Utils.findDuplicates(candidates);
        if (duplicates.length > 0 && options.checkDuplicateFieldNames) {
            const pairs = duplicates.flatMap(name => {
                return Object.values(meta.properties)
                    .filter(p => p.fieldNames?.[0] === name)
                    .map(prop => {
                    return [prop.embedded ? prop.embedded.join('.') : prop.name, prop.fieldNames[0]];
                });
            });
            throw errors_1.MetadataError.duplicateFieldName(meta.className, pairs);
        }
    }
    validateVersionField(meta) {
        if (!meta.versionProperty) {
            return;
        }
        const props = Object.values(meta.properties).filter(p => p.version);
        if (props.length > 1) {
            throw errors_1.MetadataError.multipleVersionFields(meta, props.map(p => p.name));
        }
        const prop = meta.properties[meta.versionProperty];
        const type = prop.runtimeType ?? prop.columnTypes?.[0] ?? prop.type;
        if (type !== 'number' && type !== 'Date' && !type.startsWith('timestamp') && !type.startsWith('datetime')) {
            throw errors_1.MetadataError.invalidVersionFieldType(meta);
        }
    }
}
exports.MetadataValidator = MetadataValidator;
