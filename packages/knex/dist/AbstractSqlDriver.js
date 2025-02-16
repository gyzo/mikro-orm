"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractSqlDriver = void 0;
const core_1 = require("@mikro-orm/core");
const query_1 = require("./query");
const SqlEntityManager_1 = require("./SqlEntityManager");
const PivotCollectionPersister_1 = require("./PivotCollectionPersister");
class AbstractSqlDriver extends core_1.DatabaseDriver {
    [core_1.EntityManagerType];
    connection;
    replicas = [];
    platform;
    constructor(config, platform, connection, connector) {
        super(config, connector);
        this.connection = new connection(this.config);
        this.replicas = this.createReplicas(conf => new connection(this.config, conf, 'read'));
        this.platform = platform;
    }
    getPlatform() {
        return this.platform;
    }
    createEntityManager(useContext) {
        const EntityManagerClass = this.config.get('entityManager', SqlEntityManager_1.SqlEntityManager);
        return new EntityManagerClass(this.config, this, this.metadata, useContext);
    }
    async find(entityName, where, options = {}) {
        options = { populate: [], orderBy: [], ...options };
        const meta = this.metadata.find(entityName);
        if (meta?.virtual) {
            return this.findVirtual(entityName, where, options);
        }
        const populate = this.autoJoinOneToOneOwner(meta, options.populate, options.fields);
        const joinedProps = this.joinedProps(meta, populate, options);
        const qb = this.createQueryBuilder(entityName, options.ctx, options.connectionType, false, options.logging);
        const fields = this.buildFields(meta, populate, joinedProps, qb, qb.alias, options);
        const orderBy = this.buildOrderBy(qb, meta, populate, options);
        const populateWhere = this.buildPopulateWhere(meta, joinedProps, options);
        core_1.Utils.asArray(options.flags).forEach(flag => qb.setFlag(flag));
        if (core_1.Utils.isPrimaryKey(where, meta.compositePK)) {
            where = { [core_1.Utils.getPrimaryKeyHash(meta.primaryKeys)]: where };
        }
        const { first, last, before, after } = options;
        const isCursorPagination = [first, last, before, after].some(v => v != null);
        qb.__populateWhere = options._populateWhere;
        qb.select(fields)
            // only add populateWhere if we are populate-joining, as this will be used to add `on` conditions
            .populate(populate, joinedProps.length > 0 ? populateWhere : undefined, joinedProps.length > 0 ? options.populateFilter : undefined)
            .where(where)
            .groupBy(options.groupBy)
            .having(options.having)
            .indexHint(options.indexHint)
            .comment(options.comments)
            .hintComment(options.hintComments)
            .withSchema(this.getSchemaName(meta, options));
        if (isCursorPagination) {
            const { orderBy: newOrderBy, where } = this.processCursorOptions(meta, options, orderBy);
            qb.andWhere(where).orderBy(newOrderBy);
        }
        else {
            qb.orderBy(orderBy);
        }
        if (options.limit != null || options.offset != null) {
            qb.limit(options.limit, options.offset);
        }
        if (options.lockMode) {
            qb.setLockMode(options.lockMode, options.lockTableAliases);
        }
        const result = await this.rethrow(qb.execute('all'));
        if (isCursorPagination && !first && !!last) {
            result.reverse();
        }
        return result;
    }
    async findOne(entityName, where, options) {
        const opts = { populate: [], ...options };
        const meta = this.metadata.find(entityName);
        const populate = this.autoJoinOneToOneOwner(meta, opts.populate, opts.fields);
        const joinedProps = this.joinedProps(meta, populate, options);
        const hasToManyJoins = joinedProps.some(hint => this.hasToManyJoins(hint, meta));
        if (joinedProps.length === 0 || !hasToManyJoins) {
            opts.limit = 1;
        }
        if (opts.limit > 0 && !opts.flags?.includes(core_1.QueryFlag.DISABLE_PAGINATE)) {
            opts.flags ??= [];
            opts.flags.push(core_1.QueryFlag.DISABLE_PAGINATE);
        }
        const res = await this.find(entityName, where, opts);
        return res[0] || null;
    }
    hasToManyJoins(hint, meta) {
        const [propName] = hint.field.split(':', 2);
        const prop = meta.properties[propName];
        if (prop && [core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind)) {
            return true;
        }
        if (hint.children && prop.targetMeta) {
            return hint.children.some(hint => this.hasToManyJoins(hint, prop.targetMeta));
        }
        return false;
    }
    async findVirtual(entityName, where, options) {
        return this.findFromVirtual(entityName, where, options, query_1.QueryType.SELECT);
    }
    async countVirtual(entityName, where, options) {
        return this.findFromVirtual(entityName, where, options, query_1.QueryType.COUNT);
    }
    async findFromVirtual(entityName, where, options, type) {
        const meta = this.metadata.get(entityName);
        /* istanbul ignore next */
        if (!meta.expression) {
            return type === query_1.QueryType.SELECT ? [] : 0;
        }
        if (typeof meta.expression === 'string') {
            return this.wrapVirtualExpressionInSubquery(meta, meta.expression, where, options, type);
        }
        const em = this.createEntityManager();
        em.setTransactionContext(options.ctx);
        const res = meta.expression(em, where, options);
        if (typeof res === 'string') {
            return this.wrapVirtualExpressionInSubquery(meta, res, where, options, type);
        }
        if (res instanceof query_1.QueryBuilder) {
            return this.wrapVirtualExpressionInSubquery(meta, res.getFormattedQuery(), where, options, type);
        }
        if (!(res instanceof Promise) && core_1.Utils.isObject(res)) {
            const { sql, bindings } = res.toSQL();
            const query = this.platform.formatQuery(sql, bindings);
            return this.wrapVirtualExpressionInSubquery(meta, query, where, options, type);
        }
        /* istanbul ignore next */
        return res;
    }
    async wrapVirtualExpressionInSubquery(meta, expression, where, options, type) {
        const qb = this.createQueryBuilder(meta.className, options?.ctx, options.connectionType, options.convertCustomTypes, options.logging)
            .indexHint(options.indexHint)
            .comment(options.comments)
            .hintComment(options.hintComments);
        qb.where(where);
        const { first, last, before, after } = options;
        const isCursorPagination = [first, last, before, after].some(v => v != null);
        if (type !== query_1.QueryType.COUNT) {
            if (options.orderBy) {
                if (isCursorPagination) {
                    const { orderBy: newOrderBy, where } = this.processCursorOptions(meta, options, options.orderBy);
                    qb.andWhere(where).orderBy(newOrderBy);
                }
                else {
                    qb.orderBy(options.orderBy);
                }
            }
            qb.limit(options?.limit, options?.offset);
        }
        const kqb = qb.getKnexQuery(false).clear('select');
        if (type === query_1.QueryType.COUNT) {
            kqb.select(this.connection.getKnex().raw('count(*) as count'));
        }
        else { // select
            kqb.select('*');
        }
        kqb.fromRaw(`(${expression}) as ${this.platform.quoteIdentifier(qb.alias)}`);
        const res = await this.execute(kqb);
        if (type === query_1.QueryType.COUNT) {
            return res[0].count;
        }
        if (isCursorPagination && !first && !!last) {
            res.reverse();
        }
        return res.map(row => this.mapResult(row, meta));
    }
    mapResult(result, meta, populate = [], qb, map = {}) {
        const ret = super.mapResult(result, meta);
        /* istanbul ignore if */
        if (!ret) {
            return null;
        }
        if (qb) {
            // here we map the aliased results (cartesian product) to an object graph
            this.mapJoinedProps(ret, meta, populate, qb, ret, map);
        }
        return ret;
    }
    mapJoinedProps(result, meta, populate, qb, root, map, parentJoinPath) {
        const joinedProps = this.joinedProps(meta, populate);
        joinedProps.forEach(hint => {
            const [propName, ref] = hint.field.split(':', 2);
            const prop = meta.properties[propName];
            /* istanbul ignore next */
            if (!prop) {
                return;
            }
            const pivotRefJoin = prop.kind === core_1.ReferenceKind.MANY_TO_MANY && ref;
            const meta2 = this.metadata.find(prop.type);
            let path = parentJoinPath ? `${parentJoinPath}.${prop.name}` : `${meta.name}.${prop.name}`;
            if (!parentJoinPath) {
                path = '[populate]' + path;
            }
            if (pivotRefJoin) {
                path += '[pivot]';
            }
            const relationAlias = qb.getAliasForJoinPath(path, { matchPopulateJoins: true });
            /* istanbul ignore next */
            if (!relationAlias) {
                return;
            }
            // pivot ref joins via joined strategy need to be handled separately here, as they dont join the target entity
            if (pivotRefJoin) {
                let item;
                if (prop.inverseJoinColumns.length > 1) { // composite keys
                    item = prop.inverseJoinColumns.map(name => root[`${relationAlias}__${name}`]);
                }
                else {
                    const alias = `${relationAlias}__${prop.inverseJoinColumns[0]}`;
                    item = root[alias];
                }
                prop.joinColumns.forEach(name => delete root[`${relationAlias}__${name}`]);
                prop.inverseJoinColumns.forEach(name => delete root[`${relationAlias}__${name}`]);
                result[prop.name] ??= [];
                if (item) {
                    result[prop.name].push(item);
                }
                return;
            }
            // If the primary key value for the relation is null, we know we haven't joined to anything
            // and therefore we don't return any record (since all values would be null)
            const hasPK = meta2.primaryKeys.every(pk => meta2.properties[pk].fieldNames.every(name => {
                return root[`${relationAlias}__${name}`] != null;
            }));
            if (!hasPK) {
                if ([core_1.ReferenceKind.MANY_TO_MANY, core_1.ReferenceKind.ONE_TO_MANY].includes(prop.kind)) {
                    result[prop.name] = [];
                }
                if ([core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
                    result[prop.name] = null;
                }
                return;
            }
            let relationPojo = {};
            meta2.props
                .filter(prop => !ref && prop.persist === false && prop.fieldNames)
                .filter(prop => !prop.lazy || populate.some(p => p.field === prop.name || p.all))
                .forEach(prop => {
                /* istanbul ignore if */
                if (prop.fieldNames.length > 1) { // composite keys
                    relationPojo[prop.name] = prop.fieldNames.map(name => root[`${relationAlias}__${name}`]);
                }
                else {
                    const alias = `${relationAlias}__${prop.fieldNames[0]}`;
                    relationPojo[prop.name] = root[alias];
                }
            });
            const mapToPk = !!(ref || prop.mapToPk);
            const targetProps = mapToPk
                ? meta2.getPrimaryProps()
                : meta2.props.filter(prop => this.platform.shouldHaveColumn(prop, hint.children || []));
            const tz = this.platform.getTimezone();
            for (const prop of targetProps) {
                if (prop.fieldNames.length > 1) { // composite keys
                    const fk = prop.fieldNames.map(name => root[`${relationAlias}__${name}`]);
                    const pk = core_1.Utils.mapFlatCompositePrimaryKey(fk, prop);
                    relationPojo[prop.name] = pk.every(val => val != null) ? pk : null;
                }
                else if (prop.runtimeType === 'Date') {
                    const alias = `${relationAlias}__${prop.fieldNames[0]}`;
                    const value = root[alias];
                    if (tz && tz !== 'local' && typeof value === 'string' && !value.includes('+') && value.lastIndexOf('-') < 11 && !value.endsWith('Z')) {
                        relationPojo[prop.name] = this.platform.parseDate(value + tz);
                    }
                    else if (['string', 'number'].includes(typeof value)) {
                        relationPojo[prop.name] = this.platform.parseDate(value);
                    }
                    else {
                        relationPojo[prop.name] = value;
                    }
                }
                else {
                    const alias = `${relationAlias}__${prop.fieldNames[0]}`;
                    relationPojo[prop.name] = root[alias];
                    if (prop.kind === core_1.ReferenceKind.EMBEDDED && (prop.object || meta.embeddable)) {
                        const item = (0, core_1.parseJsonSafe)(relationPojo[prop.name]);
                        if (Array.isArray(item)) {
                            relationPojo[prop.name] = item.map(row => row == null ? row : this.comparator.mapResult(prop.type, row));
                        }
                        else {
                            relationPojo[prop.name] = item == null ? item : this.comparator.mapResult(prop.type, item);
                        }
                    }
                }
            }
            // properties can be mapped to multiple places, e.g. when sharing a column in multiple FKs,
            // so we need to delete them after everything is mapped from given level
            for (const prop of targetProps) {
                prop.fieldNames.map(name => delete root[`${relationAlias}__${name}`]);
            }
            if (mapToPk) {
                const tmp = Object.values(relationPojo);
                /* istanbul ignore next */
                relationPojo = (meta2.compositePK ? tmp : tmp[0]);
            }
            if ([core_1.ReferenceKind.MANY_TO_MANY, core_1.ReferenceKind.ONE_TO_MANY].includes(prop.kind)) {
                result[prop.name] ??= [];
                result[prop.name].push(relationPojo);
            }
            else {
                result[prop.name] = relationPojo;
            }
            const populateChildren = hint.children || [];
            this.mapJoinedProps(relationPojo, meta2, populateChildren, qb, root, map, path);
        });
    }
    async count(entityName, where, options = {}) {
        const meta = this.metadata.find(entityName);
        if (meta?.virtual) {
            return this.countVirtual(entityName, where, options);
        }
        const joinedProps = meta ? this.joinedProps(meta, options.populate ?? []) : [];
        const populateWhere = meta ? this.buildPopulateWhere(meta, joinedProps, options) : undefined;
        const populate = options.populate ?? [];
        const qb = this.createQueryBuilder(entityName, options.ctx, options.connectionType, false, options.logging)
            .indexHint(options.indexHint)
            .comment(options.comments)
            .hintComment(options.hintComments)
            .groupBy(options.groupBy)
            .having(options.having)
            .populate(populate, joinedProps.length > 0 ? populateWhere : undefined, joinedProps.length > 0 ? options.populateFilter : undefined)
            .withSchema(this.getSchemaName(meta, options))
            .where(where);
        if (meta && !core_1.Utils.isEmpty(populate)) {
            this.buildFields(meta, populate, joinedProps, qb, qb.alias, options, true);
        }
        return this.rethrow(qb.getCount());
    }
    async nativeInsert(entityName, data, options = {}) {
        options.convertCustomTypes ??= true;
        const meta = this.metadata.find(entityName);
        const collections = this.extractManyToMany(entityName, data);
        const pks = meta?.primaryKeys ?? [this.config.getNamingStrategy().referenceColumnName()];
        const qb = this.createQueryBuilder(entityName, options.ctx, 'write', options.convertCustomTypes).withSchema(this.getSchemaName(meta, options));
        const res = await this.rethrow(qb.insert(data).execute('run', false));
        res.row = res.row || {};
        let pk;
        if (pks.length > 1) { // owner has composite pk
            pk = core_1.Utils.getPrimaryKeyCond(data, pks);
        }
        else {
            /* istanbul ignore next */
            res.insertId = data[pks[0]] ?? res.insertId ?? res.row[pks[0]];
            pk = [res.insertId];
        }
        await this.processManyToMany(meta, pk, collections, false, options);
        return res;
    }
    async nativeInsertMany(entityName, data, options = {}, transform) {
        options.processCollections ??= true;
        options.convertCustomTypes ??= true;
        const meta = this.metadata.find(entityName)?.root;
        const collections = options.processCollections ? data.map(d => this.extractManyToMany(entityName, d)) : [];
        const pks = this.getPrimaryKeyFields(entityName);
        const set = new Set();
        data.forEach(row => core_1.Utils.keys(row).forEach(k => set.add(k)));
        const props = [...set].map(name => meta?.properties[name] ?? { name, fieldNames: [name] });
        let fields = core_1.Utils.flatten(props.map(prop => prop.fieldNames));
        const duplicates = core_1.Utils.findDuplicates(fields);
        const params = [];
        if (duplicates.length) {
            fields = core_1.Utils.unique(fields);
        }
        /* istanbul ignore next */
        const tableName = meta ? this.getTableName(meta, options) : this.platform.quoteIdentifier(entityName);
        let sql = `insert into ${tableName} `;
        sql += fields.length > 0 ? '(' + fields.map(k => this.platform.quoteIdentifier(k)).join(', ') + ')' : `(${this.platform.quoteIdentifier(pks[0])})`;
        if (meta && this.platform.usesOutputStatement()) {
            const returningProps = meta.props
                .filter(prop => prop.persist !== false && prop.defaultRaw || prop.autoincrement || prop.generated)
                .filter(prop => !(prop.name in data[0]) || core_1.Utils.isRawSql(data[0][prop.name]));
            const returningFields = core_1.Utils.flatten(returningProps.map(prop => prop.fieldNames));
            sql += returningFields.length > 0 ? ` output ${returningFields.map(field => 'inserted.' + this.platform.quoteIdentifier(field)).join(', ')}` : '';
        }
        if (fields.length > 0 || this.platform.usesDefaultKeyword()) {
            sql += ' values ';
        }
        else {
            sql += ' ' + data.map(() => `select null as ${this.platform.quoteIdentifier(pks[0])}`).join(' union all ');
        }
        const addParams = (prop, row) => {
            let value = row[prop.name] ?? prop.default;
            if (prop.kind === core_1.ReferenceKind.EMBEDDED && prop.object) {
                if (prop.array && value) {
                    value = this.platform.cloneEmbeddable(value);
                    for (let i = 0; i < value.length; i++) {
                        const item = value[i];
                        value[i] = this.mapDataToFieldNames(item, false, prop.embeddedProps, options.convertCustomTypes);
                    }
                }
                else {
                    value = this.mapDataToFieldNames(value, false, prop.embeddedProps, options.convertCustomTypes);
                }
            }
            if (options.convertCustomTypes && prop.customType) {
                params.push(prop.customType.convertToDatabaseValue(value, this.platform, { key: prop.name, mode: 'query-data' }));
                return;
            }
            if (typeof value === 'undefined' && this.platform.usesDefaultKeyword()) {
                params.push((0, core_1.raw)('default'));
                return;
            }
            params.push(value);
        };
        if (fields.length > 0 || this.platform.usesDefaultKeyword()) {
            sql += data.map(row => {
                const keys = [];
                const usedDups = [];
                props.forEach(prop => {
                    if (prop.fieldNames.length > 1) {
                        const newFields = [];
                        const allParam = [...row[prop.name] ?? prop.fieldNames.map(() => null)];
                        const newParam = [];
                        prop.fieldNames.forEach((field, idx) => {
                            if (usedDups.includes(field)) {
                                return;
                            }
                            newFields.push(field);
                            newParam.push(allParam[idx]);
                        });
                        const param = core_1.Utils.flatten(newParam);
                        newFields.forEach((field, idx) => {
                            if (!duplicates.includes(field) || !usedDups.includes(field)) {
                                params.push(param[idx]);
                                keys.push('?');
                                usedDups.push(field);
                            }
                        });
                    }
                    else {
                        const field = prop.fieldNames[0];
                        if (!duplicates.includes(field) || !usedDups.includes(field)) {
                            if (prop.customType && !prop.object && 'convertToDatabaseValueSQL' in prop.customType && !this.platform.isRaw(row[prop.name])) {
                                keys.push(prop.customType.convertToDatabaseValueSQL('?', this.platform));
                            }
                            else {
                                keys.push('?');
                            }
                            addParams(prop, row);
                            usedDups.push(field);
                        }
                    }
                });
                return '(' + (keys.join(', ') || 'default') + ')';
            }).join(', ');
        }
        if (meta && this.platform.usesReturningStatement()) {
            const returningProps = meta.props
                .filter(prop => prop.persist !== false && prop.defaultRaw || prop.autoincrement || prop.generated)
                .filter(prop => !(prop.name in data[0]) || core_1.Utils.isRawSql(data[0][prop.name]));
            const returningFields = core_1.Utils.flatten(returningProps.map(prop => prop.fieldNames));
            /* istanbul ignore next */
            sql += returningFields.length > 0 ? ` returning ${returningFields.map(field => this.platform.quoteIdentifier(field)).join(', ')}` : '';
        }
        if (transform) {
            sql = transform(sql);
        }
        const res = await this.execute(sql, params, 'run', options.ctx);
        let pk;
        /* istanbul ignore next */
        if (pks.length > 1) { // owner has composite pk
            pk = data.map(d => core_1.Utils.getPrimaryKeyCond(d, pks));
        }
        else {
            res.row ??= {};
            res.rows ??= [];
            pk = data.map((d, i) => d[pks[0]] ?? res.rows[i]?.[pks[0]]).map(d => [d]);
            res.insertId = res.insertId || res.row[pks[0]];
        }
        for (let i = 0; i < collections.length; i++) {
            await this.processManyToMany(meta, pk[i], collections[i], false, options);
        }
        return res;
    }
    async nativeUpdate(entityName, where, data, options = {}) {
        options.convertCustomTypes ??= true;
        const meta = this.metadata.find(entityName);
        const pks = this.getPrimaryKeyFields(entityName);
        const collections = this.extractManyToMany(entityName, data);
        let res = { affectedRows: 0, insertId: 0, row: {} };
        if (core_1.Utils.isPrimaryKey(where) && pks.length === 1) {
            /* istanbul ignore next */
            where = { [meta?.primaryKeys[0] ?? pks[0]]: where };
        }
        if (core_1.Utils.hasObjectKeys(data)) {
            const qb = this.createQueryBuilder(entityName, options.ctx, 'write', options.convertCustomTypes)
                .withSchema(this.getSchemaName(meta, options));
            if (options.upsert) {
                /* istanbul ignore next */
                const uniqueFields = options.onConflictFields ?? (core_1.Utils.isPlainObject(where) ? core_1.Utils.keys(where) : meta.primaryKeys);
                const returning = (0, core_1.getOnConflictReturningFields)(meta, data, uniqueFields, options);
                qb.insert(data)
                    .onConflict(uniqueFields)
                    .returning(returning);
                if (!options.onConflictAction || options.onConflictAction === 'merge') {
                    const fields = (0, core_1.getOnConflictFields)(meta, data, uniqueFields, options);
                    qb.merge(fields);
                }
                if (options.onConflictAction === 'ignore') {
                    qb.ignore();
                }
            }
            else {
                qb.update(data).where(where);
                // reload generated columns and version fields
                const returning = [];
                meta?.props
                    .filter(prop => (prop.generated && !prop.primary) || prop.version)
                    .forEach(prop => returning.push(prop.name));
                qb.returning(returning);
            }
            res = await this.rethrow(qb.execute('run', false));
        }
        /* istanbul ignore next */
        const pk = pks.map(pk => core_1.Utils.extractPK(data[pk] || where, meta));
        await this.processManyToMany(meta, pk, collections, true, options);
        return res;
    }
    async nativeUpdateMany(entityName, where, data, options = {}) {
        options.processCollections ??= true;
        options.convertCustomTypes ??= true;
        const meta = this.metadata.get(entityName);
        if (options.upsert) {
            const uniqueFields = options.onConflictFields ?? (core_1.Utils.isPlainObject(where[0]) ? Object.keys(where[0]).flatMap(key => core_1.Utils.splitPrimaryKeys(key)) : meta.primaryKeys);
            const qb = this.createQueryBuilder(entityName, options.ctx, 'write', options.convertCustomTypes).withSchema(this.getSchemaName(meta, options));
            const returning = (0, core_1.getOnConflictReturningFields)(meta, data[0], uniqueFields, options);
            qb.insert(data)
                .onConflict(uniqueFields)
                .returning(returning);
            if (!options.onConflictAction || options.onConflictAction === 'merge') {
                const fields = (0, core_1.getOnConflictFields)(meta, data[0], uniqueFields, options);
                qb.merge(fields);
            }
            if (options.onConflictAction === 'ignore') {
                qb.ignore();
            }
            return this.rethrow(qb.execute('run', false));
        }
        const collections = options.processCollections ? data.map(d => this.extractManyToMany(entityName, d)) : [];
        const keys = new Set();
        const fields = new Set();
        const returning = new Set();
        for (const row of data) {
            for (const k of core_1.Utils.keys(row)) {
                keys.add(k);
                if (core_1.Utils.isRawSql(row[k])) {
                    returning.add(k);
                }
            }
        }
        // reload generated columns and version fields
        meta?.props
            .filter(prop => prop.generated || prop.version || prop.primary)
            .forEach(prop => returning.add(prop.name));
        const pkCond = core_1.Utils.flatten(meta.primaryKeys.map(pk => meta.properties[pk].fieldNames)).map(pk => `${this.platform.quoteIdentifier(pk)} = ?`).join(' and ');
        const params = [];
        let sql = `update ${this.getTableName(meta, options)} set `;
        const addParams = (prop, value) => {
            if (prop.kind === core_1.ReferenceKind.EMBEDDED && prop.object) {
                if (prop.array && value) {
                    for (let i = 0; i < value.length; i++) {
                        const item = value[i];
                        value[i] = this.mapDataToFieldNames(item, false, prop.embeddedProps, options.convertCustomTypes);
                    }
                }
                else {
                    value = this.mapDataToFieldNames(value, false, prop.embeddedProps, options.convertCustomTypes);
                }
            }
            params.push(value);
        };
        for (const key of keys) {
            const prop = meta.properties[key] ?? meta.root.properties[key];
            prop.fieldNames.forEach((fieldName, fieldNameIdx) => {
                if (fields.has(fieldName) || (prop.ownColumns && !prop.ownColumns.includes(fieldName))) {
                    return;
                }
                fields.add(fieldName);
                sql += `${this.platform.quoteIdentifier(fieldName)} = case`;
                where.forEach((cond, idx) => {
                    if (key in data[idx]) {
                        const pks = core_1.Utils.getOrderedPrimaryKeys(cond, meta);
                        sql += ` when (${pkCond}) then `;
                        if (prop.customType && !prop.object && 'convertToDatabaseValueSQL' in prop.customType && !this.platform.isRaw(data[idx][key])) {
                            sql += prop.customType.convertToDatabaseValueSQL('?', this.platform);
                        }
                        else {
                            sql += '?';
                        }
                        params.push(...pks);
                        addParams(prop, prop.fieldNames.length > 1 ? data[idx][key]?.[fieldNameIdx] : data[idx][key]);
                    }
                });
                sql += ` else ${this.platform.quoteIdentifier(fieldName)} end, `;
                return sql;
            });
        }
        if (meta.versionProperty) {
            const versionProperty = meta.properties[meta.versionProperty];
            const quotedFieldName = this.platform.quoteIdentifier(versionProperty.fieldNames[0]);
            sql += `${quotedFieldName} = `;
            if (versionProperty.runtimeType === 'Date') {
                sql += this.platform.getCurrentTimestampSQL(versionProperty.length);
            }
            else {
                sql += `${quotedFieldName} + 1`;
            }
            sql += `, `;
        }
        sql = sql.substring(0, sql.length - 2) + ' where ';
        const pkProps = meta.primaryKeys.concat(...meta.concurrencyCheckKeys);
        const pks = core_1.Utils.flatten(pkProps.map(pk => meta.properties[pk].fieldNames));
        sql += pks.length > 1 ? `(${pks.map(pk => `${this.platform.quoteIdentifier(pk)}`).join(', ')})` : this.platform.quoteIdentifier(pks[0]);
        const conds = where.map(cond => {
            if (core_1.Utils.isPlainObject(cond) && core_1.Utils.getObjectKeysSize(cond) === 1) {
                cond = Object.values(cond)[0];
            }
            if (pks.length > 1) {
                pkProps.forEach(pk => {
                    if (Array.isArray(cond[pk])) {
                        params.push(...core_1.Utils.flatten(cond[pk]));
                    }
                    else {
                        params.push(cond[pk]);
                    }
                });
                return `(${Array.from({ length: pks.length }).fill('?').join(', ')})`;
            }
            params.push(cond);
            return '?';
        });
        sql += ` in (${conds.join(', ')})`;
        if (this.platform.usesReturningStatement() && returning.size > 0) {
            const returningFields = core_1.Utils.flatten([...returning].map(prop => meta.properties[prop].fieldNames));
            /* istanbul ignore next */
            sql += returningFields.length > 0 ? ` returning ${returningFields.map(field => this.platform.quoteIdentifier(field)).join(', ')}` : '';
        }
        const res = await this.rethrow(this.execute(sql, params, 'run', options.ctx));
        for (let i = 0; i < collections.length; i++) {
            await this.processManyToMany(meta, where[i], collections[i], false, options);
        }
        return res;
    }
    async nativeDelete(entityName, where, options = {}) {
        const meta = this.metadata.find(entityName);
        const pks = this.getPrimaryKeyFields(entityName);
        if (core_1.Utils.isPrimaryKey(where) && pks.length === 1) {
            where = { [pks[0]]: where };
        }
        const qb = this.createQueryBuilder(entityName, options.ctx, 'write', false).delete(where).withSchema(this.getSchemaName(meta, options));
        return this.rethrow(qb.execute('run', false));
    }
    /**
     * Fast comparison for collection snapshots that are represented by PK arrays.
     * Compares scalars via `===` and fallbacks to Utils.equals()` for more complex types like Buffer.
     * Always expects the same length of the arrays, since we only compare PKs of the same entity type.
     */
    comparePrimaryKeyArrays(a, b) {
        for (let i = a.length; i-- !== 0;) {
            if (['number', 'string', 'bigint', 'boolean'].includes(typeof a[i])) {
                if (a[i] !== b[i]) {
                    return false;
                }
            }
            else {
                if (!core_1.Utils.equals(a[i], b[i])) {
                    return false;
                }
            }
        }
        return true;
    }
    async syncCollections(collections, options) {
        const groups = {};
        for (const coll of collections) {
            const wrapped = (0, core_1.helper)(coll.owner);
            const meta = wrapped.__meta;
            const pks = wrapped.getPrimaryKeys(true);
            const snap = coll.getSnapshot();
            const includes = (arr, item) => !!arr.find(i => this.comparePrimaryKeyArrays(i, item));
            const snapshot = snap ? snap.map(item => (0, core_1.helper)(item).getPrimaryKeys(true)) : [];
            const current = coll.getItems(false).map(item => (0, core_1.helper)(item).getPrimaryKeys(true));
            const deleteDiff = snap ? snapshot.filter(item => !includes(current, item)) : true;
            const insertDiff = current.filter(item => !includes(snapshot, item));
            const target = snapshot.filter(item => includes(current, item)).concat(...insertDiff);
            const equals = core_1.Utils.equals(current, target);
            // wrong order if we just delete and insert to the end (only owning sides can have fixed order)
            if (coll.property.owner && coll.property.fixedOrder && !equals && Array.isArray(deleteDiff)) {
                deleteDiff.length = insertDiff.length = 0;
                for (const item of snapshot) {
                    deleteDiff.push(item);
                }
                for (const item of current) {
                    insertDiff.push(item);
                }
            }
            if (coll.property.kind === core_1.ReferenceKind.ONE_TO_MANY) {
                const cols = coll.property.referencedColumnNames;
                const qb = this.createQueryBuilder(coll.property.type, options?.ctx, 'write')
                    .withSchema(this.getSchemaName(meta, options));
                if (coll.getSnapshot() === undefined) {
                    if (coll.property.orphanRemoval) {
                        const kqb = qb.delete({ [coll.property.mappedBy]: pks })
                            .getKnexQuery()
                            .whereNotIn(cols, insertDiff);
                        await this.rethrow(this.execute(kqb));
                        continue;
                    }
                    const kqb = qb.update({ [coll.property.mappedBy]: null })
                        .where({ [coll.property.mappedBy]: pks })
                        .getKnexQuery()
                        .andWhere(qb => qb.whereNotIn(cols, insertDiff));
                    await this.rethrow(this.execute(kqb));
                    continue;
                }
                const kqb = qb.update({ [coll.property.mappedBy]: pks })
                    .getKnexQuery()
                    .whereIn(cols, insertDiff);
                await this.rethrow(this.execute(kqb));
                continue;
            }
            /* istanbul ignore next */
            const pivotMeta = this.metadata.find(coll.property.pivotEntity);
            let schema = pivotMeta.schema;
            if (schema === '*') {
                const ownerSchema = wrapped.getSchema() === '*' ? this.config.get('schema') : wrapped.getSchema();
                schema = coll.property.owner ? ownerSchema : this.config.get('schema');
            }
            else if (schema == null) {
                schema = this.config.get('schema');
            }
            const tableName = `${schema ?? '_'}.${pivotMeta.tableName}`;
            const persister = groups[tableName] ??= new PivotCollectionPersister_1.PivotCollectionPersister(pivotMeta, this, options?.ctx, schema);
            persister.enqueueUpdate(coll.property, insertDiff, deleteDiff, pks);
        }
        for (const persister of core_1.Utils.values(groups)) {
            await this.rethrow(persister.execute());
        }
    }
    async loadFromPivotTable(prop, owners, where = {}, orderBy, ctx, options, pivotJoin) {
        const pivotMeta = this.metadata.find(prop.pivotEntity);
        const pivotProp1 = pivotMeta.relations[prop.owner ? 1 : 0];
        const pivotProp2 = pivotMeta.relations[prop.owner ? 0 : 1];
        const ownerMeta = this.metadata.find(pivotProp2.type);
        options = { ...options };
        const qb = this.createQueryBuilder(prop.pivotEntity, ctx, options.connectionType, undefined, options?.logging)
            .withSchema(this.getSchemaName(pivotMeta, options))
            .indexHint(options.indexHint)
            .comment(options.comments)
            .hintComment(options.hintComments);
        const pivotAlias = qb.alias;
        const pivotKey = pivotProp2.joinColumns.map(column => `${pivotAlias}.${column}`).join(core_1.Utils.PK_SEPARATOR);
        const cond = {
            [pivotKey]: { $in: ownerMeta.compositePK ? owners : owners.map(o => o[0]) },
        };
        /* istanbul ignore if */
        if (!core_1.Utils.isEmpty(where) && Object.keys(where).every(k => core_1.Utils.isOperator(k, false))) {
            where = cond;
        }
        else {
            where = { ...where, ...cond };
        }
        orderBy = this.getPivotOrderBy(prop, pivotProp1, pivotAlias, orderBy);
        const populate = this.autoJoinOneToOneOwner(prop.targetMeta, []);
        const fields = [];
        const k1 = !prop.owner ? 'joinColumns' : 'inverseJoinColumns';
        const k2 = prop.owner ? 'joinColumns' : 'inverseJoinColumns';
        const cols = [
            ...prop[k1].map(col => `${pivotAlias}.${col} as fk__${col}`),
            ...prop[k2].map(col => `${pivotAlias}.${col} as fk__${col}`),
        ];
        fields.push(...cols);
        if (!pivotJoin) {
            const targetAlias = qb.getNextAlias(prop.targetMeta.tableName);
            const targetSchema = this.getSchemaName(prop.targetMeta, options) ?? this.platform.getDefaultSchemaName();
            qb.innerJoin(pivotProp1.name, targetAlias, {}, targetSchema);
            const targetFields = this.buildFields(prop.targetMeta, (options.populate ?? []), [], qb, targetAlias, options);
            for (const field of targetFields) {
                const f = field.toString();
                fields.unshift(f.includes('.') ? field : `${targetAlias}.${f}`);
                if (core_1.RawQueryFragment.isKnownFragment(field)) {
                    qb.rawFragments.add(f);
                }
            }
            // we need to handle 1:1 owner auto-joins explicitly, as the QB type is the pivot table, not the target
            populate.forEach(hint => {
                const alias = qb.getNextAlias(prop.targetMeta.tableName);
                qb.leftJoin(`${targetAlias}.${hint.field}`, alias);
                // eslint-disable-next-line dot-notation
                for (const join of Object.values(qb['_joins'])) {
                    const [propName] = hint.field.split(':', 2);
                    if (join.alias === alias && join.prop.name === propName) {
                        fields.push(...qb.helper.mapJoinColumns(qb.type, join));
                    }
                }
            });
        }
        qb.select(fields)
            .where({ [pivotProp1.name]: where })
            .orderBy(orderBy)
            .setLockMode(options.lockMode, options.lockTableAliases);
        if (owners.length === 1 && (options.offset != null || options.limit != null)) {
            qb.limit(options.limit, options.offset);
        }
        const res = owners.length ? await this.rethrow(qb.execute('all', { mergeResults: false, mapResults: false })) : [];
        const tmp = {};
        const items = res.map((row) => {
            const root = super.mapResult(row, prop.targetMeta);
            this.mapJoinedProps(root, prop.targetMeta, populate, qb, root, tmp, pivotMeta.className + '.' + pivotProp1.name);
            return root;
        });
        qb.clearRawFragmentsCache();
        const map = {};
        const pkProps = ownerMeta.getPrimaryProps();
        for (const owner of owners) {
            const key = core_1.Utils.getPrimaryKeyHash(prop.joinColumns.map((_col, idx) => {
                const pkProp = pkProps[idx];
                return pkProp.customType ? pkProp.customType.convertToJSValue(owner[idx], this.platform) : owner[idx];
            }));
            map[key] = [];
        }
        for (const item of items) {
            const key = core_1.Utils.getPrimaryKeyHash(prop.joinColumns.map((col, idx) => {
                const pkProp = pkProps[idx];
                return pkProp.customType ? pkProp.customType.convertToJSValue(item[`fk__${col}`], this.platform) : item[`fk__${col}`];
            }));
            map[key].push(item);
            prop.joinColumns.forEach(col => delete item[`fk__${col}`]);
            prop.inverseJoinColumns.forEach((col, idx) => {
                core_1.Utils.renameKey(item, `fk__${col}`, prop.targetMeta.primaryKeys[idx]);
            });
        }
        return map;
    }
    getPivotOrderBy(prop, pivotProp, pivotAlias, orderBy) {
        // FIXME this is ignoring the rest of the array items
        if (!core_1.Utils.isEmpty(orderBy)) {
            return [{ [pivotProp.name]: core_1.Utils.asArray(orderBy)[0] }];
        }
        if (!core_1.Utils.isEmpty(prop.orderBy)) {
            return [{ [pivotProp.name]: core_1.Utils.asArray(prop.orderBy)[0] }];
        }
        if (prop.fixedOrder) {
            return [{ [`${pivotAlias}.${prop.fixedOrderColumn}`]: core_1.QueryOrder.ASC }];
        }
        return [];
    }
    async execute(queryOrKnex, params = [], method = 'all', ctx, loggerContext) {
        return this.rethrow(this.connection.execute(queryOrKnex, params, method, ctx, loggerContext));
    }
    /**
     * 1:1 owner side needs to be marked for population so QB auto-joins the owner id
     */
    autoJoinOneToOneOwner(meta, populate, fields = []) {
        if (!this.config.get('autoJoinOneToOneOwner')) {
            return populate;
        }
        const relationsToPopulate = populate.map(({ field }) => field.split(':')[0]);
        const toPopulate = meta.relations
            .filter(prop => prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner && !prop.lazy && !relationsToPopulate.includes(prop.name))
            .filter(prop => fields.length === 0 || fields.some(f => prop.name === f || prop.name.startsWith(`${String(f)}.`)))
            .map(prop => ({ field: `${prop.name}:ref`, strategy: prop.strategy }));
        return [...populate, ...toPopulate];
    }
    /**
     * @internal
     */
    joinedProps(meta, populate, options) {
        return populate.filter(hint => {
            const [propName, ref] = hint.field.split(':', 2);
            const prop = meta.properties[propName] || {};
            if (hint.filter && hint.strategy === core_1.LoadStrategy.JOINED) {
                return true;
            }
            // skip redundant joins for 1:1 owner population hints when using `mapToPk`
            if (prop.kind === core_1.ReferenceKind.ONE_TO_ONE && prop.mapToPk && prop.owner) {
                return false;
            }
            if ((options?.strategy || hint.strategy || prop.strategy || this.config.get('loadStrategy')) !== core_1.LoadStrategy.JOINED) {
                // force joined strategy for explicit 1:1 owner populate hint as it would require a join anyway
                return prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner;
            }
            return ![core_1.ReferenceKind.SCALAR, core_1.ReferenceKind.EMBEDDED].includes(prop.kind);
        });
    }
    /**
     * @internal
     */
    mergeJoinedResult(rawResults, meta, joinedProps) {
        const res = [];
        const map = {};
        for (const item of rawResults) {
            const pk = core_1.Utils.getCompositeKeyHash(item, meta);
            if (map[pk]) {
                for (const hint of joinedProps) {
                    const [propName, ref] = hint.field.split(':', 2);
                    const prop = meta.properties[propName];
                    if (!item[propName]) {
                        continue;
                    }
                    if ([core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind) && ref) {
                        map[pk][propName] = [...map[pk][propName], ...item[propName]];
                        continue;
                    }
                    switch (prop.kind) {
                        case core_1.ReferenceKind.ONE_TO_MANY:
                        case core_1.ReferenceKind.MANY_TO_MANY:
                            map[pk][propName] = this.mergeJoinedResult([...map[pk][propName], ...item[propName]], prop.targetMeta, hint.children ?? []);
                            break;
                        case core_1.ReferenceKind.MANY_TO_ONE:
                        case core_1.ReferenceKind.ONE_TO_ONE:
                            map[pk][propName] = this.mergeJoinedResult([map[pk][propName], item[propName]], prop.targetMeta, hint.children ?? [])[0];
                            break;
                    }
                }
            }
            else {
                map[pk] = item;
                res.push(item);
            }
        }
        return res;
    }
    getFieldsForJoinedLoad(qb, meta, explicitFields, exclude, populate = [], options, parentTableAlias, parentJoinPath, count) {
        const fields = [];
        const joinedProps = this.joinedProps(meta, populate, options);
        const shouldHaveColumn = (prop, populate, fields) => {
            if (!this.platform.shouldHaveColumn(prop, populate, exclude)) {
                return false;
            }
            if (!fields || fields.includes('*') || prop.primary) {
                return true;
            }
            return fields.some(f => f === prop.name || f.toString().startsWith(prop.name + '.'));
        };
        const populateWhereAll = options?._populateWhere === 'all' || core_1.Utils.isEmpty(options?._populateWhere);
        // root entity is already handled, skip that
        if (parentJoinPath) {
            // alias all fields in the primary table
            meta.props
                .filter(prop => shouldHaveColumn(prop, populate, explicitFields))
                .forEach(prop => fields.push(...this.mapPropToFieldNames(qb, prop, parentTableAlias)));
        }
        for (const hint of joinedProps) {
            const [propName, ref] = hint.field.split(':', 2);
            const prop = meta.properties[propName];
            // ignore ref joins of known FKs unless it's a filter hint
            if (ref && !hint.filter && (prop.kind === core_1.ReferenceKind.MANY_TO_ONE || (prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner))) {
                continue;
            }
            if (count && (!options?.populateFilter || !options.populateFilter[prop.name])) {
                continue;
            }
            const meta2 = this.metadata.find(prop.type);
            const pivotRefJoin = prop.kind === core_1.ReferenceKind.MANY_TO_MANY && ref;
            const tableAlias = qb.getNextAlias(prop.name);
            const field = parentTableAlias ? `${parentTableAlias}.${prop.name}` : prop.name;
            let path = parentJoinPath ? `${parentJoinPath}.${prop.name}` : `${meta.name}.${prop.name}`;
            if (!parentJoinPath && populateWhereAll && !hint.filter && !path.startsWith('[populate]')) {
                path = '[populate]' + path;
            }
            const joinType = pivotRefJoin
                ? query_1.JoinType.pivotJoin
                : hint.filter && !prop.nullable
                    ? query_1.JoinType.innerJoin
                    : query_1.JoinType.leftJoin;
            qb.join(field, tableAlias, {}, joinType, path);
            if (pivotRefJoin) {
                fields.push(...prop.joinColumns.map(col => qb.helper.mapper(`${tableAlias}.${col}`, qb.type, undefined, `${tableAlias}__${col}`)), ...prop.inverseJoinColumns.map(col => qb.helper.mapper(`${tableAlias}.${col}`, qb.type, undefined, `${tableAlias}__${col}`)));
            }
            if (prop.kind === core_1.ReferenceKind.ONE_TO_MANY && ref) {
                fields.push(...this.getFieldsForJoinedLoad(qb, meta2, prop.referencedColumnNames, undefined, hint.children, options, tableAlias, path, count));
            }
            const childExplicitFields = explicitFields?.filter(f => core_1.Utils.isPlainObject(f)).map(o => o[prop.name])[0] || [];
            explicitFields?.forEach(f => {
                if (typeof f === 'string' && f.startsWith(`${prop.name}.`)) {
                    childExplicitFields.push(f.substring(prop.name.length + 1));
                }
            });
            const childExclude = exclude ? core_1.Utils.extractChildElements(exclude, prop.name) : exclude;
            if (!ref && !prop.mapToPk) {
                fields.push(...this.getFieldsForJoinedLoad(qb, meta2, childExplicitFields.length === 0 ? undefined : childExplicitFields, childExclude, hint.children, options, tableAlias, path, count));
            }
            else if (hint.filter || prop.mapToPk) {
                fields.push(...prop.referencedColumnNames.map(col => qb.helper.mapper(`${tableAlias}.${col}`, qb.type, undefined, `${tableAlias}__${col}`)));
            }
        }
        return fields;
    }
    /**
     * @internal
     */
    mapPropToFieldNames(qb, prop, tableAlias) {
        const aliased = this.platform.quoteIdentifier(tableAlias ? `${tableAlias}__${prop.fieldNames[0]}` : prop.fieldNames[0]);
        if (tableAlias && prop.customTypes?.some(type => type?.convertToJSValueSQL)) {
            return prop.fieldNames.map((col, idx) => {
                if (!prop.customTypes[idx]?.convertToJSValueSQL) {
                    return col;
                }
                const prefixed = this.platform.quoteIdentifier(`${tableAlias}.${col}`);
                const aliased = this.platform.quoteIdentifier(`${tableAlias}__${col}`);
                return (0, core_1.raw)(`${prop.customTypes[idx].convertToJSValueSQL(prefixed, this.platform)} as ${aliased}`);
            });
        }
        if (tableAlias && prop.customType?.convertToJSValueSQL) {
            const prefixed = this.platform.quoteIdentifier(`${tableAlias}.${prop.fieldNames[0]}`);
            return [(0, core_1.raw)(`${prop.customType.convertToJSValueSQL(prefixed, this.platform)} as ${aliased}`)];
        }
        if (prop.formula) {
            const alias = this.platform.quoteIdentifier(tableAlias ?? qb.alias);
            return [(0, core_1.raw)(`${prop.formula(alias)} as ${aliased}`)];
        }
        if (tableAlias) {
            return prop.fieldNames.map(fieldName => {
                return `${tableAlias}.${fieldName} as ${tableAlias}__${fieldName}`;
            });
        }
        return prop.fieldNames;
    }
    /** @internal */
    createQueryBuilder(entityName, ctx, preferredConnectionType, convertCustomTypes, loggerContext, alias, em) {
        // do not compute the connectionType if EM is provided as it will be computed from it in the QB later on
        const connectionType = em ? preferredConnectionType : this.resolveConnectionType({ ctx, connectionType: preferredConnectionType });
        const qb = new query_1.QueryBuilder(entityName, this.metadata, this, ctx, alias, connectionType, em, loggerContext);
        if (!convertCustomTypes) {
            qb.unsetFlag(core_1.QueryFlag.CONVERT_CUSTOM_TYPES);
        }
        return qb;
    }
    resolveConnectionType(args) {
        if (args.ctx) {
            return 'write';
        }
        if (args.connectionType) {
            return args.connectionType;
        }
        if (this.config.get('preferReadReplicas')) {
            return 'read';
        }
        return 'write';
    }
    extractManyToMany(entityName, data) {
        if (!this.metadata.has(entityName)) {
            return {};
        }
        const ret = {};
        this.metadata.find(entityName).relations.forEach(prop => {
            if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && data[prop.name]) {
                ret[prop.name] = data[prop.name].map((item) => core_1.Utils.asArray(item));
                delete data[prop.name];
            }
        });
        return ret;
    }
    async processManyToMany(meta, pks, collections, clear, options) {
        if (!meta) {
            return;
        }
        for (const prop of meta.relations) {
            if (collections[prop.name]) {
                const pivotMeta = this.metadata.find(prop.pivotEntity);
                const persister = new PivotCollectionPersister_1.PivotCollectionPersister(pivotMeta, this, options?.ctx, options?.schema);
                persister.enqueueUpdate(prop, collections[prop.name], clear, pks);
                await this.rethrow(persister.execute());
            }
        }
    }
    async lockPessimistic(entity, options) {
        const meta = (0, core_1.helper)(entity).__meta;
        const qb = this.createQueryBuilder(entity.constructor.name, options.ctx, undefined, undefined, options.logging).withSchema(options.schema ?? meta.schema);
        const cond = core_1.Utils.getPrimaryKeyCond(entity, meta.primaryKeys);
        qb.select((0, core_1.raw)('1')).where(cond).setLockMode(options.lockMode, options.lockTableAliases);
        await this.rethrow(qb.execute());
    }
    buildPopulateWhere(meta, joinedProps, options) {
        const where = {};
        for (const hint of joinedProps) {
            const [propName] = hint.field.split(':', 2);
            const prop = meta.properties[propName];
            if (!core_1.Utils.isEmpty(prop.where)) {
                where[prop.name] = core_1.Utils.copy(prop.where);
            }
            if (hint.children) {
                const inner = this.buildPopulateWhere(prop.targetMeta, hint.children, {});
                if (!core_1.Utils.isEmpty(inner)) {
                    where[prop.name] ??= {};
                    Object.assign(where[prop.name], inner);
                }
            }
        }
        if (core_1.Utils.isEmpty(options.populateWhere)) {
            return where;
        }
        if (core_1.Utils.isEmpty(where)) {
            return options.populateWhere;
        }
        /* istanbul ignore next */
        return { $and: [options.populateWhere, where] };
    }
    buildOrderBy(qb, meta, populate, options) {
        const joinedProps = this.joinedProps(meta, populate, options);
        // `options._populateWhere` is a copy of the value provided by user with a fallback to the global config option
        // as `options.populateWhere` will be always recomputed to respect filters
        const populateWhereAll = options._populateWhere !== 'infer' && !core_1.Utils.isEmpty(options._populateWhere);
        const path = (populateWhereAll ? '[populate]' : '') + meta.className;
        const populateOrderBy = this.buildPopulateOrderBy(qb, meta, core_1.Utils.asArray(options.populateOrderBy ?? options.orderBy), path, !!options.populateOrderBy);
        const joinedPropsOrderBy = this.buildJoinedPropsOrderBy(qb, meta, joinedProps, options, path);
        return [...core_1.Utils.asArray(options.orderBy), ...populateOrderBy, ...joinedPropsOrderBy];
    }
    buildPopulateOrderBy(qb, meta, populateOrderBy, parentPath, explicit, parentAlias = qb.alias) {
        const orderBy = [];
        for (let i = 0; i < populateOrderBy.length; i++) {
            const orderHint = populateOrderBy[i];
            for (const propName of core_1.Utils.keys(orderHint)) {
                const raw = core_1.RawQueryFragment.getKnownFragment(propName, explicit);
                if (raw) {
                    const sql = raw.sql.replace(new RegExp(core_1.ALIAS_REPLACEMENT_RE, 'g'), parentAlias);
                    const raw2 = new core_1.RawQueryFragment(sql, raw.params);
                    orderBy.push({ [raw2]: orderHint[propName] });
                    continue;
                }
                const prop = meta.properties[propName];
                if (!prop) {
                    throw new Error(`Trying to order by not existing property ${meta.className}.${propName}`);
                }
                let path = parentPath;
                const meta2 = this.metadata.find(prop.type);
                const childOrder = orderHint[prop.name];
                if (![core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) || !prop.owner || core_1.Utils.isPlainObject(childOrder)) {
                    path += `.${propName}`;
                }
                if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && typeof childOrder !== 'object') {
                    path += '[pivot]';
                }
                const join = qb.getJoinForPath(path, { matchPopulateJoins: true });
                const propAlias = qb.getAliasForJoinPath(join ?? path, { matchPopulateJoins: true }) ?? parentAlias;
                if (!join && parentAlias === qb.alias) {
                    continue;
                }
                if (![core_1.ReferenceKind.SCALAR, core_1.ReferenceKind.EMBEDDED].includes(prop.kind) && typeof childOrder === 'object') {
                    const children = this.buildPopulateOrderBy(qb, meta2, core_1.Utils.asArray(childOrder), path, explicit, propAlias);
                    orderBy.push(...children);
                    continue;
                }
                if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && join) {
                    if (prop.fixedOrderColumn) {
                        orderBy.push({ [`${join.alias}.${prop.fixedOrderColumn}`]: childOrder });
                    }
                    else {
                        for (const col of prop.inverseJoinColumns) {
                            orderBy.push({ [`${join.ownerAlias}.${col}`]: childOrder });
                        }
                    }
                    continue;
                }
                const order = typeof childOrder === 'object' ? childOrder[propName] : childOrder;
                if (order) {
                    orderBy.push({ [`${propAlias}.${propName}`]: order });
                }
            }
        }
        return orderBy;
    }
    buildJoinedPropsOrderBy(qb, meta, populate, options, parentPath) {
        const orderBy = [];
        const joinedProps = this.joinedProps(meta, populate, options);
        for (const hint of joinedProps) {
            const [propName, ref] = hint.field.split(':', 2);
            const prop = meta.properties[propName];
            const propOrderBy = prop.orderBy;
            let path = `${parentPath}.${propName}`;
            if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && ref) {
                path += '[pivot]';
            }
            const join = qb.getJoinForPath(path, { matchPopulateJoins: true });
            const propAlias = qb.getAliasForJoinPath(join ?? path, { matchPopulateJoins: true });
            const meta2 = this.metadata.find(prop.type);
            if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && prop.fixedOrder && join) {
                const alias = ref ? propAlias : join.ownerAlias;
                orderBy.push({ [`${alias}.${prop.fixedOrderColumn}`]: core_1.QueryOrder.ASC });
            }
            if (propOrderBy) {
                for (const item of core_1.Utils.asArray(propOrderBy)) {
                    for (const field of core_1.Utils.keys(item)) {
                        const rawField = core_1.RawQueryFragment.getKnownFragment(field, false);
                        if (rawField) {
                            const sql = propAlias ? rawField.sql.replace(new RegExp(core_1.ALIAS_REPLACEMENT_RE, 'g'), propAlias) : rawField.sql;
                            const raw2 = (0, core_1.raw)(sql, rawField.params);
                            orderBy.push({ [raw2.toString()]: item[field] });
                            continue;
                        }
                        orderBy.push({ [`${propAlias}.${field}`]: item[field] });
                    }
                }
            }
            if (hint.children) {
                const buildJoinedPropsOrderBy = this.buildJoinedPropsOrderBy(qb, meta2, hint.children, options, path);
                orderBy.push(...buildJoinedPropsOrderBy);
            }
        }
        return orderBy;
    }
    normalizeFields(fields, prefix = '') {
        const ret = [];
        for (const field of fields) {
            if (typeof field === 'string') {
                ret.push(prefix + field);
                continue;
            }
            if (core_1.Utils.isPlainObject(field)) {
                for (const key of Object.keys(field)) {
                    ret.push(...this.normalizeFields(field[key], key + '.'));
                }
            }
        }
        return ret;
    }
    processField(meta, prop, field, ret, populate, joinedProps, qb) {
        if (!prop || (prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner)) {
            return;
        }
        if (prop.kind === core_1.ReferenceKind.EMBEDDED) {
            if (prop.object) {
                ret.push(prop.name);
                return;
            }
            const parts = field.split('.');
            const top = parts.shift();
            for (const key of Object.keys(prop.embeddedProps)) {
                if (!top || key === top) {
                    this.processField(meta, prop.embeddedProps[key], parts.join('.'), ret, populate, joinedProps, qb);
                }
            }
            return;
        }
        if (prop.persist === false && !prop.embedded && !prop.formula) {
            return;
        }
        ret.push(prop.name);
    }
    isPopulated(meta, prop, hint, name) {
        if (hint.field === prop.name || hint.field === name || hint.all) {
            return true;
        }
        if (prop.embedded && hint.children && meta.properties[prop.embedded[0]].name === hint.field) {
            return hint.children.some(c => this.isPopulated(meta, prop, c, prop.embedded[1]));
        }
        return false;
    }
    buildFields(meta, populate, joinedProps, qb, alias, options, count = false) {
        const lazyProps = meta.props.filter(prop => prop.lazy && !populate.some(p => this.isPopulated(meta, prop, p)));
        const hasLazyFormulas = meta.props.some(p => p.lazy && p.formula);
        const requiresSQLConversion = meta.props.some(p => p.customType?.convertToJSValueSQL && p.persist !== false);
        const hasExplicitFields = !!options.fields;
        const ret = [];
        let addFormulas = false;
        // handle root entity properties first, this is used for both strategies in the same way
        if (options.fields) {
            for (const field of this.normalizeFields(options.fields)) {
                if (field === '*') {
                    ret.push('*');
                    continue;
                }
                const parts = field.split('.');
                const rootPropName = parts.shift(); // first one is the `prop`
                const prop = core_1.QueryHelper.findProperty(rootPropName, {
                    metadata: this.metadata,
                    platform: this.platform,
                    entityName: meta.className,
                    where: {},
                    aliasMap: qb.getAliasMap(),
                });
                this.processField(meta, prop, parts.join('.'), ret, populate, joinedProps, qb);
            }
            if (!options.fields.includes('*') && !options.fields.includes(`${qb.alias}.*`)) {
                ret.unshift(...meta.primaryKeys.filter(pk => !options.fields.includes(pk)));
            }
        }
        else if (!core_1.Utils.isEmpty(options.exclude) || lazyProps.some(p => !p.formula && (p.kind !== '1:1' || p.owner))) {
            const props = meta.props.filter(prop => this.platform.shouldHaveColumn(prop, populate, options.exclude, false));
            ret.push(...props.filter(p => !lazyProps.includes(p)).map(p => p.name));
            addFormulas = true;
        }
        else if (hasLazyFormulas || requiresSQLConversion) {
            ret.push('*');
            addFormulas = true;
        }
        else {
            ret.push('*');
        }
        if (ret.length > 0 && !hasExplicitFields && addFormulas) {
            meta.props
                .filter(prop => prop.formula && !lazyProps.includes(prop))
                .forEach(prop => {
                const a = this.platform.quoteIdentifier(alias);
                const aliased = this.platform.quoteIdentifier(prop.fieldNames[0]);
                ret.push((0, core_1.raw)(`${prop.formula(a)} as ${aliased}`));
            });
            meta.props
                .filter(prop => !prop.object && (prop.hasConvertToDatabaseValueSQL || prop.hasConvertToJSValueSQL))
                .forEach(prop => ret.push(prop.name));
        }
        // add joined relations after the root entity fields
        if (joinedProps.length > 0) {
            ret.push(...this.getFieldsForJoinedLoad(qb, meta, options.fields, options.exclude, populate, options, alias, undefined, count));
        }
        return core_1.Utils.unique(ret);
    }
}
exports.AbstractSqlDriver = AbstractSqlDriver;
