"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbQueryBuilder = void 0;
const core_1 = require("@mikro-orm/core");
const knex_1 = require("@mikro-orm/knex");
/**
 * @inheritDoc
 */
class MariaDbQueryBuilder extends knex_1.QueryBuilder {
    wrapPaginateSubQuery(meta) {
        const pks = this.prepareFields(meta.primaryKeys, 'sub-query');
        const quotedPKs = pks.map(pk => this.platform.quoteIdentifier(pk));
        const subQuery = this.clone(['_orderBy', '_fields']).select(pks).groupBy(pks).limit(this._limit);
        // revert the on conditions added via populateWhere, we want to apply those only once
        // @ts-ignore
        Object.values(subQuery._joins).forEach(join => join.cond = join.cond_ ?? {});
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
                    if (!prop?.persist && !prop?.formula && !pks.includes(fieldName)) {
                        addToSelect.push(fieldName);
                    }
                    const key = (0, core_1.raw)(`min(${this.knex.ref(fieldName)}${type})`);
                    orderBy.push({ [key]: direction });
                }
            }
            subQuery.orderBy(orderBy);
        }
        // @ts-ignore
        subQuery.finalized = true;
        const knexQuery = subQuery.as(this.mainAlias.aliasName).clearSelect().select(pks);
        /* istanbul ignore next */
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
                if (field instanceof core_1.RawQueryFragment) {
                    knexQuery.select(this.platform.formatQuery(field.sql, field.params));
                }
                else if (field) {
                    knexQuery.select(field);
                }
            });
        }
        // multiple sub-queries are needed to get around mysql limitations with order by + limit + where in + group by (o.O)
        // https://stackoverflow.com/questions/17892762/mysql-this-version-of-mysql-doesnt-yet-support-limit-in-all-any-some-subqu
        const subSubQuery = this.getKnex().select(this.knex.raw(`json_arrayagg(${quotedPKs.join(', ')})`)).from(knexQuery);
        subSubQuery.__raw = true; // tag it as there is now way to check via `instanceof`
        this._limit = undefined;
        this._offset = undefined;
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
        for (const [key, join] of Object.entries(this._joins)) {
            const path = join.path?.replace(/\[populate]|\[pivot]|:ref/g, '').replace(new RegExp(`^${meta.className}.`), '');
            /* istanbul ignore next */
            if (!populate.has(path ?? '') && !orderByAliases.includes(join.alias)) {
                delete this._joins[key];
            }
        }
        const subquerySql = subSubQuery.toString();
        const key = meta.getPrimaryProps()[0].runtimeType === 'string' ? `concat('"', ${quotedPKs.join(', ')}, '"')` : quotedPKs.join(', ');
        const sql = `json_contains((${subquerySql}), ${key})`;
        this._cond = {};
        this.select(this._fields).where(sql);
    }
}
exports.MariaDbQueryBuilder = MariaDbQueryBuilder;
