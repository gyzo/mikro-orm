"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityManager = void 0;
const node_util_1 = require("node:util");
const dataloader_1 = __importDefault(require("dataloader"));
const utils_1 = require("./utils");
const entity_1 = require("./entity");
const unit_of_work_1 = require("./unit-of-work");
const enums_1 = require("./enums");
const events_1 = require("./events");
const errors_1 = require("./errors");
/**
 * The EntityManager is the central access point to ORM functionality. It is a facade to all different ORM subsystems
 * such as UnitOfWork, Query Language, and Repository API.
 * @template {IDatabaseDriver} Driver current driver type
 */
class EntityManager {
    config;
    driver;
    metadata;
    useContext;
    eventManager;
    static counter = 1;
    _id = EntityManager.counter++;
    global = false;
    name;
    refLoader = new dataloader_1.default(utils_1.DataloaderUtils.getRefBatchLoadFn(this));
    colLoader = new dataloader_1.default(utils_1.DataloaderUtils.getColBatchLoadFn(this));
    validator;
    repositoryMap = {};
    entityLoader;
    comparator;
    entityFactory;
    unitOfWork;
    resultCache;
    filters = {};
    filterParams = {};
    loggerContext;
    transactionContext;
    disableTransactions;
    flushMode;
    _schema;
    /**
     * @internal
     */
    constructor(config, driver, metadata, useContext = true, eventManager = new events_1.EventManager(config.get('subscribers'))) {
        this.config = config;
        this.driver = driver;
        this.metadata = metadata;
        this.useContext = useContext;
        this.eventManager = eventManager;
        this.entityLoader = new entity_1.EntityLoader(this);
        this.name = this.config.get('contextName');
        this.validator = new entity_1.EntityValidator(this.config.get('strict'));
        this.comparator = this.config.getComparator(this.metadata);
        this.resultCache = this.config.getResultCacheAdapter();
        this.disableTransactions = this.config.get('disableTransactions');
        this.entityFactory = new entity_1.EntityFactory(this);
        this.unitOfWork = new unit_of_work_1.UnitOfWork(this);
    }
    /**
     * Gets the Driver instance used by this EntityManager.
     * Driver is singleton, for one MikroORM instance, only one driver is created.
     */
    getDriver() {
        return this.driver;
    }
    /**
     * Gets the Connection instance, by default returns write connection
     */
    getConnection(type) {
        return this.driver.getConnection(type);
    }
    /**
     * Gets the platform instance. Just like the driver, platform is singleton, one for a MikroORM instance.
     */
    getPlatform() {
        return this.driver.getPlatform();
    }
    /**
     * Gets repository for given entity. You can pass either string name or entity class reference.
     */
    getRepository(entityName) {
        entityName = utils_1.Utils.className(entityName);
        if (!this.repositoryMap[entityName]) {
            const meta = this.metadata.get(entityName);
            const RepositoryClass = this.config.getRepositoryClass(meta.repository);
            this.repositoryMap[entityName] = new RepositoryClass(this, entityName);
        }
        return this.repositoryMap[entityName];
    }
    /**
     * Shortcut for `em.getRepository()`.
     */
    repo(entityName) {
        return this.getRepository(entityName);
    }
    /**
     * Gets EntityValidator instance
     */
    getValidator() {
        return this.validator;
    }
    /**
     * Finds all entities matching your `where` query. You can pass additional options via the `options` parameter.
     */
    async find(entityName, where, options = {}) {
        if (options.disableIdentityMap ?? this.config.get('disableIdentityMap')) {
            const em = this.getContext(false);
            const fork = em.fork({ keepTransactionContext: true });
            const ret = await fork.find(entityName, where, { ...options, disableIdentityMap: false });
            fork.clear();
            return ret;
        }
        const em = this.getContext();
        em.prepareOptions(options);
        await em.tryFlush(entityName, options);
        entityName = utils_1.Utils.className(entityName);
        where = await em.processWhere(entityName, where, options, 'read');
        em.validator.validateParams(where);
        options.orderBy = options.orderBy || {};
        options.populate = await em.preparePopulate(entityName, options);
        const populate = options.populate;
        const cacheKey = em.cacheKey(entityName, options, 'em.find', where);
        const cached = await em.tryCache(entityName, options.cache, cacheKey, options.refresh, true);
        if (cached?.data) {
            await em.entityLoader.populate(entityName, cached.data, populate, {
                ...options,
                ...em.getPopulateWhere(where, options),
                convertCustomTypes: false,
                ignoreLazyScalarProperties: true,
                lookup: false,
            });
            return cached.data;
        }
        const meta = this.metadata.get(entityName);
        options = { ...options };
        // save the original hint value so we know it was infer/all
        options._populateWhere = options.populateWhere ?? this.config.get('populateWhere');
        options.populateWhere = this.createPopulateWhere({ ...where }, options);
        options.populateFilter = await this.getJoinedFilters(meta, { ...where }, options);
        const results = await em.driver.find(entityName, where, { ctx: em.transactionContext, ...options });
        if (results.length === 0) {
            await em.storeCache(options.cache, cached, []);
            return [];
        }
        const ret = [];
        for (const data of results) {
            const entity = em.entityFactory.create(entityName, data, {
                merge: true,
                refresh: options.refresh,
                schema: options.schema,
                convertCustomTypes: true,
            });
            ret.push(entity);
        }
        const unique = utils_1.Utils.unique(ret);
        await em.entityLoader.populate(entityName, unique, populate, {
            ...options,
            ...em.getPopulateWhere(where, options),
            convertCustomTypes: false,
            ignoreLazyScalarProperties: true,
            lookup: false,
        });
        await em.unitOfWork.dispatchOnLoadEvent();
        if (meta.virtual) {
            await em.storeCache(options.cache, cached, () => ret);
        }
        else {
            await em.storeCache(options.cache, cached, () => unique.map(e => (0, entity_1.helper)(e).toPOJO()));
        }
        return unique;
    }
    /**
     * Finds all entities of given type, optionally matching the `where` condition provided in the `options` parameter.
     */
    async findAll(entityName, options) {
        return this.find(entityName, options?.where ?? {}, options);
    }
    getPopulateWhere(where, options) {
        if (options.populateWhere === undefined) {
            options.populateWhere = this.config.get('populateWhere');
        }
        if (options.populateWhere === enums_1.PopulateHint.ALL) {
            return { where: {}, populateWhere: options.populateWhere };
        }
        /* istanbul ignore next */
        if (options.populateWhere === enums_1.PopulateHint.INFER) {
            return { where, populateWhere: options.populateWhere };
        }
        return { where: options.populateWhere };
    }
    /**
     * Registers global filter to this entity manager. Global filters are enabled by default (unless disabled via last parameter).
     */
    addFilter(name, cond, entityName, enabled = true) {
        const options = { name, cond, default: enabled };
        if (entityName) {
            options.entity = utils_1.Utils.asArray(entityName).map(n => utils_1.Utils.className(n));
        }
        this.getContext(false).filters[name] = options;
    }
    /**
     * Sets filter parameter values globally inside context defined by this entity manager.
     * If you want to set shared value for all contexts, be sure to use the root entity manager.
     */
    setFilterParams(name, args) {
        this.getContext().filterParams[name] = args;
    }
    /**
     * Returns filter parameters for given filter set in this context.
     */
    getFilterParams(name) {
        return this.getContext().filterParams[name];
    }
    /**
     * Sets logger context for this entity manager.
     */
    setLoggerContext(context) {
        this.getContext().loggerContext = context;
    }
    /**
     * Gets logger context for this entity manager.
     */
    getLoggerContext() {
        const em = this.getContext();
        em.loggerContext ??= {};
        return em.loggerContext;
    }
    setFlushMode(flushMode) {
        this.getContext(false).flushMode = flushMode;
    }
    async processWhere(entityName, where, options, type) {
        where = utils_1.QueryHelper.processWhere({
            where,
            entityName,
            metadata: this.metadata,
            platform: this.driver.getPlatform(),
            convertCustomTypes: options.convertCustomTypes,
            aliased: type === 'read',
        });
        where = (await this.applyFilters(entityName, where, options.filters ?? {}, type, options));
        where = await this.applyDiscriminatorCondition(entityName, where);
        return where;
    }
    // this method only handles the problem for mongo driver, SQL drivers have their implementation inside QueryBuilder
    applyDiscriminatorCondition(entityName, where) {
        const meta = this.metadata.find(entityName);
        if (!meta?.discriminatorValue) {
            return where;
        }
        const types = Object.values(meta.root.discriminatorMap).map(cls => this.metadata.find(cls));
        const children = [];
        const lookUpChildren = (ret, type) => {
            const children = types.filter(meta2 => meta2.extends === type);
            children.forEach(m => lookUpChildren(ret, m.className));
            ret.push(...children.filter(c => c.discriminatorValue));
            return children;
        };
        lookUpChildren(children, meta.className);
        /* istanbul ignore next */
        where[meta.root.discriminatorColumn] = children.length > 0 ? { $in: [meta.discriminatorValue, ...children.map(c => c.discriminatorValue)] } : meta.discriminatorValue;
        return where;
    }
    createPopulateWhere(cond, options) {
        const ret = {};
        const populateWhere = options.populateWhere ?? this.config.get('populateWhere');
        if (populateWhere === enums_1.PopulateHint.INFER) {
            utils_1.Utils.merge(ret, cond);
        }
        else if (typeof populateWhere === 'object') {
            utils_1.Utils.merge(ret, populateWhere);
        }
        return ret;
    }
    async getJoinedFilters(meta, cond, options) {
        const ret = {};
        if (options.populate) {
            for (const hint of options.populate) {
                const field = hint.field.split(':')[0];
                const prop = meta.properties[field];
                const joined = (prop.strategy || options.strategy || hint.strategy || this.config.get('loadStrategy')) === enums_1.LoadStrategy.JOINED && prop.kind !== enums_1.ReferenceKind.SCALAR;
                if (!joined && !hint.filter) {
                    continue;
                }
                const where = await this.applyFilters(prop.type, {}, options.filters ?? {}, 'read', { ...options, populate: hint.children });
                const where2 = await this.getJoinedFilters(prop.targetMeta, {}, { ...options, populate: hint.children, populateWhere: enums_1.PopulateHint.ALL });
                if (utils_1.Utils.hasObjectKeys(where)) {
                    ret[field] = ret[field] ? { $and: [where, ret[field]] } : where;
                }
                if (utils_1.Utils.hasObjectKeys(where2)) {
                    if (ret[field]) {
                        utils_1.Utils.merge(ret[field], where2);
                    }
                    else {
                        ret[field] = where2;
                    }
                }
            }
        }
        return ret;
    }
    /**
     * When filters are active on M:1 or 1:1 relations, we need to ref join them eagerly as they might affect the FK value.
     */
    async autoJoinRefsForFilters(meta, options) {
        if (!meta || !this.config.get('autoJoinRefsForFilters')) {
            return;
        }
        const props = meta.relations.filter(prop => {
            return !prop.object && [enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)
                && ((options.fields?.length ?? 0) === 0 || options.fields?.some(f => prop.name === f || prop.name.startsWith(`${String(f)}.`)));
        });
        const ret = options.populate;
        for (const prop of props) {
            const cond = await this.applyFilters(prop.type, {}, options.filters ?? {}, 'read', options);
            if (!utils_1.Utils.isEmpty(cond)) {
                const populated = options.populate.filter(({ field }) => field.split(':')[0] === prop.name);
                if (populated.length > 0) {
                    populated.forEach(hint => hint.filter = true);
                }
                else {
                    ret.push({ field: `${prop.name}:ref`, strategy: enums_1.LoadStrategy.JOINED, filter: true });
                }
            }
        }
    }
    /**
     * @internal
     */
    async applyFilters(entityName, where, options, type, findOptions) {
        const meta = this.metadata.find(entityName);
        const filters = [];
        const ret = [];
        if (!meta) {
            return where;
        }
        const active = new Set();
        const push = (source) => {
            const activeFilters = utils_1.QueryHelper
                .getActiveFilters(entityName, options, source)
                .filter(f => !active.has(f.name));
            filters.push(...activeFilters);
            activeFilters.forEach(f => active.add(f.name));
        };
        push(this.config.get('filters'));
        push(this.filters);
        push(meta.filters);
        if (filters.length === 0) {
            return where;
        }
        for (const filter of filters) {
            let cond;
            if (filter.cond instanceof Function) {
                // @ts-ignore
                const args = utils_1.Utils.isPlainObject(options[filter.name]) ? options[filter.name] : this.getContext().filterParams[filter.name];
                if (!args && filter.cond.length > 0 && filter.args !== false) {
                    throw new Error(`No arguments provided for filter '${filter.name}'`);
                }
                cond = await filter.cond(args, type, this, findOptions);
            }
            else {
                cond = filter.cond;
            }
            ret.push(utils_1.QueryHelper.processWhere({
                where: cond,
                entityName,
                metadata: this.metadata,
                platform: this.driver.getPlatform(),
                aliased: type === 'read',
            }));
        }
        const conds = [...ret, where].filter(c => utils_1.Utils.hasObjectKeys(c));
        return conds.length > 1 ? { $and: conds } : conds[0];
    }
    /**
     * Calls `em.find()` and `em.count()` with the same arguments (where applicable) and returns the results as tuple
     * where the first element is the array of entities, and the second is the count.
     */
    async findAndCount(entityName, where, options = {}) {
        const em = this.getContext(false);
        await em.tryFlush(entityName, options);
        options.flushMode = 'commit'; // do not try to auto flush again
        const copy = utils_1.Utils.copy(where);
        const [entities, count] = await Promise.all([
            em.find(entityName, where, options),
            em.count(entityName, copy, options),
        ]);
        return [entities, count];
    }
    /**
     * Calls `em.find()` and `em.count()` with the same arguments (where applicable) and returns the results as {@apilink Cursor} object.
     * Supports `before`, `after`, `first` and `last` options while disallowing `limit` and `offset`. Explicit `orderBy` option
     * is required.
     *
     * Use `first` and `after` for forward pagination, or `last` and `before` for backward pagination.
     *
     * - `first` and `last` are numbers and serve as an alternative to `offset`, those options are mutually exclusive, use only one at a time
     * - `before` and `after` specify the previous cursor value, it can be one of the:
     *     - `Cursor` instance
     *     - opaque string provided by `startCursor/endCursor` properties
     *     - POJO/entity instance
     *
     * ```ts
     * const currentCursor = await em.findByCursor(User, {}, {
     *   first: 10,
     *   after: previousCursor, // cursor instance
     *   orderBy: { id: 'desc' },
     * });
     *
     * // to fetch next page
     * const nextCursor = await em.findByCursor(User, {}, {
     *   first: 10,
     *   after: currentCursor.endCursor, // opaque string
     *   orderBy: { id: 'desc' },
     * });
     *
     * // to fetch next page
     * const nextCursor2 = await em.findByCursor(User, {}, {
     *   first: 10,
     *   after: { id: lastSeenId }, // entity-like POJO
     *   orderBy: { id: 'desc' },
     * });
     * ```
     *
     * The `Cursor` object provides the following interface:
     *
     * ```ts
     * Cursor<User> {
     *   items: [
     *     User { ... },
     *     User { ... },
     *     User { ... },
     *   ],
     *   totalCount: 50,
     *   startCursor: 'WzRd',
     *   endCursor: 'WzZd',
     *   hasPrevPage: true,
     *   hasNextPage: true,
     * }
     * ```
     */
    async findByCursor(entityName, where, options) {
        const em = this.getContext(false);
        entityName = utils_1.Utils.className(entityName);
        options.overfetch ??= true;
        if (utils_1.Utils.isEmpty(options.orderBy)) {
            throw new Error('Explicit `orderBy` option required');
        }
        const [entities, count] = await em.findAndCount(entityName, where, options);
        return new utils_1.Cursor(entities, count, options, this.metadata.get(entityName));
    }
    /**
     * Refreshes the persistent state of an entity from the database, overriding any local changes that have not yet been
     * persisted. Returns the same entity instance (same object reference), but re-hydrated. If the entity is no longer
     * in database, the method throws an error just like `em.findOneOrFail()` (and respects the same config options).
     */
    async refreshOrFail(entity, options = {}) {
        const ret = await this.refresh(entity, options);
        if (!ret) {
            options.failHandler ??= this.config.get('findOneOrFailHandler');
            const entityName = entity.constructor.name;
            const where = (0, entity_1.helper)(entity).getPrimaryKey();
            throw options.failHandler(entityName, where);
        }
        return ret;
    }
    /**
     * Refreshes the persistent state of an entity from the database, overriding any local changes that have not yet been
     * persisted. Returns the same entity instance (same object reference), but re-hydrated. If the entity is no longer
     * in database, the method returns `null`.
     */
    async refresh(entity, options = {}) {
        const fork = this.fork({ keepTransactionContext: true });
        const entityName = entity.constructor.name;
        const reloaded = await fork.findOne(entityName, entity, {
            schema: (0, entity_1.helper)(entity).__schema,
            ...options,
            flushMode: enums_1.FlushMode.COMMIT,
        });
        if (reloaded) {
            this.config.getHydrator(this.metadata).hydrate(entity, (0, entity_1.helper)(entity).__meta, (0, entity_1.helper)(reloaded).toPOJO(), this.getEntityFactory(), 'full');
        }
        else {
            this.getUnitOfWork().unsetIdentity(entity);
        }
        return reloaded ? entity : reloaded;
    }
    /**
     * Finds first entity matching your `where` query.
     */
    async findOne(entityName, where, options = {}) {
        if (options.disableIdentityMap ?? this.config.get('disableIdentityMap')) {
            const em = this.getContext(false);
            const fork = em.fork({ keepTransactionContext: true });
            const ret = await fork.findOne(entityName, where, { ...options, disableIdentityMap: false });
            fork.clear();
            return ret;
        }
        const em = this.getContext();
        entityName = utils_1.Utils.className(entityName);
        em.prepareOptions(options);
        let entity = em.unitOfWork.tryGetById(entityName, where, options.schema);
        // query for a not managed entity which is already in the identity map as it
        // was provided with a PK this entity does not exist in the db, there can't
        // be any relations to it, so no need to deal with the populate hint
        if (entity && !(0, entity_1.helper)(entity).__managed) {
            return entity;
        }
        await em.tryFlush(entityName, options);
        const meta = em.metadata.get(entityName);
        where = await em.processWhere(entityName, where, options, 'read');
        em.validator.validateEmptyWhere(where);
        em.checkLockRequirements(options.lockMode, meta);
        const isOptimisticLocking = !utils_1.Utils.isDefined(options.lockMode) || options.lockMode === enums_1.LockMode.OPTIMISTIC;
        if (entity && !em.shouldRefresh(meta, entity, options) && isOptimisticLocking) {
            return em.lockAndPopulate(meta, entity, where, options);
        }
        em.validator.validateParams(where);
        options.populate = await em.preparePopulate(entityName, options);
        const cacheKey = em.cacheKey(entityName, options, 'em.findOne', where);
        const cached = await em.tryCache(entityName, options.cache, cacheKey, options.refresh, true);
        if (cached?.data) {
            await em.entityLoader.populate(entityName, [cached.data], options.populate, {
                ...options,
                ...em.getPopulateWhere(where, options),
                convertCustomTypes: false,
                ignoreLazyScalarProperties: true,
                lookup: false,
            });
            return cached.data;
        }
        options = { ...options };
        // save the original hint value so we know it was infer/all
        options._populateWhere = options.populateWhere ?? this.config.get('populateWhere');
        options.populateWhere = this.createPopulateWhere({ ...where }, options);
        options.populateFilter = await this.getJoinedFilters(meta, { ...where }, options);
        const data = await em.driver.findOne(entityName, where, {
            ctx: em.transactionContext,
            ...options,
        });
        if (!data) {
            await em.storeCache(options.cache, cached, null);
            return null;
        }
        entity = em.entityFactory.create(entityName, data, {
            merge: true,
            refresh: options.refresh,
            schema: options.schema,
            convertCustomTypes: true,
        });
        await em.lockAndPopulate(meta, entity, where, options);
        await em.unitOfWork.dispatchOnLoadEvent();
        await em.storeCache(options.cache, cached, () => (0, entity_1.helper)(entity).toPOJO());
        return entity;
    }
    /**
     * Finds first entity matching your `where` query. If nothing found, it will throw an error.
     * If the `strict` option is specified and nothing is found or more than one matching entity is found, it will throw an error.
     * You can override the factory for creating this method via `options.failHandler` locally
     * or via `Configuration.findOneOrFailHandler` (`findExactlyOneOrFailHandler` when specifying `strict`) globally.
     */
    async findOneOrFail(entityName, where, options = {}) {
        let entity;
        let isStrictViolation = false;
        if (options.strict) {
            const ret = await this.find(entityName, where, { ...options, limit: 2 });
            isStrictViolation = ret.length !== 1;
            entity = ret[0];
        }
        else {
            entity = await this.findOne(entityName, where, options);
        }
        if (!entity || isStrictViolation) {
            const key = options.strict ? 'findExactlyOneOrFailHandler' : 'findOneOrFailHandler';
            options.failHandler ??= this.config.get(key);
            entityName = utils_1.Utils.className(entityName);
            /* istanbul ignore next */
            where = utils_1.Utils.isEntity(where) ? (0, entity_1.helper)(where).getPrimaryKey() : where;
            throw options.failHandler(entityName, where);
        }
        return entity;
    }
    /**
     * Creates or updates the entity, based on whether it is already present in the database.
     * This method performs an `insert on conflict merge` query ensuring the database is in sync, returning a managed
     * entity instance. The method accepts either `entityName` together with the entity `data`, or just entity instance.
     *
     * ```ts
     * // insert into "author" ("age", "email") values (33, 'foo@bar.com') on conflict ("email") do update set "age" = 41
     * const author = await em.upsert(Author, { email: 'foo@bar.com', age: 33 });
     * ```
     *
     * The entity data needs to contain either the primary key, or any other unique property. Let's consider the following example, where `Author.email` is a unique property:
     *
     * ```ts
     * // insert into "author" ("age", "email") values (33, 'foo@bar.com') on conflict ("email") do update set "age" = 41
     * // select "id" from "author" where "email" = 'foo@bar.com'
     * const author = await em.upsert(Author, { email: 'foo@bar.com', age: 33 });
     * ```
     *
     * Depending on the driver support, this will either use a returning query, or a separate select query, to fetch the primary key if it's missing from the `data`.
     *
     * If the entity is already present in current context, there won't be any queries - instead, the entity data will be assigned and an explicit `flush` will be required for those changes to be persisted.
     */
    async upsert(entityNameOrEntity, data, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        let entityName;
        let where;
        let entity = null;
        if (data === undefined) {
            entityName = entityNameOrEntity.constructor.name;
            data = entityNameOrEntity;
        }
        else {
            entityName = utils_1.Utils.className(entityNameOrEntity);
        }
        const meta = this.metadata.get(entityName);
        const convertCustomTypes = !utils_1.Utils.isEntity(data);
        if (utils_1.Utils.isEntity(data)) {
            entity = data;
            if ((0, entity_1.helper)(entity).__managed && (0, entity_1.helper)(entity).__em === em && !this.config.get('upsertManaged')) {
                em.entityFactory.mergeData(meta, entity, data, { initialized: true });
                return entity;
            }
            where = (0, entity_1.helper)(entity).getPrimaryKey();
            data = em.comparator.prepareEntity(entity);
        }
        else {
            data = utils_1.Utils.copy(utils_1.QueryHelper.processParams(data));
            where = utils_1.Utils.extractPK(data, meta);
            if (where && !this.config.get('upsertManaged')) {
                const exists = em.unitOfWork.getById(entityName, where, options.schema);
                if (exists) {
                    return em.assign(exists, data);
                }
            }
        }
        const unique = options.onConflictFields ?? meta.props.filter(p => p.unique).map(p => p.name);
        const propIndex = !utils_1.Utils.isRawSql(unique) && unique.findIndex(p => data[p] != null);
        if (options.onConflictFields || where == null) {
            if (propIndex !== false && propIndex >= 0) {
                where = { [unique[propIndex]]: data[unique[propIndex]] };
            }
            else if (meta.uniques.length > 0) {
                for (const u of meta.uniques) {
                    if (utils_1.Utils.asArray(u.properties).every(p => data[p] != null)) {
                        where = utils_1.Utils.asArray(u.properties).reduce((o, key) => {
                            o[key] = data[key];
                            return o;
                        }, {});
                        break;
                    }
                }
            }
        }
        data = utils_1.QueryHelper.processObjectParams(data);
        em.validator.validateParams(data, 'insert data');
        if (em.eventManager.hasListeners(enums_1.EventType.beforeUpsert, meta)) {
            await em.eventManager.dispatchEvent(enums_1.EventType.beforeUpsert, { entity: data, em, meta }, meta);
        }
        const ret = await em.driver.nativeUpdate(entityName, where, data, {
            ctx: em.transactionContext,
            upsert: true,
            convertCustomTypes,
            ...options,
        });
        em.unitOfWork.getChangeSetPersister().mapReturnedValues(entity, data, ret.row, meta, true);
        entity ??= em.entityFactory.create(entityName, data, {
            refresh: true,
            initialized: true,
            schema: options.schema,
        });
        const uniqueFields = options.onConflictFields ?? (utils_1.Utils.isPlainObject(where) ? Object.keys(where) : meta.primaryKeys);
        const returning = (0, utils_1.getOnConflictReturningFields)(meta, data, uniqueFields, options);
        if (options.onConflictAction === 'ignore' || !(0, entity_1.helper)(entity).hasPrimaryKey() || (returning.length > 0 && !(this.getPlatform().usesReturningStatement() && ret.row))) {
            const where = {};
            if (Array.isArray(uniqueFields)) {
                for (const prop of uniqueFields) {
                    if (data[prop] != null) {
                        where[prop] = data[prop];
                    }
                    else if (meta.primaryKeys.includes(prop) && ret.insertId != null) {
                        where[prop] = ret.insertId;
                    }
                }
            }
            const data2 = await this.driver.findOne(meta.className, where, {
                fields: returning,
                ctx: em.transactionContext,
                convertCustomTypes: true,
                connectionType: 'write',
            });
            em.getHydrator().hydrate(entity, meta, data2, em.entityFactory, 'full');
        }
        // recompute the data as there might be some values missing (e.g. those with db column defaults)
        const snapshot = this.comparator.prepareEntity(entity);
        em.unitOfWork.register(entity, snapshot, { refresh: true });
        if (em.eventManager.hasListeners(enums_1.EventType.afterUpsert, meta)) {
            await em.eventManager.dispatchEvent(enums_1.EventType.afterUpsert, { entity, em, meta }, meta);
        }
        return entity;
    }
    /**
     * Creates or updates the entity, based on whether it is already present in the database.
     * This method performs an `insert on conflict merge` query ensuring the database is in sync, returning a managed
     * entity instance. The method accepts either `entityName` together with the entity `data`, or just entity instance.
     *
     * ```ts
     * // insert into "author" ("age", "email") values (33, 'foo@bar.com') on conflict ("email") do update set "age" = 41
     * const authors = await em.upsertMany(Author, [{ email: 'foo@bar.com', age: 33 }, ...]);
     * ```
     *
     * The entity data needs to contain either the primary key, or any other unique property. Let's consider the following example, where `Author.email` is a unique property:
     *
     * ```ts
     * // insert into "author" ("age", "email") values (33, 'foo@bar.com'), (666, 'lol@lol.lol') on conflict ("email") do update set "age" = excluded."age"
     * // select "id" from "author" where "email" = 'foo@bar.com'
     * const author = await em.upsertMany(Author, [
     *   { email: 'foo@bar.com', age: 33 },
     *   { email: 'lol@lol.lol', age: 666 },
     * ]);
     * ```
     *
     * Depending on the driver support, this will either use a returning query, or a separate select query, to fetch the primary key if it's missing from the `data`.
     *
     * If the entity is already present in current context, there won't be any queries - instead, the entity data will be assigned and an explicit `flush` will be required for those changes to be persisted.
     */
    async upsertMany(entityNameOrEntity, data, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        let entityName;
        let propIndex;
        if (data === undefined) {
            entityName = entityNameOrEntity[0].constructor.name;
            data = entityNameOrEntity;
        }
        else {
            entityName = utils_1.Utils.className(entityNameOrEntity);
        }
        const batchSize = options.batchSize ?? this.config.get('batchSize');
        if (data.length > batchSize) {
            const ret = [];
            for (let i = 0; i < data.length; i += batchSize) {
                const chunk = data.slice(i, i + batchSize);
                ret.push(...await this.upsertMany(entityName, chunk, options));
            }
            return ret;
        }
        const meta = this.metadata.get(entityName);
        const convertCustomTypes = !utils_1.Utils.isEntity(data[0]);
        const allData = [];
        const allWhere = [];
        const entities = new Map();
        const entitiesByData = new Map();
        for (let i = 0; i < data.length; i++) {
            let row = data[i];
            let where;
            if (utils_1.Utils.isEntity(row)) {
                const entity = row;
                if ((0, entity_1.helper)(entity).__managed && (0, entity_1.helper)(entity).__em === em && !this.config.get('upsertManaged')) {
                    em.entityFactory.mergeData(meta, entity, row, { initialized: true });
                    entities.set(entity, row);
                    entitiesByData.set(row, entity);
                    continue;
                }
                where = (0, entity_1.helper)(entity).getPrimaryKey();
                row = em.comparator.prepareEntity(entity);
            }
            else {
                row = data[i] = utils_1.Utils.copy(utils_1.QueryHelper.processParams(row));
                where = utils_1.Utils.extractPK(row, meta);
                if (where && !this.config.get('upsertManaged')) {
                    const exists = em.unitOfWork.getById(entityName, where, options.schema);
                    if (exists) {
                        em.assign(exists, row);
                        entities.set(exists, row);
                        entitiesByData.set(row, exists);
                        continue;
                    }
                }
            }
            const unique = meta.props.filter(p => p.unique).map(p => p.name);
            propIndex = unique.findIndex(p => row[p] != null);
            if (options.onConflictFields || where == null) {
                if (propIndex >= 0) {
                    where = { [unique[propIndex]]: row[unique[propIndex]] };
                }
                else if (meta.uniques.length > 0) {
                    for (const u of meta.uniques) {
                        if (utils_1.Utils.asArray(u.properties).every(p => row[p] != null)) {
                            where = utils_1.Utils.asArray(u.properties).reduce((o, key) => {
                                o[key] = row[key];
                                return o;
                            }, {});
                            break;
                        }
                    }
                }
            }
            row = utils_1.QueryHelper.processObjectParams(row);
            where = utils_1.QueryHelper.processWhere({
                where,
                entityName,
                metadata: this.metadata,
                platform: this.getPlatform(),
            });
            em.validator.validateParams(row, 'insert data');
            allData.push(row);
            allWhere.push(where);
        }
        if (entities.size === data.length) {
            return [...entities.keys()];
        }
        if (em.eventManager.hasListeners(enums_1.EventType.beforeUpsert, meta)) {
            for (const dto of data) {
                const entity = entitiesByData.get(dto) ?? dto;
                await em.eventManager.dispatchEvent(enums_1.EventType.beforeUpsert, { entity, em, meta }, meta);
            }
        }
        const res = await em.driver.nativeUpdateMany(entityName, allWhere, allData, {
            ctx: em.transactionContext,
            upsert: true,
            convertCustomTypes,
            ...options,
        });
        entities.clear();
        entitiesByData.clear();
        const loadPK = new Map();
        allData.forEach((row, i) => {
            em.unitOfWork.getChangeSetPersister().mapReturnedValues(utils_1.Utils.isEntity(data[i]) ? data[i] : null, utils_1.Utils.isEntity(data[i]) ? {} : data[i], res.rows?.[i], meta, true);
            const entity = utils_1.Utils.isEntity(data[i]) ? data[i] : em.entityFactory.create(entityName, row, {
                refresh: true,
                initialized: true,
                schema: options.schema,
            });
            if (!(0, entity_1.helper)(entity).hasPrimaryKey()) {
                loadPK.set(entity, allWhere[i]);
            }
            entities.set(entity, row);
            entitiesByData.set(row, entity);
        });
        // skip if we got the PKs via returning statement (`rows`)
        const uniqueFields = options.onConflictFields ?? (utils_1.Utils.isPlainObject(allWhere[0]) ? Object.keys(allWhere[0]).flatMap(key => utils_1.Utils.splitPrimaryKeys(key)) : meta.primaryKeys);
        const returning = (0, utils_1.getOnConflictReturningFields)(meta, data[0], uniqueFields, options);
        const reloadFields = returning.length > 0 && !(this.getPlatform().usesReturningStatement() && res.rows?.length);
        if (options.onConflictAction === 'ignore' || (!res.rows?.length && loadPK.size > 0) || reloadFields) {
            const unique = meta.hydrateProps.filter(p => !p.lazy).map(p => p.name);
            const add = new Set(propIndex >= 0 ? [unique[propIndex]] : []);
            for (const cond of loadPK.values()) {
                utils_1.Utils.keys(cond).forEach(key => add.add(key));
            }
            const where = { $or: [] };
            if (Array.isArray(uniqueFields)) {
                data.forEach((item, idx) => {
                    where.$or[idx] = {};
                    uniqueFields.forEach(prop => {
                        where.$or[idx][prop] = item[prop];
                    });
                });
            }
            const data2 = await this.driver.find(meta.className, where, {
                fields: returning.concat(...add).concat(...(Array.isArray(uniqueFields) ? uniqueFields : [])),
                ctx: em.transactionContext,
                convertCustomTypes: true,
                connectionType: 'write',
            });
            for (const [entity, cond] of loadPK.entries()) {
                const row = data2.find(row => {
                    const tmp = {};
                    add.forEach(k => {
                        if (!meta.properties[k]?.primary) {
                            tmp[k] = row[k];
                        }
                    });
                    return this.comparator.matching(entityName, cond, tmp);
                });
                /* istanbul ignore next */
                if (!row) {
                    throw new Error(`Cannot find matching entity for condition ${JSON.stringify(cond)}`);
                }
                em.getHydrator().hydrate(entity, meta, row, em.entityFactory, 'full');
            }
            if (loadPK.size !== data2.length && Array.isArray(uniqueFields)) {
                for (let i = 0; i < allData.length; i++) {
                    const data = allData[i];
                    const cond = uniqueFields.reduce((a, b) => {
                        // @ts-ignore
                        a[b] = data[b];
                        return a;
                    }, {});
                    const entity = entitiesByData.get(data);
                    const row = data2.find(item => {
                        const pk = uniqueFields.reduce((a, b) => {
                            // @ts-ignore
                            a[b] = item[b];
                            return a;
                        }, {});
                        return this.comparator.matching(entityName, cond, pk);
                    });
                    /* istanbul ignore next */
                    if (!row) {
                        throw new Error(`Cannot find matching entity for condition ${JSON.stringify(cond)}`);
                    }
                    em.getHydrator().hydrate(entity, meta, row, em.entityFactory, 'full');
                }
            }
        }
        for (const [entity] of entities) {
            // recompute the data as there might be some values missing (e.g. those with db column defaults)
            const snapshot = this.comparator.prepareEntity(entity);
            em.unitOfWork.register(entity, snapshot, { refresh: true });
        }
        if (em.eventManager.hasListeners(enums_1.EventType.afterUpsert, meta)) {
            for (const [entity] of entities) {
                await em.eventManager.dispatchEvent(enums_1.EventType.afterUpsert, { entity, em, meta }, meta);
            }
        }
        return [...entities.keys()];
    }
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    async transactional(cb, options = {}) {
        const em = this.getContext(false);
        if (this.disableTransactions || em.disableTransactions) {
            return cb(em);
        }
        const fork = em.fork({
            clear: options.clear ?? false, // state will be merged once resolves
            flushMode: options.flushMode,
            cloneEventManager: true,
            disableTransactions: options.ignoreNestedTransactions,
            loggerContext: options.loggerContext,
        });
        options.ctx ??= em.transactionContext;
        const propagateToUpperContext = !em.global || this.config.get('allowGlobalContext');
        return utils_1.TransactionContext.create(fork, async () => {
            return fork.getConnection().transactional(async (trx) => {
                fork.transactionContext = trx;
                if (propagateToUpperContext) {
                    fork.eventManager.registerSubscriber({
                        afterFlush(args) {
                            args.uow.getChangeSets()
                                .filter(cs => [unit_of_work_1.ChangeSetType.DELETE, unit_of_work_1.ChangeSetType.DELETE_EARLY].includes(cs.type))
                                .forEach(cs => em.unitOfWork.unsetIdentity(cs.entity));
                        },
                    });
                }
                const ret = await cb(fork);
                await fork.flush();
                if (propagateToUpperContext) {
                    // ensure all entities from inner context are merged to the upper one
                    for (const entity of fork.unitOfWork.getIdentityMap()) {
                        em.unitOfWork.register(entity);
                        entity.__helper.__em = em;
                    }
                }
                return ret;
            }, { ...options, eventBroadcaster: new events_1.TransactionEventBroadcaster(fork, undefined, { topLevelTransaction: !options.ctx }) });
        });
    }
    /**
     * Starts new transaction bound to this EntityManager. Use `ctx` parameter to provide the parent when nesting transactions.
     */
    async begin(options = {}) {
        if (this.disableTransactions) {
            return;
        }
        const em = this.getContext(false);
        em.transactionContext = await em.getConnection('write').begin({
            ...options,
            eventBroadcaster: new events_1.TransactionEventBroadcaster(em, undefined, { topLevelTransaction: !options.ctx }),
        });
    }
    /**
     * Commits the transaction bound to this EntityManager. Flushes before doing the actual commit query.
     */
    async commit() {
        const em = this.getContext(false);
        if (this.disableTransactions) {
            await em.flush();
            return;
        }
        if (!em.transactionContext) {
            throw errors_1.ValidationError.transactionRequired();
        }
        await em.flush();
        await em.getConnection('write').commit(em.transactionContext, new events_1.TransactionEventBroadcaster(em));
        delete em.transactionContext;
    }
    /**
     * Rollbacks the transaction bound to this EntityManager.
     */
    async rollback() {
        if (this.disableTransactions) {
            return;
        }
        const em = this.getContext(false);
        if (!em.transactionContext) {
            throw errors_1.ValidationError.transactionRequired();
        }
        await em.getConnection('write').rollback(em.transactionContext, new events_1.TransactionEventBroadcaster(em));
        delete em.transactionContext;
        em.unitOfWork.clearActionsQueue();
    }
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    async lock(entity, lockMode, options = {}) {
        options = utils_1.Utils.isPlainObject(options) ? options : { lockVersion: options };
        await this.getUnitOfWork().lock(entity, { lockMode, ...options });
    }
    /**
     * Fires native insert query. Calling this has no side effects on the context (identity map).
     */
    async insert(entityNameOrEntity, data, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        let entityName;
        if (data === undefined) {
            entityName = entityNameOrEntity.constructor.name;
            data = entityNameOrEntity;
        }
        else {
            entityName = utils_1.Utils.className(entityNameOrEntity);
        }
        if (utils_1.Utils.isEntity(data)) {
            if (options.schema && (0, entity_1.helper)(data).getSchema() == null) {
                (0, entity_1.helper)(data).setSchema(options.schema);
            }
            if (!(0, entity_1.helper)(data).__managed) {
                // the entity might have been created via `em.create()`, which adds it to the persist stack automatically
                em.unitOfWork.getPersistStack().delete(data);
                // it can be also in the identity map if it had a PK value already
                em.unitOfWork.unsetIdentity(data);
            }
            const meta = (0, entity_1.helper)(data).__meta;
            const payload = em.comparator.prepareEntity(data);
            const cs = new unit_of_work_1.ChangeSet(data, unit_of_work_1.ChangeSetType.CREATE, payload, meta);
            await em.unitOfWork.getChangeSetPersister().executeInserts([cs], { ctx: em.transactionContext, ...options });
            return cs.getPrimaryKey();
        }
        data = utils_1.QueryHelper.processObjectParams(data);
        em.validator.validateParams(data, 'insert data');
        const res = await em.driver.nativeInsert(entityName, data, { ctx: em.transactionContext, ...options });
        return res.insertId;
    }
    /**
     * Fires native multi-insert query. Calling this has no side effects on the context (identity map).
     */
    async insertMany(entityNameOrEntities, data, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        let entityName;
        if (data === undefined) {
            entityName = entityNameOrEntities[0].constructor.name;
            data = entityNameOrEntities;
        }
        else {
            entityName = utils_1.Utils.className(entityNameOrEntities);
        }
        if (data.length === 0) {
            return [];
        }
        if (utils_1.Utils.isEntity(data[0])) {
            const meta = (0, entity_1.helper)(data[0]).__meta;
            const css = data.map(row => {
                if (options.schema && (0, entity_1.helper)(row).getSchema() == null) {
                    (0, entity_1.helper)(row).setSchema(options.schema);
                }
                if (!(0, entity_1.helper)(row).__managed) {
                    // the entity might have been created via `em.create()`, which adds it to the persist stack automatically
                    em.unitOfWork.getPersistStack().delete(row);
                    // it can be also in the identity map if it had a PK value already
                    em.unitOfWork.unsetIdentity(row);
                }
                const payload = em.comparator.prepareEntity(row);
                return new unit_of_work_1.ChangeSet(row, unit_of_work_1.ChangeSetType.CREATE, payload, meta);
            });
            await em.unitOfWork.getChangeSetPersister().executeInserts(css, { ctx: em.transactionContext, ...options });
            return css.map(cs => cs.getPrimaryKey());
        }
        data = data.map(row => utils_1.QueryHelper.processObjectParams(row));
        data.forEach(row => em.validator.validateParams(row, 'insert data'));
        const res = await em.driver.nativeInsertMany(entityName, data, { ctx: em.transactionContext, ...options });
        if (res.insertedIds) {
            return res.insertedIds;
        }
        return [res.insertId];
    }
    /**
     * Fires native update query. Calling this has no side effects on the context (identity map).
     */
    async nativeUpdate(entityName, where, data, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        entityName = utils_1.Utils.className(entityName);
        data = utils_1.QueryHelper.processObjectParams(data);
        where = await em.processWhere(entityName, where, { ...options, convertCustomTypes: false }, 'update');
        em.validator.validateParams(data, 'update data');
        em.validator.validateParams(where, 'update condition');
        const res = await em.driver.nativeUpdate(entityName, where, data, { ctx: em.transactionContext, ...options });
        return res.affectedRows;
    }
    /**
     * Fires native delete query. Calling this has no side effects on the context (identity map).
     */
    async nativeDelete(entityName, where, options = {}) {
        const em = this.getContext(false);
        em.prepareOptions(options);
        entityName = utils_1.Utils.className(entityName);
        where = await em.processWhere(entityName, where, options, 'delete');
        em.validator.validateParams(where, 'delete condition');
        const res = await em.driver.nativeDelete(entityName, where, { ctx: em.transactionContext, ...options });
        return res.affectedRows;
    }
    /**
     * Maps raw database result to an entity and merges it to this EntityManager.
     */
    map(entityName, result, options = {}) {
        entityName = utils_1.Utils.className(entityName);
        const meta = this.metadata.get(entityName);
        const data = this.driver.mapResult(result, meta);
        Object.keys(data).forEach(k => {
            const prop = meta.properties[k];
            if (prop && prop.kind === enums_1.ReferenceKind.SCALAR && enums_1.SCALAR_TYPES.includes(prop.runtimeType) && !prop.customType && (prop.setter || !prop.getter)) {
                data[k] = this.validator.validateProperty(prop, data[k], data);
            }
        });
        return this.merge(entityName, data, {
            convertCustomTypes: true,
            refresh: true, ...options,
        });
    }
    /**
     * Merges given entity to this EntityManager so it becomes managed. You can force refreshing of existing entities
     * via second parameter. By default, it will return already loaded entities without modifying them.
     */
    merge(entityName, data, options = {}) {
        const em = this.getContext();
        if (utils_1.Utils.isEntity(entityName)) {
            return em.merge(entityName.constructor.name, entityName, data);
        }
        options.schema ??= em._schema;
        entityName = utils_1.Utils.className(entityName);
        em.validator.validatePrimaryKey(data, em.metadata.get(entityName));
        let entity = em.unitOfWork.tryGetById(entityName, data, options.schema, false);
        if (entity && (0, entity_1.helper)(entity).__managed && (0, entity_1.helper)(entity).__initialized && !options.refresh) {
            return entity;
        }
        const meta = em.metadata.find(entityName);
        const childMeta = em.metadata.getByDiscriminatorColumn(meta, data);
        entity = utils_1.Utils.isEntity(data) ? data : em.entityFactory.create(entityName, data, { merge: true, ...options });
        em.validator.validate(entity, data, childMeta ?? meta);
        em.unitOfWork.merge(entity);
        return entity;
    }
    /**
     * Creates new instance of given entity and populates it with given data.
     * The entity constructor will be used unless you provide `{ managed: true }` in the `options` parameter.
     * The constructor will be given parameters based on the defined constructor of the entity. If the constructor
     * parameter matches a property name, its value will be extracted from `data`. If no matching property exists,
     * the whole `data` parameter will be passed. This means we can also define `constructor(data: Partial<T>)` and
     * `em.create()` will pass the data into it (unless we have a property named `data` too).
     *
     * The parameters are strictly checked, you need to provide all required properties. You can use `OptionalProps`
     * symbol to omit some properties from this check without making them optional. Alternatively, use `partial: true`
     * in the options to disable the strict checks for required properties. This option has no effect on runtime.
     *
     * The newly created entity will be automatically marked for persistence via `em.persist` unless you disable this
     * behavior, either locally via `persist: false` option, or globally via `persistOnCreate` ORM config option.
     */
    create(entityName, data, options = {}) {
        const em = this.getContext();
        options.schema ??= em._schema;
        const entity = em.entityFactory.create(entityName, data, {
            ...options,
            newEntity: !options.managed,
            merge: options.managed,
        });
        options.persist ??= em.config.get('persistOnCreate');
        if (options.persist) {
            em.persist(entity);
        }
        return entity;
    }
    /**
     * Shortcut for `wrap(entity).assign(data, { em })`
     */
    assign(entity, data, options = {}) {
        return entity_1.EntityAssigner.assign(entity, data, { em: this.getContext(), ...options });
    }
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference(entityName, id, options = {}) {
        options.schema ??= this.schema;
        options.convertCustomTypes ??= false;
        const meta = this.metadata.get(utils_1.Utils.className(entityName));
        if (utils_1.Utils.isPrimaryKey(id)) {
            if (meta.compositePK) {
                throw errors_1.ValidationError.invalidCompositeIdentifier(meta);
            }
            id = [id];
        }
        const entity = this.getEntityFactory().createReference(entityName, id, { merge: true, ...options });
        if (options.wrapped) {
            return entity_1.Reference.create(entity);
        }
        return entity;
    }
    /**
     * Returns total number of entities matching your `where` query.
     */
    async count(entityName, where = {}, options = {}) {
        const em = this.getContext(false);
        // Shallow copy options since the object will be modified when deleting orderBy
        options = {
            schema: em._schema,
            ...options,
        };
        entityName = utils_1.Utils.className(entityName);
        await em.tryFlush(entityName, options);
        where = await em.processWhere(entityName, where, options, 'read');
        options.populate = await em.preparePopulate(entityName, options);
        options = { ...options };
        // save the original hint value so we know it was infer/all
        const meta = em.metadata.find(entityName);
        options._populateWhere = options.populateWhere ?? this.config.get('populateWhere');
        options.populateWhere = this.createPopulateWhere({ ...where }, options);
        options.populateFilter = await this.getJoinedFilters(meta, { ...where }, options);
        em.validator.validateParams(where);
        delete options.orderBy;
        const cacheKey = em.cacheKey(entityName, options, 'em.count', where);
        const cached = await em.tryCache(entityName, options.cache, cacheKey);
        if (cached?.data) {
            return cached.data;
        }
        const count = await em.driver.count(entityName, where, { ctx: em.transactionContext, ...options });
        await em.storeCache(options.cache, cached, () => +count);
        return +count;
    }
    /**
     * Tells the EntityManager to make an instance managed and persistent.
     * The entity will be entered into the database at or before transaction commit or as a result of the flush operation.
     */
    persist(entity) {
        const em = this.getContext();
        if (utils_1.Utils.isEntity(entity)) {
            // do not cascade just yet, cascading of entities in persist stack is done when flushing
            em.unitOfWork.persist(entity, undefined, { cascade: false });
            return em;
        }
        const entities = utils_1.Utils.asArray(entity);
        for (const ent of entities) {
            if (!utils_1.Utils.isEntity(ent, true)) {
                /* istanbul ignore next */
                const meta = typeof ent === 'object' ? em.metadata.find(ent.constructor.name) : undefined;
                throw errors_1.ValidationError.notDiscoveredEntity(ent, meta);
            }
            // do not cascade just yet, cascading of entities in persist stack is done when flushing
            em.unitOfWork.persist(entity_1.Reference.unwrapReference(ent), undefined, { cascade: false });
        }
        return this;
    }
    /**
     * Persists your entity immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.persist(e).flush()`.
     */
    async persistAndFlush(entity) {
        await this.persist(entity).flush();
    }
    /**
     * Marks entity for removal.
     * A removed entity will be removed from the database at or before transaction commit or as a result of the flush operation.
     *
     * To remove entities by condition, use `em.nativeDelete()`.
     */
    remove(entity) {
        const em = this.getContext();
        if (utils_1.Utils.isEntity(entity)) {
            // do not cascade just yet, cascading of entities in persist stack is done when flushing
            em.unitOfWork.remove(entity, undefined, { cascade: false });
            return em;
        }
        const entities = utils_1.Utils.asArray(entity, true);
        for (const ent of entities) {
            if (!utils_1.Utils.isEntity(ent, true)) {
                throw new Error(`You need to pass entity instance or reference to 'em.remove()'. To remove entities by condition, use 'em.nativeDelete()'.`);
            }
            // do not cascade just yet, cascading of entities in remove stack is done when flushing
            em.unitOfWork.remove(entity_1.Reference.unwrapReference(ent), undefined, { cascade: false });
        }
        return em;
    }
    /**
     * Removes an entity instance immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.remove(e).flush()`
     */
    async removeAndFlush(entity) {
        await this.remove(entity).flush();
    }
    /**
     * Flushes all changes to objects that have been queued up to now to the database.
     * This effectively synchronizes the in-memory state of managed objects with the database.
     */
    async flush() {
        await this.getUnitOfWork().commit();
    }
    /**
     * @internal
     */
    async tryFlush(entityName, options) {
        const em = this.getContext();
        const flushMode = options.flushMode ?? em.flushMode ?? em.config.get('flushMode');
        entityName = utils_1.Utils.className(entityName);
        const meta = em.metadata.get(entityName);
        if (flushMode === enums_1.FlushMode.COMMIT) {
            return;
        }
        if (flushMode === enums_1.FlushMode.ALWAYS || em.getUnitOfWork().shouldAutoFlush(meta)) {
            await em.flush();
        }
    }
    /**
     * Clears the EntityManager. All entities that are currently managed by this EntityManager become detached.
     */
    clear() {
        this.getContext().unitOfWork.clear();
    }
    /**
     * Checks whether given property can be populated on the entity.
     */
    canPopulate(entityName, property) {
        entityName = utils_1.Utils.className(entityName);
        // eslint-disable-next-line prefer-const
        let [p, ...parts] = property.split('.');
        const meta = this.metadata.find(entityName);
        if (!meta) {
            return true;
        }
        if (p.includes(':')) {
            p = p.split(':', 2)[0];
        }
        const ret = p in meta.root.properties;
        if (!ret) {
            return !!this.metadata.find(property)?.pivotTable;
        }
        if (parts.length > 0) {
            return this.canPopulate((meta.root.properties)[p].type, parts.join('.'));
        }
        return ret;
    }
    /**
     * Loads specified relations in batch. This will execute one query for each relation, that will populate it on all the specified entities.
     */
    async populate(entities, populate, options = {}) {
        const arr = utils_1.Utils.asArray(entities);
        if (arr.length === 0) {
            return entities;
        }
        const em = this.getContext();
        em.prepareOptions(options);
        const entityName = arr[0].constructor.name;
        const preparedPopulate = await em.preparePopulate(entityName, { populate: populate }, options.validate);
        await em.entityLoader.populate(entityName, arr, preparedPopulate, options);
        return entities;
    }
    /**
     * Returns new EntityManager instance with its own identity map
     */
    fork(options = {}) {
        const em = options.disableContextResolution ? this : this.getContext(false);
        options.clear ??= true;
        options.useContext ??= false;
        options.freshEventManager ??= false;
        options.cloneEventManager ??= false;
        const eventManager = options.freshEventManager
            ? new events_1.EventManager(em.config.get('subscribers'))
            : options.cloneEventManager
                ? em.eventManager.clone()
                : em.eventManager;
        // we need to allow global context here as forking from global EM is fine
        const allowGlobalContext = em.config.get('allowGlobalContext');
        em.config.set('allowGlobalContext', true);
        const fork = new em.constructor(em.config, em.driver, em.metadata, options.useContext, eventManager);
        fork.setFlushMode(options.flushMode ?? em.flushMode);
        fork.disableTransactions = options.disableTransactions ?? this.disableTransactions ?? this.config.get('disableTransactions');
        em.config.set('allowGlobalContext', allowGlobalContext);
        if (options.keepTransactionContext) {
            fork.transactionContext = em.transactionContext;
        }
        fork.filters = { ...em.filters };
        fork.filterParams = utils_1.Utils.copy(em.filterParams);
        fork.loggerContext = utils_1.Utils.merge({}, em.loggerContext, options.loggerContext);
        fork._schema = options.schema ?? em._schema;
        if (!options.clear) {
            for (const entity of em.unitOfWork.getIdentityMap()) {
                fork.unitOfWork.register(entity);
            }
            for (const entity of em.unitOfWork.getOrphanRemoveStack()) {
                fork.unitOfWork.getOrphanRemoveStack().add(entity);
            }
        }
        return fork;
    }
    /**
     * Gets the UnitOfWork used by the EntityManager to coordinate operations.
     */
    getUnitOfWork(useContext = true) {
        if (!useContext) {
            return this.unitOfWork;
        }
        return this.getContext().unitOfWork;
    }
    /**
     * Gets the EntityFactory used by the EntityManager.
     */
    getEntityFactory() {
        return this.getContext().entityFactory;
    }
    /**
     * Gets the Hydrator used by the EntityManager.
     */
    getHydrator() {
        return this.config.getHydrator(this.getMetadata());
    }
    /**
     * Gets the EntityManager based on current transaction/request context.
     * @internal
     */
    getContext(validate = true) {
        if (!this.useContext) {
            return this;
        }
        let em = utils_1.TransactionContext.getEntityManager(this.name); // prefer the tx context
        if (em) {
            return em;
        }
        // no explicit tx started
        em = this.config.get('context')(this.name) ?? this;
        if (validate && !this.config.get('allowGlobalContext') && em.global) {
            throw errors_1.ValidationError.cannotUseGlobalContext();
        }
        return em;
    }
    getEventManager() {
        return this.eventManager;
    }
    /**
     * Checks whether this EntityManager is currently operating inside a database transaction.
     */
    isInTransaction() {
        return !!this.getContext(false).transactionContext;
    }
    /**
     * Gets the transaction context (driver dependent object used to make sure queries are executed on same connection).
     */
    getTransactionContext() {
        return this.getContext(false).transactionContext;
    }
    /**
     * Sets the transaction context.
     */
    setTransactionContext(ctx) {
        this.getContext(false).transactionContext = ctx;
    }
    /**
     * Resets the transaction context.
     */
    resetTransactionContext() {
        delete this.getContext(false).transactionContext;
    }
    /**
     * Gets the `MetadataStorage` (without parameters) or `EntityMetadata` instance when provided with the `entityName` parameter.
     */
    getMetadata(entityName) {
        if (entityName) {
            entityName = utils_1.Utils.className(entityName);
            return this.metadata.get(entityName);
        }
        return this.metadata;
    }
    /**
     * Gets the EntityComparator.
     */
    getComparator() {
        return this.comparator;
    }
    checkLockRequirements(mode, meta) {
        if (!mode) {
            return;
        }
        if (mode === enums_1.LockMode.OPTIMISTIC && !meta.versionProperty) {
            throw errors_1.OptimisticLockError.notVersioned(meta);
        }
        if ([enums_1.LockMode.PESSIMISTIC_READ, enums_1.LockMode.PESSIMISTIC_WRITE].includes(mode) && !this.isInTransaction()) {
            throw errors_1.ValidationError.transactionRequired();
        }
    }
    async lockAndPopulate(meta, entity, where, options) {
        if (!meta.virtual && options.lockMode === enums_1.LockMode.OPTIMISTIC) {
            await this.lock(entity, options.lockMode, {
                lockVersion: options.lockVersion,
                lockTableAliases: options.lockTableAliases,
            });
        }
        const preparedPopulate = await this.preparePopulate(meta.className, options);
        await this.entityLoader.populate(meta.className, [entity], preparedPopulate, {
            ...options,
            ...this.getPopulateWhere(where, options),
            orderBy: options.populateOrderBy ?? options.orderBy,
            convertCustomTypes: false,
            ignoreLazyScalarProperties: true,
            lookup: false,
        });
        return entity;
    }
    buildFields(fields) {
        return fields.reduce((ret, f) => {
            if (utils_1.Utils.isPlainObject(f)) {
                utils_1.Utils.keys(f).forEach(ff => ret.push(...this.buildFields(f[ff]).map(field => `${ff}.${field}`)));
            }
            else {
                ret.push(f);
            }
            return ret;
        }, []);
    }
    async preparePopulate(entityName, options, validate = true) {
        if (options.populate === false) {
            return [];
        }
        const meta = this.metadata.find(entityName);
        // infer populate hint if only `fields` are available
        if (!options.populate && options.fields) {
            // we need to prune the `populate` hint from to-one relations, as partially loading them does not require their population, we want just the FK
            const pruneToOneRelations = (meta, fields) => {
                const ret = [];
                for (let field of fields) {
                    if (field === enums_1.PopulatePath.ALL || field.startsWith(`${enums_1.PopulatePath.ALL}.`)) {
                        ret.push(...meta.props.filter(prop => prop.lazy || [enums_1.ReferenceKind.SCALAR, enums_1.ReferenceKind.EMBEDDED].includes(prop.kind)).map(prop => prop.name));
                        continue;
                    }
                    field = field.split(':')[0];
                    if (!field.includes('.') && ![enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(meta.properties[field].kind)) {
                        ret.push(field);
                        continue;
                    }
                    const parts = field.split('.');
                    const key = parts.shift();
                    if (parts.length === 0) {
                        continue;
                    }
                    const prop = meta.properties[key];
                    const inner = pruneToOneRelations(prop.targetMeta, [parts.join('.')]);
                    if (inner.length > 0) {
                        ret.push(...inner.map(c => `${key}.${c}`));
                    }
                }
                return utils_1.Utils.unique(ret);
            };
            options.populate = pruneToOneRelations(meta, this.buildFields(options.fields));
        }
        if (!options.populate) {
            const populate = this.entityLoader.normalizePopulate(entityName, [], options.strategy);
            await this.autoJoinRefsForFilters(meta, { ...options, populate });
            return populate;
        }
        if (typeof options.populate !== 'boolean') {
            options.populate = utils_1.Utils.asArray(options.populate).map(field => {
                /* istanbul ignore next */
                if (typeof field === 'boolean' || field === enums_1.PopulatePath.ALL) {
                    return [{ field: meta.primaryKeys[0], strategy: options.strategy, all: !!field }]; //
                }
                // will be handled in QueryBuilder when processing the where condition via CriteriaNode
                if (field === enums_1.PopulatePath.INFER) {
                    options.flags ??= [];
                    options.flags.push(enums_1.QueryFlag.INFER_POPULATE);
                    return [];
                }
                if (utils_1.Utils.isString(field)) {
                    return [{ field, strategy: options.strategy }];
                }
                return [field];
            }).flat();
        }
        const populate = this.entityLoader.normalizePopulate(entityName, options.populate, options.strategy);
        const invalid = populate.find(({ field }) => !this.canPopulate(entityName, field));
        if (validate && invalid) {
            throw errors_1.ValidationError.invalidPropertyName(entityName, invalid.field);
        }
        await this.autoJoinRefsForFilters(meta, { ...options, populate });
        return populate.map(field => {
            // force select-in strategy when populating all relations as otherwise we could cause infinite loops when self-referencing
            const all = field.all ?? (Array.isArray(options.populate) && options.populate.includes('*'));
            field.strategy = all ? enums_1.LoadStrategy.SELECT_IN : (options.strategy ?? field.strategy);
            return field;
        });
    }
    /**
     * when the entity is found in identity map, we check if it was partially loaded or we are trying to populate
     * some additional lazy properties, if so, we reload and merge the data from database
     */
    shouldRefresh(meta, entity, options) {
        if (!(0, entity_1.helper)(entity).__initialized || options.refresh) {
            return true;
        }
        let autoRefresh;
        if (options.fields) {
            autoRefresh = options.fields.some(field => !(0, entity_1.helper)(entity).__loadedProperties.has(field));
        }
        else {
            autoRefresh = meta.comparableProps.some(prop => {
                const inlineEmbedded = prop.kind === enums_1.ReferenceKind.EMBEDDED && !prop.object;
                return !inlineEmbedded && !prop.lazy && !(0, entity_1.helper)(entity).__loadedProperties.has(prop.name);
            });
        }
        if (autoRefresh) {
            return true;
        }
        if (Array.isArray(options.populate)) {
            return options.populate.some(field => !(0, entity_1.helper)(entity).__loadedProperties.has(field));
        }
        return !!options.populate;
    }
    prepareOptions(options) {
        if (!utils_1.Utils.isEmpty(options.fields) && !utils_1.Utils.isEmpty(options.exclude)) {
            throw new errors_1.ValidationError(`Cannot combine 'fields' and 'exclude' option.`);
        }
        options.schema ??= this._schema;
        options.logging = utils_1.Utils.merge({ id: this.id }, this.loggerContext, options.loggerContext, options.logging);
    }
    /**
     * @internal
     */
    cacheKey(entityName, options, method, where) {
        const { ...opts } = options;
        // ignore some irrelevant options, e.g. logger context can contain dynamic data for the same query
        for (const k of ['ctx', 'strategy', 'flushMode', 'logging', 'loggerContext']) {
            delete opts[k];
        }
        return [entityName, method, opts, where];
    }
    /**
     * @internal
     */
    async tryCache(entityName, config, key, refresh, merge) {
        config ??= this.config.get('resultCache').global;
        if (!config) {
            return undefined;
        }
        const em = this.getContext();
        const cacheKey = Array.isArray(config) ? config[0] : JSON.stringify(key);
        const cached = await em.resultCache.get(cacheKey);
        if (cached) {
            let data;
            if (Array.isArray(cached) && merge) {
                data = cached.map(item => em.entityFactory.create(entityName, item, {
                    merge: true,
                    convertCustomTypes: true,
                    refresh,
                    recomputeSnapshot: true,
                }));
            }
            else if (utils_1.Utils.isObject(cached) && merge) {
                data = em.entityFactory.create(entityName, cached, {
                    merge: true,
                    convertCustomTypes: true,
                    refresh,
                    recomputeSnapshot: true,
                });
            }
            else {
                data = cached;
            }
            await em.unitOfWork.dispatchOnLoadEvent();
            return { key: cacheKey, data };
        }
        return { key: cacheKey };
    }
    /**
     * @internal
     */
    async storeCache(config, key, data) {
        config ??= this.config.get('resultCache').global;
        if (config) {
            const em = this.getContext();
            const expiration = Array.isArray(config) ? config[1] : (utils_1.Utils.isNumber(config) ? config : undefined);
            await em.resultCache.set(key.key, data instanceof Function ? data() : data, '', expiration);
        }
    }
    /**
     * Clears result cache for given cache key. If we want to be able to call this method,
     * we need to set the cache key explicitly when storing the cache.
     *
     * ```ts
     * // set the cache key to 'book-cache-key', with expiration of 60s
     * const res = await em.find(Book, { ... }, { cache: ['book-cache-key', 60_000] });
     *
     * // clear the cache key by name
     * await em.clearCache('book-cache-key');
     * ```
     */
    async clearCache(cacheKey) {
        await this.getContext().resultCache.remove(cacheKey);
    }
    /**
     * Returns the default schema of this EntityManager. Respects the context, so global EM will give you the contextual schema
     * if executed inside request context handler.
     */
    get schema() {
        return this.getContext(false)._schema;
    }
    /**
     * Sets the default schema of this EntityManager. Respects the context, so global EM will set the contextual schema
     * if executed inside request context handler.
     */
    set schema(schema) {
        this.getContext(false)._schema = schema ?? undefined;
    }
    /**
     * Returns the ID of this EntityManager. Respects the context, so global EM will give you the contextual ID
     * if executed inside request context handler.
     */
    get id() {
        return this.getContext(false)._id;
    }
    /** @ignore */
    [node_util_1.inspect.custom]() {
        return `[EntityManager<${this.id}>]`;
    }
}
exports.EntityManager = EntityManager;
