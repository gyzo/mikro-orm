"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArrayCollection = void 0;
const node_util_1 = require("node:util");
const Reference_1 = require("./Reference");
const wrap_1 = require("./wrap");
const errors_1 = require("../errors");
const enums_1 = require("../enums");
const Utils_1 = require("../utils/Utils");
class ArrayCollection {
    owner;
    items = new Set();
    initialized = true;
    dirty = false;
    snapshot = []; // used to create a diff of the collection at commit time, undefined marks overridden values so we need to wipe when flushing
    _count;
    _property;
    constructor(owner, items) {
        this.owner = owner;
        /* istanbul ignore next */
        if (items) {
            let i = 0;
            this.items = new Set(items);
            this.items.forEach(item => this[i++] = item);
        }
    }
    async loadCount() {
        return this.items.size;
    }
    getItems() {
        return [...this.items];
    }
    toArray() {
        if (this.items.size === 0) {
            return [];
        }
        const meta = this.property.targetMeta;
        const args = meta.toJsonParams.map(() => undefined);
        return this.map(item => (0, wrap_1.wrap)(item).toJSON(...args));
    }
    toJSON() {
        return this.toArray();
    }
    getIdentifiers(field) {
        const items = this.getItems();
        if (items.length === 0) {
            return [];
        }
        field ??= this.property.targetMeta.serializedPrimaryKey;
        return items.map(i => {
            if (Utils_1.Utils.isEntity(i[field], true)) {
                return (0, wrap_1.wrap)(i[field], true).getPrimaryKey();
            }
            return i[field];
        });
    }
    add(entity, ...entities) {
        entities = Utils_1.Utils.asArray(entity).concat(entities);
        for (const item of entities) {
            const entity = Reference_1.Reference.unwrapReference(item);
            if (!this.contains(entity, false)) {
                this.incrementCount(1);
                this[this.items.size] = entity;
                this.items.add(entity);
                this.propagate(entity, 'add');
            }
        }
    }
    /**
     * @internal
     */
    addWithoutPropagation(entity) {
        if (!this.contains(entity, false)) {
            this.incrementCount(1);
            this[this.items.size] = entity;
            this.items.add(entity);
            this.dirty = true;
        }
    }
    set(items) {
        if (!this.initialized) {
            this.initialized = true;
            this.snapshot = undefined;
        }
        if (this.compare(Utils_1.Utils.asArray(items).map(item => Reference_1.Reference.unwrapReference(item)))) {
            return;
        }
        this.remove(this.items);
        this.add(items);
    }
    compare(items) {
        if (items.length !== this.items.size) {
            return false;
        }
        let idx = 0;
        for (const item of this.items) {
            if (item !== items[idx++]) {
                return false;
            }
        }
        return true;
    }
    /**
     * @internal
     */
    hydrate(items, forcePropagate) {
        for (let i = 0; i < this.items.size; i++) {
            delete this[i];
        }
        this.initialized = true;
        this.items.clear();
        this._count = 0;
        this.add(items);
        this.takeSnapshot(forcePropagate);
    }
    /**
     * Remove specified item(s) from the collection. Note that removing item from collection does not necessarily imply deleting the target entity,
     * it means we are disconnecting the relation - removing items from collection, not removing entities from database - `Collection.remove()`
     * is not the same as `em.remove()`. If we want to delete the entity by removing it from collection, we need to enable `orphanRemoval: true`,
     * which tells the ORM we don't want orphaned entities to exist, so we know those should be removed.
     */
    remove(entity, ...entities) {
        entities = Utils_1.Utils.asArray(entity).concat(entities);
        let modified = false;
        for (const item of entities) {
            if (!item) {
                continue;
            }
            const entity = Reference_1.Reference.unwrapReference(item);
            if (this.items.delete(entity)) {
                this.incrementCount(-1);
                delete this[this.items.size]; // remove last item
                this.propagate(entity, 'remove');
                modified = true;
            }
        }
        if (modified) {
            Object.assign(this, [...this.items]); // reassign array access
        }
    }
    /**
     * Remove all items from the collection. Note that removing items from collection does not necessarily imply deleting the target entity,
     * it means we are disconnecting the relation - removing items from collection, not removing entities from database - `Collection.remove()`
     * is not the same as `em.remove()`. If we want to delete the entity by removing it from collection, we need to enable `orphanRemoval: true`,
     * which tells the ORM we don't want orphaned entities to exist, so we know those should be removed.
     */
    removeAll() {
        if (!this.initialized) {
            this.initialized = true;
            this.snapshot = undefined;
        }
        this.remove(this.items);
    }
    /**
     * @internal
     */
    removeWithoutPropagation(entity) {
        if (!this.items.delete(entity)) {
            return;
        }
        this.incrementCount(-1);
        delete this[this.items.size];
        Object.assign(this, [...this.items]);
        this.dirty = true;
    }
    contains(item, check) {
        const entity = Reference_1.Reference.unwrapReference(item);
        return this.items.has(entity);
    }
    /**
     * Extracts a slice of the collection items starting at position start to end (exclusive) of the collection.
     * If end is null it returns all elements from start to the end of the collection.
     */
    slice(start = 0, end) {
        let index = 0;
        end ??= this.items.size;
        const items = [];
        for (const item of this.items) {
            if (index === end) {
                break;
            }
            if (index >= start && index < end) {
                items.push(item);
            }
            index++;
        }
        return items;
    }
    /**
     * Tests for the existence of an element that satisfies the given predicate.
     */
    exists(cb) {
        for (const item of this.items) {
            if (cb(item)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns the first element of this collection that satisfies the predicate.
     */
    find(cb) {
        let index = 0;
        for (const item of this.items) {
            if (cb(item, index++)) {
                return item;
            }
        }
        return undefined;
    }
    /**
     * Extracts a subset of the collection items.
     */
    filter(cb) {
        const items = [];
        let index = 0;
        for (const item of this.items) {
            if (cb(item, index++)) {
                items.push(item);
            }
        }
        return items;
    }
    /**
     * Maps the collection items based on your provided mapper function.
     */
    map(mapper) {
        const items = [];
        let index = 0;
        for (const item of this.items) {
            items.push(mapper(item, index++));
        }
        return items;
    }
    /**
     * Maps the collection items based on your provided mapper function to a single object.
     */
    reduce(cb, initial = {}) {
        let index = 0;
        for (const item of this.items) {
            initial = cb(initial, item, index++);
        }
        return initial;
    }
    /**
     * Maps the collection items to a dictionary, indexed by the key you specify.
     * If there are more items with the same key, only the first one will be present.
     */
    indexBy(key, valueKey) {
        return this.reduce((obj, item) => {
            obj[item[key]] ??= valueKey ? item[valueKey] : item;
            return obj;
        }, {});
    }
    count() {
        return this.items.size;
    }
    isInitialized(fully = false) {
        if (!this.initialized || !fully) {
            return this.initialized;
        }
        for (const item of this.items) {
            if (!(0, wrap_1.helper)(item).__initialized) {
                return false;
            }
        }
        return true;
    }
    isDirty() {
        return this.dirty;
    }
    isEmpty() {
        return this.count() === 0;
    }
    setDirty(dirty = true) {
        this.dirty = dirty;
    }
    get length() {
        return this.count();
    }
    *[Symbol.iterator]() {
        for (const item of this.getItems()) {
            yield item;
        }
    }
    /**
     * @internal
     */
    takeSnapshot(forcePropagate) {
        this.snapshot = [...this.items];
        this.setDirty(false);
        if (this.property.owner || forcePropagate) {
            this.items.forEach(item => {
                this.propagate(item, 'takeSnapshot');
            });
        }
    }
    /**
     * @internal
     */
    getSnapshot() {
        return this.snapshot;
    }
    /**
     * @internal
     */
    get property() {
        if (!this._property) {
            const meta = (0, wrap_1.wrap)(this.owner, true).__meta;
            /* istanbul ignore if */
            if (!meta) {
                throw errors_1.MetadataError.fromUnknownEntity(this.owner.constructor.name, 'Collection.property getter, maybe you just forgot to initialize the ORM?');
            }
            this._property = meta.relations.find(prop => this.owner[prop.name] === this);
        }
        return this._property;
    }
    /**
     * @internal
     */
    set property(prop) {
        this._property = prop;
    }
    propagate(item, method) {
        if (this.property.owner && this.property.inversedBy) {
            this.propagateToInverseSide(item, method);
        }
        else if (!this.property.owner && this.property.mappedBy) {
            this.propagateToOwningSide(item, method);
        }
    }
    propagateToInverseSide(item, method) {
        const collection = item[this.property.inversedBy];
        if (this.shouldPropagateToCollection(collection, method)) {
            method = method === 'takeSnapshot' ? method : (method + 'WithoutPropagation');
            collection[method](this.owner);
        }
    }
    propagateToOwningSide(item, method) {
        const mappedBy = this.property.mappedBy;
        const collection = item[mappedBy];
        if (this.property.kind === enums_1.ReferenceKind.MANY_TO_MANY) {
            if (this.shouldPropagateToCollection(collection, method)) {
                collection[method](this.owner);
            }
        }
        else if (this.property.kind === enums_1.ReferenceKind.ONE_TO_MANY && method !== 'takeSnapshot') {
            const prop2 = this.property.targetMeta.properties[mappedBy];
            const owner = prop2.mapToPk ? (0, wrap_1.helper)(this.owner).getPrimaryKey() : this.owner;
            const value = method === 'add' ? owner : null;
            if (this.property.orphanRemoval && method === 'remove') {
                // cache the PK before we propagate, as its value might be needed when flushing
                (0, wrap_1.helper)(item).__pk = (0, wrap_1.helper)(item).getPrimaryKey();
            }
            if (!prop2.nullable && prop2.deleteRule !== 'cascade' && method === 'remove') {
                if (!this.property.orphanRemoval) {
                    throw errors_1.ValidationError.cannotRemoveFromCollectionWithoutOrphanRemoval(this.owner, this.property);
                }
                return;
            }
            // skip if already propagated
            if (Reference_1.Reference.unwrapReference(item[mappedBy]) !== value) {
                item[mappedBy] = value;
            }
        }
    }
    shouldPropagateToCollection(collection, method) {
        if (!collection) {
            return false;
        }
        switch (method) {
            case 'add':
                return !collection.contains(this.owner, false);
            case 'remove':
                return collection.isInitialized() && collection.contains(this.owner, false);
            case 'takeSnapshot':
                return collection.isDirty();
        }
    }
    incrementCount(value) {
        if (typeof this._count === 'number' && this.initialized) {
            this._count += value;
        }
    }
    /** @ignore */
    [node_util_1.inspect.custom](depth = 2) {
        const object = { ...this };
        const hidden = ['items', 'owner', '_property', '_count', 'snapshot', '_populated', '_snapshot', '_lazyInitialized', '_em', 'readonly'];
        hidden.forEach(k => delete object[k]);
        const ret = (0, node_util_1.inspect)(object, { depth });
        const name = `${this.constructor.name}<${this.property?.type ?? 'unknown'}>`;
        return ret === '[Object]' ? `[${name}]` : name + ' ' + ret;
    }
}
exports.ArrayCollection = ArrayCollection;
Object.defineProperties(ArrayCollection.prototype, {
    __collection: { value: true, enumerable: false, writable: false },
});
