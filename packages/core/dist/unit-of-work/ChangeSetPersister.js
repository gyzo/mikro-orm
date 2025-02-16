"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeSetPersister = void 0;
const entity_1 = require("../entity");
const ChangeSet_1 = require("./ChangeSet");
const utils_1 = require("../utils");
const errors_1 = require("../errors");
const enums_1 = require("../enums");
class ChangeSetPersister {
    driver;
    metadata;
    hydrator;
    factory;
    validator;
    config;
    platform;
    comparator;
    usesReturningStatement;
    constructor(driver, metadata, hydrator, factory, validator, config) {
        this.driver = driver;
        this.metadata = metadata;
        this.hydrator = hydrator;
        this.factory = factory;
        this.validator = validator;
        this.config = config;
        this.platform = this.driver.getPlatform();
        this.comparator = this.config.getComparator(this.metadata);
        this.usesReturningStatement = this.platform.usesReturningStatement() || this.platform.usesOutputStatement();
    }
    async executeInserts(changeSets, options, withSchema) {
        if (!withSchema) {
            return this.runForEachSchema(changeSets, 'executeInserts', options);
        }
        const meta = this.metadata.find(changeSets[0].name);
        changeSets.forEach(changeSet => this.processProperties(changeSet));
        if (changeSets.length > 1 && this.config.get('useBatchInserts', this.platform.usesBatchInserts())) {
            return this.persistNewEntities(meta, changeSets, options);
        }
        for (const changeSet of changeSets) {
            await this.persistNewEntity(meta, changeSet, options);
        }
    }
    async executeUpdates(changeSets, batched, options, withSchema) {
        if (!withSchema) {
            return this.runForEachSchema(changeSets, 'executeUpdates', options, batched);
        }
        const meta = this.metadata.find(changeSets[0].name);
        changeSets.forEach(changeSet => this.processProperties(changeSet));
        if (batched && changeSets.length > 1 && this.config.get('useBatchUpdates', this.platform.usesBatchUpdates())) {
            return this.persistManagedEntities(meta, changeSets, options);
        }
        for (const changeSet of changeSets) {
            await this.persistManagedEntity(changeSet, options);
        }
    }
    async executeDeletes(changeSets, options, withSchema) {
        if (!withSchema) {
            return this.runForEachSchema(changeSets, 'executeDeletes', options);
        }
        const size = this.config.get('batchSize');
        const meta = changeSets[0].meta;
        const pk = utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys);
        for (let i = 0; i < changeSets.length; i += size) {
            const chunk = changeSets.slice(i, i + size);
            const pks = chunk.map(cs => cs.getPrimaryKey());
            options = this.propagateSchemaFromMetadata(meta, options);
            await this.driver.nativeDelete(meta.root.className, { [pk]: { $in: pks } }, options);
        }
    }
    async runForEachSchema(changeSets, method, options, ...args) {
        const groups = new Map();
        changeSets.forEach(cs => {
            const group = groups.get(cs.schema) ?? [];
            group.push(cs);
            groups.set(cs.schema, group);
        });
        for (const [key, group] of groups.entries()) {
            options = { ...options, schema: key };
            // @ts-ignore
            await this[method](group, ...args, options, true);
        }
    }
    processProperties(changeSet) {
        const meta = this.metadata.find(changeSet.name);
        for (const prop of meta.relations) {
            this.processProperty(changeSet, prop);
        }
        if (changeSet.type === ChangeSet_1.ChangeSetType.CREATE && this.config.get('validateRequired')) {
            this.validator.validateRequired(changeSet.entity);
        }
    }
    async persistNewEntity(meta, changeSet, options) {
        const wrapped = (0, entity_1.helper)(changeSet.entity);
        options = this.propagateSchemaFromMetadata(meta, options, {
            convertCustomTypes: false,
        });
        const res = await this.driver.nativeInsertMany(meta.className, [changeSet.payload], options);
        if (!wrapped.hasPrimaryKey()) {
            this.mapPrimaryKey(meta, res.insertId, changeSet);
        }
        this.mapReturnedValues(changeSet.entity, changeSet.payload, res.row, meta);
        this.markAsPopulated(changeSet, meta);
        wrapped.__initialized = true;
        wrapped.__managed = true;
        if (!this.usesReturningStatement) {
            await this.reloadVersionValues(meta, [changeSet], options);
        }
        changeSet.persisted = true;
    }
    async persistNewEntities(meta, changeSets, options) {
        const size = this.config.get('batchSize');
        for (let i = 0; i < changeSets.length; i += size) {
            const chunk = changeSets.slice(i, i + size);
            await this.persistNewEntitiesBatch(meta, chunk, options);
            if (!this.usesReturningStatement) {
                await this.reloadVersionValues(meta, chunk, options);
            }
        }
    }
    propagateSchemaFromMetadata(meta, options, additionalOptions) {
        return {
            ...options,
            ...additionalOptions,
            schema: options?.schema ?? meta.schema,
        };
    }
    async persistNewEntitiesBatch(meta, changeSets, options) {
        options = this.propagateSchemaFromMetadata(meta, options, {
            convertCustomTypes: false,
            processCollections: false,
        });
        const res = await this.driver.nativeInsertMany(meta.className, changeSets.map(cs => cs.payload), options);
        for (let i = 0; i < changeSets.length; i++) {
            const changeSet = changeSets[i];
            const wrapped = (0, entity_1.helper)(changeSet.entity);
            if (!wrapped.hasPrimaryKey()) {
                const field = meta.getPrimaryProps()[0].fieldNames[0];
                this.mapPrimaryKey(meta, res.rows[i][field], changeSet);
            }
            if (res.rows) {
                this.mapReturnedValues(changeSet.entity, changeSet.payload, res.rows[i], meta);
            }
            this.markAsPopulated(changeSet, meta);
            wrapped.__initialized = true;
            wrapped.__managed = true;
            changeSet.persisted = true;
        }
    }
    async persistManagedEntity(changeSet, options) {
        const meta = this.metadata.find(changeSet.name);
        const res = await this.updateEntity(meta, changeSet, options);
        this.checkOptimisticLock(meta, changeSet, res);
        this.mapReturnedValues(changeSet.entity, changeSet.payload, res.row, meta);
        await this.reloadVersionValues(meta, [changeSet], options);
        changeSet.persisted = true;
    }
    async persistManagedEntities(meta, changeSets, options) {
        const size = this.config.get('batchSize');
        for (let i = 0; i < changeSets.length; i += size) {
            const chunk = changeSets.slice(i, i + size);
            await this.persistManagedEntitiesBatch(meta, chunk, options);
            await this.reloadVersionValues(meta, chunk, options);
        }
    }
    checkConcurrencyKeys(meta, changeSet, cond) {
        const tmp = [];
        for (const key of meta.concurrencyCheckKeys) {
            cond[key] = changeSet.originalEntity[key];
            if (changeSet.payload[key]) {
                tmp.push(key);
            }
        }
        if (tmp.length === 0 && meta.concurrencyCheckKeys.size > 0) {
            throw errors_1.OptimisticLockError.lockFailed(changeSet.entity);
        }
    }
    async persistManagedEntitiesBatch(meta, changeSets, options) {
        await this.checkOptimisticLocks(meta, changeSets, options);
        options = this.propagateSchemaFromMetadata(meta, options, {
            convertCustomTypes: false,
            processCollections: false,
        });
        const cond = [];
        const payload = [];
        for (const changeSet of changeSets) {
            const where = changeSet.getPrimaryKey(true);
            this.checkConcurrencyKeys(meta, changeSet, where);
            cond.push(where);
            payload.push(changeSet.payload);
        }
        const res = await this.driver.nativeUpdateMany(meta.className, cond, payload, options);
        const map = new Map();
        res.rows?.forEach(item => map.set(utils_1.Utils.getCompositeKeyHash(item, meta, true, this.platform, true), item));
        for (const changeSet of changeSets) {
            if (res.rows) {
                const row = map.get((0, entity_1.helper)(changeSet.entity).getSerializedPrimaryKey());
                this.mapReturnedValues(changeSet.entity, changeSet.payload, row, meta);
            }
            changeSet.persisted = true;
        }
    }
    mapPrimaryKey(meta, value, changeSet) {
        const prop = meta.properties[meta.primaryKeys[0]];
        const insertId = prop.customType ? prop.customType.convertToJSValue(value, this.platform) : value;
        const wrapped = (0, entity_1.helper)(changeSet.entity);
        if (!wrapped.hasPrimaryKey()) {
            wrapped.setPrimaryKey(insertId);
        }
        // some drivers might be returning bigint PKs as numbers when the number is small enough,
        // but we need to have it as string so comparison works in change set tracking, so instead
        // of using the raw value from db, we convert it back to the db value explicitly
        value = prop.customType ? prop.customType.convertToDatabaseValue(insertId, this.platform, { mode: 'serialization' }) : value;
        changeSet.payload[wrapped.__meta.primaryKeys[0]] = value;
        wrapped.__identifier?.setValue(value);
    }
    /**
     * Sets populate flag to new entities so they are serialized like if they were loaded from the db
     */
    markAsPopulated(changeSet, meta) {
        (0, entity_1.helper)(changeSet.entity).__schema = this.driver.getSchemaName(meta, changeSet);
        if (!this.config.get('populateAfterFlush')) {
            return;
        }
        (0, entity_1.helper)(changeSet.entity).populated();
        meta.relations.forEach(prop => {
            const value = changeSet.entity[prop.name];
            if (utils_1.Utils.isEntity(value, true)) {
                value.__helper.populated();
            }
            else if (utils_1.Utils.isCollection(value)) {
                value.populated();
            }
        });
    }
    async updateEntity(meta, changeSet, options) {
        const cond = changeSet.getPrimaryKey(true);
        options = this.propagateSchemaFromMetadata(meta, options, {
            convertCustomTypes: false,
        });
        if (meta.concurrencyCheckKeys.size === 0 && (!meta.versionProperty || changeSet.entity[meta.versionProperty] == null)) {
            return this.driver.nativeUpdate(changeSet.name, cond, changeSet.payload, options);
        }
        if (meta.versionProperty) {
            cond[meta.versionProperty] = this.platform.quoteVersionValue(changeSet.entity[meta.versionProperty], meta.properties[meta.versionProperty]);
        }
        this.checkConcurrencyKeys(meta, changeSet, cond);
        return this.driver.nativeUpdate(changeSet.name, cond, changeSet.payload, options);
    }
    async checkOptimisticLocks(meta, changeSets, options) {
        if (meta.concurrencyCheckKeys.size === 0 && (!meta.versionProperty || changeSets.every(cs => cs.entity[meta.versionProperty] == null))) {
            return;
        }
        // skip entity references as they don't have version values loaded
        changeSets = changeSets.filter(cs => (0, entity_1.helper)(cs.entity).__initialized);
        const $or = changeSets.map(cs => {
            const cond = utils_1.Utils.getPrimaryKeyCond(cs.originalEntity, meta.primaryKeys.concat(...meta.concurrencyCheckKeys));
            if (meta.versionProperty) {
                // @ts-ignore
                cond[meta.versionProperty] = this.platform.quoteVersionValue(cs.entity[meta.versionProperty], meta.properties[meta.versionProperty]);
            }
            return cond;
        });
        const primaryKeys = meta.primaryKeys.concat(...meta.concurrencyCheckKeys);
        options = this.propagateSchemaFromMetadata(meta, options, {
            fields: primaryKeys,
        });
        const res = await this.driver.find(meta.root.className, { $or }, options);
        if (res.length !== changeSets.length) {
            const compare = (a, b, keys) => keys.every(k => a[k] === b[k]);
            const entity = changeSets.find(cs => {
                return !res.some(row => compare(utils_1.Utils.getPrimaryKeyCond(cs.entity, primaryKeys), row, primaryKeys));
            }).entity;
            throw errors_1.OptimisticLockError.lockFailed(entity);
        }
    }
    checkOptimisticLock(meta, changeSet, res) {
        if ((meta.versionProperty || meta.concurrencyCheckKeys.size > 0) && res && !res.affectedRows) {
            throw errors_1.OptimisticLockError.lockFailed(changeSet.entity);
        }
    }
    /**
     * This method also handles reloading of database default values for inserts and raw property updates,
     * so we use a single query in case of both versioning and default values is used.
     */
    async reloadVersionValues(meta, changeSets, options) {
        const reloadProps = meta.versionProperty && !this.usesReturningStatement ? [meta.properties[meta.versionProperty]] : [];
        if (changeSets[0].type === ChangeSet_1.ChangeSetType.CREATE) {
            // do not reload things that already had a runtime value
            meta.props
                .filter(prop => prop.persist !== false && (prop.autoincrement || prop.generated || prop.defaultRaw))
                .filter(prop => (changeSets[0].entity[prop.name] == null && prop.defaultRaw !== 'null') || utils_1.Utils.isRawSql(changeSets[0].entity[prop.name]))
                .forEach(prop => reloadProps.push(prop));
        }
        if (changeSets[0].type === ChangeSet_1.ChangeSetType.UPDATE) {
            const returning = new Set();
            changeSets.forEach(cs => {
                utils_1.Utils.keys(cs.payload).forEach(k => {
                    if (utils_1.Utils.isRawSql(cs.payload[k]) && utils_1.Utils.isRawSql(cs.entity[k])) {
                        returning.add(meta.properties[k]);
                    }
                });
            });
            // reload generated columns
            if (!this.usesReturningStatement) {
                meta.props
                    .filter(prop => prop.generated && !prop.primary)
                    .forEach(prop => reloadProps.push(prop));
                reloadProps.push(...returning);
            }
        }
        if (reloadProps.length === 0) {
            return;
        }
        reloadProps.unshift(...meta.getPrimaryProps());
        const pk = utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys);
        const pks = changeSets.map(cs => {
            const val = (0, entity_1.helper)(cs.entity).getPrimaryKey(true);
            if (utils_1.Utils.isPlainObject(val)) {
                return utils_1.Utils.getCompositeKeyValue(val, meta, false, this.platform);
            }
            return val;
        });
        options = this.propagateSchemaFromMetadata(meta, options, {
            fields: utils_1.Utils.unique(reloadProps.map(prop => prop.name)),
        });
        const data = await this.driver.find(meta.className, { [pk]: { $in: pks } }, options);
        const map = new Map();
        data.forEach(item => map.set(utils_1.Utils.getCompositeKeyHash(item, meta, true, this.platform, true), item));
        for (const changeSet of changeSets) {
            const data = map.get((0, entity_1.helper)(changeSet.entity).getSerializedPrimaryKey());
            this.hydrator.hydrate(changeSet.entity, meta, data, this.factory, 'full', false, true);
            Object.assign(changeSet.payload, data); // merge to the changeset payload, so it gets saved to the entity snapshot
        }
    }
    processProperty(changeSet, prop) {
        const meta = this.metadata.find(changeSet.name);
        const value = changeSet.payload[prop.name]; // for inline embeddables
        if (value instanceof entity_1.EntityIdentifier) {
            changeSet.payload[prop.name] = value.getValue();
            return;
        }
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && Array.isArray(value)) {
            changeSet.payload[prop.name] = value.map(val => val instanceof entity_1.EntityIdentifier ? val.getValue() : val);
            return;
        }
        if (prop.name in changeSet.payload) {
            return;
        }
        const values = utils_1.Utils.unwrapProperty(changeSet.payload, meta, prop, true); // for object embeddables
        values.forEach(([value, indexes]) => {
            if (value instanceof entity_1.EntityIdentifier) {
                utils_1.Utils.setPayloadProperty(changeSet.payload, meta, prop, value.getValue(), indexes);
            }
        });
    }
    /**
     * Maps values returned via `returning` statement (postgres) or the inserted id (other sql drivers).
     * No need to handle composite keys here as they need to be set upfront.
     * We do need to map to the change set payload too, as it will be used in the originalEntityData for new entities.
     */
    mapReturnedValues(entity, payload, row, meta, upsert = false) {
        if ((!this.usesReturningStatement && !upsert) || !row || !utils_1.Utils.hasObjectKeys(row)) {
            return;
        }
        const mapped = this.comparator.mapResult(meta.className, row);
        if (entity) {
            this.hydrator.hydrate(entity, meta, mapped, this.factory, 'full', false, true);
        }
        if (upsert) {
            for (const prop of meta.props) {
                if (prop.customType && prop.name in mapped) {
                    mapped[prop.name] = prop.customType.convertToJSValue(mapped[prop.name], this.platform);
                }
            }
        }
        Object.assign(payload, mapped);
    }
}
exports.ChangeSetPersister = ChangeSetPersister;
