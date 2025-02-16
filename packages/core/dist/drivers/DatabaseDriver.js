"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseDriver = void 0;
const IDatabaseDriver_1 = require("./IDatabaseDriver");
const utils_1 = require("../utils");
const enums_1 = require("../enums");
const EntityManager_1 = require("../EntityManager");
const errors_1 = require("../errors");
const exceptions_1 = require("../exceptions");
const wrap_1 = require("../entity/wrap");
const JsonType_1 = require("../types/JsonType");
class DatabaseDriver {
    config;
    dependencies;
    [IDatabaseDriver_1.EntityManagerType];
    connection;
    replicas = [];
    platform;
    logger;
    comparator;
    metadata;
    constructor(config, dependencies) {
        this.config = config;
        this.dependencies = dependencies;
        this.logger = this.config.getLogger();
    }
    async nativeUpdateMany(entityName, where, data, options) {
        throw new Error(`Batch updates are not supported by ${this.constructor.name} driver`);
    }
    createEntityManager(useContext) {
        const EntityManagerClass = this.config.get('entityManager', EntityManager_1.EntityManager);
        return new EntityManagerClass(this.config, this, this.metadata, useContext);
    }
    /* istanbul ignore next */
    async findVirtual(entityName, where, options) {
        throw new Error(`Virtual entities are not supported by ${this.constructor.name} driver.`);
    }
    /* istanbul ignore next */
    async countVirtual(entityName, where, options) {
        throw new Error(`Counting virtual entities is not supported by ${this.constructor.name} driver.`);
    }
    async aggregate(entityName, pipeline) {
        throw new Error(`Aggregations are not supported by ${this.constructor.name} driver`);
    }
    async loadFromPivotTable(prop, owners, where, orderBy, ctx, options, pivotJoin) {
        throw new Error(`${this.constructor.name} does not use pivot tables`);
    }
    async syncCollections(collections, options) {
        for (const coll of collections) {
            if (!coll.property.owner) {
                if (coll.getSnapshot() === undefined) {
                    throw errors_1.ValidationError.cannotModifyInverseCollection(coll.owner, coll.property);
                }
                continue;
            }
            /* istanbul ignore next */
            {
                const pk = coll.property.targetMeta.primaryKeys[0];
                const data = { [coll.property.name]: coll.getIdentifiers(pk) };
                await this.nativeUpdate(coll.owner.constructor.name, (0, wrap_1.helper)(coll.owner).getPrimaryKey(), data, options);
            }
        }
    }
    mapResult(result, meta, populate = []) {
        if (!result || !meta) {
            return result ?? null;
        }
        return this.comparator.mapResult(meta.className, result);
    }
    async connect() {
        await this.connection.connect();
        await Promise.all(this.replicas.map(replica => replica.connect()));
        return this.connection;
    }
    async reconnect() {
        await this.close(true);
        await this.connect();
        return this.connection;
    }
    getConnection(type = 'write') {
        if (type === 'write' || this.replicas.length === 0) {
            return this.connection;
        }
        const rand = utils_1.Utils.randomInt(0, this.replicas.length - 1);
        return this.replicas[rand];
    }
    async close(force) {
        await Promise.all(this.replicas.map(replica => replica.close(force)));
        await this.connection.close(force);
    }
    getPlatform() {
        return this.platform;
    }
    setMetadata(metadata) {
        this.metadata = metadata;
        this.comparator = new utils_1.EntityComparator(this.metadata, this.platform);
        this.connection.setMetadata(metadata);
        this.connection.setPlatform(this.platform);
        this.replicas.forEach(replica => {
            replica.setMetadata(metadata);
            replica.setPlatform(this.platform);
        });
    }
    getMetadata() {
        return this.metadata;
    }
    getDependencies() {
        return this.dependencies;
    }
    processCursorOptions(meta, options, orderBy) {
        const { first, last, before, after, overfetch } = options;
        const limit = first ?? last;
        const isLast = !first && !!last;
        const definition = utils_1.Cursor.getDefinition(meta, orderBy);
        const $and = [];
        // allow POJO as well, we care only about the correct key being present
        const isCursor = (val, key) => {
            return !!val && typeof val === 'object' && key in val;
        };
        const createCursor = (val, key, inverse = false) => {
            let def = isCursor(val, key) ? val[key] : val;
            if (utils_1.Utils.isPlainObject(def)) {
                def = utils_1.Cursor.for(meta, def, orderBy);
            }
            /* istanbul ignore next */
            const offsets = def ? utils_1.Cursor.decode(def) : [];
            if (definition.length === offsets.length) {
                return this.createCursorCondition(definition, offsets, inverse, meta);
            }
            /* istanbul ignore next */
            return {};
        };
        if (after) {
            $and.push(createCursor(after, 'endCursor'));
        }
        if (before) {
            $and.push(createCursor(before, 'startCursor', true));
        }
        if (limit != null) {
            options.limit = limit + (overfetch ? 1 : 0);
        }
        const createOrderBy = (prop, direction) => {
            if (utils_1.Utils.isPlainObject(direction)) {
                const value = utils_1.Utils.keys(direction).reduce((o, key) => {
                    Object.assign(o, createOrderBy(key, direction[key]));
                    return o;
                }, {});
                return ({ [prop]: value });
            }
            const desc = direction === enums_1.QueryOrderNumeric.DESC || direction.toString().toLowerCase() === 'desc';
            const dir = utils_1.Utils.xor(desc, isLast) ? 'desc' : 'asc';
            return ({ [prop]: dir });
        };
        return {
            orderBy: definition.map(([prop, direction]) => createOrderBy(prop, direction)),
            where: ($and.length > 1 ? { $and } : { ...$and[0] }),
        };
    }
    /* istanbul ignore next */
    createCursorCondition(definition, offsets, inverse, meta) {
        const createCondition = (prop, direction, offset, eq = false) => {
            if (offset === null) {
                throw errors_1.CursorError.missingValue(meta.className, prop);
            }
            if (utils_1.Utils.isPlainObject(direction)) {
                const value = utils_1.Utils.keys(direction).reduce((o, key) => {
                    if (utils_1.Utils.isEmpty(offset[key])) {
                        throw errors_1.CursorError.missingValue(meta.className, `${prop}.${key}`);
                    }
                    Object.assign(o, createCondition(key, direction[key], offset[key], eq));
                    return o;
                }, {});
                return ({ [prop]: value });
            }
            const desc = direction === enums_1.QueryOrderNumeric.DESC || direction.toString().toLowerCase() === 'desc';
            const operator = utils_1.Utils.xor(desc, inverse) ? '$lt' : '$gt';
            return { [prop]: { [operator + (eq ? 'e' : '')]: offset } };
        };
        const [order, ...otherOrders] = definition;
        const [offset, ...otherOffsets] = offsets;
        const [prop, direction] = order;
        if (!otherOrders.length) {
            return createCondition(prop, direction, offset);
        }
        return {
            ...createCondition(prop, direction, offset, true),
            $or: [
                createCondition(prop, direction, offset),
                this.createCursorCondition(otherOrders, otherOffsets, inverse, meta),
            ],
        };
    }
    /** @internal */
    mapDataToFieldNames(data, stringifyJsonArrays, properties, convertCustomTypes, object) {
        if (!properties || data == null) {
            return data;
        }
        data = Object.assign({}, data); // copy first
        Object.keys(data).forEach(k => {
            const prop = properties[k];
            if (!prop) {
                return;
            }
            if (prop.embeddedProps && !prop.object && !object) {
                const copy = data[k];
                delete data[k];
                Object.assign(data, this.mapDataToFieldNames(copy, stringifyJsonArrays, prop.embeddedProps, convertCustomTypes));
                return;
            }
            if (prop.embeddedProps && (object || prop.object)) {
                const copy = data[k];
                delete data[k];
                if (prop.array) {
                    data[prop.fieldNames[0]] = copy?.map((item) => this.mapDataToFieldNames(item, stringifyJsonArrays, prop.embeddedProps, convertCustomTypes, true));
                }
                else {
                    data[prop.fieldNames[0]] = this.mapDataToFieldNames(copy, stringifyJsonArrays, prop.embeddedProps, convertCustomTypes, true);
                }
                if (stringifyJsonArrays && prop.array) {
                    data[prop.fieldNames[0]] = this.platform.convertJsonToDatabaseValue(data[prop.fieldNames[0]]);
                }
                return;
            }
            if (prop.joinColumns && Array.isArray(data[k])) {
                const copy = utils_1.Utils.flatten(data[k]);
                delete data[k];
                prop.joinColumns.forEach((joinColumn, idx) => data[joinColumn] = copy[idx]);
                return;
            }
            if (prop.joinColumns?.length > 1 && data[k] == null) {
                delete data[k];
                prop.ownColumns.forEach(joinColumn => data[joinColumn] = null);
                return;
            }
            if (prop.customType && convertCustomTypes && !(prop.customType instanceof JsonType_1.JsonType && object) && !this.platform.isRaw(data[k])) {
                data[k] = prop.customType.convertToDatabaseValue(data[k], this.platform, { fromQuery: true, key: k, mode: 'query-data' });
            }
            if (prop.hasConvertToDatabaseValueSQL && !prop.object && !this.platform.isRaw(data[k])) {
                const quoted = this.platform.quoteValue(data[k]);
                const sql = prop.customType.convertToDatabaseValueSQL(quoted, this.platform);
                data[k] = (0, utils_1.raw)(sql.replace(/\?/g, '\\?'));
            }
            /* istanbul ignore next */
            if (!prop.customType && (Array.isArray(data[k]) || utils_1.Utils.isPlainObject(data[k]))) {
                data[k] = JSON.stringify(data[k]);
            }
            if (prop.fieldNames) {
                utils_1.Utils.renameKey(data, k, prop.fieldNames[0]);
            }
        });
        return data;
    }
    inlineEmbeddables(meta, data, where) {
        /* istanbul ignore next */
        if (data == null) {
            return;
        }
        utils_1.Utils.keys(data).forEach(k => {
            if (utils_1.Utils.isOperator(k)) {
                utils_1.Utils.asArray(data[k]).forEach(payload => this.inlineEmbeddables(meta, payload, where));
            }
        });
        meta.props.forEach(prop => {
            if (prop.kind === enums_1.ReferenceKind.EMBEDDED && prop.object && !where && utils_1.Utils.isObject(data[prop.name])) {
                return;
            }
            if (prop.kind === enums_1.ReferenceKind.EMBEDDED && utils_1.Utils.isObject(data[prop.name])) {
                const props = prop.embeddedProps;
                let unknownProp = false;
                Object.keys(data[prop.name]).forEach(kk => {
                    // explicitly allow `$exists`, `$eq` and `$ne` operators here as they can't be misused this way
                    const operator = Object.keys(data[prop.name]).some(f => utils_1.Utils.isOperator(f) && !['$exists', '$ne', '$eq'].includes(f));
                    if (operator) {
                        throw errors_1.ValidationError.cannotUseOperatorsInsideEmbeddables(meta.className, prop.name, data);
                    }
                    if (prop.object && where) {
                        const inline = (payload, sub, path) => {
                            if (sub.kind === enums_1.ReferenceKind.EMBEDDED && utils_1.Utils.isObject(payload[sub.embedded[1]])) {
                                return Object.keys(payload[sub.embedded[1]]).forEach(kkk => {
                                    if (!sub.embeddedProps[kkk]) {
                                        throw errors_1.ValidationError.invalidEmbeddableQuery(meta.className, kkk, sub.type);
                                    }
                                    inline(payload[sub.embedded[1]], sub.embeddedProps[kkk], [...path, sub.embedded[1]]);
                                });
                            }
                            data[`${path.join('.')}.${sub.embedded[1]}`] = payload[sub.embedded[1]];
                        };
                        const parentPropName = kk.substring(0, kk.indexOf('.'));
                        // we might be using some native JSON operator, e.g. with mongodb's `$geoWithin` or `$exists`
                        if (props[kk]) {
                            /* istanbul ignore next */
                            inline(data[prop.name], props[kk] || props[parentPropName], [prop.name]);
                        }
                        else if (props[parentPropName]) {
                            data[`${prop.name}.${kk}`] = data[prop.name][kk];
                        }
                        else {
                            unknownProp = true;
                        }
                    }
                    else if (props[kk]) {
                        data[props[kk].name] = data[prop.name][props[kk].embedded[1]];
                    }
                    else {
                        throw errors_1.ValidationError.invalidEmbeddableQuery(meta.className, kk, prop.type);
                    }
                });
                if (!unknownProp) {
                    delete data[prop.name];
                }
            }
        });
    }
    getPrimaryKeyFields(entityName) {
        const meta = this.metadata.find(entityName);
        return meta ? utils_1.Utils.flatten(meta.getPrimaryProps().map(pk => pk.fieldNames)) : [this.config.getNamingStrategy().referenceColumnName()];
    }
    createReplicas(cb) {
        const replicas = this.config.get('replicas', []);
        const ret = [];
        const props = ['dbName', 'clientUrl', 'host', 'port', 'user', 'password', 'multipleStatements', 'pool', 'name', 'driverOptions'];
        for (const conf of replicas) {
            const replicaConfig = utils_1.Utils.copy(conf);
            for (const prop of props) {
                if (conf[prop]) {
                    continue;
                }
                // do not copy options that can be inferred from explicitly provided `clientUrl`
                if (conf.clientUrl && ['clientUrl', 'host', 'port', 'user', 'password'].includes(prop)) {
                    continue;
                }
                if (conf.clientUrl && prop === 'dbName' && new URL(conf.clientUrl).pathname) {
                    continue;
                }
                replicaConfig[prop] = this.config.get(prop);
            }
            ret.push(cb(replicaConfig));
        }
        return ret;
    }
    async lockPessimistic(entity, options) {
        throw new Error(`Pessimistic locks are not supported by ${this.constructor.name} driver`);
    }
    /**
     * @inheritDoc
     */
    convertException(exception) {
        if (exception instanceof exceptions_1.DriverException) {
            return exception;
        }
        return this.platform.getExceptionConverter().convertException(exception);
    }
    rethrow(promise) {
        return promise.catch(e => {
            throw this.convertException(e);
        });
    }
    /**
     * @internal
     */
    getTableName(meta, options, quote = true) {
        const schema = this.getSchemaName(meta, options);
        const tableName = schema ? `${schema}.${meta.tableName}` : meta.tableName;
        if (quote) {
            return this.platform.quoteIdentifier(tableName);
        }
        return tableName;
    }
    /**
     * @internal
     */
    getSchemaName(meta, options) {
        if (meta?.schema && meta.schema !== '*') {
            return meta.schema;
        }
        if (options?.schema === '*') {
            return this.config.get('schema');
        }
        const schemaName = meta?.schema === '*' ? this.config.get('schema') : meta?.schema;
        return options?.schema ?? schemaName ?? this.config.get('schema');
    }
}
exports.DatabaseDriver = DatabaseDriver;
