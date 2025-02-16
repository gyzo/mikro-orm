"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDriver = void 0;
const bson_1 = require("bson");
const core_1 = require("@mikro-orm/core");
const MongoConnection_1 = require("./MongoConnection");
const MongoPlatform_1 = require("./MongoPlatform");
const MongoEntityManager_1 = require("./MongoEntityManager");
class MongoDriver extends core_1.DatabaseDriver {
    [core_1.EntityManagerType];
    connection = new MongoConnection_1.MongoConnection(this.config);
    platform = new MongoPlatform_1.MongoPlatform();
    constructor(config) {
        super(config, ['mongodb']);
    }
    createEntityManager(useContext) {
        const EntityManagerClass = this.config.get('entityManager', MongoEntityManager_1.MongoEntityManager);
        return new EntityManagerClass(this.config, this, this.metadata, useContext);
    }
    async find(entityName, where, options = {}) {
        if (this.metadata.find(entityName)?.virtual) {
            return this.findVirtual(entityName, where, options);
        }
        const { first, last, before, after } = options;
        const fields = this.buildFields(entityName, options.populate || [], options.fields, options.exclude);
        where = this.renameFields(entityName, where, true);
        const isCursorPagination = [first, last, before, after].some(v => v != null);
        if (isCursorPagination) {
            const andWhere = (cond1, cond2) => {
                if (core_1.Utils.isEmpty(cond1)) {
                    return cond2;
                }
                if (core_1.Utils.isEmpty(cond2)) {
                    return cond1;
                }
                return { $and: [cond1, cond2] };
            };
            const meta = this.metadata.find(entityName);
            const { orderBy: newOrderBy, where: newWhere } = this.processCursorOptions(meta, options, options.orderBy);
            const newWhereConverted = this.renameFields(entityName, newWhere, true);
            const orderBy = core_1.Utils.asArray(newOrderBy).map(order => this.renameFields(entityName, order, true));
            const res = await this.rethrow(this.getConnection('read').find(entityName, andWhere(where, newWhereConverted), orderBy, options.limit, options.offset, fields, options.ctx, options.logging));
            if (isCursorPagination && !first && !!last) {
                res.reverse();
            }
            return res.map(r => this.mapResult(r, this.metadata.find(entityName)));
        }
        const orderBy = core_1.Utils.asArray(options.orderBy).map(orderBy => this.renameFields(entityName, orderBy, true));
        const res = await this.rethrow(this.getConnection('read').find(entityName, where, orderBy, options.limit, options.offset, fields, options.ctx));
        return res.map(r => this.mapResult(r, this.metadata.find(entityName)));
    }
    async findOne(entityName, where, options = { populate: [], orderBy: {} }) {
        if (this.metadata.find(entityName)?.virtual) {
            const [item] = await this.findVirtual(entityName, where, options);
            /* istanbul ignore next */
            return item ?? null;
        }
        if (core_1.Utils.isPrimaryKey(where)) {
            where = this.buildFilterById(entityName, where);
        }
        const fields = this.buildFields(entityName, options.populate || [], options.fields, options.exclude);
        where = this.renameFields(entityName, where, true);
        const orderBy = core_1.Utils.asArray(options.orderBy).map(orderBy => this.renameFields(entityName, orderBy, true));
        const res = await this.rethrow(this.getConnection('read').find(entityName, where, orderBy, 1, undefined, fields, options.ctx, options.logging));
        return this.mapResult(res[0], this.metadata.find(entityName));
    }
    async findVirtual(entityName, where, options) {
        const meta = this.metadata.find(entityName);
        if (meta.expression instanceof Function) {
            const em = this.createEntityManager();
            return meta.expression(em, where, options);
        }
        /* istanbul ignore next */
        return super.findVirtual(entityName, where, options);
    }
    async count(entityName, where, options = {}, ctx) {
        /* istanbul ignore next */
        if (this.metadata.find(entityName)?.virtual) {
            return this.countVirtual(entityName, where, options);
        }
        where = this.renameFields(entityName, where, true);
        return this.rethrow(this.getConnection('read').countDocuments(entityName, where, ctx));
    }
    async nativeInsert(entityName, data, options = {}) {
        data = this.renameFields(entityName, data);
        return this.rethrow(this.getConnection('write').insertOne(entityName, data, options.ctx));
    }
    async nativeInsertMany(entityName, data, options = {}) {
        data = data.map(d => this.renameFields(entityName, d));
        const meta = this.metadata.find(entityName);
        /* istanbul ignore next */
        const pk = meta?.getPrimaryProps()[0].fieldNames[0] ?? '_id';
        const res = await this.rethrow(this.getConnection('write').insertMany(entityName, data, options.ctx));
        res.rows = res.insertedIds.map(id => ({ [pk]: id }));
        return res;
    }
    async nativeUpdate(entityName, where, data, options = {}) {
        if (core_1.Utils.isPrimaryKey(where)) {
            where = this.buildFilterById(entityName, where);
        }
        where = this.renameFields(entityName, where, true);
        data = this.renameFields(entityName, data);
        options = { ...options };
        const meta = this.metadata.find(entityName);
        /* istanbul ignore next */
        const rename = (field) => meta ? (meta.properties[field]?.fieldNames[0] ?? field) : field;
        if (options.onConflictFields && Array.isArray(options.onConflictFields)) {
            options.onConflictFields = options.onConflictFields.map(rename);
        }
        if (options.onConflictMergeFields) {
            options.onConflictMergeFields = options.onConflictMergeFields.map(rename);
        }
        if (options.onConflictExcludeFields) {
            options.onConflictExcludeFields = options.onConflictExcludeFields.map(rename);
        }
        return this.rethrow(this.getConnection('write').updateMany(entityName, where, data, options.ctx, options.upsert, options));
    }
    async nativeUpdateMany(entityName, where, data, options = {}) {
        where = where.map(row => {
            if (core_1.Utils.isPlainObject(row)) {
                return this.renameFields(entityName, row, true);
            }
            return row;
        });
        data = data.map(row => this.renameFields(entityName, row));
        options = { ...options };
        const meta = this.metadata.find(entityName);
        /* istanbul ignore next */
        const rename = (field) => meta ? (meta.properties[field]?.fieldNames[0] ?? field) : field;
        if (options.onConflictFields && Array.isArray(options.onConflictFields)) {
            options.onConflictFields = options.onConflictFields.map(rename);
        }
        if (options.onConflictMergeFields) {
            options.onConflictMergeFields = options.onConflictMergeFields.map(rename);
        }
        if (options.onConflictExcludeFields) {
            options.onConflictExcludeFields = options.onConflictExcludeFields.map(rename);
        }
        /* istanbul ignore next */
        const pk = meta?.getPrimaryProps()[0].fieldNames[0] ?? '_id';
        const res = await this.rethrow(this.getConnection('write').bulkUpdateMany(entityName, where, data, options.ctx, options.upsert, options));
        if (res.insertedIds) {
            let i = 0;
            res.rows = where.map(cond => {
                if (core_1.Utils.isEmpty(cond)) {
                    return { [pk]: res.insertedIds[i++] };
                }
                return { [pk]: cond[pk] };
            });
        }
        return res;
    }
    async nativeDelete(entityName, where, options = {}) {
        if (core_1.Utils.isPrimaryKey(where)) {
            where = this.buildFilterById(entityName, where);
        }
        where = this.renameFields(entityName, where, true);
        return this.rethrow(this.getConnection('write').deleteMany(entityName, where, options.ctx));
    }
    async aggregate(entityName, pipeline, ctx) {
        return this.rethrow(this.getConnection('read').aggregate(entityName, pipeline, ctx));
    }
    getPlatform() {
        return this.platform;
    }
    renameFields(entityName, data, dotPaths = false, object) {
        // copy to new variable to prevent changing the T type or doing as unknown casts
        const copiedData = Object.assign({}, data); // copy first
        const meta = this.metadata.find(entityName);
        if (meta?.serializedPrimaryKey && !meta.embeddable && meta.serializedPrimaryKey !== meta.primaryKeys[0]) {
            core_1.Utils.renameKey(copiedData, meta.serializedPrimaryKey, meta.primaryKeys[0]);
        }
        if (meta && !meta.embeddable) {
            this.inlineEmbeddables(meta, copiedData, dotPaths);
        }
        // If we had a query with $fulltext and some filter we end up with $and with $fulltext in it.
        // We will try to move $fulltext to top level.
        if (copiedData.$and) {
            for (let i = 0; i < copiedData.$and.length; i++) {
                const and = copiedData.$and[i];
                if ('$fulltext' in and) {
                    /* istanbul ignore next */
                    if ('$fulltext' in copiedData) {
                        throw new Error('Cannot merge multiple $fulltext conditions to top level of the query object.');
                    }
                    copiedData.$fulltext = and.$fulltext;
                    delete and.$fulltext;
                }
            }
        }
        // move search terms from data['$fulltext'] to mongo's structure: data['$text']['search']
        if ('$fulltext' in copiedData) {
            copiedData.$text = { $search: copiedData.$fulltext };
            delete copiedData.$fulltext;
        }
        // mongo only allows the $text operator in the root of the object and will
        // search all documents where the field has a text index.
        if (core_1.Utils.hasNestedKey(copiedData, '$fulltext')) {
            throw new Error('Full text search is only supported on the top level of the query object.');
        }
        core_1.Utils.keys(copiedData).forEach(k => {
            if (core_1.Utils.isGroupOperator(k)) {
                /* istanbul ignore else */
                if (Array.isArray(copiedData[k])) {
                    copiedData[k] = copiedData[k].map(v => this.renameFields(entityName, v));
                }
                else {
                    copiedData[k] = this.renameFields(entityName, copiedData[k]);
                }
                return;
            }
            if (meta?.properties[k]) {
                const prop = meta.properties[k];
                let isObjectId = false;
                if (prop.kind === core_1.ReferenceKind.SCALAR) {
                    isObjectId = prop.type.toLowerCase() === 'objectid';
                }
                else if (prop.kind === core_1.ReferenceKind.EMBEDDED) {
                    if (copiedData[prop.name] == null) {
                        return;
                    }
                    if (prop.array && Array.isArray(copiedData[prop.name])) {
                        copiedData[prop.name] = copiedData[prop.name].map((item) => this.renameFields(prop.type, item, dotPaths, true));
                    }
                    else {
                        copiedData[prop.name] = this.renameFields(prop.type, copiedData[prop.name], dotPaths, prop.object || object);
                    }
                }
                else {
                    const meta2 = this.metadata.find(prop.type);
                    const pk = meta2.properties[meta2.primaryKeys[0]];
                    isObjectId = pk.type.toLowerCase() === 'objectid';
                }
                if (isObjectId) {
                    copiedData[k] = this.convertObjectIds(copiedData[k]);
                }
                if (prop.fieldNames) {
                    core_1.Utils.renameKey(copiedData, k, prop.fieldNames[0]);
                }
            }
            if (core_1.Utils.isPlainObject(copiedData[k]) && '$re' in copiedData[k]) {
                copiedData[k] = new RegExp(copiedData[k].$re);
            }
        });
        return copiedData;
    }
    convertObjectIds(data) {
        if (data instanceof bson_1.ObjectId) {
            return data;
        }
        if (core_1.Utils.isString(data) && data.match(/^[0-9a-f]{24}$/i)) {
            return new bson_1.ObjectId(data);
        }
        if (Array.isArray(data)) {
            return data.map((item) => this.convertObjectIds(item));
        }
        if (core_1.Utils.isObject(data)) {
            Object.keys(data).forEach(k => {
                data[k] = this.convertObjectIds(data[k]);
            });
        }
        return data;
    }
    buildFilterById(entityName, id) {
        const meta = this.metadata.find(entityName);
        if (meta.properties[meta.primaryKeys[0]].type.toLowerCase() === 'objectid') {
            return { _id: new bson_1.ObjectId(id) };
        }
        return { _id: id };
    }
    buildFields(entityName, populate, fields, exclude) {
        const meta = this.metadata.find(entityName);
        if (!meta) {
            return fields;
        }
        const lazyProps = meta.props.filter(prop => prop.lazy && !populate.some(p => p.field === prop.name || p.all));
        const ret = [];
        if (fields) {
            for (let field of fields) {
                /* istanbul ignore next */
                if (core_1.Utils.isPlainObject(field)) {
                    continue;
                }
                if (field.toString().includes('.')) {
                    field = field.toString().substring(0, field.toString().indexOf('.'));
                }
                let prop = meta.properties[field];
                /* istanbul ignore else */
                if (prop) {
                    if (!prop.fieldNames) {
                        continue;
                    }
                    prop = prop.serializedPrimaryKey ? meta.getPrimaryProps()[0] : prop;
                    ret.push(prop.fieldNames[0]);
                }
                else if (field === '*') {
                    const props = meta.props.filter(prop => this.platform.shouldHaveColumn(prop, populate));
                    ret.push(...core_1.Utils.flatten(props.filter(p => !lazyProps.includes(p)).map(p => p.fieldNames)));
                }
                else {
                    ret.push(field);
                }
            }
            ret.unshift(...meta.primaryKeys.filter(pk => !fields.includes(pk)));
        }
        else if (!core_1.Utils.isEmpty(exclude) || lazyProps.some(p => !p.formula)) {
            const props = meta.props.filter(prop => this.platform.shouldHaveColumn(prop, populate, exclude));
            ret.push(...core_1.Utils.flatten(props.filter(p => !lazyProps.includes(p)).map(p => p.fieldNames)));
        }
        return ret.length > 0 ? ret : undefined;
    }
}
exports.MongoDriver = MongoDriver;
