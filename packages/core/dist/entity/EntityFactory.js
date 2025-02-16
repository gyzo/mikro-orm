"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityFactory = void 0;
const Utils_1 = require("../utils/Utils");
const QueryHelper_1 = require("../utils/QueryHelper");
const enums_1 = require("../enums");
const Reference_1 = require("./Reference");
const wrap_1 = require("./wrap");
const EntityHelper_1 = require("./EntityHelper");
class EntityFactory {
    em;
    driver;
    platform;
    config;
    metadata;
    hydrator;
    eventManager;
    comparator;
    constructor(em) {
        this.em = em;
        this.driver = this.em.getDriver();
        this.platform = this.driver.getPlatform();
        this.config = this.em.config;
        this.metadata = this.em.getMetadata();
        this.hydrator = this.config.getHydrator(this.metadata);
        this.eventManager = this.em.getEventManager();
        this.comparator = this.em.getComparator();
    }
    create(entityName, data, options = {}) {
        data = Reference_1.Reference.unwrapReference(data);
        options.initialized ??= true;
        if (data.__entity) {
            return data;
        }
        entityName = Utils_1.Utils.className(entityName);
        const meta = this.metadata.get(entityName);
        if (meta.virtual) {
            data = { ...data };
            const entity = this.createEntity(data, meta, options);
            this.hydrate(entity, meta, data, options);
            return entity;
        }
        if (this.platform.usesDifferentSerializedPrimaryKey()) {
            meta.primaryKeys.forEach(pk => this.denormalizePrimaryKey(data, pk, meta.properties[pk]));
        }
        const meta2 = this.processDiscriminatorColumn(meta, data);
        const exists = this.findEntity(data, meta2, options);
        let wrapped = exists && (0, wrap_1.helper)(exists);
        if (wrapped && !options.refresh) {
            wrapped.__processing = true;
            this.mergeData(meta2, exists, data, options);
            wrapped.__processing = false;
            if (wrapped.isInitialized()) {
                return exists;
            }
        }
        data = { ...data };
        const entity = exists ?? this.createEntity(data, meta2, options);
        wrapped = (0, wrap_1.helper)(entity);
        wrapped.__processing = true;
        wrapped.__initialized = options.initialized;
        if (options.newEntity || meta.forceConstructor || meta.virtual) {
            const tmp = { ...data };
            meta.constructorParams.forEach(prop => delete tmp[prop]);
            this.hydrate(entity, meta2, tmp, options);
            // since we now process only a copy of the `data` via hydrator, but later we register the state with the full snapshot,
            // we need to go through all props with custom types that have `ensureComparable: true` and ensure they are comparable
            // even if they are not part of constructor parameters (as this is otherwise normalized during hydration, here only in `tmp`)
            if (options.convertCustomTypes) {
                for (const prop of meta.props) {
                    if (prop.customType?.ensureComparable(meta, prop) && data[prop.name]) {
                        if ([enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind)) {
                            continue;
                        }
                        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isPlainObject(data[prop.name])) {
                            data[prop.name] = Utils_1.Utils.getPrimaryKeyValues(data[prop.name], prop.targetMeta.primaryKeys, true);
                        }
                        data[prop.name] = prop.customType.convertToDatabaseValue(data[prop.name], this.platform, { key: prop.name, mode: 'hydration' });
                    }
                }
            }
        }
        else {
            this.hydrate(entity, meta2, data, options);
        }
        wrapped.__touched = false;
        if (exists && meta.discriminatorColumn && !(entity instanceof meta2.class)) {
            Object.setPrototypeOf(entity, meta2.prototype);
        }
        if (options.merge && wrapped.hasPrimaryKey()) {
            this.unitOfWork.register(entity, data, {
                refresh: options.refresh && options.initialized,
                newEntity: options.newEntity,
                loaded: options.initialized,
            });
            if (options.recomputeSnapshot) {
                wrapped.__originalEntityData = this.comparator.prepareEntity(entity);
            }
        }
        if (this.eventManager.hasListeners(enums_1.EventType.onInit, meta2)) {
            this.eventManager.dispatchEvent(enums_1.EventType.onInit, { entity, meta: meta2, em: this.em });
        }
        wrapped.__processing = false;
        return entity;
    }
    mergeData(meta, entity, data, options = {}) {
        // merge unchanged properties automatically
        data = QueryHelper_1.QueryHelper.processParams(data);
        const existsData = this.comparator.prepareEntity(entity);
        const originalEntityData = (0, wrap_1.helper)(entity).__originalEntityData ?? {};
        const diff = this.comparator.diffEntities(meta.className, originalEntityData, existsData);
        // version properties are not part of entity snapshots
        if (meta.versionProperty && data[meta.versionProperty] && data[meta.versionProperty] !== originalEntityData[meta.versionProperty]) {
            diff[meta.versionProperty] = data[meta.versionProperty];
        }
        const diff2 = this.comparator.diffEntities(meta.className, existsData, data);
        // do not override values changed by user
        Utils_1.Utils.keys(diff).forEach(key => delete diff2[key]);
        Utils_1.Utils.keys(diff2).filter(key => {
            // ignore null values if there is already present non-null value
            if (existsData[key] != null) {
                return diff2[key] == null;
            }
            return diff2[key] === undefined;
        }).forEach(key => delete diff2[key]);
        // but always add collection properties and formulas if they are part of the `data`
        Utils_1.Utils.keys(data)
            .filter(key => meta.properties[key]?.formula || [enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(meta.properties[key]?.kind))
            .forEach(key => diff2[key] = data[key]);
        // rehydrated with the new values, skip those changed by user
        this.hydrate(entity, meta, diff2, options);
        // we need to update the entity data only with keys that were not present before
        const nullVal = this.config.get('forceUndefined') ? undefined : null;
        Utils_1.Utils.keys(diff2).forEach(key => {
            const prop = meta.properties[key];
            if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isPlainObject(data[prop.name])) {
                diff2[key] = entity[prop.name] ? (0, wrap_1.helper)(entity[prop.name]).getPrimaryKey(options.convertCustomTypes) : null;
            }
            originalEntityData[key] = diff2[key] === null ? nullVal : diff2[key];
            (0, wrap_1.helper)(entity).__loadedProperties.add(key);
        });
        // in case of joined loading strategy, we need to cascade the merging to possibly loaded relations manually
        meta.relations.forEach(prop => {
            if ([enums_1.ReferenceKind.MANY_TO_MANY, enums_1.ReferenceKind.ONE_TO_MANY].includes(prop.kind) && Array.isArray(data[prop.name])) {
                // instead of trying to match the collection items (which could easily fail if the collection was loaded with different ordering),
                // we just create the entity from scratch, which will automatically pick the right one from the identity map and call `mergeData` on it
                data[prop.name]
                    .filter(child => Utils_1.Utils.isPlainObject(child)) // objects with prototype can be PKs (e.g. `ObjectId`)
                    .forEach(child => this.create(prop.type, child, options)); // we can ignore the value, we just care about the `mergeData` call
                return;
            }
            if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isPlainObject(data[prop.name]) && entity[prop.name] && (0, wrap_1.helper)(entity[prop.name]).__initialized) {
                this.create(prop.type, data[prop.name], options); // we can ignore the value, we just care about the `mergeData` call
            }
        });
        (0, wrap_1.helper)(entity).__touched = false;
    }
    createReference(entityName, id, options = {}) {
        options.convertCustomTypes ??= true;
        entityName = Utils_1.Utils.className(entityName);
        const meta = this.metadata.get(entityName);
        const schema = this.driver.getSchemaName(meta, options);
        if (meta.simplePK) {
            const exists = this.unitOfWork.getById(entityName, id, schema);
            if (exists) {
                return exists;
            }
            const data = Utils_1.Utils.isPlainObject(id) ? id : { [meta.primaryKeys[0]]: Array.isArray(id) ? id[0] : id };
            return this.create(entityName, data, { ...options, initialized: false });
        }
        if (Array.isArray(id)) {
            id = Utils_1.Utils.getPrimaryKeyCondFromArray(id, meta);
        }
        const pks = Utils_1.Utils.getOrderedPrimaryKeys(id, meta, this.platform, options.convertCustomTypes);
        const exists = this.unitOfWork.getById(entityName, pks, schema);
        if (exists) {
            return exists;
        }
        if (Utils_1.Utils.isPrimaryKey(id)) {
            id = { [meta.primaryKeys[0]]: id };
        }
        return this.create(entityName, id, { ...options, initialized: false });
    }
    createEmbeddable(entityName, data, options = {}) {
        entityName = Utils_1.Utils.className(entityName);
        data = { ...data };
        const meta = this.metadata.get(entityName);
        const meta2 = this.processDiscriminatorColumn(meta, data);
        return this.createEntity(data, meta2, options);
    }
    getComparator() {
        return this.comparator;
    }
    createEntity(data, meta, options) {
        if (options.newEntity || meta.forceConstructor || meta.virtual) {
            if (!meta.class) {
                throw new Error(`Cannot create entity ${meta.className}, class prototype is unknown`);
            }
            const params = this.extractConstructorParams(meta, data, options);
            const Entity = meta.class;
            // creates new instance via constructor as this is the new entity
            const entity = new Entity(...params);
            // creating managed entity instance when `forceEntityConstructor` is enabled,
            // we need to wipe all the values as they would cause update queries on next flush
            if (!options.newEntity && (meta.forceConstructor || this.config.get('forceEntityConstructor'))) {
                meta.props
                    .filter(prop => prop.persist !== false && !prop.primary && data[prop.name] === undefined)
                    .forEach(prop => delete entity[prop.name]);
            }
            if (meta.virtual) {
                return entity;
            }
            (0, wrap_1.helper)(entity).__schema = this.driver.getSchemaName(meta, options);
            if (options.initialized) {
                EntityHelper_1.EntityHelper.ensurePropagation(entity);
            }
            return entity;
        }
        // creates new entity instance, bypassing constructor call as its already persisted entity
        const entity = Object.create(meta.class.prototype);
        (0, wrap_1.helper)(entity).__managed = true;
        (0, wrap_1.helper)(entity).__processing = !meta.embeddable && !meta.virtual;
        (0, wrap_1.helper)(entity).__schema = this.driver.getSchemaName(meta, options);
        if (options.merge && !options.newEntity) {
            this.hydrator.hydrateReference(entity, meta, data, this, options.convertCustomTypes, this.driver.getSchemaName(meta, options));
            this.unitOfWork.register(entity);
        }
        if (options.initialized) {
            EntityHelper_1.EntityHelper.ensurePropagation(entity);
        }
        return entity;
    }
    hydrate(entity, meta, data, options) {
        if (options.initialized) {
            this.hydrator.hydrate(entity, meta, data, this, 'full', options.newEntity, options.convertCustomTypes, this.driver.getSchemaName(meta, options));
        }
        else {
            this.hydrator.hydrateReference(entity, meta, data, this, options.convertCustomTypes, this.driver.getSchemaName(meta, options));
        }
        Utils_1.Utils.keys(data).forEach(key => {
            (0, wrap_1.helper)(entity)?.__loadedProperties.add(key);
            (0, wrap_1.helper)(entity)?.__serializationContext.fields?.add(key);
        });
    }
    findEntity(data, meta, options) {
        const schema = this.driver.getSchemaName(meta, options);
        if (meta.simplePK) {
            return this.unitOfWork.getById(meta.className, data[meta.primaryKeys[0]], schema);
        }
        if (!Array.isArray(data) && meta.primaryKeys.some(pk => data[pk] == null)) {
            return undefined;
        }
        const pks = Utils_1.Utils.getOrderedPrimaryKeys(data, meta, this.platform);
        return this.unitOfWork.getById(meta.className, pks, schema);
    }
    processDiscriminatorColumn(meta, data) {
        if (!meta.root.discriminatorColumn) {
            return meta;
        }
        const prop = meta.properties[meta.root.discriminatorColumn];
        const value = data[prop.name];
        const type = meta.root.discriminatorMap[value];
        meta = type ? this.metadata.find(type) : meta;
        return meta;
    }
    /**
     * denormalize PK to value required by driver (e.g. ObjectId)
     */
    denormalizePrimaryKey(data, primaryKey, prop) {
        const pk = this.platform.getSerializedPrimaryKeyField(primaryKey);
        if (data[pk] != null || data[primaryKey] != null) {
            let id = (data[pk] || data[primaryKey]);
            if (prop.type.toLowerCase() === 'objectid') {
                id = this.platform.denormalizePrimaryKey(id);
            }
            delete data[pk];
            data[primaryKey] = id;
        }
    }
    /**
     * returns parameters for entity constructor, creating references from plain ids
     */
    extractConstructorParams(meta, data, options) {
        return meta.constructorParams.map(k => {
            if (meta.properties[k] && [enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(meta.properties[k].kind) && data[k]) {
                const pk = Reference_1.Reference.unwrapReference(data[k]);
                const entity = this.unitOfWork.getById(meta.properties[k].type, pk, options.schema);
                if (entity) {
                    return entity;
                }
                if (Utils_1.Utils.isEntity(data[k])) {
                    return data[k];
                }
                const nakedPk = Utils_1.Utils.extractPK(data[k], meta.properties[k].targetMeta, true);
                if (Utils_1.Utils.isObject(data[k]) && !nakedPk) {
                    return this.create(meta.properties[k].type, data[k], options);
                }
                const { newEntity, initialized, ...rest } = options;
                const target = this.createReference(meta.properties[k].type, nakedPk, rest);
                return Reference_1.Reference.wrapReference(target, meta.properties[k]);
            }
            if (meta.properties[k]?.kind === enums_1.ReferenceKind.EMBEDDED && data[k]) {
                /* istanbul ignore next */
                if (Utils_1.Utils.isEntity(data[k])) {
                    return data[k];
                }
                return this.createEmbeddable(meta.properties[k].type, data[k], options);
            }
            if (!meta.properties[k]) {
                const tmp = { ...data };
                for (const prop of meta.props) {
                    if (!options.convertCustomTypes || !prop.customType || tmp[prop.name] == null) {
                        continue;
                    }
                    if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isPlainObject(tmp[prop.name]) && !Utils_1.Utils.extractPK(tmp[prop.name], meta.properties[prop.name].targetMeta, true)) {
                        tmp[prop.name] = Reference_1.Reference.wrapReference(this.create(meta.properties[prop.name].type, tmp[prop.name], options), prop);
                    }
                    else if (prop.kind === enums_1.ReferenceKind.SCALAR) {
                        tmp[prop.name] = prop.customType.convertToJSValue(tmp[prop.name], this.platform);
                    }
                }
                return tmp;
            }
            if (options.convertCustomTypes && meta.properties[k].customType && data[k] != null) {
                return meta.properties[k].customType.convertToJSValue(data[k], this.platform);
            }
            return data[k];
        });
    }
    get unitOfWork() {
        return this.em.getUnitOfWork(false);
    }
}
exports.EntityFactory = EntityFactory;
