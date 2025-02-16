"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectCriteriaNode = void 0;
const core_1 = require("@mikro-orm/core");
const CriteriaNode_1 = require("./CriteriaNode");
const enums_1 = require("./enums");
/**
 * @internal
 */
class ObjectCriteriaNode extends CriteriaNode_1.CriteriaNode {
    process(qb, options) {
        const nestedAlias = qb.getAliasForJoinPath(this.getPath(), options);
        const ownerAlias = options?.alias || qb.alias;
        const keys = Object.keys(this.payload);
        let alias = options?.alias;
        if (nestedAlias) {
            alias = nestedAlias;
        }
        if (this.shouldAutoJoin(qb, nestedAlias)) {
            if (keys.some(k => ['$some', '$none', '$every'].includes(k))) {
                if (![core_1.ReferenceKind.MANY_TO_MANY, core_1.ReferenceKind.ONE_TO_MANY].includes(this.prop.kind)) {
                    // ignore collection operators when used on a non-relational property - this can happen when they get into
                    // populateWhere via `infer` on m:n properties with select-in strategy
                    if (this.parent?.parent) { // we validate only usage on top level
                        return {};
                    }
                    throw new Error(`Collection operators can be used only inside a collection property context, but it was used for ${this.getPath()}.`);
                }
                const $and = [];
                const knownKey = [core_1.ReferenceKind.SCALAR, core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.EMBEDDED].includes(this.prop.kind) || (this.prop.kind === core_1.ReferenceKind.ONE_TO_ONE && this.prop.owner);
                const parentMeta = this.metadata.find(this.parent.entityName);
                const primaryKeys = parentMeta.primaryKeys.map(pk => {
                    return [enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(qb.type) ? `${knownKey ? alias : ownerAlias}.${pk}` : pk;
                });
                for (const key of keys) {
                    if (!['$some', '$none', '$every'].includes(key)) {
                        throw new Error('Mixing collection operators with other filters is not allowed.');
                    }
                    const payload = this.payload[key].unwrap();
                    const qb2 = qb.clone(true);
                    const sub = qb2
                        .from(parentMeta.className)
                        .innerJoin(this.key, qb2.getNextAlias(this.prop.type))
                        .select(parentMeta.primaryKeys);
                    if (key === '$every') {
                        sub.where({ $not: { [this.key]: payload } });
                    }
                    else {
                        sub.where({ [this.key]: payload });
                    }
                    const op = key === '$some' ? '$in' : '$nin';
                    $and.push({
                        [core_1.Utils.getPrimaryKeyHash(primaryKeys)]: { [op]: sub.getKnexQuery() },
                    });
                }
                if ($and.length === 1) {
                    return $and[0];
                }
                return { $and };
            }
            alias = this.autoJoin(qb, ownerAlias);
        }
        return keys.reduce((o, field) => {
            const childNode = this.payload[field];
            const payload = childNode.process(qb, { ...options, alias: this.prop ? alias : ownerAlias });
            const operator = core_1.Utils.isOperator(field);
            const isRawField = core_1.RawQueryFragment.isKnownFragment(field);
            // we need to keep the prefixing for formulas otherwise we would lose aliasing context when nesting inside group operators
            const virtual = childNode.prop?.persist === false && !childNode.prop?.formula;
            // if key is missing, we are inside group operator and we need to prefix with alias
            const primaryKey = this.key && this.metadata.find(this.entityName).primaryKeys.includes(field);
            if (childNode.shouldInline(payload)) {
                const childAlias = qb.getAliasForJoinPath(childNode.getPath(), options);
                const a = qb.helper.isTableNameAliasRequired(qb.type) ? alias : undefined;
                this.inlineChildPayload(o, payload, field, a, childAlias);
            }
            else if (childNode.shouldRename(payload)) {
                this.inlineCondition(childNode.renameFieldToPK(qb), o, payload);
            }
            else if (isRawField) {
                const rawField = core_1.RawQueryFragment.getKnownFragment(field);
                o[(0, core_1.raw)(rawField.sql.replaceAll(core_1.ALIAS_REPLACEMENT, alias), rawField.params)] = payload;
            }
            else if (primaryKey || virtual || operator || field.includes('.') || ![enums_1.QueryType.SELECT, enums_1.QueryType.COUNT].includes(qb.type ?? enums_1.QueryType.SELECT)) {
                this.inlineCondition(field.replaceAll(core_1.ALIAS_REPLACEMENT, alias), o, payload);
            }
            else {
                this.inlineCondition(`${alias}.${field}`, o, payload);
            }
            return o;
        }, {});
    }
    unwrap() {
        return Object.keys(this.payload).reduce((o, field) => {
            o[field] = this.payload[field].unwrap();
            return o;
        }, {});
    }
    willAutoJoin(qb, alias, options) {
        const nestedAlias = qb.getAliasForJoinPath(this.getPath(), options);
        const ownerAlias = alias || qb.alias;
        const keys = Object.keys(this.payload);
        if (nestedAlias) {
            alias = nestedAlias;
        }
        if (this.shouldAutoJoin(qb, nestedAlias)) {
            return !keys.some(k => ['$some', '$none', '$every'].includes(k));
        }
        return keys.some(field => {
            const childNode = this.payload[field];
            return childNode.willAutoJoin(qb, this.prop ? alias : ownerAlias, options);
        });
    }
    shouldInline(payload) {
        const customExpression = core_1.RawQueryFragment.isKnownFragment(this.key);
        const scalar = core_1.Utils.isPrimaryKey(payload) || payload instanceof RegExp || payload instanceof Date || customExpression;
        const operator = core_1.Utils.isObject(payload) && Object.keys(payload).every(k => core_1.Utils.isOperator(k, false));
        return !!this.prop && this.prop.kind !== core_1.ReferenceKind.SCALAR && !scalar && !operator;
    }
    getChildKey(k, prop, childAlias, alias) {
        const idx = prop.referencedPKs.indexOf(k);
        return idx !== -1 && !childAlias && ![core_1.ReferenceKind.ONE_TO_MANY, core_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind)
            ? this.aliased(prop.joinColumns[idx], alias)
            : k;
    }
    inlineArrayChildPayload(obj, payload, k, prop, childAlias, alias) {
        const key = this.getChildKey(k, prop, childAlias);
        const value = payload.map((child) => Object.keys(child).reduce((inner, childKey) => {
            const key = (this.isPrefixed(childKey) || core_1.Utils.isOperator(childKey)) ? childKey : this.aliased(childKey, childAlias);
            inner[key] = child[childKey];
            return inner;
        }, {}));
        this.inlineCondition(key, obj, value);
    }
    inlineChildPayload(o, payload, field, alias, childAlias) {
        const prop = this.metadata.find(this.entityName).properties[field];
        for (const k of Object.keys(payload)) {
            if (core_1.Utils.isOperator(k, false)) {
                const tmp = payload[k];
                delete payload[k];
                o[this.aliased(field, alias)] = { [k]: tmp, ...o[this.aliased(field, alias)] };
            }
            else if (core_1.Utils.isGroupOperator(k) && Array.isArray(payload[k])) {
                this.inlineArrayChildPayload(o, payload[k], k, prop, childAlias, alias);
            }
            else if (this.isPrefixed(k) || core_1.Utils.isOperator(k) || !childAlias) {
                const key = this.getChildKey(k, prop, childAlias, alias);
                this.inlineCondition(key, o, payload[k]);
            }
            else if (core_1.RawQueryFragment.isKnownFragment(k)) {
                o[k] = payload[k];
            }
            else {
                o[this.aliased(k, childAlias)] = payload[k];
            }
        }
    }
    inlineCondition(key, o, value) {
        if (!(key in o)) {
            o[key] = value;
            return;
        }
        /* istanbul ignore next */
        if (key === '$and') {
            o.$and.push({ [key]: value });
            return;
        }
        const $and = o.$and ?? [];
        $and.push({ [key]: o[key] }, { [key]: value });
        delete o[key];
        o.$and = $and;
    }
    shouldAutoJoin(qb, nestedAlias) {
        if (!this.prop || !this.parent) {
            return false;
        }
        const keys = Object.keys(this.payload);
        if (keys.every(k => k.includes('.') && k.startsWith(`${qb.alias}.`))) {
            return false;
        }
        if (keys.some(k => ['$some', '$none', '$every'].includes(k))) {
            return true;
        }
        const meta = this.metadata.find(this.entityName);
        const embeddable = this.prop.kind === core_1.ReferenceKind.EMBEDDED;
        const knownKey = [core_1.ReferenceKind.SCALAR, core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.EMBEDDED].includes(this.prop.kind) || (this.prop.kind === core_1.ReferenceKind.ONE_TO_ONE && this.prop.owner);
        const operatorKeys = knownKey && keys.every(key => core_1.Utils.isOperator(key, false));
        const primaryKeys = knownKey && keys.every(key => {
            if (!meta.primaryKeys.includes(key)) {
                return false;
            }
            if (!core_1.Utils.isPlainObject(this.payload[key].payload) || ![core_1.ReferenceKind.ONE_TO_ONE, core_1.ReferenceKind.MANY_TO_ONE].includes(meta.properties[key].kind)) {
                return true;
            }
            return Object.keys(this.payload[key].payload).every(k => meta.properties[key].targetMeta.primaryKeys.includes(k));
        });
        return !primaryKeys && !nestedAlias && !operatorKeys && !embeddable;
    }
    autoJoin(qb, alias) {
        const nestedAlias = qb.getNextAlias(this.prop?.pivotTable ?? this.entityName);
        const customExpression = core_1.RawQueryFragment.isKnownFragment(this.key);
        const scalar = core_1.Utils.isPrimaryKey(this.payload) || this.payload instanceof RegExp || this.payload instanceof Date || customExpression;
        const operator = core_1.Utils.isPlainObject(this.payload) && Object.keys(this.payload).every(k => core_1.Utils.isOperator(k, false));
        const field = `${alias}.${this.prop.name}`;
        const method = qb.hasFlag(core_1.QueryFlag.INFER_POPULATE) ? 'joinAndSelect' : 'join';
        if (this.prop.kind === core_1.ReferenceKind.MANY_TO_MANY && (scalar || operator)) {
            qb.join(field, nestedAlias, undefined, enums_1.JoinType.pivotJoin, this.getPath());
        }
        else {
            const prev = qb._fields?.slice();
            qb[method](field, nestedAlias, undefined, enums_1.JoinType.leftJoin, this.getPath());
            if (!qb.hasFlag(core_1.QueryFlag.INFER_POPULATE)) {
                qb._fields = prev;
            }
        }
        return nestedAlias;
    }
    isPrefixed(field) {
        return !!field.match(/\w+\./);
    }
}
exports.ObjectCriteriaNode = ObjectCriteriaNode;
