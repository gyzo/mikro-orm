"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Collection = void 0;
const ArrayCollection_1 = require("./ArrayCollection");
const utils_1 = require("../utils");
const errors_1 = require("../errors");
const enums_1 = require("../enums");
const Reference_1 = require("./Reference");
const wrap_1 = require("./wrap");
class Collection extends ArrayCollection_1.ArrayCollection {
    cachedOptions = new Map();
    inMemoryAdded = new Map();
    readonly;
    _populated;
    _em;
    // this is for some reason needed for TS, otherwise it can fail with `Type instantiation is excessively deep and possibly infinite.`
    _snapshot;
    constructor(owner, items, initialized = true) {
        super(owner, items);
        this.initialized = !!items || initialized;
    }
    /**
     * Creates new Collection instance, assigns it to the owning entity and sets the items to it (propagating them to their inverse sides)
     */
    static create(owner, prop, items, initialized) {
        const coll = new Collection(owner, undefined, initialized);
        coll.property = (0, wrap_1.helper)(owner).__meta.properties[prop];
        owner[prop] = coll;
        if (items) {
            coll.set(items);
        }
        return coll;
    }
    async loadedItems(options) {
        if (!options && this.cachedOptions.size > 0) {
            return [...this.inMemoryAdded.values()];
        }
        if (options && options.refresh) {
            return this.loadItems(options);
        }
        const sortedOptions = options ? this.sortObjectKeys(options) : {};
        const optionsKey = JSON.stringify(sortedOptions);
        let freshResults = [];
        if (!this.cachedOptions.has(optionsKey)) {
            this.cachedOptions.set(optionsKey, sortedOptions);
            freshResults = (await this.loadItems({
                ...options,
                refresh: true,
            }));
            if (freshResults.length > 0) {
                for (const item of freshResults) {
                    this._add(item);
                }
            }
        }
        return [...this.inMemoryAdded.values()];
    }
    _add(item) {
        if (Array.isArray(item)) {
            item.forEach((i) => this._add(i));
            return;
        }
        const inMemoryAddedKeyOfItem = this.sortObjectKeys(item.__helper.__primaryKeys);
        if (!this.inMemoryAdded.has(inMemoryAddedKeyOfItem)) {
            this.inMemoryAdded.set(inMemoryAddedKeyOfItem, item);
        }
    }
    /**
     * Ensures the collection is loaded first (without reloading it if it already is loaded).
     * Returns the Collection instance (itself), works the same as `Reference.load()`.
     */
    async load(options = {}) {
        if (this.isInitialized(true) && !options.refresh) {
            const em = this.getEntityManager(this.items, false);
            await em?.populate(this.items, options.populate, options);
            this.setSerializationContext(options);
        }
        else {
            await this.init({ refresh: false, ...options });
        }
        return this;
    }
    setSerializationContext(options) {
        (0, wrap_1.helper)(this.owner).setSerializationContext({
            populate: Array.isArray(options.populate)
                ? options.populate.map((hint) => `${this.property.name}.${hint}`)
                : options.populate ?? [this.property.name],
        });
    }
    /**
     * Initializes the collection and returns the items
     */
    async loadItems(options) {
        await this.load(options);
        return super.getItems();
    }
    /**
     * Gets the count of collection items from database instead of counting loaded items.
     * The value is cached (unless you use the `where` option), use `refresh: true` to force reload it.
     */
    async loadCount(options = {}) {
        options = typeof options === "boolean" ? { refresh: options } : options;
        const { refresh, where, ...countOptions } = options;
        if (!refresh && !where && utils_1.Utils.isDefined(this._count)) {
            return this._count;
        }
        const em = this.getEntityManager();
        if (!em.getPlatform().usesPivotTable() &&
            this.property.kind === enums_1.ReferenceKind.MANY_TO_MANY &&
            this.property.owner) {
            return (this._count = this.length);
        }
        const cond = this.createLoadCountCondition(where ?? {});
        const count = await em.count(this.property.type, cond, countOptions);
        if (!where) {
            this._count = count;
        }
        return count;
    }
    async matching(options) {
        const em = this.getEntityManager();
        const { where, ctx, ...opts } = options;
        opts.orderBy = this.createOrderBy(opts.orderBy);
        let items;
        if (this.property.kind === enums_1.ReferenceKind.MANY_TO_MANY &&
            em.getPlatform().usesPivotTable()) {
            const cond = (await em.applyFilters(this.property.type, where, options.filters ?? {}, "read"));
            const map = await em
                .getDriver()
                .loadFromPivotTable(this.property, [(0, wrap_1.helper)(this.owner).__primaryKeys], cond, opts.orderBy, ctx, options);
            items = map[(0, wrap_1.helper)(this.owner).getSerializedPrimaryKey()].map((item) => em.merge(this.property.type, item, { convertCustomTypes: true }));
        }
        else {
            items = (await em.find(this.property.type, this.createCondition(where), opts));
        }
        if (options.store) {
            this.hydrate(items, true);
            this.setSerializationContext(options);
            this.populated();
            this.readonly = true;
        }
        return items;
    }
    sortObjectKeys(obj) {
        if (obj === null || typeof obj !== "object") {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.sortObjectKeys(item));
        }
        return Object.keys(obj)
            .sort()
            .reduce((result, key) => {
            result[key] = this.sortObjectKeys(obj[key]);
            return result;
        }, {});
    }
    /**
     * Returns the items (the collection must be initialized)
     */
    getItems(check = true) {
        if (check) {
            this.checkInitialized();
        }
        return super.getItems();
    }
    toJSON() {
        if (!this.isInitialized()) {
            return [];
        }
        return super.toJSON();
    }
    add(entity, ...entities) {
        entities = utils_1.Utils.asArray(entity).concat(entities);
        entities.forEach((e) => this._add(e));
        const unwrapped = entities.map((i) => Reference_1.Reference.unwrapReference(i));
        unwrapped.forEach((entity) => this.validateItemType(entity));
        this.modify("add", unwrapped);
        this.cancelOrphanRemoval(unwrapped);
    }
    /**
     * @inheritDoc
     */
    remove(entity, ...entities) {
        if (entity instanceof Function) {
            for (const item of this.items) {
                if (entity(item)) {
                    this._delete(item);
                    this.remove(item);
                }
            }
            return;
        }
        entities = utils_1.Utils.asArray(entity).concat(entities);
        entities.forEach((e) => this._delete(e));
        const unwrapped = entities.map((i) => Reference_1.Reference.unwrapReference(i));
        this.modify("remove", unwrapped);
        const em = this.getEntityManager(unwrapped, false);
        if (this.property.orphanRemoval && em) {
            for (const item of unwrapped) {
                em.getUnitOfWork().scheduleOrphanRemoval(item);
            }
        }
    }
    _delete(item) {
        const inMemoryAddedKeyOfItem = this.sortObjectKeys(item.__helper.__primaryKeys);
        this.inMemoryAdded.delete(inMemoryAddedKeyOfItem);
    }
    contains(item, check = true) {
        if (check) {
            this.checkInitialized();
        }
        return super.contains(item);
    }
    count() {
        this.checkInitialized();
        return super.count();
    }
    isEmpty() {
        this.checkInitialized();
        return super.isEmpty();
    }
    /**
     * @inheritDoc
     */
    slice(start, end) {
        this.checkInitialized();
        return super.slice(start, end);
    }
    /**
     * @inheritDoc
     */
    exists(cb) {
        this.checkInitialized();
        return super.exists(cb);
    }
    /**
     * @inheritDoc
     */
    find(cb) {
        this.checkInitialized();
        return super.find(cb);
    }
    /**
     * @inheritDoc
     */
    filter(cb) {
        this.checkInitialized();
        return super.filter(cb);
    }
    /**
     * @inheritDoc
     */
    map(mapper) {
        this.checkInitialized();
        return super.map(mapper);
    }
    /**
     * @inheritDoc
     */
    indexBy(key, valueKey) {
        this.checkInitialized();
        return super.indexBy(key, valueKey);
    }
    shouldPopulate(populated) {
        if (!this.isInitialized(true)) {
            return false;
        }
        if (this._populated != null) {
            return this._populated;
        }
        return !!populated;
    }
    populated(populated = true) {
        this._populated = populated;
    }
    async init(options = {}) {
        if (this.dirty) {
            const items = [...this.items];
            this.dirty = false;
            await this.init(options);
            items.forEach((i) => this.add(i));
            return this;
        }
        const em = this.getEntityManager();
        if (options.dataloader ??
            [enums_1.DataloaderType.ALL, enums_1.DataloaderType.COLLECTION].includes(utils_1.DataloaderUtils.getDataloaderType(em.config.get("dataloader")))) {
            const order = [...this.items]; // copy order of references
            const customOrder = !!options.orderBy;
            // eslint-disable-next-line dot-notation
            const items = await em["colLoader"].load([this, options]);
            if (!customOrder) {
                this.reorderItems(items, order);
            }
            this.items.clear();
            let i = 0;
            for (const item of items) {
                this.items.add(item);
                this[i++] = item;
            }
            this.initialized = true;
            this.dirty = false;
            return this;
        }
        const populate = Array.isArray(options.populate)
            ? options.populate.map((f) => f === "*" ? f : `${this.property.name}.${f}`)
            : [`${this.property.name}${options.ref ? ":ref" : ""}`];
        const schema = this.property.targetMeta.schema === "*"
            ? (0, wrap_1.helper)(this.owner).__schema
            : undefined;
        await em.populate(this.owner, populate, {
            refresh: true,
            ...options,
            connectionType: options.connectionType,
            schema,
            where: { [this.property.name]: options.where },
            orderBy: { [this.property.name]: options.orderBy },
        });
        return this;
    }
    getEntityManager(items = [], required = true) {
        const wrapped = (0, wrap_1.helper)(this.owner);
        let em = (this._em ?? wrapped.__em);
        if (!em) {
            for (const i of items) {
                if (i && (0, wrap_1.helper)(i).__em) {
                    em = (0, wrap_1.helper)(i).__em;
                    break;
                }
            }
        }
        if (em) {
            Object.defineProperty(this, "_em", { value: em });
        }
        if (!em && required) {
            throw errors_1.ValidationError.entityNotManaged(this.owner);
        }
        return em;
    }
    createCondition(cond = {}) {
        if (this.property.kind === enums_1.ReferenceKind.ONE_TO_MANY) {
            cond[this.property.mappedBy] = (0, wrap_1.helper)(this.owner).getPrimaryKey();
        }
        else {
            // MANY_TO_MANY
            this.createManyToManyCondition(cond);
        }
        return cond;
    }
    createOrderBy(orderBy = []) {
        if (utils_1.Utils.isEmpty(orderBy) && this.property.orderBy) {
            orderBy = this.property.orderBy;
        }
        return utils_1.Utils.asArray(orderBy);
    }
    createManyToManyCondition(cond) {
        const dict = cond;
        if (this.property.owner || this.property.pivotTable) {
            // we know there is at least one item as it was checked in load method
            const pk = this.property.targetMeta.primaryKeys[0];
            dict[pk] = { $in: [] };
            this.items.forEach((item) => dict[pk].$in.push((0, wrap_1.helper)(item).getPrimaryKey()));
        }
        else {
            dict[this.property.mappedBy] = (0, wrap_1.helper)(this.owner).getPrimaryKey();
        }
    }
    createLoadCountCondition(cond) {
        const wrapped = (0, wrap_1.helper)(this.owner);
        const val = wrapped.__meta.compositePK
            ? { $in: wrapped.__primaryKeys }
            : wrapped.getPrimaryKey();
        const dict = cond;
        if (this.property.kind === enums_1.ReferenceKind.ONE_TO_MANY) {
            dict[this.property.mappedBy] = val;
        }
        else {
            const key = this.property.owner
                ? this.property.inversedBy
                : this.property.mappedBy;
            dict[key] = val;
        }
        return cond;
    }
    modify(method, items) {
        if (method === "remove") {
            this.checkInitialized();
        }
        this.validateModification(items);
        super[method](items);
        this.setDirty();
    }
    checkInitialized() {
        if (!this.isInitialized()) {
            throw new Error(`Collection<${this.property.type}> of entity ${this.owner.constructor.name}[${(0, wrap_1.helper)(this.owner).getSerializedPrimaryKey()}] not initialized`);
        }
    }
    /**
     * re-orders items after searching with `$in` operator
     */
    reorderItems(items, order) {
        if (this.property.kind === enums_1.ReferenceKind.MANY_TO_MANY &&
            this.property.owner) {
            items.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        }
    }
    cancelOrphanRemoval(items) {
        const em = this.getEntityManager(items, false);
        if (!em) {
            return;
        }
        for (const item of items) {
            em.getUnitOfWork().cancelOrphanRemoval(item);
        }
    }
    validateItemType(item) {
        if (!utils_1.Utils.isEntity(item)) {
            throw errors_1.ValidationError.notEntity(this.owner, this.property, item);
        }
    }
    validateModification(items) {
        if (this.readonly) {
            throw errors_1.ValidationError.cannotModifyReadonlyCollection(this.owner, this.property);
        }
        // currently we allow persisting to inverse sides only in SQL drivers
        if (this.property.pivotTable || !this.property.mappedBy) {
            return;
        }
        const check = (item) => {
            if (!item || (0, wrap_1.helper)(item).__initialized) {
                return false;
            }
            return (!item[this.property.mappedBy] &&
                this.property.kind === enums_1.ReferenceKind.MANY_TO_MANY);
        };
        // throw if we are modifying inverse side of M:N collection when owning side is initialized (would be ignored when persisting)
        if (items.find((item) => check(item))) {
            throw errors_1.ValidationError.cannotModifyInverseCollection(this.owner, this.property);
        }
    }
}
exports.Collection = Collection;
Object.defineProperties(Collection.prototype, {
    $: {
        get() {
            return this;
        },
    },
    get: {
        get() {
            return () => this;
        },
    },
});
