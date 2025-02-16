"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryHelper = void 0;
const Reference_1 = require("../entity/Reference");
const Utils_1 = require("./Utils");
const enums_1 = require("../enums");
const JsonType_1 = require("../types/JsonType");
const wrap_1 = require("../entity/wrap");
const RawQueryFragment_1 = require("./RawQueryFragment");
class QueryHelper {
    static SUPPORTED_OPERATORS = ['>', '<', '<=', '>=', '!', '!='];
    static processParams(params) {
        if (Reference_1.Reference.isReference(params)) {
            params = params.unwrap();
        }
        if (Utils_1.Utils.isEntity(params)) {
            if ((0, wrap_1.helper)(params).__meta.compositePK) {
                return (0, wrap_1.helper)(params).__primaryKeys;
            }
            return (0, wrap_1.helper)(params).getPrimaryKey();
        }
        if (params === undefined) {
            return null;
        }
        if (Array.isArray(params)) {
            return params.map(item => QueryHelper.processParams(item));
        }
        if (Utils_1.Utils.isPlainObject(params)) {
            QueryHelper.processObjectParams(params);
        }
        return params;
    }
    static processObjectParams(params = {}) {
        Utils_1.Utils.keys(params).forEach(k => {
            params[k] = QueryHelper.processParams(params[k]);
        });
        return params;
    }
    static inlinePrimaryKeyObjects(where, meta, metadata, key) {
        if (Array.isArray(where)) {
            where.forEach((item, i) => {
                if (this.inlinePrimaryKeyObjects(item, meta, metadata, key)) {
                    where[i] = Utils_1.Utils.getPrimaryKeyValues(item, meta.primaryKeys, false);
                }
            });
        }
        if (!Utils_1.Utils.isPlainObject(where) || (key && meta.properties[key]?.customType instanceof JsonType_1.JsonType)) {
            return false;
        }
        if (meta.primaryKeys.every(pk => pk in where) && Utils_1.Utils.getObjectKeysSize(where) === meta.primaryKeys.length) {
            return !!key && !enums_1.GroupOperator[key] && Object.keys(where).every(k => !Utils_1.Utils.isPlainObject(where[k]) || Object.keys(where[k]).every(v => {
                if (Utils_1.Utils.isOperator(v, false)) {
                    return false;
                }
                if (meta.properties[k].primary && [enums_1.ReferenceKind.ONE_TO_ONE, enums_1.ReferenceKind.MANY_TO_ONE].includes(meta.properties[k].kind)) {
                    return this.inlinePrimaryKeyObjects(where[k], meta.properties[k].targetMeta, metadata, v);
                }
                return true;
            }));
        }
        Object.keys(where).forEach(k => {
            const meta2 = metadata.find(meta.properties[k]?.type) || meta;
            if (this.inlinePrimaryKeyObjects(where[k], meta2, metadata, k)) {
                where[k] = Utils_1.Utils.getPrimaryKeyValues(where[k], meta2.primaryKeys, true);
            }
        });
        return false;
    }
    static processWhere(options) {
        // eslint-disable-next-line prefer-const
        let { where, entityName, metadata, platform, aliased = true, convertCustomTypes = true, root = true } = options;
        const meta = metadata.find(entityName);
        // inline PK-only objects in M:N queries, so we don't join the target entity when not needed
        if (meta && root) {
            QueryHelper.inlinePrimaryKeyObjects(where, meta, metadata);
        }
        if (options.platform.getConfig().get('ignoreUndefinedInQuery') && where && typeof where === 'object') {
            Utils_1.Utils.dropUndefinedProperties(where);
        }
        where = QueryHelper.processParams(where) ?? {};
        /* istanbul ignore next */
        if (!root && Utils_1.Utils.isPrimaryKey(where)) {
            return where;
        }
        if (meta && Utils_1.Utils.isPrimaryKey(where, meta.compositePK)) {
            where = { [Utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys)]: where };
        }
        if (Array.isArray(where) && root) {
            const rootPrimaryKey = meta ? Utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys) : entityName;
            let cond = { [rootPrimaryKey]: { $in: where } };
            // @ts-ignore
            // detect tuple comparison, use `$or` in case the number of constituents don't match
            if (meta && !where.every(c => Utils_1.Utils.isPrimaryKey(c) || (Array.isArray(c) && c.length === meta.primaryKeys.length && c.every(i => Utils_1.Utils.isPrimaryKey(i))))) {
                cond = { $or: where };
            }
            return QueryHelper.processWhere({ ...options, where: cond, root: false });
        }
        if (!Utils_1.Utils.isPlainObject(where)) {
            return where;
        }
        return Object.keys(where).reduce((o, key) => {
            let value = where[key];
            const prop = this.findProperty(key, options);
            const keys = prop?.joinColumns?.length ?? 0;
            const composite = keys > 1;
            if (Array.isArray(value) && value.length === 0 && RawQueryFragment_1.RawQueryFragment.isKnownFragment(key)) {
                o[key] = value;
                return o;
            }
            if (key in enums_1.GroupOperator) {
                o[key] = value.map((sub) => QueryHelper.processWhere({ ...options, where: sub, root }));
                return o;
            }
            // wrap top level operators (except platform allowed operators) with PK
            if (Utils_1.Utils.isOperator(key) && root && meta && !options.platform.isAllowedTopLevelOperator(key)) {
                const rootPrimaryKey = Utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys);
                o[rootPrimaryKey] = { [key]: QueryHelper.processWhere({ ...options, where: value, root: false }) };
                return o;
            }
            if (prop?.customType && convertCustomTypes && !platform.isRaw(value)) {
                value = QueryHelper.processCustomType(prop, value, platform, undefined, true);
            }
            const isJsonProperty = prop?.customType instanceof JsonType_1.JsonType && Utils_1.Utils.isPlainObject(value) && !platform.isRaw(value) && Object.keys(value)[0] !== '$eq';
            if (isJsonProperty) {
                return this.processJsonCondition(o, value, [prop.fieldNames[0]], platform, aliased);
            }
            if (Array.isArray(value) && !Utils_1.Utils.isOperator(key) && !QueryHelper.isSupportedOperator(key) && !key.includes('?') && options.type !== 'orderBy') {
                // comparing single composite key - use $eq instead of $in
                const op = composite && !value.every(v => Array.isArray(v)) ? '$eq' : '$in';
                o[key] = { [op]: value };
                return o;
            }
            if (Utils_1.Utils.isPlainObject(value)) {
                o[key] = QueryHelper.processWhere({
                    ...options,
                    where: value,
                    entityName: prop?.type ?? entityName,
                    root: false,
                });
            }
            else {
                o[key] = value;
            }
            return o;
        }, {});
    }
    static getActiveFilters(entityName, options, filters) {
        if (options === false) {
            return [];
        }
        const opts = {};
        if (Array.isArray(options)) {
            options.forEach(filter => opts[filter] = true);
        }
        else if (Utils_1.Utils.isPlainObject(options)) {
            Object.keys(options).forEach(filter => opts[filter] = options[filter]);
        }
        return Object.keys(filters)
            .filter(f => QueryHelper.isFilterActive(entityName, f, filters[f], opts))
            .map(f => {
            filters[f].name = f;
            return filters[f];
        });
    }
    static isFilterActive(entityName, filterName, filter, options) {
        if (filter.entity && !filter.entity.includes(entityName)) {
            return false;
        }
        if (options[filterName] === false) {
            return false;
        }
        return filter.default || filterName in options;
    }
    static processCustomType(prop, cond, platform, key, fromQuery) {
        if (Utils_1.Utils.isPlainObject(cond)) {
            return Utils_1.Utils.keys(cond).reduce((o, k) => {
                if (Utils_1.Utils.isOperator(k, true) || prop.referencedPKs?.includes(k)) {
                    o[k] = QueryHelper.processCustomType(prop, cond[k], platform, k, fromQuery);
                }
                else {
                    o[k] = cond[k];
                }
                return o;
            }, {});
        }
        if (key && Utils_1.Utils.isJsonKeyOperator(key)) {
            return Array.isArray(cond)
                ? platform.marshallArray(cond)
                : cond;
        }
        if (Array.isArray(cond) && !(key && Utils_1.Utils.isArrayOperator(key))) {
            return cond.map(v => QueryHelper.processCustomType(prop, v, platform, key, fromQuery));
        }
        if (platform.isRaw(cond)) {
            return cond;
        }
        return prop.customType.convertToDatabaseValue(cond, platform, { fromQuery, key, mode: 'query' });
    }
    static isSupportedOperator(key) {
        return !!QueryHelper.SUPPORTED_OPERATORS.find(op => key === op);
    }
    static processJsonCondition(o, value, path, platform, alias) {
        if (Utils_1.Utils.isPlainObject(value) && !Object.keys(value).some(k => Utils_1.Utils.isOperator(k))) {
            Utils_1.Utils.keys(value).forEach(k => {
                this.processJsonCondition(o, value[k], [...path, k], platform, alias);
            });
            return o;
        }
        if (path.length === 1) {
            o[path[0]] = value;
            return o;
        }
        const type = this.getValueType(value);
        const k = platform.getSearchJsonPropertyKey(path, type, alias, value);
        o[k] = value;
        return o;
    }
    static getValueType(value) {
        if (Array.isArray(value)) {
            return typeof value[0];
        }
        if (Utils_1.Utils.isPlainObject(value) && Object.keys(value).every(k => Utils_1.Utils.isOperator(k))) {
            return this.getValueType(Object.values(value)[0]);
        }
        return typeof value;
    }
    static findProperty(fieldName, options) {
        const parts = fieldName.split('.');
        const propName = parts.pop();
        const alias = parts.length > 0 ? parts.join('.') : undefined;
        const entityName = alias ? options.aliasMap?.[alias] : options.entityName;
        const meta = entityName ? options.metadata.find(entityName) : undefined;
        return meta?.properties[propName];
    }
}
exports.QueryHelper = QueryHelper;
