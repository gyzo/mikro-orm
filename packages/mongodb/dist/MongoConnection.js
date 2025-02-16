"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoConnection = void 0;
const mongodb_1 = require("mongodb");
const bson_1 = require("bson");
const node_util_1 = require("node:util");
const core_1 = require("@mikro-orm/core");
class MongoConnection extends core_1.Connection {
    client;
    db;
    constructor(config, options, type = 'write') {
        super(config, options, type);
        // @ts-ignore
        bson_1.ObjectId.prototype[node_util_1.inspect.custom] = function () {
            return `ObjectId('${this.toHexString()}')`;
        };
        // @ts-ignore
        Date.prototype[node_util_1.inspect.custom] = function () {
            return `ISODate('${this.toISOString()}')`;
        };
    }
    async connect() {
        const driverOptions = this.config.get('driverOptions');
        if (driverOptions instanceof mongodb_1.MongoClient) {
            this.logger.log('info', 'Reusing MongoClient provided via `driverOptions`');
            this.client = driverOptions;
        }
        else {
            this.client = new mongodb_1.MongoClient(this.config.getClientUrl(), this.getConnectionOptions());
            await this.client.connect();
        }
        this.db = this.client.db(this.config.get('dbName'));
        this.connected = true;
    }
    async close(force) {
        await this.client?.close(!!force);
        this.connected = false;
    }
    async isConnected() {
        try {
            const res = await this.db?.command({ ping: 1 });
            return this.connected = !!res.ok;
        }
        catch (error) {
            return this.connected = false;
        }
    }
    async checkConnection() {
        try {
            const res = await this.db?.command({ ping: 1 });
            return res.ok
                ? { ok: true }
                : { ok: false, reason: 'Ping reply does not feature "ok" property, or it evaluates to "false"' };
        }
        catch (error) {
            return { ok: false, reason: error.message, error };
        }
    }
    getClient() {
        return this.client;
    }
    getCollection(name) {
        return this.db.collection(this.getCollectionName(name));
    }
    async createCollection(name) {
        return this.db.createCollection(this.getCollectionName(name));
    }
    async listCollections() {
        const collections = await this.db.listCollections({}, { nameOnly: true }).toArray();
        return collections.map(c => c.name);
    }
    async dropCollection(name) {
        return this.db.dropCollection(this.getCollectionName(name));
    }
    getDefaultClientUrl() {
        return 'mongodb://127.0.0.1:27017';
    }
    getConnectionOptions() {
        const ret = {};
        const pool = this.config.get('pool');
        const username = this.config.get('user');
        const password = this.config.get('password');
        if (this.config.get('host')) {
            throw new core_1.ValidationError('Mongo driver does not support `host` options, use `clientUrl` instead!');
        }
        if (username && password) {
            ret.auth = { username, password };
        }
        if (pool.min) {
            ret.minPoolSize = pool.min;
        }
        if (pool.max) {
            ret.maxPoolSize = pool.max;
        }
        ret.driverInfo = {
            name: 'MikroORM',
            version: core_1.Utils.getORMVersion(),
        };
        return core_1.Utils.mergeConfig(ret, this.config.get('driverOptions'));
    }
    getClientUrl() {
        const options = this.getConnectionOptions();
        const clientUrl = this.config.getClientUrl(true);
        const match = clientUrl.match(/^(\w+):\/\/((.*@.+)|.+)$/);
        return match ? `${match[1]}://${options.auth ? options.auth.username + ':*****@' : ''}${match[2]}` : clientUrl;
    }
    getDb() {
        return this.db;
    }
    async execute(query) {
        throw new Error(`${this.constructor.name} does not support generic execute method`);
    }
    async find(collection, where, orderBy, limit, offset, fields, ctx, loggerContext) {
        await this.ensureConnection();
        collection = this.getCollectionName(collection);
        const options = ctx ? { session: ctx } : {};
        if (fields) {
            options.projection = fields.reduce((o, k) => Object.assign(o, { [k]: 1 }), {});
        }
        const resultSet = this.getCollection(collection).find(where, options);
        let query = `db.getCollection('${collection}').find(${this.logObject(where)}, ${this.logObject(options)})`;
        orderBy = core_1.Utils.asArray(orderBy);
        if (Array.isArray(orderBy) && orderBy.length > 0) {
            const orderByTuples = [];
            orderBy.forEach(o => {
                core_1.Utils.keys(o).forEach(k => {
                    const direction = o[k];
                    orderByTuples.push([k.toString(), core_1.Utils.isString(direction) ? direction.toUpperCase() === core_1.QueryOrder.ASC ? 1 : -1 : direction]);
                });
            });
            if (orderByTuples.length > 0) {
                query += `.sort(${this.logObject(orderByTuples)})`;
                // @ts-expect-error ??
                resultSet.sort(orderByTuples);
            }
        }
        if (limit !== undefined) {
            query += `.limit(${limit})`;
            resultSet.limit(limit);
        }
        if (offset !== undefined) {
            query += `.skip(${offset})`;
            resultSet.skip(offset);
        }
        const now = Date.now();
        const res = await resultSet.toArray();
        this.logQuery(`${query}.toArray();`, { took: Date.now() - now, results: res.length, ...loggerContext });
        return res;
    }
    async insertOne(collection, data, ctx) {
        return this.runQuery('insertOne', collection, data, undefined, ctx);
    }
    async insertMany(collection, data, ctx) {
        return this.runQuery('insertMany', collection, data, undefined, ctx);
    }
    async updateMany(collection, where, data, ctx, upsert, upsertOptions) {
        return this.runQuery('updateMany', collection, data, where, ctx, upsert, upsertOptions);
    }
    async bulkUpdateMany(collection, where, data, ctx, upsert, upsertOptions) {
        return this.runQuery('bulkUpdateMany', collection, data, where, ctx, upsert, upsertOptions);
    }
    async deleteMany(collection, where, ctx) {
        return this.runQuery('deleteMany', collection, undefined, where, ctx);
    }
    async aggregate(collection, pipeline, ctx, loggerContext) {
        await this.ensureConnection();
        collection = this.getCollectionName(collection);
        /* istanbul ignore next */
        const options = ctx ? { session: ctx } : {};
        const query = `db.getCollection('${collection}').aggregate(${this.logObject(pipeline)}, ${this.logObject(options)}).toArray();`;
        const now = Date.now();
        const res = await this.getCollection(collection).aggregate(pipeline, options).toArray();
        this.logQuery(query, { took: Date.now() - now, results: res.length, ...loggerContext });
        return res;
    }
    async countDocuments(collection, where, ctx) {
        return this.runQuery('countDocuments', collection, undefined, where, ctx);
    }
    async transactional(cb, options = {}) {
        await this.ensureConnection();
        const session = await this.begin(options);
        try {
            const ret = await cb(session);
            await this.commit(session, options.eventBroadcaster);
            return ret;
        }
        catch (error) {
            await this.rollback(session, options.eventBroadcaster);
            throw error;
        }
        finally {
            await session.endSession();
        }
    }
    async begin(options = {}) {
        await this.ensureConnection();
        const { ctx, isolationLevel, eventBroadcaster, ...txOptions } = options;
        if (!ctx) {
            await eventBroadcaster?.dispatchEvent(core_1.EventType.beforeTransactionStart);
        }
        const session = ctx || this.client.startSession();
        session.startTransaction(txOptions);
        this.logQuery('db.begin();');
        await eventBroadcaster?.dispatchEvent(core_1.EventType.afterTransactionStart, session);
        return session;
    }
    async commit(ctx, eventBroadcaster) {
        await this.ensureConnection();
        await eventBroadcaster?.dispatchEvent(core_1.EventType.beforeTransactionCommit, ctx);
        await ctx.commitTransaction();
        this.logQuery('db.commit();');
        await eventBroadcaster?.dispatchEvent(core_1.EventType.afterTransactionCommit, ctx);
    }
    async rollback(ctx, eventBroadcaster) {
        await this.ensureConnection();
        await eventBroadcaster?.dispatchEvent(core_1.EventType.beforeTransactionRollback, ctx);
        await ctx.abortTransaction();
        this.logQuery('db.rollback();');
        await eventBroadcaster?.dispatchEvent(core_1.EventType.afterTransactionRollback, ctx);
    }
    async runQuery(method, collection, data, where, ctx, upsert, upsertOptions, loggerContext) {
        await this.ensureConnection();
        collection = this.getCollectionName(collection);
        const logger = this.config.getLogger();
        const options = ctx ? { session: ctx, upsert } : { upsert };
        if (options.upsert === undefined) {
            delete options.upsert;
        }
        const now = Date.now();
        let res;
        let query;
        const log = (msg) => logger.isEnabled('query') ? msg() : '';
        switch (method) {
            case 'insertOne':
                Object.keys(data).filter(k => typeof data[k] === 'undefined').forEach(k => delete data[k]);
                query = log(() => `db.getCollection('${collection}').insertOne(${this.logObject(data)}, ${this.logObject(options)});`);
                res = await this.rethrow(this.getCollection(collection).insertOne(data, options), query);
                break;
            case 'insertMany':
                data.forEach(data => Object.keys(data).filter(k => typeof data[k] === 'undefined').forEach(k => delete data[k]));
                query = log(() => `db.getCollection('${collection}').insertMany(${this.logObject(data)}, ${this.logObject(options)});`);
                res = await this.rethrow(this.getCollection(collection).insertMany(data, options), query);
                break;
            case 'updateMany': {
                const payload = Object.keys(data).some(k => k.startsWith('$')) ? data : this.createUpdatePayload(data, upsertOptions);
                query = log(() => `db.getCollection('${collection}').updateMany(${this.logObject(where)}, ${this.logObject(payload)}, ${this.logObject(options)});`);
                res = await this.rethrow(this.getCollection(collection).updateMany(where, payload, options), query);
                break;
            }
            case 'bulkUpdateMany': {
                query = log(() => `bulk = db.getCollection('${collection}').initializeUnorderedBulkOp(${this.logObject(options)});\n`);
                const bulk = this.getCollection(collection).initializeUnorderedBulkOp(options);
                data.forEach((row, idx) => {
                    const id = where[idx];
                    const cond = core_1.Utils.isPlainObject(id) ? id : { _id: id };
                    const doc = this.createUpdatePayload(row, upsertOptions);
                    if (upsert) {
                        if (core_1.Utils.isEmpty(cond)) {
                            query += log(() => `bulk.insert(${this.logObject(row)});\n`);
                            bulk.insert(row);
                        }
                        else {
                            query += log(() => `bulk.find(${this.logObject(cond)}).upsert().update(${this.logObject(doc)});\n`);
                            bulk.find(cond).upsert().update(doc);
                        }
                        return;
                    }
                    query += log(() => `bulk.find(${this.logObject(cond)}).update(${this.logObject(doc)});\n`);
                    bulk.find(cond).update(doc);
                });
                query += log(() => `bulk.execute()`);
                res = await this.rethrow(bulk.execute(), query);
                break;
            }
            case 'deleteMany':
            case 'countDocuments':
                query = log(() => `db.getCollection('${collection}').${method}(${this.logObject(where)}, ${this.logObject(options)});`);
                res = await this.rethrow(this.getCollection(collection)[method](where, options), query);
                break;
        }
        this.logQuery(query, { took: Date.now() - now, ...loggerContext });
        if (method === 'countDocuments') {
            return res;
        }
        return this.transformResult(res);
    }
    rethrow(promise, query) {
        return promise.catch(e => {
            this.logQuery(query, { level: 'error' });
            e.message += '\nQuery: ' + query;
            throw e;
        });
    }
    createUpdatePayload(row, upsertOptions) {
        const doc = { $set: row };
        const $unset = {};
        core_1.Utils.keys(row)
            .filter(k => typeof row[k] === 'undefined')
            .forEach(k => {
            $unset[k] = '';
            delete row[k];
        });
        if (upsertOptions) {
            if (upsertOptions.onConflictAction === 'ignore') {
                doc.$setOnInsert = doc.$set;
                delete doc.$set;
            }
            if (upsertOptions.onConflictMergeFields) {
                doc.$setOnInsert = {};
                upsertOptions.onConflictMergeFields.forEach(f => {
                    doc.$setOnInsert[f] = doc.$set[f];
                    delete doc.$set[f];
                });
                const { $set, $setOnInsert } = doc;
                doc.$set = $setOnInsert;
                doc.$setOnInsert = $set;
            }
            else if (upsertOptions.onConflictExcludeFields) {
                doc.$setOnInsert = {};
                upsertOptions.onConflictExcludeFields.forEach(f => {
                    doc.$setOnInsert[f] = doc.$set[f];
                    delete doc.$set[f];
                });
            }
        }
        if (core_1.Utils.hasObjectKeys($unset)) {
            doc.$unset = $unset;
            if (!core_1.Utils.hasObjectKeys(doc.$set)) {
                delete doc.$set;
            }
        }
        return doc;
    }
    transformResult(res) {
        return {
            affectedRows: res.modifiedCount || res.deletedCount || res.insertedCount || 0,
            insertId: res.insertedId ?? res.insertedIds?.[0],
            insertedIds: res.insertedIds ? Object.values(res.insertedIds) : undefined,
        };
    }
    getCollectionName(name) {
        name = core_1.Utils.className(name);
        const meta = this.metadata.find(name);
        return meta ? meta.collection : name;
    }
    logObject(o) {
        if (o.session) {
            o = { ...o, session: `[ClientSession]` };
        }
        return (0, node_util_1.inspect)(o, { depth: 5, compact: true, breakLength: 300 });
    }
}
exports.MongoConnection = MongoConnection;
