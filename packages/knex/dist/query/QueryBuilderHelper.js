"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilderHelper = void 0;
const node_util_1 = require("node:util");
const core_1 = require("@mikro-orm/core");
const enums_1 = require("./enums");
/**
 * @internal
 */
class QueryBuilderHelper {
    entityName;
    alias;
    aliasMap;
    subQueries;
    knex;
    driver;
    platform;
    metadata;
    constructor(entityName, alias, aliasMap, subQueries, knex, driver) {
        this.entityName = entityName;
        this.alias = alias;
        this.aliasMap = aliasMap;
        this.subQueries = subQueries;
        this.knex = knex;
        this.driver = driver;
        this.platform = this.driver.getPlatform();
        this.metadata = this.driver.getMetadata();
    }
    mapper(field, type = enums_1.QueryType.SELECT, value, alias) {
        if (core_1.Utils.isRawSql(field)) {
            return this.knex.raw(field.sql, field.params);
        }
        /* istanbul ignore next */
        if (typeof field !== 'string') {
            return field;
        }
        const isTableNameAliasRequired = this.isTableNameAliasRequired(type);
        const fields = core_1.Utils.splitPrimaryKeys(field);
        if (fields.length > 1) {
            const parts = [];
            for (const p of fields) {
                const [a, f] = this.splitField(p);
                const prop = this.getProperty(f, a);
                const fkIdx2 = prop?.fieldNames.findIndex(name => name === f) ?? -1;
                if (fkIdx2 !== -1) {
                    parts.push(this.mapper(a !== this.alias ? `${a}.${prop.fieldNames[fkIdx2]}` : prop.fieldNames[fkIdx2], type, value, alias));
                }
                else if (prop) {
                    parts.push(...prop.fieldNames.map(f => this.mapper(a !== this.alias ? `${a}.${f}` : f, type, value, alias)));
                }
                else {
                    parts.push(this.mapper(a !== this.alias ? `${a}.${f}` : f, type, value, alias));
                }
            }
            // flatten the value if we see we are expanding nested composite key
            // hackish, but cleaner solution would require quite a lot of refactoring
            if (fields.length !== parts.length && Array.isArray(value)) {
                value.forEach(row => {
                    if (Array.isArray(row)) {
                        const tmp = core_1.Utils.flatten(row);
                        row.length = 0;
                        row.push(...tmp);
                    }
                });
            }
            return this.knex.raw('(' + parts.map(part => this.knex.ref(part)).join(', ') + ')');
        }
        const rawField = core_1.RawQueryFragment.getKnownFragment(field);
        if (rawField) {
            // sometimes knex is confusing the binding positions, we need to interpolate early
            return this.knex.raw(this.platform.formatQuery(rawField.sql, rawField.params));
        }
        const [a, f] = this.splitField(field);
        const prop = this.getProperty(f, a);
        const fkIdx2 = prop?.fieldNames.findIndex(name => name === f) ?? -1;
        const fkIdx = fkIdx2 === -1 ? 0 : fkIdx2;
        let ret = field;
        // embeddable nested path instead of a regular property with table alias, reset alias
        if (prop?.name === a && prop.embeddedProps[f]) {
            return this.alias + '.' + prop.fieldNames[fkIdx];
        }
        const noPrefix = prop && prop.persist === false;
        if (prop?.fieldNameRaw) {
            return this.knex.raw(this.prefix(field, isTableNameAliasRequired));
        }
        if (prop?.formula) {
            const alias2 = this.knex.ref(a).toString();
            const aliased = this.knex.ref(prop.fieldNames[0]).toString();
            const as = alias === null ? '' : ` as ${aliased}`;
            let value = prop.formula(alias2);
            if (!this.isTableNameAliasRequired(type)) {
                value = value.replaceAll(alias2 + '.', '');
            }
            return this.knex.raw(`${value}${as}`);
        }
        if (prop?.hasConvertToJSValueSQL && type !== enums_1.QueryType.UPSERT) {
            let valueSQL;
            if (prop.fieldNames.length > 1 && fkIdx !== -1) {
                const fk = prop.targetMeta.getPrimaryProps()[fkIdx];
                const prefixed = this.prefix(field, isTableNameAliasRequired, true, fkIdx);
                valueSQL = fk.customType.convertToJSValueSQL(prefixed, this.platform);
            }
            else {
                const prefixed = this.prefix(field, isTableNameAliasRequired, true);
                valueSQL = prop.customType.convertToJSValueSQL(prefixed, this.platform);
            }
            if (alias === null) {
                return this.knex.raw(valueSQL);
            }
            return this.knex.raw(`${valueSQL} as ${this.platform.quoteIdentifier(alias ?? prop.fieldNames[fkIdx])}`);
        }
        // do not wrap custom expressions
        if (!rawField) {
            ret = this.prefix(field, false, false, fkIdx);
        }
        if (alias) {
            ret += ' as ' + alias;
        }
        if (!isTableNameAliasRequired || this.isPrefixed(ret) || noPrefix) {
            return ret;
        }
        return this.alias + '.' + ret;
    }
    processData(data, convertCustomTypes, multi = false) {
        if (Array.isArray(data)) {
            return data.map(d => this.processData(d, convertCustomTypes, true));
        }
        const meta = this.metadata.find(this.entityName);
        data = this.driver.mapDataToFieldNames(data, true, meta?.properties, convertCustomTypes);
        if (!core_1.Utils.hasObjectKeys(data) && meta && multi) {
            /* istanbul ignore next */
            data[meta.getPrimaryProps()[0].fieldNames[0]] = this.platform.usesDefaultKeyword() ? this.knex.raw('default') : undefined;
        }
        return data;
    }
    joinOneToReference(prop, ownerAlias, alias, type, cond = {}, schema) {
        const prop2 = prop.targetMeta.properties[prop.mappedBy || prop.inversedBy];
        const table = this.getTableName(prop.type);
        const joinColumns = prop.owner ? prop.referencedColumnNames : prop2.joinColumns;
        const inverseJoinColumns = prop.referencedColumnNames;
        const primaryKeys = prop.owner ? prop.joinColumns : prop2.referencedColumnNames;
        schema ??= prop.targetMeta?.schema === '*' ? '*' : this.driver.getSchemaName(prop.targetMeta);
        cond = core_1.Utils.merge(cond, prop.where);
        return {
            prop, type, cond, ownerAlias, alias, table, schema,
            joinColumns, inverseJoinColumns, primaryKeys,
        };
    }
    joinManyToOneReference(prop, ownerAlias, alias, type, cond = {}, schema) {
        return {
            prop, type, cond, ownerAlias, alias,
            table: this.getTableName(prop.type),
            schema: prop.targetMeta?.schema === '*' ? '*' : this.driver.getSchemaName(prop.targetMeta, { schema }),
            joinColumns: prop.referencedColumnNames,
            primaryKeys: prop.fieldNames,
        };
    }
    joinManyToManyReference(prop, ownerAlias, alias, pivotAlias, type, cond, path, schema) {
        const pivotMeta = this.metadata.find(prop.pivotEntity);
        const ret = {
            [`${ownerAlias}.${prop.name}#${pivotAlias}`]: {
                prop, type, ownerAlias,
                alias: pivotAlias,
                inverseAlias: alias,
                joinColumns: prop.joinColumns,
                inverseJoinColumns: prop.inverseJoinColumns,
                primaryKeys: prop.referencedColumnNames,
                cond: {},
                table: pivotMeta.tableName,
                schema: prop.targetMeta?.schema === '*' ? '*' : this.driver.getSchemaName(pivotMeta, { schema }),
                path: path.endsWith('[pivot]') ? path : `${path}[pivot]`,
            },
        };
        if (type === enums_1.JoinType.pivotJoin) {
            return ret;
        }
        const prop2 = prop.owner ? pivotMeta.relations[1] : pivotMeta.relations[0];
        ret[`${pivotAlias}.${prop2.name}#${alias}`] = this.joinManyToOneReference(prop2, pivotAlias, alias, type, cond, schema);
        ret[`${pivotAlias}.${prop2.name}#${alias}`].path = path;
        const tmp = prop2.referencedTableName.split('.');
        ret[`${pivotAlias}.${prop2.name}#${alias}`].schema ??= tmp.length > 1 ? tmp[0] : undefined;
        return ret;
    }
    processJoins(qb, joins, schema) {
        Object.values(joins).forEach(join => {
            if ([enums_1.JoinType.nestedInnerJoin, enums_1.JoinType.nestedLeftJoin].includes(join.type)) {
                return;
            }
            const { sql, params } = this.createJoinExpression(join, joins, schema);
            qb.joinRaw(sql, params);
        });
    }
    createJoinExpression(join, joins, schema) {
        let table = join.table;
        const method = {
            [enums_1.JoinType.nestedInnerJoin]: 'inner join',
            [enums_1.JoinType.nestedLeftJoin]: 'left join',
            [enums_1.JoinType.pivotJoin]: 'left join',
        }[join.type] ?? join.type;
        const conditions = [];
        const params = [];
        schema = join.schema && join.schema !== '*' ? join.schema : schema;
        if (schema) {
            table = `${schema}.${table}`;
        }
        if (join.prop.name !== '__subquery__') {
            join.primaryKeys.forEach((primaryKey, idx) => {
                const right = `${join.alias}.${join.joinColumns[idx]}`;
                if (join.prop.formula) {
                    const alias = this.platform.quoteIdentifier(join.ownerAlias);
                    const left = join.prop.formula(alias);
                    conditions.push(`${left} = ${this.knex.ref(right)}`);
                    return;
                }
                const left = join.prop.object && join.prop.fieldNameRaw
                    ? join.prop.fieldNameRaw.replaceAll(core_1.ALIAS_REPLACEMENT, join.ownerAlias)
                    : this.knex.ref(`${join.ownerAlias}.${primaryKey}`);
                conditions.push(`${left} = ${this.knex.ref(right)}`);
            });
        }
        if (join.prop.targetMeta?.discriminatorValue && !join.path?.endsWith('[pivot]')) {
            const typeProperty = join.prop.targetMeta.root.discriminatorColumn;
            const alias = join.inverseAlias ?? join.alias;
            join.cond[`${alias}.${typeProperty}`] = join.prop.targetMeta.discriminatorValue;
        }
        let sql = method + ' ';
        if (join.nested) {
            sql += `(${this.knex.ref(table)} as ${this.knex.ref(join.alias)}`;
            for (const nested of join.nested) {
                const { sql: nestedSql, params: nestedParams } = this.createJoinExpression(nested, joins, schema);
                sql += ' ' + nestedSql;
                params.push(...nestedParams);
            }
            sql += `)`;
        }
        else if (join.subquery) {
            sql += `(${join.subquery}) as ${this.knex.ref(join.alias)}`;
        }
        else {
            sql += `${this.knex.ref(table)} as ${this.knex.ref(join.alias)}`;
        }
        for (const key of Object.keys(join.cond)) {
            const hasPrefix = key.includes('.') || core_1.Utils.isOperator(key) || core_1.RawQueryFragment.isKnownFragment(key);
            const newKey = hasPrefix ? key : `${join.alias}.${key}`;
            const clause = this.processJoinClause(newKey, join.cond[key], join.alias, params);
            /* istanbul ignore else */
            if (clause !== '()') {
                conditions.push(clause);
            }
        }
        if (conditions.length > 0) {
            sql += ` on ${conditions.join(' and ')}`;
        }
        return { sql, params };
    }
    processJoinClause(key, value, alias, params, operator = '$eq') {
        if (core_1.Utils.isGroupOperator(key) && Array.isArray(value)) {
            const parts = value.map(sub => {
                return this.wrapQueryGroup(Object.keys(sub).map(k => this.processJoinClause(k, sub[k], alias, params)));
            });
            return this.wrapQueryGroup(parts, key);
        }
        if (this.isSimpleRegExp(value)) {
            params.push(this.getRegExpParam(value));
            return `${this.knex.ref(this.mapper(key))} like ?`;
        }
        if (value instanceof RegExp) {
            value = this.platform.getRegExpValue(value);
        }
        if (core_1.Utils.isOperator(key, false) && core_1.Utils.isPlainObject(value)) {
            const parts = Object.keys(value).map(k => this.processJoinClause(k, value[k], alias, params, key));
            return key === '$not' ? `not ${this.wrapQueryGroup(parts)}` : this.wrapQueryGroup(parts);
        }
        if (core_1.Utils.isPlainObject(value) && Object.keys(value).every(k => core_1.Utils.isOperator(k, false))) {
            const parts = Object.keys(value).map(op => this.processJoinClause(key, value[op], alias, params, op));
            return this.wrapQueryGroup(parts);
        }
        operator = operator === '$not' ? '$eq' : operator;
        if (value === null) {
            return `${this.knex.ref(this.mapper(key))} is ${operator === '$ne' ? 'not ' : ''}null`;
        }
        if (operator === '$fulltext') {
            const [fromAlias, fromField] = this.splitField(key);
            const property = this.getProperty(fromField, fromAlias);
            const query = this.knex.raw(this.platform.getFullTextWhereClause(property), {
                column: this.mapper(key),
                query: this.knex.raw('?'),
            }).toSQL().toNative();
            params.push(value);
            return query.sql;
        }
        const replacement = this.getOperatorReplacement(operator, { [operator]: value });
        if (['$in', '$nin'].includes(operator) && Array.isArray(value)) {
            params.push(...value);
            return `${this.knex.ref(this.mapper(key))} ${replacement} (${value.map(() => '?').join(', ')})`;
        }
        if (operator === '$exists') {
            value = null;
        }
        const rawField = core_1.RawQueryFragment.getKnownFragment(key);
        if (rawField) {
            let sql = rawField.sql.replaceAll(core_1.ALIAS_REPLACEMENT, alias);
            params.push(...rawField.params);
            params.push(...core_1.Utils.asArray(value));
            if (core_1.Utils.asArray(value).length > 0) {
                sql += ' = ?';
            }
            return sql;
        }
        const sql = this.mapper(key);
        if (value !== null) {
            params.push(value);
        }
        return `${this.knex.ref(sql)} ${replacement} ${value === null ? 'null' : '?'}`;
    }
    wrapQueryGroup(parts, operator = '$and') {
        if (parts.length === 1) {
            return parts[0];
        }
        return `(${parts.join(` ${core_1.GroupOperator[operator]} `)})`;
    }
    mapJoinColumns(type, join) {
        if (join.prop && [core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(join.prop.kind)) {
            return join.prop.fieldNames.map((_fieldName, idx) => {
                const columns = join.prop.owner ? join.joinColumns : join.inverseJoinColumns;
                return this.mapper(`${join.alias}.${columns[idx]}`, type, undefined, `${join.alias}__${columns[idx]}`);
            });
        }
        return [
            ...join.joinColumns.map(col => this.mapper(`${join.alias}.${col}`, type, undefined, `fk__${col}`)),
            ...join.inverseJoinColumns.map(col => this.mapper(`${join.alias}.${col}`, type, undefined, `fk__${col}`)),
        ];
    }
    isOneToOneInverse(field, meta) {
        meta ??= this.metadata.find(this.entityName);
        const prop = meta.properties[field.replace(/:ref$/, '')];
        return prop && prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.owner;
    }
    getTableName(entityName) {
        const meta = this.metadata.find(entityName);
        return meta ? meta.collection : entityName;
    }
    /**
     * Checks whether the RE can be rewritten to simple LIKE query
     */
    isSimpleRegExp(re) {
        if (!(re instanceof RegExp)) {
            return false;
        }
        if (re.flags.includes('i')) {
            return false;
        }
        // when including the opening bracket/paren we consider it complex
        return !re.source.match(/[{[(]/);
    }
    getRegExpParam(re) {
        const value = re.source
            .replace(/\.\*/g, '%') // .* -> %
            .replace(/\./g, '_') // .  -> _
            .replace(/\\_/g, '.') // \. -> .
            .replace(/^\^/g, '') // remove ^ from start
            .replace(/\$$/g, ''); // remove $ from end
        if (re.source.startsWith('^') && re.source.endsWith('$')) {
            return value;
        }
        if (re.source.startsWith('^')) {
            return value + '%';
        }
        if (re.source.endsWith('$')) {
            return '%' + value;
        }
        return `%${value}%`;
    }
    appendOnConflictClause(type, onConflict, qb) {
        onConflict.forEach(item => {
            let sub;
            if (core_1.Utils.isRawSql(item.fields)) {
                sub = qb.onConflict(this.knex.raw(item.fields.sql, item.fields.params));
            }
            else if (item.fields.length > 0) {
                sub = qb.onConflict(item.fields);
            }
            else {
                sub = qb.onConflict();
            }
            core_1.Utils.runIfNotEmpty(() => sub.ignore(), item.ignore);
            core_1.Utils.runIfNotEmpty(() => {
                let mergeParam = item.merge;
                if (core_1.Utils.isObject(item.merge)) {
                    mergeParam = {};
                    core_1.Utils.keys(item.merge).forEach(key => {
                        const k = this.mapper(key, type);
                        mergeParam[k] = item.merge[key];
                    });
                }
                if (Array.isArray(item.merge)) {
                    mergeParam = item.merge.map(key => this.mapper(key, type));
                }
                const sub2 = sub.merge(mergeParam);
                core_1.Utils.runIfNotEmpty(() => this.appendQueryCondition(type, item.where, sub2), item.where);
            }, 'merge' in item);
        });
    }
    appendQueryCondition(type, cond, qb, operator, method = 'where') {
        const m = operator === '$or' ? 'orWhere' : 'andWhere';
        Object.keys(cond).forEach(k => {
            if (k === '$and' || k === '$or') {
                if (operator) {
                    return qb[m](inner => this.appendGroupCondition(type, inner, k, method, cond[k]));
                }
                return this.appendGroupCondition(type, qb, k, method, cond[k]);
            }
            if (k === '$not') {
                const m = operator === '$or' ? 'orWhereNot' : 'whereNot';
                return qb[m](inner => this.appendQueryCondition(type, cond[k], inner));
            }
            this.appendQuerySubCondition(qb, type, method, cond, k, operator);
        });
    }
    appendQuerySubCondition(qb, type, method, cond, key, operator) {
        const m = operator === '$or' ? 'orWhere' : method;
        if (cond[key] instanceof core_1.RawQueryFragment) {
            cond[key] = this.knex.raw(cond[key].sql, cond[key].params);
        }
        if (this.isSimpleRegExp(cond[key])) {
            return void qb[m](this.mapper(key, type), 'like', this.getRegExpParam(cond[key]));
        }
        if (core_1.Utils.isPlainObject(cond[key]) || cond[key] instanceof RegExp) {
            return this.processObjectSubCondition(cond, key, qb, method, m, type);
        }
        const op = cond[key] === null ? 'is' : '=';
        const raw = core_1.RawQueryFragment.getKnownFragment(key);
        if (raw) {
            const value = core_1.Utils.asArray(cond[key]);
            if (value.length > 0) {
                return void qb[m](this.knex.raw(raw.sql, raw.params), op, value[0]);
            }
            return void qb[m](this.knex.raw(raw.sql, raw.params));
        }
        if (this.subQueries[key]) {
            return void qb[m](this.knex.raw(`(${this.subQueries[key]})`), op, cond[key]);
        }
        qb[m](this.mapper(key, type, cond[key], null), op, cond[key]);
    }
    processObjectSubCondition(cond, key, qb, method, m, type) {
        let value = cond[key];
        const size = core_1.Utils.getObjectKeysSize(value);
        if (core_1.Utils.isPlainObject(value) && size === 0) {
            return;
        }
        // grouped condition for one field, e.g. `{ age: { $gte: 10, $lt: 50 } }`
        if (size > 1) {
            const rawField = core_1.RawQueryFragment.getKnownFragment(key);
            const subCondition = Object.entries(value).map(([subKey, subValue]) => {
                key = rawField?.clone().toString() ?? key;
                return ({ [key]: { [subKey]: subValue } });
            });
            return subCondition.forEach(sub => this.appendQueryCondition(type, sub, qb, '$and', method));
        }
        if (value instanceof RegExp) {
            value = this.platform.getRegExpValue(value);
        }
        // operators
        const op = Object.keys(core_1.QueryOperator).find(op => op in value);
        /* istanbul ignore next */
        if (!op) {
            throw new Error(`Invalid query condition: ${(0, node_util_1.inspect)(cond, { depth: 5 })}`);
        }
        const replacement = this.getOperatorReplacement(op, value);
        const fields = core_1.Utils.splitPrimaryKeys(key);
        if (fields.length > 1 && Array.isArray(value[op])) {
            const singleTuple = !value[op].every((v) => Array.isArray(v));
            if (!this.platform.allowsComparingTuples()) {
                const mapped = fields.map(f => this.mapper(f, type));
                if (op === '$in') {
                    const conds = value[op].map(() => {
                        return `(${mapped.map(field => `${this.platform.quoteIdentifier(field)} = ?`).join(' and ')})`;
                    });
                    return void qb[m](this.knex.raw(`(${conds.join(' or ')})`, core_1.Utils.flatten(value[op])));
                }
                return void qb[m](this.knex.raw(`${mapped.map(field => `${this.platform.quoteIdentifier(field)} = ?`).join(' and ')}`, core_1.Utils.flatten(value[op])));
            }
            if (singleTuple) {
                const tmp = value[op].length === 1 && core_1.Utils.isPlainObject(value[op][0]) ? fields.map(f => value[op][0][f]) : value[op];
                value[op] = this.knex.raw(`(${fields.map(() => '?').join(', ')})`, tmp);
            }
        }
        if (value[op] instanceof core_1.RawQueryFragment) {
            value[op] = this.knex.raw(value[op].sql, value[op].params);
        }
        if (this.subQueries[key]) {
            return void qb[m](this.knex.raw(`(${this.subQueries[key]})`), replacement, value[op]);
        }
        if (op === '$fulltext') {
            const [a, f] = this.splitField(key);
            const prop = this.getProperty(f, a);
            /* istanbul ignore next */
            if (!prop) {
                throw new Error(`Cannot use $fulltext operator on ${key}, property not found`);
            }
            qb[m](this.knex.raw(this.platform.getFullTextWhereClause(prop), {
                column: this.mapper(key, type, undefined, null),
                query: value[op],
            }));
        }
        else {
            const mappedKey = this.mapper(key, type, value[op], null);
            qb[m](mappedKey, replacement, value[op]);
        }
    }
    getOperatorReplacement(op, value) {
        let replacement = core_1.QueryOperator[op];
        if (op === '$exists') {
            replacement = value[op] ? 'is not' : 'is';
            value[op] = null;
        }
        if (value[op] === null && ['$eq', '$ne'].includes(op)) {
            replacement = op === '$eq' ? 'is' : 'is not';
        }
        if (op === '$re') {
            replacement = this.platform.getRegExpOperator(value[op], value.$flags);
        }
        return replacement;
    }
    getQueryOrder(type, orderBy, populate) {
        if (Array.isArray(orderBy)) {
            return orderBy.flatMap(o => this.getQueryOrder(type, o, populate));
        }
        return this.getQueryOrderFromObject(type, orderBy, populate);
    }
    getQueryOrderFromObject(type, orderBy, populate) {
        const ret = [];
        for (const key of Object.keys(orderBy)) {
            const direction = orderBy[key];
            const order = core_1.Utils.isNumber(direction) ? core_1.QueryOrderNumeric[direction] : direction;
            const raw = core_1.RawQueryFragment.getKnownFragment(key);
            if (raw) {
                ret.push(...this.platform.getOrderByExpression(this.platform.formatQuery(raw.sql, raw.params), order));
                continue;
            }
            for (const f of core_1.Utils.splitPrimaryKeys(key)) {
                // eslint-disable-next-line prefer-const
                let [alias, field] = this.splitField(f, true);
                alias = populate[alias] || alias;
                const prop = this.getProperty(field, alias);
                const noPrefix = (prop && prop.persist === false && !prop.formula && !prop.embedded) || core_1.RawQueryFragment.isKnownFragment(f);
                const column = this.mapper(noPrefix ? field : `${alias}.${field}`, type, undefined, null);
                /* istanbul ignore next */
                const rawColumn = core_1.Utils.isString(column) ? column.split('.').map(e => this.knex.ref(e)).join('.') : column;
                const customOrder = prop?.customOrder;
                let colPart = customOrder
                    ? this.platform.generateCustomOrder(rawColumn, customOrder)
                    : rawColumn;
                if (core_1.Utils.isRawSql(colPart)) {
                    colPart = this.platform.formatQuery(colPart.sql, colPart.params);
                }
                if (Array.isArray(order)) {
                    order.forEach(part => ret.push(...this.getQueryOrderFromObject(type, part, populate)));
                }
                else {
                    ret.push(...this.platform.getOrderByExpression(colPart, order));
                }
            }
        }
        return ret;
    }
    finalize(type, qb, meta, data, returning) {
        const usesReturningStatement = this.platform.usesReturningStatement() || this.platform.usesOutputStatement();
        if (!meta || !data || !usesReturningStatement) {
            return;
        }
        // always respect explicit returning hint
        if (returning && returning.length > 0) {
            qb.returning(returning.map(field => this.mapper(field, type)));
            return;
        }
        if (type === enums_1.QueryType.INSERT) {
            const returningProps = meta.hydrateProps
                .filter(prop => prop.returning || (prop.persist !== false && ((prop.primary && prop.autoincrement) || prop.defaultRaw)))
                .filter(prop => !(prop.name in data));
            if (returningProps.length > 0) {
                qb.returning(core_1.Utils.flatten(returningProps.map(prop => prop.fieldNames)));
            }
            return;
        }
        if (type === enums_1.QueryType.UPDATE) {
            const returningProps = meta.hydrateProps.filter(prop => prop.fieldNames && core_1.Utils.isRawSql(data[prop.fieldNames[0]]));
            if (returningProps.length > 0) {
                qb.returning(returningProps.flatMap(prop => {
                    if (prop.hasConvertToJSValueSQL) {
                        const aliased = this.platform.quoteIdentifier(prop.fieldNames[0]);
                        const sql = prop.customType.convertToJSValueSQL(aliased, this.platform) + ' as ' + this.platform.quoteIdentifier(prop.fieldNames[0]);
                        return [this.knex.raw(sql)];
                    }
                    return prop.fieldNames;
                }));
            }
        }
    }
    splitField(field, greedyAlias = false) {
        const parts = field.split('.');
        const ref = parts[parts.length - 1].split(':')[1];
        if (ref) {
            parts[parts.length - 1] = parts[parts.length - 1].substring(0, parts[parts.length - 1].indexOf(':'));
        }
        if (parts.length === 1) {
            return [this.alias, parts[0], ref];
        }
        if (greedyAlias) {
            const fromField = parts.pop();
            const fromAlias = parts.join('.');
            return [fromAlias, fromField, ref];
        }
        const fromAlias = parts.shift();
        const fromField = parts.join('.');
        return [fromAlias, fromField, ref];
    }
    getLockSQL(qb, lockMode, lockTables = []) {
        const meta = this.metadata.find(this.entityName);
        if (lockMode === core_1.LockMode.OPTIMISTIC && meta && !meta.versionProperty) {
            throw core_1.OptimisticLockError.lockFailed(this.entityName);
        }
        switch (lockMode) {
            case core_1.LockMode.PESSIMISTIC_READ: return void qb.forShare(...lockTables);
            case core_1.LockMode.PESSIMISTIC_WRITE: return void qb.forUpdate(...lockTables);
            case core_1.LockMode.PESSIMISTIC_PARTIAL_WRITE: return void qb.forUpdate(...lockTables).skipLocked();
            case core_1.LockMode.PESSIMISTIC_WRITE_OR_FAIL: return void qb.forUpdate(...lockTables).noWait();
            case core_1.LockMode.PESSIMISTIC_PARTIAL_READ: return void qb.forShare(...lockTables).skipLocked();
            case core_1.LockMode.PESSIMISTIC_READ_OR_FAIL: return void qb.forShare(...lockTables).noWait();
        }
    }
    updateVersionProperty(qb, data) {
        const meta = this.metadata.find(this.entityName);
        if (!meta?.versionProperty || meta.versionProperty in data) {
            return;
        }
        const versionProperty = meta.properties[meta.versionProperty];
        let sql = this.platform.quoteIdentifier(versionProperty.fieldNames[0]) + ' + 1';
        if (versionProperty.runtimeType === 'Date') {
            sql = this.platform.getCurrentTimestampSQL(versionProperty.length);
        }
        qb.update(versionProperty.fieldNames[0], this.knex.raw(sql));
    }
    prefix(field, always = false, quote = false, idx) {
        let ret;
        if (!this.isPrefixed(field)) {
            const alias = always ? (quote ? this.alias : this.platform.quoteIdentifier(this.alias)) + '.' : '';
            const fieldName = this.fieldName(field, this.alias, always, idx);
            if (fieldName instanceof core_1.RawQueryFragment) {
                return fieldName.sql;
            }
            ret = alias + fieldName;
        }
        else {
            const [a, ...rest] = field.split('.');
            const f = rest.join('.');
            const fieldName = this.fieldName(f, a, always, idx);
            if (fieldName instanceof core_1.RawQueryFragment) {
                return fieldName.sql;
            }
            ret = a + '.' + fieldName;
        }
        if (quote) {
            return this.platform.quoteIdentifier(ret);
        }
        return ret;
    }
    appendGroupCondition(type, qb, operator, method, subCondition) {
        // single sub-condition can be ignored to reduce nesting of parens
        if (subCondition.length === 1 || operator === '$and') {
            return subCondition.forEach(sub => this.appendQueryCondition(type, sub, qb, undefined, method));
        }
        qb[method](outer => subCondition.forEach(sub => {
            // skip nesting parens if the value is simple = scalar or object without operators or with only single key, being the operator
            const keys = Object.keys(sub);
            const val = sub[keys[0]];
            const simple = !core_1.Utils.isPlainObject(val) || core_1.Utils.getObjectKeysSize(val) === 1 || Object.keys(val).every(k => !core_1.Utils.isOperator(k));
            if (keys.length === 1 && simple) {
                return this.appendQueryCondition(type, sub, outer, operator);
            }
            outer.orWhere(inner => this.appendQueryCondition(type, sub, inner));
        }));
    }
    isPrefixed(field) {
        return !!field.match(/[\w`"[\]]+\./);
    }
    fieldName(field, alias, always, idx = 0) {
        const prop = this.getProperty(field, alias);
        if (!prop) {
            return field;
        }
        if (prop.fieldNameRaw) {
            if (!always) {
                return (0, core_1.raw)(prop.fieldNameRaw
                    .replace(new RegExp(core_1.ALIAS_REPLACEMENT_RE + '\\.?', 'g'), '')
                    .replace(this.platform.quoteIdentifier('') + '.', ''));
            }
            if (alias) {
                return (0, core_1.raw)(prop.fieldNameRaw.replace(new RegExp(core_1.ALIAS_REPLACEMENT_RE, 'g'), alias));
            }
            /* istanbul ignore next */
            return (0, core_1.raw)(prop.fieldNameRaw);
        }
        /* istanbul ignore next */
        return prop.fieldNames?.[idx] ?? field;
    }
    getProperty(field, alias) {
        const entityName = this.aliasMap[alias]?.entityName || this.entityName;
        const meta = this.metadata.find(entityName);
        // check if `alias` is not matching an embedded property name instead of alias, e.g. `address.city`
        if (alias && meta) {
            const prop = meta.properties[alias];
            if (prop?.kind === core_1.ReferenceKind.EMBEDDED) {
                // we want to select the full object property so hydration works as expected
                if (prop.object) {
                    return prop;
                }
                const parts = field.split('.');
                const nest = (p) => parts.length > 0 ? nest(p.embeddedProps[parts.shift()]) : p;
                return nest(prop);
            }
        }
        if (meta) {
            if (meta.properties[field]) {
                return meta.properties[field];
            }
            return meta.relations.find(prop => prop.fieldNames?.some(name => field === name));
        }
        return undefined;
    }
    isTableNameAliasRequired(type) {
        return [enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(type ?? enums_1.QueryType.SELECT);
    }
    // workaround for https://github.com/knex/knex/issues/5257
    processOnConflictCondition(cond, schema) {
        const meta = this.metadata.get(this.entityName);
        const tableName = this.driver.getTableName(meta, { schema }, false);
        for (const key of Object.keys(cond)) {
            const mapped = this.mapper(key, enums_1.QueryType.UPSERT);
            core_1.Utils.renameKey(cond, key, tableName + '.' + mapped);
        }
        return cond;
    }
}
exports.QueryBuilderHelper = QueryBuilderHelper;
