"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnitOfWork = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const entity_1 = require("../entity");
const ChangeSet_1 = require("./ChangeSet");
const ChangeSetComputer_1 = require("./ChangeSetComputer");
const ChangeSetPersister_1 = require("./ChangeSetPersister");
const CommitOrderCalculator_1 = require("./CommitOrderCalculator");
const Utils_1 = require("../utils/Utils");
const enums_1 = require("../enums");
const errors_1 = require("../errors");
const events_1 = require("../events");
const IdentityMap_1 = require("./IdentityMap");
// to deal with validation for flush inside flush hooks and `Promise.all`
const insideFlush = new node_async_hooks_1.AsyncLocalStorage();
class UnitOfWork {
    em;
    /** map of references to managed entities */
    identityMap = new IdentityMap_1.IdentityMap();
    persistStack = new Set();
    removeStack = new Set();
    orphanRemoveStack = new Set();
    changeSets = new Map();
    collectionUpdates = new Set();
    extraUpdates = new Set();
    metadata;
    platform;
    eventManager;
    comparator;
    changeSetComputer;
    changeSetPersister;
    queuedActions = new Set();
    loadedEntities = new Set();
    flushQueue = [];
    working = false;
    constructor(em) {
        this.em = em;
        this.metadata = this.em.getMetadata();
        this.platform = this.em.getPlatform();
        this.eventManager = this.em.getEventManager();
        this.comparator = this.em.getComparator();
        this.changeSetComputer = new ChangeSetComputer_1.ChangeSetComputer(this.em.getValidator(), this.collectionUpdates, this.metadata, this.platform, this.em.config, this.em);
        this.changeSetPersister = new ChangeSetPersister_1.ChangeSetPersister(this.em.getDriver(), this.metadata, this.em.config.getHydrator(this.metadata), this.em.getEntityFactory(), this.em.getValidator(), this.em.config);
    }
    merge(entity, visited) {
        const wrapped = (0, entity_1.helper)(entity);
        wrapped.__em = this.em;
        if (!wrapped.hasPrimaryKey()) {
            return;
        }
        // skip new entities that could be linked from already persisted entity
        // that is being re-fetched (but allow calling `merge(e)` explicitly for those)
        if (!wrapped.__managed && visited) {
            return;
        }
        this.identityMap.store(entity);
        // if visited is available, we are cascading, and need to be careful when resetting the entity data
        // as there can be some entity with already changed state that is not yet flushed
        if (wrapped.__initialized && (!visited || !wrapped.__originalEntityData)) {
            wrapped.__originalEntityData = this.comparator.prepareEntity(entity);
            wrapped.__touched = false;
        }
        this.cascade(entity, enums_1.Cascade.MERGE, visited ?? new Set());
    }
    /**
     * @internal
     */
    register(entity, data, options) {
        this.identityMap.store(entity);
        entity_1.EntityHelper.ensurePropagation(entity);
        if (options?.newEntity) {
            return entity;
        }
        const forceUndefined = this.em.config.get('forceUndefined');
        const wrapped = (0, entity_1.helper)(entity);
        if (options?.loaded && wrapped.__initialized && !wrapped.__onLoadFired) {
            this.loadedEntities.add(entity);
        }
        wrapped.__em ??= this.em;
        wrapped.__managed = true;
        if (data && (options?.refresh || !wrapped.__originalEntityData)) {
            for (const key of Utils_1.Utils.keys(data)) {
                const prop = wrapped.__meta.properties[key];
                if (!prop) {
                    continue;
                }
                wrapped.__loadedProperties.add(key);
                if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isPlainObject(data[prop.name])) {
                    data[prop.name] = Utils_1.Utils.getPrimaryKeyValues(data[prop.name], prop.targetMeta.primaryKeys, true);
                }
                else if (prop.kind === enums_1.ReferenceKind.EMBEDDED && !prop.object && Utils_1.Utils.isPlainObject(data[prop.name])) {
                    for (const p of prop.targetMeta.props) {
                        /* istanbul ignore next */
                        const prefix = prop.prefix === false ? '' : prop.prefix === true ? prop.name + '_' : prop.prefix;
                        data[prefix + p.name] = data[prop.name][p.name];
                    }
                    data[prop.name] = Utils_1.Utils.getPrimaryKeyValues(data[prop.name], prop.targetMeta.primaryKeys, true);
                }
                if (forceUndefined) {
                    if (data[key] === null) {
                        data[key] = undefined;
                    }
                }
            }
            wrapped.__originalEntityData = data;
            wrapped.__touched = false;
        }
        return entity;
    }
    /**
     * @internal
     */
    async dispatchOnLoadEvent() {
        for (const entity of this.loadedEntities) {
            if (this.eventManager.hasListeners(enums_1.EventType.onLoad, entity.__meta)) {
                await this.eventManager.dispatchEvent(enums_1.EventType.onLoad, { entity, meta: entity.__meta, em: this.em });
                (0, entity_1.helper)(entity).__onLoadFired = true;
            }
        }
        this.loadedEntities.clear();
    }
    /**
     * Returns entity from the identity map. For composite keys, you need to pass an array of PKs in the same order as they are defined in `meta.primaryKeys`.
     */
    getById(entityName, id, schema) {
        if (id == null || (Array.isArray(id) && id.length === 0)) {
            return undefined;
        }
        const meta = this.metadata.find(entityName).root;
        let hash;
        if (meta.simplePK) {
            hash = '' + id;
        }
        else {
            const keys = Array.isArray(id) ? Utils_1.Utils.flatten(id) : [id];
            hash = Utils_1.Utils.getPrimaryKeyHash(keys);
        }
        schema ??= meta.schema ?? this.em.config.get('schema');
        if (schema) {
            hash = `${schema}:${hash}`;
        }
        return this.identityMap.getByHash(meta, hash);
    }
    tryGetById(entityName, where, schema, strict = true) {
        const pk = Utils_1.Utils.extractPK(where, this.metadata.find(entityName), strict);
        if (!pk) {
            return null;
        }
        return this.getById(entityName, pk, schema);
    }
    /**
     * Returns map of all managed entities.
     */
    getIdentityMap() {
        return this.identityMap;
    }
    /**
     * Returns stored snapshot of entity state that is used for change set computation.
     */
    getOriginalEntityData(entity) {
        return (0, entity_1.helper)(entity).__originalEntityData;
    }
    getPersistStack() {
        return this.persistStack;
    }
    getRemoveStack() {
        return this.removeStack;
    }
    getChangeSets() {
        return [...this.changeSets.values()];
    }
    getCollectionUpdates() {
        return [...this.collectionUpdates];
    }
    getExtraUpdates() {
        return this.extraUpdates;
    }
    shouldAutoFlush(meta) {
        if (insideFlush.getStore()) {
            return false;
        }
        if (this.queuedActions.has(meta.className) || this.queuedActions.has(meta.root.className)) {
            return true;
        }
        for (const entity of this.identityMap.getStore(meta).values()) {
            if ((0, entity_1.helper)(entity).__initialized && (0, entity_1.helper)(entity).isTouched()) {
                return true;
            }
        }
        return false;
    }
    clearActionsQueue() {
        this.queuedActions.clear();
    }
    computeChangeSet(entity, type) {
        const wrapped = (0, entity_1.helper)(entity);
        if (type) {
            this.changeSets.set(entity, new ChangeSet_1.ChangeSet(entity, type, {}, wrapped.__meta));
            return;
        }
        const cs = this.changeSetComputer.computeChangeSet(entity);
        if (!cs || this.checkUniqueProps(cs)) {
            return;
        }
        this.initIdentifier(entity);
        this.changeSets.set(entity, cs);
        this.persistStack.delete(entity);
        wrapped.__originalEntityData = this.comparator.prepareEntity(entity);
        wrapped.__touched = false;
    }
    recomputeSingleChangeSet(entity) {
        const changeSet = this.changeSets.get(entity);
        if (!changeSet) {
            return;
        }
        const cs = this.changeSetComputer.computeChangeSet(entity);
        /* istanbul ignore else */
        if (cs && !this.checkUniqueProps(cs)) {
            Object.assign(changeSet.payload, cs.payload);
            (0, entity_1.helper)(entity).__originalEntityData = this.comparator.prepareEntity(entity);
            (0, entity_1.helper)(entity).__touched = false;
        }
    }
    persist(entity, visited, options = {}) {
        entity_1.EntityHelper.ensurePropagation(entity);
        if (options.checkRemoveStack && this.removeStack.has(entity)) {
            return;
        }
        const wrapped = (0, entity_1.helper)(entity);
        this.persistStack.add(entity);
        this.queuedActions.add(wrapped.__meta.className);
        this.removeStack.delete(entity);
        if (!wrapped.__managed && wrapped.hasPrimaryKey()) {
            this.identityMap.store(entity);
        }
        if (options.cascade ?? true) {
            this.cascade(entity, enums_1.Cascade.PERSIST, visited, options);
        }
    }
    remove(entity, visited, options = {}) {
        // allow removing not managed entities if they are not part of the persist stack
        if ((0, entity_1.helper)(entity).__managed || !this.persistStack.has(entity)) {
            this.removeStack.add(entity);
            this.queuedActions.add((0, entity_1.helper)(entity).__meta.className);
        }
        else {
            this.persistStack.delete(entity);
            this.identityMap.delete(entity);
        }
        // remove from referencing relations that are nullable
        for (const prop of (0, entity_1.helper)(entity).__meta.bidirectionalRelations) {
            const inverseProp = prop.mappedBy || prop.inversedBy;
            const relation = entity_1.Reference.unwrapReference(entity[prop.name]);
            const prop2 = prop.targetMeta.properties[inverseProp];
            if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY && prop2.nullable && Utils_1.Utils.isCollection(relation)) {
                for (const item of relation.getItems(false)) {
                    delete item[inverseProp];
                }
                continue;
            }
            const target = relation && relation[inverseProp];
            if (relation && Utils_1.Utils.isCollection(target)) {
                target.removeWithoutPropagation(entity);
            }
        }
        if (options.cascade ?? true) {
            this.cascade(entity, enums_1.Cascade.REMOVE, visited);
        }
    }
    async commit() {
        if (this.working) {
            if (insideFlush.getStore()) {
                throw errors_1.ValidationError.cannotCommit();
            }
            return new Promise((resolve, reject) => {
                this.flushQueue.push(() => {
                    return insideFlush.run(true, () => {
                        return this.doCommit().then(resolve, reject);
                    });
                });
            });
        }
        try {
            this.working = true;
            await insideFlush.run(true, () => this.doCommit());
            while (this.flushQueue.length) {
                await this.flushQueue.shift()();
            }
        }
        finally {
            this.postCommitCleanup();
            this.working = false;
        }
    }
    async doCommit() {
        const oldTx = this.em.getTransactionContext();
        try {
            await this.eventManager.dispatchEvent(enums_1.EventType.beforeFlush, { em: this.em, uow: this });
            this.computeChangeSets();
            for (const cs of this.changeSets.values()) {
                cs.entity.__helper.__processing = true;
            }
            await this.eventManager.dispatchEvent(enums_1.EventType.onFlush, { em: this.em, uow: this });
            // nothing to do, do not start transaction
            if (this.changeSets.size === 0 && this.collectionUpdates.size === 0 && this.extraUpdates.size === 0) {
                return void await this.eventManager.dispatchEvent(enums_1.EventType.afterFlush, { em: this.em, uow: this });
            }
            const groups = this.getChangeSetGroups();
            const platform = this.em.getPlatform();
            const runInTransaction = !this.em.isInTransaction() && platform.supportsTransactions() && this.em.config.get('implicitTransactions');
            if (runInTransaction) {
                await this.em.getConnection('write').transactional(trx => this.persistToDatabase(groups, trx), {
                    ctx: oldTx,
                    eventBroadcaster: new events_1.TransactionEventBroadcaster(this.em, this),
                });
            }
            else {
                await this.persistToDatabase(groups, this.em.getTransactionContext());
            }
            this.resetTransaction(oldTx);
            for (const cs of this.changeSets.values()) {
                cs.entity.__helper.__processing = false;
            }
            await this.eventManager.dispatchEvent(enums_1.EventType.afterFlush, { em: this.em, uow: this });
        }
        finally {
            this.resetTransaction(oldTx);
        }
    }
    async lock(entity, options) {
        if (!this.getById(entity.constructor.name, (0, entity_1.helper)(entity).__primaryKeys, (0, entity_1.helper)(entity).__schema)) {
            throw errors_1.ValidationError.entityNotManaged(entity);
        }
        const meta = this.metadata.find(entity.constructor.name);
        if (options.lockMode === enums_1.LockMode.OPTIMISTIC) {
            await this.lockOptimistic(entity, meta, options.lockVersion);
        }
        else if (options.lockMode != null) {
            await this.lockPessimistic(entity, options);
        }
    }
    clear() {
        this.identityMap.clear();
        this.loadedEntities.clear();
        this.postCommitCleanup();
    }
    unsetIdentity(entity) {
        this.identityMap.delete(entity);
        const wrapped = (0, entity_1.helper)(entity);
        const serializedPK = wrapped.getSerializedPrimaryKey();
        // remove references of this entity in all managed entities, otherwise flushing could reinsert the entity
        for (const { meta, prop } of wrapped.__meta.referencingProperties) {
            for (const referrer of this.identityMap.getStore(meta).values()) {
                const rel = entity_1.Reference.unwrapReference(referrer[prop.name]);
                if (Utils_1.Utils.isCollection(rel)) {
                    rel.removeWithoutPropagation(entity);
                }
                else if (rel && (prop.mapToPk ? (0, entity_1.helper)(this.em.getReference(prop.type, rel)).getSerializedPrimaryKey() === serializedPK : rel === entity)) {
                    if (prop.formula) {
                        delete referrer[prop.name];
                    }
                    else {
                        delete (0, entity_1.helper)(referrer).__data[prop.name];
                    }
                }
            }
        }
        delete wrapped.__identifier;
        delete wrapped.__originalEntityData;
        wrapped.__touched = false;
        wrapped.__managed = false;
    }
    computeChangeSets() {
        this.changeSets.clear();
        const visited = new Set();
        for (const entity of this.removeStack) {
            this.cascade(entity, enums_1.Cascade.REMOVE, visited);
        }
        visited.clear();
        for (const entity of this.persistStack) {
            this.cascade(entity, enums_1.Cascade.PERSIST, visited, { checkRemoveStack: true });
        }
        for (const entity of this.identityMap) {
            if (!this.removeStack.has(entity) && !this.persistStack.has(entity) && !this.orphanRemoveStack.has(entity)) {
                this.cascade(entity, enums_1.Cascade.PERSIST, visited, { checkRemoveStack: true });
            }
        }
        visited.clear();
        for (const entity of this.persistStack) {
            this.findNewEntities(entity, visited);
        }
        for (const entity of this.orphanRemoveStack) {
            if (!(0, entity_1.helper)(entity).__processing) {
                this.removeStack.add(entity);
            }
        }
        // Check insert stack if there are any entities matching something from delete stack. This can happen when recreating entities.
        const inserts = {};
        for (const cs of this.changeSets.values()) {
            if (cs.type === ChangeSet_1.ChangeSetType.CREATE) {
                inserts[cs.meta.className] ??= [];
                inserts[cs.meta.className].push(cs);
            }
        }
        for (const cs of this.changeSets.values()) {
            if (cs.type === ChangeSet_1.ChangeSetType.UPDATE) {
                this.findEarlyUpdates(cs, inserts[cs.meta.className]);
            }
        }
        for (const entity of this.removeStack) {
            const wrapped = (0, entity_1.helper)(entity);
            /* istanbul ignore next */
            if (wrapped.__processing) {
                continue;
            }
            const deletePkHash = [wrapped.getSerializedPrimaryKey(), ...this.expandUniqueProps(entity)];
            let type = ChangeSet_1.ChangeSetType.DELETE;
            for (const cs of inserts[wrapped.__meta.className] ?? []) {
                if (deletePkHash.some(hash => hash === cs.getSerializedPrimaryKey() || this.expandUniqueProps(cs.entity).find(child => hash === child))) {
                    type = ChangeSet_1.ChangeSetType.DELETE_EARLY;
                }
            }
            this.computeChangeSet(entity, type);
        }
    }
    scheduleExtraUpdate(changeSet, props) {
        if (props.length === 0) {
            return;
        }
        let conflicts = false;
        let type = ChangeSet_1.ChangeSetType.UPDATE;
        if (!props.some(prop => prop.name in changeSet.payload)) {
            return;
        }
        for (const cs of this.changeSets.values()) {
            for (const prop of props) {
                if (prop.name in cs.payload && cs.rootName === changeSet.rootName && cs.type === changeSet.type) {
                    conflicts = true;
                    if (changeSet.payload[prop.name] == null) {
                        type = ChangeSet_1.ChangeSetType.UPDATE_EARLY;
                    }
                }
            }
        }
        if (!conflicts) {
            return;
        }
        this.extraUpdates.add([changeSet.entity, props.map(p => p.name), props.map(p => changeSet.entity[p.name]), changeSet, type]);
        for (const p of props) {
            delete changeSet.entity[p.name];
            delete changeSet.payload[p.name];
        }
    }
    scheduleOrphanRemoval(entity, visited) {
        if (entity) {
            (0, entity_1.helper)(entity).__em = this.em;
            this.orphanRemoveStack.add(entity);
            this.queuedActions.add(entity.__meta.className);
            this.cascade(entity, enums_1.Cascade.SCHEDULE_ORPHAN_REMOVAL, visited);
        }
    }
    cancelOrphanRemoval(entity, visited) {
        this.orphanRemoveStack.delete(entity);
        this.cascade(entity, enums_1.Cascade.CANCEL_ORPHAN_REMOVAL, visited);
    }
    getOrphanRemoveStack() {
        return this.orphanRemoveStack;
    }
    getChangeSetPersister() {
        return this.changeSetPersister;
    }
    findNewEntities(entity, visited, idx = 0, processed = new Set()) {
        if (visited.has(entity)) {
            return;
        }
        visited.add(entity);
        processed.add(entity);
        const wrapped = (0, entity_1.helper)(entity);
        if (wrapped.__processing || this.removeStack.has(entity) || this.orphanRemoveStack.has(entity)) {
            return;
        }
        // Set entityManager default schema
        wrapped.__schema ??= this.em.schema;
        this.initIdentifier(entity);
        for (const prop of wrapped.__meta.relations) {
            const targets = Utils_1.Utils.unwrapProperty(entity, wrapped.__meta, prop);
            for (const [target] of targets) {
                const kind = entity_1.Reference.unwrapReference(target);
                this.processReference(entity, prop, kind, visited, processed, idx);
            }
        }
        const changeSet = this.changeSetComputer.computeChangeSet(entity);
        if (changeSet && !this.checkUniqueProps(changeSet)) {
            this.changeSets.set(entity, changeSet);
        }
    }
    /**
     * Returns `true` when the change set should be skipped as it will be empty after the extra update.
     */
    checkUniqueProps(changeSet) {
        if (changeSet.type !== ChangeSet_1.ChangeSetType.UPDATE) {
            return false;
        }
        // when changing a unique nullable property (or a 1:1 relation), we can't do it in a single
        // query as it would cause unique constraint violations
        const uniqueProps = changeSet.meta.uniqueProps.filter(prop => {
            return (prop.nullable || changeSet.type !== ChangeSet_1.ChangeSetType.CREATE);
        });
        this.scheduleExtraUpdate(changeSet, uniqueProps);
        return changeSet.type === ChangeSet_1.ChangeSetType.UPDATE && !Utils_1.Utils.hasObjectKeys(changeSet.payload);
    }
    expandUniqueProps(entity) {
        const wrapped = (0, entity_1.helper)(entity);
        if (!wrapped.__meta.hasUniqueProps) {
            return [];
        }
        const simpleUniqueHashes = wrapped.__meta.uniqueProps.map(prop => {
            if (entity[prop.name] != null) {
                return prop.kind === enums_1.ReferenceKind.SCALAR || prop.mapToPk ? entity[prop.name] : (0, entity_1.helper)(entity[prop.name]).getSerializedPrimaryKey();
            }
            if (wrapped.__originalEntityData?.[prop.name] != null) {
                return Utils_1.Utils.getPrimaryKeyHash(Utils_1.Utils.asArray(wrapped.__originalEntityData[prop.name]));
            }
            return undefined;
        }).filter(i => i);
        const compoundUniqueHashes = wrapped.__meta.uniques.map(unique => {
            const props = Utils_1.Utils.asArray(unique.properties);
            if (props.every(prop => entity[prop] != null)) {
                return Utils_1.Utils.getPrimaryKeyHash(props.map(p => {
                    const prop = wrapped.__meta.properties[p];
                    return prop.kind === enums_1.ReferenceKind.SCALAR || prop.mapToPk ? entity[prop.name] : (0, entity_1.helper)(entity[prop.name]).getSerializedPrimaryKey();
                }));
            }
            return undefined;
        }).filter(i => i);
        return simpleUniqueHashes.concat(compoundUniqueHashes);
    }
    initIdentifier(entity) {
        const wrapped = entity && (0, entity_1.helper)(entity);
        if (!wrapped || wrapped.__identifier || wrapped.hasPrimaryKey()) {
            return;
        }
        const pk = wrapped.__meta.getPrimaryProps()[0];
        if (pk.kind === enums_1.ReferenceKind.SCALAR) {
            wrapped.__identifier = new entity_1.EntityIdentifier();
        }
        else if (entity[pk.name]) {
            this.initIdentifier(entity[pk.name]);
            wrapped.__identifier = (0, entity_1.helper)(entity[pk.name])?.__identifier;
        }
    }
    processReference(parent, prop, kind, visited, processed, idx) {
        const isToOne = prop.kind === enums_1.ReferenceKind.MANY_TO_ONE || prop.kind === enums_1.ReferenceKind.ONE_TO_ONE;
        if (isToOne && Utils_1.Utils.isEntity(kind)) {
            return this.processToOneReference(kind, visited, processed, idx);
        }
        if (Utils_1.Utils.isCollection(kind)) {
            kind.getItems(false)
                .filter(item => !item.__helper.__originalEntityData)
                .forEach(item => {
                // propagate schema from parent
                item.__helper.__schema ??= (0, entity_1.helper)(parent).__schema;
            });
            if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && kind.isDirty()) {
                this.processToManyReference(kind, visited, processed, parent, prop);
            }
        }
    }
    processToOneReference(kind, visited, processed, idx) {
        if (!kind.__helper.__managed) {
            this.findNewEntities(kind, visited, idx, processed);
        }
    }
    processToManyReference(collection, visited, processed, parent, prop) {
        if (this.isCollectionSelfReferenced(collection, processed)) {
            this.extraUpdates.add([parent, prop.name, collection, undefined, ChangeSet_1.ChangeSetType.UPDATE]);
            const coll = new entity_1.Collection(parent);
            coll.property = prop;
            parent[prop.name] = coll;
            return;
        }
        collection.getItems(false)
            .filter(item => !item.__helper.__originalEntityData)
            .forEach(item => this.findNewEntities(item, visited, 0, processed));
    }
    async runHooks(type, changeSet, sync = false) {
        const meta = changeSet.meta;
        if (!this.eventManager.hasListeners(type, meta)) {
            return;
        }
        if (!sync) {
            await this.eventManager.dispatchEvent(type, { entity: changeSet.entity, meta, em: this.em, changeSet });
            return;
        }
        const copy = this.comparator.prepareEntity(changeSet.entity);
        await this.eventManager.dispatchEvent(type, { entity: changeSet.entity, meta, em: this.em, changeSet });
        const current = this.comparator.prepareEntity(changeSet.entity);
        const diff = this.comparator.diffEntities(changeSet.name, copy, current);
        Object.assign(changeSet.payload, diff);
        const wrapped = (0, entity_1.helper)(changeSet.entity);
        if (wrapped.__identifier && diff[wrapped.__meta.primaryKeys[0]]) {
            wrapped.__identifier.setValue(diff[wrapped.__meta.primaryKeys[0]]);
        }
    }
    postCommitCleanup() {
        for (const cs of this.changeSets.values()) {
            const wrapped = (0, entity_1.helper)(cs.entity);
            wrapped.__processing = false;
            delete wrapped.__pk;
        }
        this.persistStack.clear();
        this.removeStack.clear();
        this.orphanRemoveStack.clear();
        this.changeSets.clear();
        this.collectionUpdates.clear();
        this.extraUpdates.clear();
        this.queuedActions.clear();
        this.working = false;
    }
    cascade(entity, type, visited = new Set(), options = {}) {
        if (visited.has(entity)) {
            return;
        }
        visited.add(entity);
        switch (type) {
            case enums_1.Cascade.PERSIST:
                this.persist(entity, visited, options);
                break;
            case enums_1.Cascade.MERGE:
                this.merge(entity, visited);
                break;
            case enums_1.Cascade.REMOVE:
                this.remove(entity, visited, options);
                break;
            case enums_1.Cascade.SCHEDULE_ORPHAN_REMOVAL:
                this.scheduleOrphanRemoval(entity, visited);
                break;
            case enums_1.Cascade.CANCEL_ORPHAN_REMOVAL:
                this.cancelOrphanRemoval(entity, visited);
                break;
        }
        for (const prop of (0, entity_1.helper)(entity).__meta.relations) {
            this.cascadeReference(entity, prop, type, visited, options);
        }
    }
    cascadeReference(entity, prop, type, visited, options) {
        this.fixMissingReference(entity, prop);
        if (!this.shouldCascade(prop, type)) {
            return;
        }
        const kind = entity_1.Reference.unwrapReference(entity[prop.name]);
        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && Utils_1.Utils.isEntity(kind)) {
            return this.cascade(kind, type, visited, options);
        }
        const collection = kind;
        if ([enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind) && collection) {
            for (const item of collection.getItems(false)) {
                this.cascade(item, type, visited, options);
            }
        }
    }
    isCollectionSelfReferenced(collection, processed) {
        const filtered = collection.getItems(false).filter(item => !(0, entity_1.helper)(item).__originalEntityData);
        return filtered.some(items => processed.has(items));
    }
    shouldCascade(prop, type) {
        if ([enums_1.Cascade.REMOVE, enums_1.Cascade.SCHEDULE_ORPHAN_REMOVAL, enums_1.Cascade.CANCEL_ORPHAN_REMOVAL, enums_1.Cascade.ALL].includes(type) && prop.orphanRemoval) {
            return true;
        }
        // ignore user settings for merge, it is kept only for back compatibility, this should have never been configurable
        if (type === enums_1.Cascade.MERGE) {
            return true;
        }
        return prop.cascade && (prop.cascade.includes(type) || prop.cascade.includes(enums_1.Cascade.ALL));
    }
    async lockPessimistic(entity, options) {
        if (!this.em.isInTransaction()) {
            throw errors_1.ValidationError.transactionRequired();
        }
        await this.em.getDriver().lockPessimistic(entity, { ctx: this.em.getTransactionContext(), ...options });
    }
    async lockOptimistic(entity, meta, version) {
        if (!meta.versionProperty) {
            throw errors_1.OptimisticLockError.notVersioned(meta);
        }
        if (!Utils_1.Utils.isDefined(version)) {
            return;
        }
        const wrapped = (0, entity_1.helper)(entity);
        if (!wrapped.__initialized) {
            await wrapped.init();
        }
        const previousVersion = entity[meta.versionProperty];
        if (previousVersion !== version) {
            throw errors_1.OptimisticLockError.lockFailedVersionMismatch(entity, version, previousVersion);
        }
    }
    fixMissingReference(entity, prop) {
        const reference = entity[prop.name];
        const kind = entity_1.Reference.unwrapReference(reference);
        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && kind && !prop.mapToPk) {
            if (!Utils_1.Utils.isEntity(kind)) {
                entity[prop.name] = this.em.getReference(prop.type, kind, { wrapped: !!prop.ref });
            }
            else if (!(0, entity_1.helper)(kind).__initialized && !(0, entity_1.helper)(kind).__em) {
                const pk = (0, entity_1.helper)(kind).getPrimaryKey();
                entity[prop.name] = this.em.getReference(prop.type, pk, { wrapped: !!prop.ref });
            }
        }
        // perf: set the `Collection._property` to skip the getter, as it can be slow when there is a lot of relations
        if (Utils_1.Utils.isCollection(kind)) {
            kind.property = prop;
        }
        const isCollection = [enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind);
        if (isCollection && Array.isArray(kind)) {
            const collection = new entity_1.Collection(entity);
            collection.property = prop;
            entity[prop.name] = collection;
            collection.set(kind);
        }
    }
    async persistToDatabase(groups, ctx) {
        if (ctx) {
            this.em.setTransactionContext(ctx);
        }
        const commitOrder = this.getCommitOrder();
        const commitOrderReversed = [...commitOrder].reverse();
        // early delete - when we recreate entity in the same UoW, we need to issue those delete queries before inserts
        for (const name of commitOrderReversed) {
            await this.commitDeleteChangeSets(groups[ChangeSet_1.ChangeSetType.DELETE_EARLY].get(name) ?? [], ctx);
        }
        // early update - when we recreate entity in the same UoW, we need to issue those delete queries before inserts
        for (const name of commitOrder) {
            await this.commitUpdateChangeSets(groups[ChangeSet_1.ChangeSetType.UPDATE_EARLY].get(name) ?? [], ctx);
        }
        // extra updates
        await this.commitExtraUpdates(ChangeSet_1.ChangeSetType.UPDATE_EARLY, ctx);
        // create
        for (const name of commitOrder) {
            await this.commitCreateChangeSets(groups[ChangeSet_1.ChangeSetType.CREATE].get(name) ?? [], ctx);
        }
        // update
        for (const name of commitOrder) {
            await this.commitUpdateChangeSets(groups[ChangeSet_1.ChangeSetType.UPDATE].get(name) ?? [], ctx);
        }
        // extra updates
        await this.commitExtraUpdates(ChangeSet_1.ChangeSetType.UPDATE, ctx);
        // collection updates
        await this.commitCollectionUpdates(ctx);
        // delete - entity deletions need to be in reverse commit order
        for (const name of commitOrderReversed) {
            await this.commitDeleteChangeSets(groups[ChangeSet_1.ChangeSetType.DELETE].get(name) ?? [], ctx);
        }
        // take snapshots of all persisted collections
        const visited = new Set();
        for (const changeSet of this.changeSets.values()) {
            this.takeCollectionSnapshots(changeSet.entity, visited);
        }
    }
    async commitCreateChangeSets(changeSets, ctx) {
        if (changeSets.length === 0) {
            return;
        }
        const props = changeSets[0].meta.root.relations.filter(prop => {
            return (prop.kind === enums_1.ReferenceKind.ONE_TO_ONE && prop.owner)
                || prop.kind === enums_1.ReferenceKind.MANY_TO_ONE
                || (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.owner && !this.platform.usesPivotTable());
        });
        for (const changeSet of changeSets) {
            this.findExtraUpdates(changeSet, props);
            await this.runHooks(enums_1.EventType.beforeCreate, changeSet, true);
        }
        await this.changeSetPersister.executeInserts(changeSets, { ctx });
        for (const changeSet of changeSets) {
            this.register(changeSet.entity, changeSet.payload, { refresh: true });
            await this.runHooks(enums_1.EventType.afterCreate, changeSet);
        }
    }
    findExtraUpdates(changeSet, props) {
        for (const prop of props) {
            const ref = changeSet.entity[prop.name];
            if (!ref || prop.deferMode === enums_1.DeferMode.INITIALLY_DEFERRED) {
                continue;
            }
            if (Utils_1.Utils.isCollection(ref)) {
                ref.getItems(false).some(item => {
                    const cs = this.changeSets.get(entity_1.Reference.unwrapReference(item));
                    const isScheduledForInsert = cs && cs.type === ChangeSet_1.ChangeSetType.CREATE && !cs.persisted;
                    if (isScheduledForInsert) {
                        this.scheduleExtraUpdate(changeSet, [prop]);
                        return true;
                    }
                    return false;
                });
            }
            const cs = this.changeSets.get(entity_1.Reference.unwrapReference(ref));
            const isScheduledForInsert = cs && cs.type === ChangeSet_1.ChangeSetType.CREATE && !cs.persisted;
            if (isScheduledForInsert) {
                this.scheduleExtraUpdate(changeSet, [prop]);
            }
        }
    }
    findEarlyUpdates(changeSet, inserts = []) {
        const props = changeSet.meta.uniqueProps;
        for (const prop of props) {
            const insert = inserts.find(c => Utils_1.Utils.equals(c.payload[prop.name], changeSet.originalEntity[prop.name]));
            const propEmpty = changeSet.payload[prop.name] === null || changeSet.payload[prop.name] === undefined;
            if (prop.name in changeSet.payload &&
                insert &&
                // We only want to update early if the unique property on the changeset is going to be empty, so that
                // the previous unique value can be set on a different entity without constraint issues
                propEmpty) {
                changeSet.type = ChangeSet_1.ChangeSetType.UPDATE_EARLY;
            }
        }
    }
    async commitUpdateChangeSets(changeSets, ctx, batched = true) {
        if (changeSets.length === 0) {
            return;
        }
        for (const changeSet of changeSets) {
            await this.runHooks(enums_1.EventType.beforeUpdate, changeSet, true);
        }
        await this.changeSetPersister.executeUpdates(changeSets, batched, { ctx });
        for (const changeSet of changeSets) {
            (0, entity_1.helper)(changeSet.entity).__originalEntityData = this.comparator.prepareEntity(changeSet.entity);
            (0, entity_1.helper)(changeSet.entity).__touched = false;
            (0, entity_1.helper)(changeSet.entity).__initialized = true;
            await this.runHooks(enums_1.EventType.afterUpdate, changeSet);
        }
    }
    async commitDeleteChangeSets(changeSets, ctx) {
        if (changeSets.length === 0) {
            return;
        }
        for (const changeSet of changeSets) {
            await this.runHooks(enums_1.EventType.beforeDelete, changeSet, true);
        }
        await this.changeSetPersister.executeDeletes(changeSets, { ctx });
        for (const changeSet of changeSets) {
            this.unsetIdentity(changeSet.entity);
            await this.runHooks(enums_1.EventType.afterDelete, changeSet);
        }
    }
    async commitExtraUpdates(type, ctx) {
        const extraUpdates = [];
        for (const extraUpdate of this.extraUpdates) {
            if (extraUpdate[4] !== type) {
                continue;
            }
            if (Array.isArray(extraUpdate[1])) {
                extraUpdate[1].forEach((p, i) => extraUpdate[0][p] = extraUpdate[2][i]);
            }
            else {
                extraUpdate[0][extraUpdate[1]] = extraUpdate[2];
            }
            const changeSet = this.changeSetComputer.computeChangeSet(extraUpdate[0]);
            if (changeSet) {
                extraUpdates.push([changeSet, extraUpdate[3]]);
            }
        }
        await this.commitUpdateChangeSets(extraUpdates.map(u => u[0]), ctx, false);
        // propagate the new values to the original changeset
        for (const extraUpdate of extraUpdates) {
            if (extraUpdate[1]) {
                Object.assign(extraUpdate[1].payload, extraUpdate[0].payload);
            }
        }
    }
    async commitCollectionUpdates(ctx) {
        const collectionUpdates = [];
        for (const coll of this.collectionUpdates) {
            if (coll.property.owner || coll.getItems(false).filter(item => !item.__helper.__initialized).length > 0) {
                if (this.platform.usesPivotTable()) {
                    collectionUpdates.push(coll);
                }
            }
            else if (coll.property.kind === enums_1.ReferenceKind.ONE_TO_MANY && coll.getSnapshot() === undefined) {
                collectionUpdates.push(coll);
            }
            else if (coll.property.kind === enums_1.ReferenceKind.MANY_TO_MANY && !coll.property.owner) {
                collectionUpdates.push(coll);
            }
        }
        await this.em.getDriver().syncCollections(collectionUpdates, { ctx });
        for (const coll of this.collectionUpdates) {
            coll.takeSnapshot();
        }
    }
    /**
     * Orders change sets so FK constrains are maintained, ensures stable order (needed for node < 11)
     */
    getChangeSetGroups() {
        const groups = {
            [ChangeSet_1.ChangeSetType.CREATE]: new Map(),
            [ChangeSet_1.ChangeSetType.UPDATE]: new Map(),
            [ChangeSet_1.ChangeSetType.DELETE]: new Map(),
            [ChangeSet_1.ChangeSetType.UPDATE_EARLY]: new Map(),
            [ChangeSet_1.ChangeSetType.DELETE_EARLY]: new Map(),
        };
        for (const cs of this.changeSets.values()) {
            const group = groups[cs.type];
            const classGroup = group.get(cs.rootName) ?? [];
            classGroup.push(cs);
            if (!group.has(cs.rootName)) {
                group.set(cs.rootName, classGroup);
            }
        }
        return groups;
    }
    getCommitOrder() {
        const calc = new CommitOrderCalculator_1.CommitOrderCalculator();
        const set = new Set();
        this.changeSets.forEach(cs => set.add(cs.rootName));
        set.forEach(entityName => calc.addNode(entityName));
        for (const entityName of set) {
            for (const prop of this.metadata.find(entityName).props) {
                calc.discoverProperty(prop, entityName);
            }
        }
        return calc.sort();
    }
    resetTransaction(oldTx) {
        if (oldTx) {
            this.em.setTransactionContext(oldTx);
        }
        else {
            this.em.resetTransactionContext();
        }
    }
    /**
     * Takes snapshots of all processed collections
     */
    takeCollectionSnapshots(entity, visited) {
        if (visited.has(entity)) {
            return;
        }
        visited.add(entity);
        (0, entity_1.helper)(entity)?.__meta.relations.forEach(prop => {
            const value = entity[prop.name];
            if (Utils_1.Utils.isCollection(value)) {
                value.takeSnapshot();
            }
            // cascade to m:1 relations as we need to snapshot the 1:m inverse side (for `removeAll()` with orphan removal)
            if (prop.kind === enums_1.ReferenceKind.MANY_TO_ONE && value) {
                this.takeCollectionSnapshots(entity_1.Reference.unwrapReference(value), visited);
            }
        });
    }
}
exports.UnitOfWork = UnitOfWork;
