"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoSchemaGenerator = void 0;
const core_1 = require("@mikro-orm/core");
class MongoSchemaGenerator extends core_1.AbstractSchemaGenerator {
    static register(orm) {
        orm.config.registerExtension('@mikro-orm/schema-generator', () => new MongoSchemaGenerator(orm.em));
    }
    async createSchema(options = {}) {
        options.ensureIndexes ??= true;
        const existing = await this.connection.listCollections();
        const metadata = this.getOrderedMetadata();
        metadata.push({ collection: this.config.get('migrations').tableName });
        /* istanbul ignore next */
        const promises = metadata
            .filter(meta => !existing.includes(meta.collection))
            .map(meta => this.connection.createCollection(meta.collection).catch(err => {
            const existsErrorMessage = `Collection ${this.config.get('dbName')}.${meta.collection} already exists.`;
            // ignore errors about the collection already existing
            if (!(err.name === 'MongoServerError' && err.message.includes(existsErrorMessage))) {
                throw err;
            }
        }));
        if (options.ensureIndexes) {
            await this.ensureIndexes({ ensureCollections: false });
        }
        await Promise.all(promises);
    }
    async dropSchema(options = {}) {
        const db = this.connection.getDb();
        const collections = await db.listCollections().toArray();
        const existing = collections.map(c => c.name);
        const metadata = this.getOrderedMetadata();
        if (options.dropMigrationsTable) {
            metadata.push({ collection: this.config.get('migrations').tableName });
        }
        const promises = metadata
            .filter(meta => existing.includes(meta.collection))
            .map(meta => this.connection.dropCollection(meta.collection));
        await Promise.all(promises);
    }
    async updateSchema(options = {}) {
        await this.createSchema(options);
    }
    async ensureDatabase() {
        return false;
    }
    async refreshDatabase(options = {}) {
        await this.ensureDatabase();
        await this.dropSchema();
        await this.createSchema(options);
    }
    async dropIndexes(options) {
        const db = this.connection.getDb();
        const collections = await db.listCollections().toArray();
        const promises = [];
        for (const collection of collections) {
            if (options?.collectionsWithFailedIndexes && !options.collectionsWithFailedIndexes.includes(collection.name)) {
                continue;
            }
            const indexes = await db.collection(collection.name).listIndexes().toArray();
            for (const index of indexes) {
                const isIdIndex = index.key._id === 1 && core_1.Utils.getObjectKeysSize(index.key) === 1;
                /* istanbul ignore next */
                if (!isIdIndex && !options?.skipIndexes?.find(idx => idx.collection === collection.name && idx.indexName === index.name)) {
                    promises.push(db.collection(collection.name).dropIndex(index.name));
                }
            }
        }
        await Promise.all(promises);
    }
    async ensureIndexes(options = {}) {
        options.ensureCollections ??= true;
        options.retryLimit ??= 3;
        if (options.ensureCollections) {
            await this.createSchema({ ensureIndexes: false });
        }
        const promises = [];
        for (const meta of this.getOrderedMetadata()) {
            if (Array.isArray(options?.retry) && !options.retry.includes(meta.collection)) {
                continue;
            }
            promises.push(...this.createIndexes(meta));
            promises.push(...this.createUniqueIndexes(meta));
            for (const prop of meta.props) {
                promises.push(...this.createPropertyIndexes(meta, prop, 'index'));
                promises.push(...this.createPropertyIndexes(meta, prop, 'unique'));
            }
        }
        const res = await Promise.allSettled(promises.map(p => p[1]));
        if (res.some(r => r.status === 'rejected') && options.retry !== false) {
            const skipIndexes = [];
            const collectionsWithFailedIndexes = [];
            const errors = [];
            for (let i = 0; i < res.length; i++) {
                const r = res[i];
                if (r.status === 'rejected') {
                    collectionsWithFailedIndexes.push(promises[i][0]);
                    errors.push(r.reason);
                }
                else {
                    skipIndexes.push({ collection: promises[i][0], indexName: r.value });
                }
            }
            await this.dropIndexes({ skipIndexes, collectionsWithFailedIndexes });
            if (options.retryLimit === 0) {
                const details = errors.map(e => e.message).join('\n');
                const message = `Failed to create indexes on the following collections: ${collectionsWithFailedIndexes.join(', ')}\n${details}`;
                throw new Error(message, { cause: errors });
            }
            await this.ensureIndexes({
                retry: collectionsWithFailedIndexes,
                retryLimit: options.retryLimit - 1,
            });
        }
    }
    createIndexes(meta) {
        const res = [];
        meta.indexes.forEach(index => {
            let fieldOrSpec;
            const properties = core_1.Utils.flatten(core_1.Utils.asArray(index.properties).map(prop => meta.properties[prop].fieldNames));
            const collection = this.connection.getCollection(meta.className);
            if (Array.isArray(index.options) && index.options.length === 2 && properties.length === 0) {
                res.push([collection.collectionName, collection.createIndex(index.options[0], index.options[1])]);
                return;
            }
            if (index.options && properties.length === 0) {
                res.push([collection.collectionName, collection.createIndex(index.options)]);
                return;
            }
            if (index.type) {
                if (index.type === 'fulltext') {
                    index.type = 'text';
                }
                const spec = {};
                properties.forEach(prop => spec[prop] = index.type);
                fieldOrSpec = spec;
            }
            else {
                fieldOrSpec = properties.reduce((o, i) => { o[i] = 1; return o; }, {});
            }
            res.push([collection.collectionName, collection.createIndex(fieldOrSpec, {
                    name: index.name,
                    unique: false,
                    ...index.options,
                })]);
        });
        return res;
    }
    createUniqueIndexes(meta) {
        const res = [];
        meta.uniques.forEach(index => {
            const properties = core_1.Utils.flatten(core_1.Utils.asArray(index.properties).map(prop => meta.properties[prop].fieldNames));
            const fieldOrSpec = properties.reduce((o, i) => { o[i] = 1; return o; }, {});
            const collection = this.connection.getCollection(meta.className);
            res.push([collection.collectionName, collection.createIndex(fieldOrSpec, {
                    name: index.name,
                    unique: true,
                    ...index.options,
                })]);
        });
        return res;
    }
    createPropertyIndexes(meta, prop, type) {
        if (!prop[type] || !meta.collection) {
            return [];
        }
        const collection = this.connection.getCollection(meta.className);
        const fieldOrSpec = prop.embeddedPath
            ? prop.embeddedPath.join('.')
            : prop.fieldNames.reduce((o, i) => { o[i] = 1; return o; }, {});
        return [[collection.collectionName, collection.createIndex(fieldOrSpec, {
                    name: (core_1.Utils.isString(prop[type]) ? prop[type] : undefined),
                    unique: type === 'unique',
                    sparse: prop.nullable === true,
                })]];
    }
}
exports.MongoSchemaGenerator = MongoSchemaGenerator;
