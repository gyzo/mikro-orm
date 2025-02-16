"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilder = void 0;
const node_util_1 = require("node:util");
const core_1 = require("@mikro-orm/core");
const enums_1 = require("./enums");
const QueryBuilderHelper_1 = require("./QueryBuilderHelper");
const CriteriaNodeFactory_1 = require("./CriteriaNodeFactory");
/**
 * SQL query builder with fluent interface.
 *
 * ```ts
 * const qb = orm.em.createQueryBuilder(Publisher);
 * qb.select('*')
 *   .where({
 *     name: 'test 123',
 *     type: PublisherType.GLOBAL,
 *   })
 *   .orderBy({
 *     name: QueryOrder.DESC,
 *     type: QueryOrder.ASC,
 *   })
 *   .limit(2, 1);
 *
 * const publisher = await qb.getSingleResult();
 * ```
 */
class QueryBuilder {
    metadata;
    driver;
    context;
    connectionType;
    em;
    loggerContext;
    get mainAlias() {
        this.ensureFromClause();
        return this._mainAlias;
    }
    get alias() {
        return this.mainAlias.aliasName;
    }
    get helper() {
        this.ensureFromClause();
        return this._helper;
    }
    /** @internal */
    type;
    /** @internal */
    _fields;
    /** @internal */
    _populate = [];
    /** @internal */
    _populateWhere;
    /** @internal */
    _populateFilter;
    /** @internal */
    __populateWhere;
    /** @internal */
    _populateMap = {};
    /** @internal */
    rawFragments = new Set();
    aliasCounter = 0;
    flags = new Set([core_1.QueryFlag.CONVERT_CUSTOM_TYPES]);
    finalized = false;
    populateHintFinalized = false;
    _joins = {};
    _explicitAlias = false;
    _schema;
    _cond = {};
    _data;
    _orderBy = [];
    _groupBy = [];
    _having = {};
    _returning;
    _onConflict;
    _limit;
    _offset;
    _distinctOn;
    _joinedProps = new Map();
    _cache;
    _indexHint;
    _comments = [];
    _hintComments = [];
    flushMode;
    lockMode;
    lockTables;
    subQueries = {};
    _mainAlias;
    _aliases = {};
    _helper;
    _query;
    platform;
    knex;
    /**
     * @internal
     */
    constructor(entityName, metadata, driver, context, alias, connectionType, em, loggerContext) {
        this.metadata = metadata;
        this.driver = driver;
        this.context = context;
        this.connectionType = connectionType;
        this.em = em;
        this.loggerContext = loggerContext;
        this.platform = this.driver.getPlatform();
        this.knex = this.driver.getConnection(this.connectionType).getKnex();
        if (alias) {
            this.aliasCounter++;
            this._explicitAlias = true;
        }
        // @ts-expect-error union type does not match the overloaded method signature
        this.from(entityName, alias);
    }
    select(fields, distinct = false) {
        this.ensureNotFinalized();
        this._fields = core_1.Utils.asArray(fields);
        if (distinct) {
            this.flags.add(core_1.QueryFlag.DISTINCT);
        }
        return this.init(enums_1.QueryType.SELECT);
    }
    addSelect(fields) {
        this.ensureNotFinalized();
        if (this.type && this.type !== enums_1.QueryType.SELECT) {
            return this;
        }
        return this.select([...core_1.Utils.asArray(this._fields), ...core_1.Utils.asArray(fields)]);
    }
    distinct() {
        this.ensureNotFinalized();
        return this.setFlag(core_1.QueryFlag.DISTINCT);
    }
    /** postgres only */
    distinctOn(fields) {
        this.ensureNotFinalized();
        this._distinctOn = core_1.Utils.asArray(fields);
        return this;
    }
    insert(data) {
        return this.init(enums_1.QueryType.INSERT, data);
    }
    update(data) {
        return this.init(enums_1.QueryType.UPDATE, data);
    }
    delete(cond) {
        return this.init(enums_1.QueryType.DELETE, undefined, cond);
    }
    truncate() {
        return this.init(enums_1.QueryType.TRUNCATE);
    }
    count(field, distinct = false) {
        if (field) {
            this._fields = core_1.Utils.asArray(field);
        }
        else if (distinct || this.hasToManyJoins()) {
            this._fields = this.mainAlias.metadata.primaryKeys;
        }
        else {
            this._fields = [(0, core_1.raw)('*')];
        }
        if (distinct) {
            this.flags.add(core_1.QueryFlag.DISTINCT);
        }
        return this.init(enums_1.QueryType.COUNT);
    }
    join(field, alias, cond = {}, type = enums_1.JoinType.innerJoin, path, schema) {
        this.joinReference(field, alias, cond, type, path, schema);
        return this;
    }
    innerJoin(field, alias, cond = {}, schema) {
        this.join(field, alias, cond, enums_1.JoinType.innerJoin, undefined, schema);
        return this;
    }
    innerJoinLateral(field, alias, cond = {}, schema) {
        this.join(field, alias, cond, enums_1.JoinType.innerJoinLateral, undefined, schema);
        return this;
    }
    leftJoin(field, alias, cond = {}, schema) {
        return this.join(field, alias, cond, enums_1.JoinType.leftJoin, undefined, schema);
    }
    leftJoinLateral(field, alias, cond = {}, schema) {
        return this.join(field, alias, cond, enums_1.JoinType.leftJoinLateral, undefined, schema);
    }
    joinAndSelect(field, alias, cond = {}, type = enums_1.JoinType.innerJoin, path, fields, schema) {
        if (!this.type) {
            this.select('*');
        }
        let subquery;
        if (Array.isArray(field)) {
            subquery = field[1] instanceof QueryBuilder ? field[1].getFormattedQuery() : field[1].toString();
            field = field[0];
        }
        const prop = this.joinReference(field, alias, cond, type, path, schema, subquery);
        const [fromAlias] = this.helper.splitField(field);
        if (subquery) {
            this._joins[`${fromAlias}.${prop.name}#${alias}`].subquery = subquery;
        }
        const populate = this._joinedProps.get(fromAlias);
        const item = { field: prop.name, strategy: core_1.LoadStrategy.JOINED, children: [] };
        if (populate) {
            populate.children.push(item);
        }
        else { // root entity
            this._populate.push(item);
        }
        this._joinedProps.set(alias, item);
        this.addSelect(this.getFieldsForJoinedLoad(prop, alias, fields));
        return this;
    }
    leftJoinAndSelect(field, alias, cond = {}, fields, schema) {
        return this.joinAndSelect(field, alias, cond, enums_1.JoinType.leftJoin, undefined, fields, schema);
    }
    leftJoinLateralAndSelect(field, alias, cond = {}, fields, schema) {
        return this.joinAndSelect(field, alias, cond, enums_1.JoinType.leftJoinLateral, undefined, fields, schema);
    }
    innerJoinAndSelect(field, alias, cond = {}, fields, schema) {
        return this.joinAndSelect(field, alias, cond, enums_1.JoinType.innerJoin, undefined, fields, schema);
    }
    innerJoinLateralAndSelect(field, alias, cond = {}, fields, schema) {
        return this.joinAndSelect(field, alias, cond, enums_1.JoinType.innerJoinLateral, undefined, fields, schema);
    }
    getFieldsForJoinedLoad(prop, alias, explicitFields) {
        const fields = [];
        const populate = [];
        const joinKey = Object.keys(this._joins).find(join => join.endsWith(`#${alias}`));
        if (joinKey) {
            const path = this._joins[joinKey].path.split('.').slice(1);
            let children = this._populate;
            for (let i = 0; i < path.length; i++) {
                const child = children.filter(hint => {
                    const [propName] = hint.field.split(':', 2);
                    return propName === path[i];
                });
                children = child.flatMap(c => c.children);
            }
            populate.push(...children);
        }
        for (const p of prop.targetMeta.getPrimaryProps()) {
            fields.push(...this.driver.mapPropToFieldNames(this, p, alias));
        }
        if (explicitFields) {
            for (const field of explicitFields) {
                const [a, f] = this.helper.splitField(field);
                const p = prop.targetMeta.properties[f];
                if (p) {
                    fields.push(...this.driver.mapPropToFieldNames(this, p, alias));
                }
                else {
                    fields.push(`${a}.${f} as ${a}__${f}`);
                }
            }
        }
        prop.targetMeta.props
            .filter(prop => explicitFields
            ? explicitFields.includes(prop.name) || explicitFields.includes(`${alias}.${prop.name}`) || prop.primary
            : this.platform.shouldHaveColumn(prop, populate))
            .forEach(prop => fields.push(...this.driver.mapPropToFieldNames(this, prop, alias)));
        return fields;
    }
    /**
     * Apply filters to the QB where condition.
     */
    async applyFilters(filterOptions = {}) {
        /* istanbul ignore next */
        if (!this.em) {
            throw new Error('Cannot apply filters, this QueryBuilder is not attached to an EntityManager');
        }
        const cond = await this.em.applyFilters(this.mainAlias.entityName, {}, filterOptions, 'read');
        this.andWhere(cond);
    }
    withSubQuery(subQuery, alias) {
        this.ensureNotFinalized();
        this.subQueries[alias] = subQuery.toString();
        return this;
    }
    where(cond, params, operator) {
        this.ensureNotFinalized();
        const rawField = core_1.RawQueryFragment.getKnownFragment(cond);
        if (rawField) {
            const sql = this.platform.formatQuery(rawField.sql, rawField.params);
            cond = { [(0, core_1.raw)(`(${sql})`)]: core_1.Utils.asArray(params) };
            operator ??= '$and';
        }
        else if (core_1.Utils.isString(cond)) {
            cond = { [(0, core_1.raw)(`(${cond})`, core_1.Utils.asArray(params))]: [] };
            operator ??= '$and';
        }
        else {
            cond = core_1.QueryHelper.processWhere({
                where: cond,
                entityName: this.mainAlias.entityName,
                metadata: this.metadata,
                platform: this.platform,
                aliasMap: this.getAliasMap(),
                aliased: !this.type || [enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(this.type),
                convertCustomTypes: this.flags.has(core_1.QueryFlag.CONVERT_CUSTOM_TYPES),
            });
        }
        const op = operator || params;
        const topLevel = !op || !core_1.Utils.hasObjectKeys(this._cond);
        const criteriaNode = CriteriaNodeFactory_1.CriteriaNodeFactory.createNode(this.metadata, this.mainAlias.entityName, cond);
        const ignoreBranching = this.__populateWhere === 'infer';
        if ([enums_1.QueryType.UPDATE, enums_1.QueryType.DELETE].includes(this.type) && criteriaNode.willAutoJoin(this, undefined, { ignoreBranching })) {
            // use sub-query to support joining
            this.setFlag(this.type === enums_1.QueryType.UPDATE ? core_1.QueryFlag.UPDATE_SUB_QUERY : core_1.QueryFlag.DELETE_SUB_QUERY);
            this.select(this.mainAlias.metadata.primaryKeys, true);
        }
        if (topLevel) {
            this._cond = criteriaNode.process(this, { ignoreBranching });
        }
        else if (Array.isArray(this._cond[op])) {
            this._cond[op].push(criteriaNode.process(this, { ignoreBranching }));
        }
        else {
            const cond1 = [this._cond, criteriaNode.process(this, { ignoreBranching })];
            this._cond = { [op]: cond1 };
        }
        if (this._onConflict) {
            this._onConflict[this._onConflict.length - 1].where = this.helper.processOnConflictCondition(this._cond, this._schema);
            this._cond = {};
        }
        return this;
    }
    andWhere(cond, params) {
        return this.where(cond, params, '$and');
    }
    orWhere(cond, params) {
        return this.where(cond, params, '$or');
    }
    orderBy(orderBy) {
        this.ensureNotFinalized();
        this._orderBy = [];
        core_1.Utils.asArray(orderBy).forEach(o => {
            const processed = core_1.QueryHelper.processWhere({
                where: o,
                entityName: this.mainAlias.entityName,
                metadata: this.metadata,
                platform: this.platform,
                aliasMap: this.getAliasMap(),
                aliased: !this.type || [enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(this.type),
                convertCustomTypes: false,
                type: 'orderBy',
            });
            this._orderBy.push(CriteriaNodeFactory_1.CriteriaNodeFactory.createNode(this.metadata, this.mainAlias.entityName, processed).process(this, { matchPopulateJoins: true }));
        });
        return this;
    }
    groupBy(fields) {
        this.ensureNotFinalized();
        this._groupBy = core_1.Utils.asArray(fields);
        return this;
    }
    having(cond = {}, params, operator) {
        this.ensureNotFinalized();
        if (core_1.Utils.isString(cond)) {
            cond = { [(0, core_1.raw)(`(${cond})`, params)]: [] };
        }
        cond = CriteriaNodeFactory_1.CriteriaNodeFactory.createNode(this.metadata, this.mainAlias.entityName, cond).process(this);
        if (!this._having || !operator) {
            this._having = cond;
        }
        else {
            const cond1 = [this._having, cond];
            this._having = { [operator]: cond1 };
        }
        return this;
    }
    andHaving(cond, params) {
        return this.having(cond, params, '$and');
    }
    orHaving(cond, params) {
        return this.having(cond, params, '$or');
    }
    onConflict(fields = []) {
        const meta = this.mainAlias.metadata;
        this.ensureNotFinalized();
        this._onConflict ??= [];
        this._onConflict.push({
            fields: core_1.Utils.isRawSql(fields)
                ? fields
                : core_1.Utils.asArray(fields).flatMap(f => {
                    const key = f.toString();
                    /* istanbul ignore next */
                    return meta.properties[key]?.fieldNames ?? [key];
                }),
        });
        return this;
    }
    ignore() {
        if (!this._onConflict) {
            throw new Error('You need to call `qb.onConflict()` first to use `qb.ignore()`');
        }
        this._onConflict[this._onConflict.length - 1].ignore = true;
        return this;
    }
    merge(data) {
        if (!this._onConflict) {
            throw new Error('You need to call `qb.onConflict()` first to use `qb.merge()`');
        }
        if (Array.isArray(data) && data.length === 0) {
            return this.ignore();
        }
        this._onConflict[this._onConflict.length - 1].merge = data;
        return this;
    }
    returning(fields) {
        this._returning = core_1.Utils.asArray(fields);
        return this;
    }
    /**
     * @internal
     */
    populate(populate, populateWhere, populateFilter) {
        this.ensureNotFinalized();
        this._populate = populate;
        this._populateWhere = populateWhere;
        this._populateFilter = populateFilter;
        return this;
    }
    limit(limit, offset = 0) {
        this.ensureNotFinalized();
        this._limit = limit;
        if (offset) {
            this.offset(offset);
        }
        return this;
    }
    offset(offset) {
        this.ensureNotFinalized();
        this._offset = offset;
        return this;
    }
    withSchema(schema) {
        this.ensureNotFinalized();
        this._schema = schema;
        return this;
    }
    setLockMode(mode, tables) {
        this.ensureNotFinalized();
        if (mode != null && mode !== core_1.LockMode.OPTIMISTIC && !this.context) {
            throw core_1.ValidationError.transactionRequired();
        }
        this.lockMode = mode;
        this.lockTables = tables;
        return this;
    }
    setFlushMode(flushMode) {
        this.ensureNotFinalized();
        this.flushMode = flushMode;
        return this;
    }
    setFlag(flag) {
        this.ensureNotFinalized();
        this.flags.add(flag);
        return this;
    }
    unsetFlag(flag) {
        this.ensureNotFinalized();
        this.flags.delete(flag);
        return this;
    }
    hasFlag(flag) {
        return this.flags.has(flag);
    }
    cache(config = true) {
        this.ensureNotFinalized();
        this._cache = config;
        return this;
    }
    /**
     * Adds index hint to the FROM clause.
     */
    indexHint(sql) {
        this.ensureNotFinalized();
        this._indexHint = sql;
        return this;
    }
    /**
     * Prepend comment to the sql query using the syntax `/* ... *&#8205;/`. Some characters are forbidden such as `/*, *&#8205;/` and `?`.
     */
    comment(comment) {
        this.ensureNotFinalized();
        this._comments.push(...core_1.Utils.asArray(comment));
        return this;
    }
    /**
     * Add hints to the query using comment-like syntax `/*+ ... *&#8205;/`. MySQL and Oracle use this syntax for optimizer hints.
     * Also various DB proxies and routers use this syntax to pass hints to alter their behavior. In other dialects the hints
     * are ignored as simple comments.
     */
    hintComment(comment) {
        this.ensureNotFinalized();
        this._hintComments.push(...core_1.Utils.asArray(comment));
        return this;
    }
    from(target, aliasName) {
        this.ensureNotFinalized();
        if (target instanceof QueryBuilder) {
            this.fromSubQuery(target, aliasName);
        }
        else {
            const entityName = core_1.Utils.className(target);
            if (aliasName && this._mainAlias && entityName !== this._mainAlias.aliasName) {
                throw new Error(`Cannot override the alias to '${aliasName}' since a query already contains references to '${this._mainAlias.aliasName}'`);
            }
            this.fromEntityName(entityName, aliasName);
        }
        return this;
    }
    getKnexQuery(processVirtualEntity = true) {
        if (this._query?.qb) {
            return this._query.qb;
        }
        this._query = {};
        this.finalize();
        const qb = this.getQueryBase(processVirtualEntity);
        const type = this.type ?? enums_1.QueryType.SELECT;
        qb.__raw = true; // tag it as there is now way to check via `instanceof`
        core_1.Utils.runIfNotEmpty(() => this.helper.appendQueryCondition(type, this._cond, qb), this._cond && !this._onConflict);
        core_1.Utils.runIfNotEmpty(() => qb.groupBy(this.prepareFields(this._groupBy, 'groupBy')), this._groupBy);
        core_1.Utils.runIfNotEmpty(() => this.helper.appendQueryCondition(type, this._having, qb, undefined, 'having'), this._having);
        core_1.Utils.runIfNotEmpty(() => {
            const queryOrder = this.helper.getQueryOrder(type, this._orderBy, this._populateMap);
            if (queryOrder.length > 0) {
                const sql = core_1.Utils.unique(queryOrder).join(', ');
                qb.orderByRaw(sql);
                return;
            }
        }, this._orderBy);
        core_1.Utils.runIfNotEmpty(() => qb.limit(this._limit), this._limit != null);
        core_1.Utils.runIfNotEmpty(() => qb.offset(this._offset), this._offset);
        core_1.Utils.runIfNotEmpty(() => this._comments.forEach(comment => qb.comment(comment)), this._comments);
        core_1.Utils.runIfNotEmpty(() => this._hintComments.forEach(comment => qb.hintComment(comment)), this._hintComments);
        core_1.Utils.runIfNotEmpty(() => this.helper.appendOnConflictClause(enums_1.QueryType.UPSERT, this._onConflict, qb), this._onConflict);
        if (this.type === enums_1.QueryType.TRUNCATE && this.platform.usesCascadeStatement()) {
            return this._query.qb = this.knex.raw(qb.toSQL().toNative().sql + ' cascade');
        }
        if (this.lockMode) {
            this.helper.getLockSQL(qb, this.lockMode, this.lockTables);
        }
        this.helper.finalize(type, qb, this.mainAlias.metadata, this._data, this._returning);
        this.clearRawFragmentsCache();
        return this._query.qb = qb;
    }
    /**
     * @internal
     */
    clearRawFragmentsCache() {
        this.rawFragments.forEach(key => core_1.RawQueryFragment.remove(key));
        this.rawFragments.clear();
    }
    /**
     * Returns the query with parameters as wildcards.
     */
    getQuery() {
        return this.toQuery().sql;
    }
    toQuery() {
        if (this._query?.sql) {
            return { sql: this._query.sql, _sql: this._query._sql, params: this._query.params };
        }
        const sql = this.getKnexQuery().toSQL();
        const query = sql.toNative();
        this._query.sql = query.sql;
        this._query._sql = sql;
        this._query.params = query.bindings ?? [];
        return { sql: this._query.sql, _sql: this._query._sql, params: this._query.params };
    }
    /**
     * Returns the list of all parameters for this query.
     */
    getParams() {
        return this.toQuery().params;
    }
    /**
     * Returns raw interpolated query string with all the parameters inlined.
     */
    getFormattedQuery() {
        const query = this.toQuery()._sql;
        return this.platform.formatQuery(query.sql, query.bindings);
    }
    /**
     * @internal
     */
    getAliasForJoinPath(path, options) {
        if (!path || path === this.mainAlias.entityName) {
            return this.mainAlias.aliasName;
        }
        const join = typeof path === 'string' ? this.getJoinForPath(path, options) : path;
        if (join?.path?.endsWith('[pivot]')) {
            return join.alias;
        }
        return join?.inverseAlias || join?.alias;
    }
    /**
     * @internal
     */
    getJoinForPath(path, options) {
        const joins = Object.values(this._joins);
        if (joins.length === 0) {
            return undefined;
        }
        let join = joins.find(j => j.path === path);
        if (options?.preferNoBranch) {
            join = joins.find(j => {
                return j.path?.replace(/\[\d+]|\[populate]/g, '') === path.replace(/\[\d+]|\[populate]/g, '');
            });
        }
        if (!join && options?.ignoreBranching) {
            join = joins.find(j => {
                return j.path?.replace(/\[\d+]/g, '') === path.replace(/\[\d+]/g, '');
            });
        }
        if (!join && options?.matchPopulateJoins && options?.ignoreBranching) {
            join = joins.find(j => {
                return j.path?.replace(/\[\d+]|\[populate]/g, '') === path.replace(/\[\d+]|\[populate]/g, '');
            });
        }
        if (!join && options?.matchPopulateJoins) {
            join = joins.find(j => {
                return j.path?.replace(/\[populate]/g, '') === path.replace(/\[populate]/g, '');
            });
        }
        return join;
    }
    /**
     * @internal
     */
    getNextAlias(entityName = 'e') {
        return this.driver.config.getNamingStrategy().aliasName(entityName, this.aliasCounter++);
    }
    /**
     * @internal
     */
    getAliasMap() {
        return Object.fromEntries(Object.entries(this._aliases).map(([key, value]) => [key, value.entityName]));
    }
    /**
     * Executes this QB and returns the raw results, mapped to the property names (unless disabled via last parameter).
     * Use `method` to specify what kind of result you want to get (array/single/meta).
     */
    async execute(method, options) {
        options = typeof options === 'boolean' ? { mapResults: options } : (options ?? {});
        options.mergeResults ??= true;
        options.mapResults ??= true;
        const isRunType = [enums_1.QueryType.INSERT, enums_1.QueryType.UPDATE, enums_1.QueryType.DELETE, enums_1.QueryType.TRUNCATE].includes(this.type ?? enums_1.QueryType.SELECT);
        method ??= isRunType ? 'run' : 'all';
        if (!this.connectionType && isRunType) {
            this.connectionType = 'write';
        }
        if (!this.finalized && method === 'get' && this.type === enums_1.QueryType.SELECT) {
            this.limit(1);
        }
        const query = this.toQuery()._sql;
        const cached = await this.em?.tryCache(this.mainAlias.entityName, this._cache, ['qb.execute', query.sql, query.bindings, method]);
        if (cached?.data) {
            return cached.data;
        }
        const write = method === 'run' || !this.platform.getConfig().get('preferReadReplicas');
        const type = this.connectionType || (write ? 'write' : 'read');
        const loggerContext = { id: this.em?.id, ...this.loggerContext };
        const res = await this.driver.getConnection(type).execute(query.sql, query.bindings, method, this.context, loggerContext);
        const meta = this.mainAlias.metadata;
        if (!options.mapResults || !meta) {
            await this.em?.storeCache(this._cache, cached, res);
            return res;
        }
        if (method === 'run') {
            return res;
        }
        const joinedProps = this.driver.joinedProps(meta, this._populate);
        let mapped;
        if (Array.isArray(res)) {
            const map = {};
            mapped = res.map(r => this.driver.mapResult(r, meta, this._populate, this, map));
            if (options.mergeResults && joinedProps.length > 0) {
                mapped = this.driver.mergeJoinedResult(mapped, this.mainAlias.metadata, joinedProps);
            }
        }
        else {
            mapped = [this.driver.mapResult(res, meta, joinedProps, this)];
        }
        if (method === 'get') {
            await this.em?.storeCache(this._cache, cached, mapped[0]);
            return mapped[0];
        }
        await this.em?.storeCache(this._cache, cached, mapped);
        return mapped;
    }
    /**
     * Alias for `qb.getResultList()`
     */
    async getResult() {
        return this.getResultList();
    }
    /**
     * Executes the query, returning array of results
     */
    async getResultList(limit) {
        await this.em.tryFlush(this.mainAlias.entityName, { flushMode: this.flushMode });
        const res = await this.execute('all', true);
        const entities = [];
        function propagatePopulateHint(entity, hint) {
            (0, core_1.helper)(entity).__serializationContext.populate = hint.concat((0, core_1.helper)(entity).__serializationContext.populate ?? []);
            hint.forEach(hint => {
                const [propName] = hint.field.split(':', 2);
                const value = core_1.Reference.unwrapReference(entity[propName]);
                if (core_1.Utils.isEntity(value)) {
                    propagatePopulateHint(value, hint.children ?? []);
                }
                else if (core_1.Utils.isCollection(value)) {
                    value.populated();
                    value.getItems(false).forEach(item => propagatePopulateHint(item, hint.children ?? []));
                }
            });
        }
        for (const r of res) {
            const entity = this.em.map(this.mainAlias.entityName, r, { schema: this._schema });
            propagatePopulateHint(entity, this._populate);
            entities.push(entity);
            if (limit != null && --limit === 0) {
                break;
            }
        }
        return core_1.Utils.unique(entities);
    }
    /**
     * Executes the query, returning the first result or null
     */
    async getSingleResult() {
        if (!this.finalized) {
            this.limit(1);
        }
        const [res] = await this.getResultList(1);
        return res || null;
    }
    /**
     * Executes count query (without offset and limit), returning total count of results
     */
    async getCount(field, distinct) {
        let res;
        if (this.type === enums_1.QueryType.COUNT) {
            res = await this.execute('get', false);
        }
        else {
            const qb = this.type === undefined ? this : this.clone();
            qb.processPopulateHint(); // needs to happen sooner so `qb.hasToManyJoins()` reports correctly
            qb.count(field, distinct ?? qb.hasToManyJoins()).limit(undefined).offset(undefined).orderBy([]);
            res = await qb.execute('get', false);
        }
        return res ? +res.count : 0;
    }
    /**
     * Executes the query, returning both array of results and total count query (without offset and limit).
     */
    async getResultAndCount() {
        return [
            await this.clone().getResultList(),
            await this.clone().getCount(),
        ];
    }
    /**
     * Provides promise-like interface so we can await the QB instance.
     */
    then(onfulfilled, onrejected) {
        let type = this.type ?? enums_1.QueryType.SELECT;
        if (this.flags.has(core_1.QueryFlag.UPDATE_SUB_QUERY) || this.flags.has(core_1.QueryFlag.DELETE_SUB_QUERY)) {
            type = enums_1.QueryType.UPDATE;
        }
        switch (type) {
            case enums_1.QueryType.INSERT:
            case enums_1.QueryType.UPDATE:
            case enums_1.QueryType.DELETE:
            case enums_1.QueryType.UPSERT:
            case enums_1.QueryType.TRUNCATE:
                return this.execute('run').then(onfulfilled, onrejected);
            case enums_1.QueryType.COUNT:
                return this.getCount().then(onfulfilled, onrejected);
            case enums_1.QueryType.SELECT: return this.getResultList().then(onfulfilled, onrejected);
        }
    }
    /**
     * Returns knex instance with sub-query aliased with given alias.
     * You can provide `EntityName.propName` as alias, then the field name will be used based on the metadata
     */
    as(alias) {
        const qb = this.getKnexQuery();
        if (alias.includes('.')) {
            const [a, f] = alias.split('.');
            const meta = this.metadata.find(a);
            /* istanbul ignore next */
            alias = meta?.properties[f]?.fieldNames[0] ?? alias;
        }
        const ret = qb.as(alias);
        // tag the instance, so it is possible to detect it easily
        Object.defineProperty(ret, '__as', { enumerable: false, value: alias });
        return ret;
    }
    clone(reset) {
        const qb = new QueryBuilder(this.mainAlias.entityName, this.metadata, this.driver, this.context, this.mainAlias.aliasName, this.connectionType, this.em);
        if (reset === true) {
            return qb;
        }
        reset = reset || [];
        // clone array/object properties
        const properties = [
            'flags', '_populate', '_populateWhere', '_populateFilter', '__populateWhere', '_populateMap', '_joins', '_joinedProps', '_cond', '_data', '_orderBy',
            '_schema', '_indexHint', '_cache', 'subQueries', 'lockMode', 'lockTables', '_groupBy', '_having', '_returning',
            '_comments', '_hintComments', 'rawFragments', 'aliasCounter',
        ];
        core_1.RawQueryFragment.cloneRegistry = this.rawFragments;
        for (const prop of Object.keys(this)) {
            if (reset.includes(prop) || prop === '_helper') {
                continue;
            }
            qb[prop] = properties.includes(prop) ? core_1.Utils.copy(this[prop]) : this[prop];
        }
        delete core_1.RawQueryFragment.cloneRegistry;
        /* istanbul ignore else */
        if (this._fields && !reset.includes('_fields')) {
            qb._fields = [...this._fields];
        }
        qb._aliases = { ...this._aliases };
        qb._helper.aliasMap = qb._aliases;
        qb.finalized = false;
        return qb;
    }
    getKnex(processVirtualEntity = true) {
        const qb = this.knex.queryBuilder();
        const { subQuery, aliasName, entityName, metadata } = this.mainAlias;
        const ref = subQuery ? subQuery : this.knex.ref(this.helper.getTableName(entityName));
        if (this.finalized && (this._explicitAlias || this.helper.isTableNameAliasRequired(this.type))) {
            ref.as(aliasName);
        }
        const schema = this.getSchema(this.mainAlias);
        if (schema) {
            ref.withSchema(schema);
        }
        if (metadata?.virtual && processVirtualEntity) {
            qb.fromRaw(this.fromVirtual(metadata));
        }
        else {
            qb.from(ref);
        }
        if (this.context) {
            qb.transacting(this.context);
        }
        return qb;
    }
    /**
     * Sets logger context for this query builder.
     */
    setLoggerContext(context) {
        this.loggerContext = context;
    }
    /**
     * Gets logger context for this query builder.
     */
    getLoggerContext() {
        this.loggerContext ??= {};
        return this.loggerContext;
    }
    fromVirtual(meta) {
        if (typeof meta.expression === 'string') {
            return `(${meta.expression}) as ${this.platform.quoteIdentifier(this.alias)}`;
        }
        const res = meta.expression(this.em, this._cond, {});
        if (typeof res === 'string') {
            return `(${res}) as ${this.platform.quoteIdentifier(this.alias)}`;
        }
        if (res instanceof QueryBuilder) {
            return `(${res.getFormattedQuery()}) as ${this.platform.quoteIdentifier(this.alias)}`;
        }
        if (core_1.Utils.isObject(res)) {
            const { sql, bindings } = res.toSQL();
            const query = this.platform.formatQuery(sql, bindings);
            return `(${query}) as ${this.platform.quoteIdentifier(this.alias)}`;
        }
        /* istanbul ignore next */
        return res;
    }
    joinReference(field, alias, cond, type, path, schema, subquery) {
        this.ensureNotFinalized();
        if (typeof field === 'object') {
            const prop = {
                name: '__subquery__',
                kind: core_1.ReferenceKind.MANY_TO_ONE,
            };
            if (field instanceof QueryBuilder) {
                prop.type = field.mainAlias.entityName;
                prop.targetMeta = field.mainAlias.metadata;
                field = field.getKnexQuery();
            }
            this._joins[`${this.alias}.${prop.name}#${alias}`] = {
                prop,
                alias,
                type,
                cond,
                schema,
                subquery: field.toString(),
                ownerAlias: this.alias,
            };
            return prop;
        }
        if (!subquery && type.includes('lateral')) {
            throw new Error(`Lateral join can be used only with a sub-query.`);
        }
        const [fromAlias, fromField] = this.helper.splitField(field);
        const q = (str) => `'${str}'`;
        if (!this._aliases[fromAlias]) {
            throw new Error(`Trying to join ${q(fromField)} with alias ${q(fromAlias)}, but ${q(fromAlias)} is not a known alias. Available aliases are: ${Object.keys(this._aliases).map(q).join(', ')}.`);
        }
        const entityName = this._aliases[fromAlias].entityName;
        const meta = this.metadata.get(entityName);
        const prop = meta.properties[fromField];
        if (!prop) {
            throw new Error(`Trying to join ${q(field)}, but ${q(fromField)} is not a defined relation on ${meta.className}.`);
        }
        this.createAlias(prop.type, alias);
        cond = core_1.QueryHelper.processWhere({
            where: cond,
            entityName: this.mainAlias.entityName,
            metadata: this.metadata,
            platform: this.platform,
            aliasMap: this.getAliasMap(),
            aliased: !this.type || [enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(this.type),
        });
        let aliasedName = `${fromAlias}.${prop.name}#${alias}`;
        path ??= `${(Object.values(this._joins).find(j => j.alias === fromAlias)?.path ?? entityName)}.${prop.name}`;
        if (prop.kind === core_1.ReferenceKind.ONE_TO_MANY) {
            this._joins[aliasedName] = this.helper.joinOneToReference(prop, fromAlias, alias, type, cond, schema);
        }
        else if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY) {
            let pivotAlias = alias;
            if (type !== enums_1.JoinType.pivotJoin) {
                const oldPivotAlias = this.getAliasForJoinPath(path + '[pivot]');
                pivotAlias = oldPivotAlias ?? this.getNextAlias(prop.pivotEntity);
                aliasedName = `${fromAlias}.${prop.name}#${pivotAlias}`;
            }
            const joins = this.helper.joinManyToManyReference(prop, fromAlias, alias, pivotAlias, type, cond, path, schema);
            Object.assign(this._joins, joins);
            this.createAlias(prop.pivotEntity, pivotAlias);
        }
        else if (prop.kind === core_1.ReferenceKind.ONE_TO_ONE) {
            this._joins[aliasedName] = this.helper.joinOneToReference(prop, fromAlias, alias, type, cond, schema);
        }
        else { // MANY_TO_ONE
            this._joins[aliasedName] = this.helper.joinManyToOneReference(prop, fromAlias, alias, type, cond, schema);
        }
        if (!this._joins[aliasedName].path && path) {
            this._joins[aliasedName].path = path;
        }
        return prop;
    }
    prepareFields(fields, type = 'where') {
        const ret = [];
        const getFieldName = (name) => {
            if (type === 'groupBy') {
                return this.helper.mapper(name, this.type, undefined, null);
            }
            return this.helper.mapper(name, this.type);
        };
        fields.forEach(field => {
            const rawField = core_1.RawQueryFragment.getKnownFragment(field);
            if (rawField) {
                const sql = this.platform.formatQuery(rawField.sql, rawField.params);
                ret.push(this.knex.raw(sql));
                return;
            }
            if (!core_1.Utils.isString(field)) {
                ret.push(field);
                return;
            }
            const join = Object.keys(this._joins).find(k => field === k.substring(0, k.indexOf('#')));
            if (join && type === 'where') {
                ret.push(...this.helper.mapJoinColumns(this.type ?? enums_1.QueryType.SELECT, this._joins[join]));
                return;
            }
            const [a, f] = this.helper.splitField(field);
            const prop = this.helper.getProperty(f, a);
            /* istanbul ignore next */
            if (prop && [core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind)) {
                return;
            }
            if (prop?.persist === false && !prop.embedded && !prop.formula && type === 'where') {
                return;
            }
            if (prop?.embedded || (prop?.kind === core_1.ReferenceKind.EMBEDDED && prop.object)) {
                const name = prop.embeddedPath?.join('.') ?? prop.fieldNames[0];
                const aliased = this._aliases[a] ? `${a}.${name}` : name;
                ret.push(getFieldName(aliased));
                return;
            }
            if (prop?.kind === core_1.ReferenceKind.EMBEDDED) {
                const nest = (prop) => {
                    for (const childProp of Object.values(prop.embeddedProps)) {
                        if (childProp.fieldNames && (childProp.kind !== core_1.ReferenceKind.EMBEDDED || childProp.object) && childProp.persist !== false) {
                            ret.push(getFieldName(childProp.fieldNames[0]));
                        }
                        else {
                            nest(childProp);
                        }
                    }
                };
                nest(prop);
                return;
            }
            if (prop && prop.fieldNames.length > 1) {
                ret.push(...prop.fieldNames.map(f => getFieldName(f)));
                return;
            }
            ret.push(getFieldName(field));
        });
        const meta = this.mainAlias.metadata;
        /* istanbul ignore next */
        const requiresSQLConversion = meta?.props.filter(p => p.hasConvertToJSValueSQL && p.persist !== false) ?? [];
        if (this.flags.has(core_1.QueryFlag.CONVERT_CUSTOM_TYPES) && (fields.includes('*') || fields.includes(`${this.mainAlias.aliasName}.*`)) && requiresSQLConversion.length > 0) {
            for (const p of requiresSQLConversion) {
                ret.push(this.helper.mapper(p.name, this.type));
            }
        }
        for (const f of Object.keys(this._populateMap)) {
            if (type === 'where' && this._joins[f]) {
                const cols = this.helper.mapJoinColumns(this.type ?? enums_1.QueryType.SELECT, this._joins[f]);
                for (const col of cols) {
                    ret.push(col);
                }
            }
        }
        return core_1.Utils.unique(ret);
    }
    init(type, data, cond) {
        this.ensureNotFinalized();
        this.type = type;
        if ([enums_1.QueryType.UPDATE, enums_1.QueryType.DELETE].includes(type) && core_1.Utils.hasObjectKeys(this._cond)) {
            throw new Error(`You are trying to call \`qb.where().${type.toLowerCase()}()\`. Calling \`qb.${type.toLowerCase()}()\` before \`qb.where()\` is required.`);
        }
        if (!this.helper.isTableNameAliasRequired(type)) {
            delete this._fields;
        }
        if (data) {
            if (core_1.Utils.isEntity(data)) {
                data = this.em?.getComparator().prepareEntity(data) ?? (0, core_1.serialize)(data);
            }
            this._data = this.helper.processData(data, this.flags.has(core_1.QueryFlag.CONVERT_CUSTOM_TYPES), false);
        }
        if (cond) {
            this.where(cond);
        }
        return this;
    }
    getQueryBase(processVirtualEntity) {
        const qb = this.getKnex(processVirtualEntity);
        const schema = this.getSchema(this.mainAlias);
        // Joined tables doesn't need to belong to the same schema as the main table
        const joinSchema = this._schema ?? this.em?.schema ?? schema;
        if (schema) {
            qb.withSchema(schema);
        }
        if (this._indexHint) {
            const alias = this.helper.isTableNameAliasRequired(this.type) ? ` as ${this.platform.quoteIdentifier(this.mainAlias.aliasName)}` : '';
            const schemaQuoted = schema ? this.platform.quoteIdentifier(schema) + '.' : '';
            const tableName = schemaQuoted + this.platform.quoteIdentifier(this.helper.getTableName(this.mainAlias.entityName)) + alias;
            qb.from(this.knex.raw(`${tableName} ${this._indexHint}`));
        }
        switch (this.type) {
            case enums_1.QueryType.SELECT:
                qb.select(this.prepareFields(this._fields));
                if (this._distinctOn) {
                    qb.distinctOn(this.prepareFields(this._distinctOn));
                }
                else if (this.flags.has(core_1.QueryFlag.DISTINCT)) {
                    qb.distinct();
                }
                this.helper.processJoins(qb, this._joins, joinSchema);
                break;
            case enums_1.QueryType.COUNT: {
                const m = this.flags.has(core_1.QueryFlag.DISTINCT) ? 'countDistinct' : 'count';
                qb[m]({ count: this._fields.map(f => this.helper.mapper(f, this.type)) });
                this.helper.processJoins(qb, this._joins, joinSchema);
                break;
            }
            case enums_1.QueryType.INSERT:
                qb.insert(this._data);
                break;
            case enums_1.QueryType.UPDATE:
                qb.update(this._data);
                this.helper.processJoins(qb, this._joins, joinSchema);
                this.helper.updateVersionProperty(qb, this._data);
                break;
            case enums_1.QueryType.DELETE:
                qb.delete();
                break;
            case enums_1.QueryType.TRUNCATE:
                qb.truncate();
                break;
        }
        return qb;
    }
    applyDiscriminatorCondition() {
        const meta = this.mainAlias.metadata;
        if (!meta?.discriminatorValue) {
            return;
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
        this.andWhere({
            [meta.root.discriminatorColumn]: children.length > 0 ? { $in: [meta.discriminatorValue, ...children.map(c => c.discriminatorValue)] } : meta.discriminatorValue,
        });
    }
    finalize() {
        if (this.finalized) {
            return;
        }
        if (!this.type) {
            this.select('*');
        }
        const meta = this.mainAlias.metadata;
        this.applyDiscriminatorCondition();
        this.processPopulateHint();
        if (meta && (this._fields?.includes('*') || this._fields?.includes(`${this.mainAlias.aliasName}.*`))) {
            meta.props
                .filter(prop => prop.formula && (!prop.lazy || this.flags.has(core_1.QueryFlag.INCLUDE_LAZY_FORMULAS)))
                .map(prop => {
                const alias = this.knex.ref(this.mainAlias.aliasName).toString();
                const aliased = this.knex.ref(prop.fieldNames[0]).toString();
                return `${prop.formula(alias)} as ${aliased}`;
            })
                .filter(field => !this._fields.some(f => {
                if (f instanceof core_1.RawQueryFragment) {
                    return f.sql === field && f.params.length === 0;
                }
                return f === field;
            }))
                .forEach(field => this._fields.push((0, core_1.raw)(field)));
        }
        core_1.QueryHelper.processObjectParams(this._data);
        core_1.QueryHelper.processObjectParams(this._cond);
        core_1.QueryHelper.processObjectParams(this._having);
        // automatically enable paginate flag when we detect to-many joins, but only if there is no `group by` clause
        if (!this.flags.has(core_1.QueryFlag.DISABLE_PAGINATE) && this._groupBy.length === 0 && this.hasToManyJoins()) {
            this.flags.add(core_1.QueryFlag.PAGINATE);
        }
        if (meta && this.flags.has(core_1.QueryFlag.PAGINATE) && (this._limit > 0 || this._offset > 0)) {
            this.wrapPaginateSubQuery(meta);
        }
        if (meta && (this.flags.has(core_1.QueryFlag.UPDATE_SUB_QUERY) || this.flags.has(core_1.QueryFlag.DELETE_SUB_QUERY))) {
            this.wrapModifySubQuery(meta);
        }
        this.finalized = true;
    }
    /** @internal */
    processPopulateHint() {
        if (this.populateHintFinalized) {
            return;
        }
        const meta = this.mainAlias.metadata;
        if (meta && this.flags.has(core_1.QueryFlag.AUTO_JOIN_ONE_TO_ONE_OWNER)) {
            const relationsToPopulate = this._populate.map(({ field }) => field);
            meta.relations
                .filter(prop => prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner && !relationsToPopulate.includes(prop.name) && !relationsToPopulate.includes(`${prop.name}:ref`))
                .map(prop => ({ field: `${prop.name}:ref` }))
                .forEach(item => this._populate.push(item));
        }
        this._populate.forEach(({ field }) => {
            const [fromAlias, fromField] = this.helper.splitField(field);
            const aliasedField = `${fromAlias}.${fromField}`;
            const join = Object.keys(this._joins).find(k => `${aliasedField}#${this._joins[k].alias}` === k);
            if (join && this._joins[join] && this.helper.isOneToOneInverse(fromField)) {
                this._populateMap[join] = this._joins[join].alias;
                return;
            }
            if (meta && this.helper.isOneToOneInverse(fromField)) {
                const prop = meta.properties[fromField];
                const alias = this.getNextAlias(prop.pivotEntity ?? prop.type);
                const aliasedName = `${fromAlias}.${prop.name}#${alias}`;
                this._joins[aliasedName] = this.helper.joinOneToReference(prop, this.mainAlias.aliasName, alias, enums_1.JoinType.leftJoin);
                this._joins[aliasedName].path = `${(Object.values(this._joins).find(j => j.alias === fromAlias)?.path ?? meta.className)}.${prop.name}`;
                this._populateMap[aliasedName] = this._joins[aliasedName].alias;
            }
        });
        this.processPopulateWhere(false);
        this.processPopulateWhere(true);
        this.populateHintFinalized = true;
    }
    processPopulateWhere(filter) {
        const key = filter ? '_populateFilter' : '_populateWhere';
        if (this[key] == null || this[key] === core_1.PopulateHint.ALL) {
            return;
        }
        let joins = Object.values(this._joins);
        for (const join of joins) {
            join.cond_ ??= join.cond;
            join.cond = filter ? { ...join.cond } : {};
        }
        if (typeof this[key] === 'object') {
            const cond = CriteriaNodeFactory_1.CriteriaNodeFactory
                .createNode(this.metadata, this.mainAlias.entityName, this[key])
                .process(this, { matchPopulateJoins: true, ignoreBranching: true, preferNoBranch: true });
            // there might be new joins created by processing the `populateWhere` object
            joins = Object.values(this._joins);
            this.mergeOnConditions(joins, cond, filter);
        }
    }
    mergeOnConditions(joins, cond, filter, op) {
        for (const k of Object.keys(cond)) {
            if (core_1.Utils.isOperator(k)) {
                if (Array.isArray(cond[k])) {
                    cond[k].forEach((c) => this.mergeOnConditions(joins, c, filter, k));
                }
                /* istanbul ignore next */
                this.mergeOnConditions(joins, cond[k], filter, k);
            }
            const [alias] = this.helper.splitField(k);
            const join = joins.find(j => j.alias === alias);
            if (join) {
                const parentJoin = joins.find(j => j.alias === join.ownerAlias);
                // https://stackoverflow.com/a/56815807/3665878
                if (parentJoin && !filter) {
                    const nested = (parentJoin.nested ??= new Set());
                    join.type = join.type === enums_1.JoinType.innerJoin || ([core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(parentJoin.prop.kind))
                        ? enums_1.JoinType.nestedInnerJoin
                        : enums_1.JoinType.nestedLeftJoin;
                    nested.add(join);
                }
                if (join.cond[k]) {
                    /* istanbul ignore next */
                    join.cond = { [op ?? '$and']: [join.cond, { [k]: cond[k] }] };
                }
                else if (op === '$or') {
                    join.cond.$or ??= [];
                    join.cond.$or.push({ [k]: cond[k] });
                }
                else {
                    join.cond = { ...join.cond, [k]: cond[k] };
                }
            }
        }
    }
    hasToManyJoins() {
        // console.log(this._joins);
        return Object.values(this._joins).some(join => {
            // console.log(join.prop.name, join.prop.kind, [ReferenceKind.ONE_TO_MANY, ReferenceKind.MANY_TO_MANY].includes(join.prop.kind));
            return [core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(join.prop.kind);
        });
    }
    wrapPaginateSubQuery(meta) {
        const pks = this.prepareFields(meta.primaryKeys, 'sub-query');
        const subQuery = this.clone(['_orderBy', '_fields', 'lockMode', 'lockTableAliases']).select(pks).groupBy(pks).limit(this._limit);
        // revert the on conditions added via populateWhere, we want to apply those only once
        for (const join of Object.values(subQuery._joins)) {
            if (join.cond_) {
                join.cond = join.cond_;
            }
        }
        if (this._offset) {
            subQuery.offset(this._offset);
        }
        const addToSelect = [];
        if (this._orderBy.length > 0) {
            const orderBy = [];
            for (const orderMap of this._orderBy) {
                for (const [field, direction] of Object.entries(orderMap)) {
                    if (core_1.RawQueryFragment.isKnownFragment(field)) {
                        const rawField = core_1.RawQueryFragment.getKnownFragment(field, false);
                        this.rawFragments.add(field);
                        orderBy.push({ [rawField.clone()]: direction });
                        continue;
                    }
                    const [a, f] = this.helper.splitField(field);
                    const prop = this.helper.getProperty(f, a);
                    const type = this.platform.castColumn(prop);
                    const fieldName = this.helper.mapper(field, this.type, undefined, null);
                    if (!prop?.persist && !prop?.formula && !prop?.hasConvertToJSValueSQL && !pks.includes(fieldName)) {
                        addToSelect.push(fieldName);
                    }
                    const key = (0, core_1.raw)(`min(${this.knex.ref(fieldName)}${type})`);
                    orderBy.push({ [key]: direction });
                }
            }
            subQuery.orderBy(orderBy);
        }
        subQuery.finalized = true;
        const knexQuery = subQuery.as(this.mainAlias.aliasName).clearSelect().select(pks);
        if (addToSelect.length > 0) {
            addToSelect.forEach(prop => {
                const field = this._fields.find(field => {
                    if (typeof field === 'object' && field && '__as' in field) {
                        return field.__as === prop;
                    }
                    if (field instanceof core_1.RawQueryFragment) {
                        // not perfect, but should work most of the time, ideally we should check only the alias (`... as alias`)
                        return field.sql.includes(prop);
                    }
                    return false;
                });
                /* istanbul ignore next */
                if (field instanceof core_1.RawQueryFragment) {
                    const sql = this.platform.formatQuery(field.sql, field.params);
                    knexQuery.select(this.knex.raw(sql));
                }
                else if (field) {
                    knexQuery.select(field);
                }
            });
        }
        // multiple sub-queries are needed to get around mysql limitations with order by + limit + where in + group by (o.O)
        // https://stackoverflow.com/questions/17892762/mysql-this-version-of-mysql-doesnt-yet-support-limit-in-all-any-some-subqu
        const subSubQuery = this.getKnex().select(pks).from(knexQuery);
        subSubQuery.__raw = true; // tag it as there is now way to check via `instanceof`
        this._limit = undefined;
        this._offset = undefined;
        if (this._fields.some(f => core_1.RawQueryFragment.isKnownFragment(f))) {
            this.select(this._fields).where({ [core_1.Utils.getPrimaryKeyHash(meta.primaryKeys)]: { $in: subSubQuery } });
            return;
        }
        // remove joins that are not used for population or ordering to improve performance
        const populate = new Set();
        const orderByAliases = this._orderBy
            .flatMap(hint => Object.keys(hint))
            .map(k => k.split('.')[0]);
        function addPath(hints, prefix = '') {
            for (const hint of hints) {
                const field = hint.field.split(':')[0];
                populate.add((prefix ? prefix + '.' : '') + field);
                if (hint.children) {
                    addPath(hint.children, (prefix ? prefix + '.' : '') + field);
                }
            }
        }
        addPath(this._populate);
        const joins = Object.entries(this._joins);
        const rootAlias = this.alias;
        function addParentAlias(alias) {
            const join = joins.find(j => j[1].alias === alias);
            if (join && join[1].ownerAlias !== rootAlias) {
                orderByAliases.push(join[1].ownerAlias);
                addParentAlias(join[1].ownerAlias);
            }
        }
        for (const orderByAlias of orderByAliases) {
            addParentAlias(orderByAlias);
        }
        for (const [key, join] of joins) {
            const path = join.path?.replace(/\[populate]|\[pivot]|:ref/g, '').replace(new RegExp(`^${meta.className}.`), '');
            if (!populate.has(path ?? '') && !orderByAliases.includes(join.alias)) {
                delete this._joins[key];
            }
        }
        this.select(this._fields).where({ [core_1.Utils.getPrimaryKeyHash(meta.primaryKeys)]: { $in: subSubQuery } });
    }
    wrapModifySubQuery(meta) {
        const subQuery = this.clone();
        subQuery.finalized = true;
        // wrap one more time to get around MySQL limitations
        // https://stackoverflow.com/questions/45494/mysql-error-1093-cant-specify-target-table-for-update-in-from-clause
        const subSubQuery = this.getKnex().select(this.prepareFields(meta.primaryKeys)).from(subQuery.as(this.mainAlias.aliasName));
        subSubQuery.__raw = true; // tag it as there is now way to check via `instanceof`
        const method = this.flags.has(core_1.QueryFlag.UPDATE_SUB_QUERY) ? 'update' : 'delete';
        this._cond = {}; // otherwise we would trigger validation error
        this._joins = {}; // included in the subquery
        this[method](this._data).where({
            [core_1.Utils.getPrimaryKeyHash(meta.primaryKeys)]: { $in: subSubQuery },
        });
    }
    getSchema(alias) {
        const { metadata } = alias;
        const metaSchema = metadata?.schema && metadata.schema !== '*' ? metadata.schema : undefined;
        return this._schema ?? metaSchema ?? this.em?.schema ?? this.em?.config.get('schema');
    }
    createAlias(entityName, aliasName, subQuery) {
        const metadata = this.metadata.find(entityName);
        const alias = { aliasName, entityName, metadata, subQuery };
        this._aliases[aliasName] = alias;
        return alias;
    }
    createMainAlias(entityName, aliasName, subQuery) {
        this._mainAlias = this.createAlias(entityName, aliasName, subQuery);
        this._helper = this.createQueryBuilderHelper();
        return this._mainAlias;
    }
    fromSubQuery(target, aliasName) {
        const subQuery = target.getKnexQuery();
        const { entityName } = target.mainAlias;
        aliasName ??= this.getNextAlias(entityName);
        this.createMainAlias(entityName, aliasName, subQuery);
    }
    fromEntityName(entityName, aliasName) {
        aliasName ??= this._mainAlias?.aliasName ?? this.getNextAlias(entityName);
        this.createMainAlias(entityName, aliasName);
    }
    createQueryBuilderHelper() {
        return new QueryBuilderHelper_1.QueryBuilderHelper(this.mainAlias.entityName, this.mainAlias.aliasName, this._aliases, this.subQueries, this.knex, this.driver);
    }
    ensureFromClause() {
        /* istanbul ignore next */
        if (!this._mainAlias) {
            throw new Error(`Cannot proceed to build a query because the main alias is not set.`);
        }
    }
    ensureNotFinalized() {
        if (this.finalized) {
            throw new Error('This QueryBuilder instance is already finalized, clone it first if you want to modify it.');
        }
    }
    /* istanbul ignore next */
    /** @ignore */
    [node_util_1.inspect.custom](depth = 2) {
        const object = { ...this };
        const hidden = ['metadata', 'driver', 'context', 'platform', 'knex', 'type'];
        Object.keys(object).filter(k => k.startsWith('_')).forEach(k => delete object[k]);
        Object.keys(object).filter(k => object[k] == null).forEach(k => delete object[k]);
        hidden.forEach(k => delete object[k]);
        let prefix = this.type ? this.type.substring(0, 1) + this.type.toLowerCase().substring(1) : '';
        if (this._data) {
            object.data = this._data;
        }
        if (this._schema) {
            object.schema = this._schema;
        }
        if (!core_1.Utils.isEmpty(this._cond)) {
            object.where = this._cond;
        }
        if (this._onConflict?.[0]) {
            prefix = 'Upsert';
            object.onConflict = this._onConflict[0];
        }
        if (!core_1.Utils.isEmpty(this._orderBy)) {
            object.orderBy = this._orderBy;
        }
        const name = this._mainAlias ? `${prefix}QueryBuilder<${this._mainAlias?.entityName}>` : 'QueryBuilder';
        const ret = (0, node_util_1.inspect)(object, { depth });
        return ret === '[Object]' ? `[${name}]` : name + ' ' + ret;
    }
}
exports.QueryBuilder = QueryBuilder;
