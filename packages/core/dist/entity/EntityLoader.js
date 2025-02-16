"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityLoader = void 0;
const QueryHelper_1 = require("../utils/QueryHelper");
const Utils_1 = require("../utils/Utils");
const errors_1 = require("../errors");
const enums_1 = require("../enums");
const Reference_1 = require("./Reference");
const wrap_1 = require("./wrap");
const RawQueryFragment_1 = require("../utils/RawQueryFragment");
const utils_1 = require("./utils");
class EntityLoader {
    em;
    metadata;
    driver;
    constructor(em) {
        this.em = em;
        this.metadata = this.em.getMetadata();
        this.driver = this.em.getDriver();
    }
    /**
     * Loads specified relations in batch.
     * This will execute one query for each relation, that will populate it on all the specified entities.
     */
    async populate(entityName, entities, populate, options) {
        if (entities.length === 0 || Utils_1.Utils.isEmpty(populate)) {
            return this.setSerializationContext(entities, populate, options);
        }
        const meta = this.metadata.find(entityName);
        if (entities.some(e => !e.__helper)) {
            const entity = entities.find(e => !Utils_1.Utils.isEntity(e));
            throw errors_1.ValidationError.notDiscoveredEntity(entity, meta, 'populate');
        }
        const references = entities.filter(e => !(0, wrap_1.helper)(e).isInitialized());
        const visited = options.visited ??= new Set();
        options.where ??= {};
        options.orderBy ??= {};
        options.filters ??= {};
        options.lookup ??= true;
        options.validate ??= true;
        options.refresh ??= false;
        options.convertCustomTypes ??= true;
        if (references.length > 0) {
            await this.populateScalar(meta, references, options);
        }
        populate = this.normalizePopulate(entityName, populate, options.strategy, options.lookup);
        const invalid = populate.find(({ field }) => !this.em.canPopulate(entityName, field));
        /* istanbul ignore next */
        if (options.validate && invalid) {
            throw errors_1.ValidationError.invalidPropertyName(entityName, invalid.field);
        }
        this.setSerializationContext(entities, populate, options);
        for (const entity of entities) {
            visited.add(entity);
        }
        for (const pop of populate) {
            await this.populateField(entityName, entities, pop, options);
        }
        for (const entity of entities) {
            visited.delete(entity);
        }
    }
    normalizePopulate(entityName, populate, strategy, lookup = true) {
        const meta = this.metadata.find(entityName);
        let normalized = Utils_1.Utils.asArray(populate).map(field => {
            return typeof field === 'boolean' || field.field === enums_1.PopulatePath.ALL ? { all: !!field, field: meta.primaryKeys[0] } : field;
        });
        if (normalized.some(p => p.all)) {
            normalized = this.lookupAllRelationships(entityName);
        }
        // convert nested `field` with dot syntax to PopulateOptions with `children` array
        (0, utils_1.expandDotPaths)(meta, normalized, true);
        if (lookup && populate !== false) {
            normalized = this.lookupEagerLoadedRelationships(entityName, normalized, strategy);
            // convert nested `field` with dot syntax produced by eager relations
            (0, utils_1.expandDotPaths)(meta, normalized, true);
        }
        // merge same fields
        return this.mergeNestedPopulate(normalized);
    }
    setSerializationContext(entities, populate, options) {
        for (const entity of entities) {
            (0, wrap_1.helper)(entity).setSerializationContext({
                populate,
                fields: options.fields,
                exclude: options.exclude,
            });
        }
    }
    /**
     * Merge multiple populates for the same entity with different children. Also skips `*` fields, those can come from
     * partial loading hints (`fields`) that are used to infer the `populate` hint if missing.
     */
    mergeNestedPopulate(populate) {
        const tmp = populate.reduce((ret, item) => {
            if (item.field === enums_1.PopulatePath.ALL) {
                return ret;
            }
            if (!ret[item.field]) {
                ret[item.field] = item;
                return ret;
            }
            if (!ret[item.field].children && item.children) {
                ret[item.field].children = item.children;
            }
            else if (ret[item.field].children && item.children) {
                ret[item.field].children.push(...item.children);
            }
            return ret;
        }, {});
        return Object.values(tmp).map(item => {
            if (item.children) {
                item.children = this.mergeNestedPopulate(item.children);
            }
            return item;
        });
    }
    /**
     * preload everything in one call (this will update already existing references in IM)
     */
    async populateMany(entityName, entities, populate, options) {
        const [field, ref] = populate.field.split(':', 2);
        const meta = this.metadata.find(entityName);
        const prop = meta.properties[field];
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.owner && !this.driver.getPlatform().usesPivotTable()) {
            const filtered = entities.filter(e => !e[prop.name]?.isInitialized());
            if (filtered.length > 0) {
                await this.populateScalar(meta, filtered, { ...options, fields: [prop.name] });
            }
        }
        if (prop.kind === enums_1.ReferenceKind.SCALAR && prop.lazy) {
            const filtered = entities.filter(e => options.refresh || (prop.ref ? !e[prop.name]?.isInitialized() : e[prop.name] === undefined));
            if (options.ignoreLazyScalarProperties || filtered.length === 0) {
                return entities;
            }
            await this.populateScalar(meta, filtered, { ...options, fields: [prop.name] });
            return entities;
        }
        if (prop.kind === enums_1.ReferenceKind.EMBEDDED) {
            return [];
        }
        const filtered = this.filterCollections(entities, field, options, ref);
        const innerOrderBy = Utils_1.Utils.asArray(options.orderBy)
            .filter(orderBy => (Array.isArray(orderBy[prop.name]) && orderBy[prop.name].length > 0) || Utils_1.Utils.isObject(orderBy[prop.name]))
            .flatMap(orderBy => orderBy[prop.name]);
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && this.driver.getPlatform().usesPivotTable()) {
            return this.findChildrenFromPivotTable(filtered, prop, options, innerOrderBy, populate, !!ref);
        }
        const where = await this.extractChildCondition(options, prop);
        const data = await this.findChildren(entities, prop, populate, { ...options, where, orderBy: innerOrderBy }, !!(ref || prop.mapToPk));
        this.initializeCollections(filtered, prop, field, data, innerOrderBy.length > 0);
        return data;
    }
    async populateScalar(meta, filtered, options) {
        const pk = Utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys);
        const ids = Utils_1.Utils.unique(filtered.map(e => Utils_1.Utils.getPrimaryKeyValues(e, meta.primaryKeys, true)));
        const where = this.mergePrimaryCondition(ids, pk, options, meta, this.metadata, this.driver.getPlatform());
        const { filters, convertCustomTypes, lockMode, strategy, populateWhere, connectionType, logging, fields } = options;
        await this.em.find(meta.className, where, {
            filters, convertCustomTypes, lockMode, strategy, populateWhere, connectionType, logging,
            fields: fields,
            populate: [],
        });
    }
    initializeCollections(filtered, prop, field, children, customOrder) {
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY) {
            this.initializeOneToMany(filtered, children, prop, field);
        }
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && !this.driver.getPlatform().usesPivotTable()) {
            this.initializeManyToMany(filtered, children, prop, field, customOrder);
        }
    }
    initializeOneToMany(filtered, children, prop, field) {
        const mapToPk = prop.targetMeta.properties[prop.mappedBy].mapToPk;
        const map = {};
        for (const entity of filtered) {
            const key = (0, wrap_1.helper)(entity).getSerializedPrimaryKey();
            map[key] = [];
        }
        for (const child of children) {
            const pk = child.__helper.__data[prop.mappedBy] ?? child[prop.mappedBy];
            if (pk) {
                const key = (0, wrap_1.helper)(mapToPk ? this.em.getReference(prop.type, pk) : pk).getSerializedPrimaryKey();
                map[key]?.push(child);
            }
        }
        for (const entity of filtered) {
            const key = (0, wrap_1.helper)(entity).getSerializedPrimaryKey();
            entity[field].hydrate(map[key]);
        }
    }
    initializeManyToMany(filtered, children, prop, field, customOrder) {
        if (prop.mappedBy) {
            for (const entity of filtered) {
                const items = children.filter(child => child[prop.mappedBy].contains(entity, false));
                entity[field].hydrate(items, true);
            }
        }
        else { // owning side of M:N without pivot table needs to be reordered
            for (const entity of filtered) {
                const order = !customOrder ? [...entity[prop.name].getItems(false)] : []; // copy order of references
                const items = children.filter(child => entity[prop.name].contains(child, false));
                if (!customOrder) {
                    items.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                }
                entity[field].hydrate(items, true);
            }
        }
    }
    async findChildren(entities, prop, populate, options, ref) {
        const children = this.getChildReferences(entities, prop, options, ref);
        const meta = prop.targetMeta;
        let fk = Utils_1.Utils.getPrimaryKeyHash(meta.primaryKeys);
        let schema = options.schema;
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY || (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && !prop.owner)) {
            fk = meta.properties[prop.mappedBy].name;
        }
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_ONE && !prop.owner && !ref) {
            children.length = 0;
            fk = meta.properties[prop.mappedBy].name;
            children.push(...this.filterByReferences(entities, prop.name, options.refresh));
        }
        if (children.length === 0) {
            return [];
        }
        if (!schema && [enums_1.ReferenceKind.ONE_TO_ONE, enums_1.ReferenceKind.MANY_TO_ONE].includes(prop.kind)) {
            schema = children.find(e => e.__helper.__schema)?.__helper.__schema;
        }
        const ids = Utils_1.Utils.unique(children.map(e => e.__helper.getPrimaryKey()));
        let where = this.mergePrimaryCondition(ids, fk, options, meta, this.metadata, this.driver.getPlatform());
        const fields = this.buildFields(options.fields, prop, ref);
        /* eslint-disable prefer-const */
        let { refresh, filters, convertCustomTypes, lockMode, strategy, populateWhere, connectionType, logging, } = options;
        /* eslint-enable prefer-const */
        if (typeof populateWhere === 'object') {
            populateWhere = await this.extractChildCondition({ where: populateWhere }, prop);
        }
        if (!Utils_1.Utils.isEmpty(prop.where)) {
            where = { $and: [where, prop.where] };
        }
        const propOrderBy = [];
        if (prop.orderBy) {
            for (const item of Utils_1.Utils.asArray(prop.orderBy)) {
                for (const field of Utils_1.Utils.keys(item)) {
                    const rawField = RawQueryFragment_1.RawQueryFragment.getKnownFragment(field, false);
                    if (rawField) {
                        const raw2 = (0, RawQueryFragment_1.raw)(rawField.sql, rawField.params);
                        propOrderBy.push({ [raw2.toString()]: item[field] });
                        continue;
                    }
                    propOrderBy.push({ [field]: item[field] });
                }
            }
        }
        const items = await this.em.find(prop.type, where, {
            filters, convertCustomTypes, lockMode, populateWhere, logging,
            orderBy: [...Utils_1.Utils.asArray(options.orderBy), ...propOrderBy],
            populate: populate.children ?? populate.all ?? [],
            exclude: Array.isArray(options.exclude) ? Utils_1.Utils.extractChildElements(options.exclude, prop.name) : options.exclude,
            strategy, fields, schema, connectionType,
            // @ts-ignore not a public option, will be propagated to the populate call
            refresh: refresh && !children.every(item => options.visited.has(item)),
            // @ts-ignore not a public option, will be propagated to the populate call
            visited: options.visited,
        });
        for (const item of items) {
            if (ref && !(0, wrap_1.helper)(item).__onLoadFired) {
                (0, wrap_1.helper)(item).__initialized = false;
                // eslint-disable-next-line dot-notation
                this.em.getUnitOfWork()['loadedEntities'].delete(item);
            }
        }
        return items;
    }
    mergePrimaryCondition(ids, pk, options, meta, metadata, platform) {
        const cond1 = QueryHelper_1.QueryHelper.processWhere({ where: { [pk]: { $in: ids } }, entityName: meta.className, metadata, platform, convertCustomTypes: !options.convertCustomTypes });
        const where = { ...options.where };
        Utils_1.Utils.dropUndefinedProperties(where);
        return where[pk]
            ? { $and: [cond1, where] }
            : { ...cond1, ...where };
    }
    async populateField(entityName, entities, populate, options) {
        const field = populate.field.split(':')[0];
        const prop = this.metadata.find(entityName).properties[field];
        if (prop.kind === enums_1.ReferenceKind.SCALAR && !prop.lazy) {
            return;
        }
        const populated = await this.populateMany(entityName, entities, populate, options);
        if (!populate.children && !populate.all) {
            return;
        }
        const children = [];
        for (const entity of entities) {
            const ref = entity[field];
            if (Utils_1.Utils.isEntity(ref)) {
                children.push(ref);
            }
            else if (Reference_1.Reference.isReference(ref)) {
                children.push(ref.unwrap());
            }
            else if (Utils_1.Utils.isCollection(ref)) {
                children.push(...ref.getItems());
            }
            else if (ref && prop.kind === enums_1.ReferenceKind.EMBEDDED) {
                children.push(...Utils_1.Utils.asArray(ref));
            }
        }
        if (populated.length === 0 && !populate.children) {
            return;
        }
        const fields = this.buildFields(options.fields, prop);
        const innerOrderBy = Utils_1.Utils.asArray(options.orderBy)
            .filter(orderBy => Utils_1.Utils.isObject(orderBy[prop.name]))
            .map(orderBy => orderBy[prop.name]);
        const { refresh, filters, ignoreLazyScalarProperties, populateWhere, connectionType, logging } = options;
        const exclude = Array.isArray(options.exclude) ? Utils_1.Utils.extractChildElements(options.exclude, prop.name) : options.exclude;
        const filtered = Utils_1.Utils.unique(children.filter(e => !options.visited.has(e)));
        await this.populate(prop.type, filtered, populate.children ?? populate.all, {
            where: await this.extractChildCondition(options, prop, false),
            orderBy: innerOrderBy,
            fields,
            exclude,
            validate: false,
            lookup: false,
            filters,
            ignoreLazyScalarProperties,
            populateWhere,
            connectionType,
            logging,
            // @ts-ignore not a public option, will be propagated to the populate call
            refresh: refresh && !filtered.every(item => options.visited.has(item)),
            // @ts-ignore not a public option, will be propagated to the populate call
            visited: options.visited,
        });
    }
    async findChildrenFromPivotTable(filtered, prop, options, orderBy, populate, pivotJoin) {
        const ids = filtered.map(e => e.__helper.__primaryKeys);
        const refresh = options.refresh;
        let where = await this.extractChildCondition(options, prop, true);
        const fields = this.buildFields(options.fields, prop);
        const exclude = Array.isArray(options.exclude) ? Utils_1.Utils.extractChildElements(options.exclude, prop.name) : options.exclude;
        const options2 = { ...options };
        delete options2.limit;
        delete options2.offset;
        options2.fields = fields;
        options2.exclude = exclude;
        options2.populate = (populate?.children ?? []);
        if (prop.customType) {
            ids.forEach((id, idx) => ids[idx] = QueryHelper_1.QueryHelper.processCustomType(prop, id, this.driver.getPlatform()));
        }
        if (!Utils_1.Utils.isEmpty(prop.where)) {
            where = { $and: [where, prop.where] };
        }
        const map = await this.driver.loadFromPivotTable(prop, ids, where, orderBy, this.em.getTransactionContext(), options2, pivotJoin);
        const children = [];
        for (const entity of filtered) {
            const items = map[entity.__helper.getSerializedPrimaryKey()].map(item => {
                if (pivotJoin) {
                    return this.em.getReference(prop.type, item, {
                        convertCustomTypes: true,
                        schema: options.schema ?? this.em.config.get('schema'),
                    });
                }
                const entity = this.em.getEntityFactory().create(prop.type, item, {
                    refresh,
                    merge: true,
                    convertCustomTypes: true,
                    schema: options.schema ?? this.em.config.get('schema'),
                });
                return this.em.getUnitOfWork().register(entity, item, { refresh, loaded: true });
            });
            entity[prop.name].hydrate(items, true);
            children.push(...items);
        }
        return children;
    }
    async extractChildCondition(options, prop, filters = false) {
        const where = options.where;
        const subCond = Utils_1.Utils.isPlainObject(where[prop.name]) ? where[prop.name] : {};
        const meta2 = this.metadata.find(prop.type);
        if (!meta2) {
            return {};
        }
        const pk = Utils_1.Utils.getPrimaryKeyHash(meta2.primaryKeys);
        ['$and', '$or'].forEach(op => {
            if (where[op]) {
                const child = where[op]
                    .map((cond) => cond[prop.name])
                    .filter((sub) => sub != null && !(Utils_1.Utils.isPlainObject(sub) && Object.keys(sub).every(key => Utils_1.Utils.isOperator(key, false))))
                    .map((cond) => {
                    if (Utils_1.Utils.isPrimaryKey(cond)) {
                        return { [pk]: cond };
                    }
                    return cond;
                });
                if (child.length > 0) {
                    subCond[op] = child;
                }
            }
        });
        const operators = Object.keys(subCond).filter(key => Utils_1.Utils.isOperator(key, false));
        if (operators.length > 0) {
            operators.forEach(op => {
                subCond[pk] ??= {};
                subCond[pk][op] = subCond[op];
                delete subCond[op];
            });
        }
        if (filters) {
            return this.em.applyFilters(prop.type, subCond, options.filters, 'read', options);
        }
        return subCond;
    }
    buildFields(fields = [], prop, ref) {
        if (ref) {
            fields = prop.targetMeta.primaryKeys.map(targetPkName => `${prop.name}.${targetPkName}`);
        }
        const ret = fields.reduce((ret, f) => {
            if (Utils_1.Utils.isPlainObject(f)) {
                Utils_1.Utils.keys(f)
                    .filter(ff => ff === prop.name)
                    .forEach(ff => ret.push(...f[ff]));
            }
            else if (f.toString().includes('.')) {
                const parts = f.toString().split('.');
                const propName = parts.shift();
                const childPropName = parts.join('.');
                /* istanbul ignore else */
                if (propName === prop.name) {
                    ret.push(childPropName);
                }
            }
            return ret;
        }, []);
        if (ret.length === 0) {
            return undefined;
        }
        // we need to automatically select the FKs too, e.g. for 1:m relations to be able to wire them with the items
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY || prop.kind === enums_1.ReferenceKind.MANY_TO_MANY) {
            const owner = prop.targetMeta.properties[prop.mappedBy];
            if (owner && !ret.includes(owner.name)) {
                ret.push(owner.name);
            }
        }
        return ret;
    }
    getChildReferences(entities, prop, options, ref) {
        const filtered = this.filterCollections(entities, prop.name, options, ref);
        const children = [];
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY) {
            children.push(...filtered.map(e => e[prop.name].owner));
        }
        else if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.owner) {
            children.push(...filtered.reduce((a, b) => {
                a.push(...b[prop.name].getItems());
                return a;
            }, []));
        }
        else if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY) { // inverse side
            children.push(...filtered);
        }
        else { // MANY_TO_ONE or ONE_TO_ONE
            children.push(...this.filterReferences(entities, prop.name, options, ref));
        }
        return children;
    }
    filterCollections(entities, field, options, ref) {
        if (options.refresh) {
            return entities.filter(e => e[field]);
        }
        return entities.filter(e => Utils_1.Utils.isCollection(e[field]) && !e[field].isInitialized(!ref));
    }
    isPropertyLoaded(entity, field) {
        if (!entity || field === '*') {
            return true;
        }
        const wrapped = (0, wrap_1.helper)(entity);
        if (!field.includes('.')) {
            return wrapped.__loadedProperties.has(field);
        }
        const [f, ...r] = field.split('.');
        if (wrapped.__loadedProperties.has(f) && wrapped.__meta.properties[f]?.targetMeta) {
            if ([enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(wrapped.__meta.properties[f].kind)) {
                return entity[f].getItems(false).every((item) => this.isPropertyLoaded(item, r.join('.')));
            }
            return this.isPropertyLoaded(entity[f], r.join('.'));
        }
        /* istanbul ignore next */
        return false;
    }
    filterReferences(entities, field, options, ref) {
        if (ref) {
            return [];
        }
        const children = entities.filter(e => Utils_1.Utils.isEntity(e[field], true));
        if (options.refresh) {
            return children.map(e => Reference_1.Reference.unwrapReference(e[field]));
        }
        if (options.fields) {
            return children
                .filter(e => {
                const target = e[field];
                const wrapped = (0, wrap_1.helper)(target);
                const childFields = options.fields
                    .filter(f => f.startsWith(`${field}.`))
                    .map(f => f.substring(field.length + 1));
                return !wrapped.__initialized || !childFields.every(cf => this.isPropertyLoaded(target, cf));
            })
                .map(e => Reference_1.Reference.unwrapReference(e[field]));
        }
        return children
            .filter(e => !e[field].__helper.__initialized)
            .map(e => Reference_1.Reference.unwrapReference(e[field]));
    }
    filterByReferences(entities, field, refresh) {
        /* istanbul ignore next */
        if (refresh) {
            return entities;
        }
        return entities.filter(e => !e[field]?.__helper?.__initialized);
    }
    lookupAllRelationships(entityName) {
        const ret = [];
        const meta = this.metadata.find(entityName);
        meta.relations.forEach(prop => {
            ret.push({
                field: this.getRelationName(meta, prop),
                // force select-in strategy when populating all relations as otherwise we could cause infinite loops when self-referencing
                strategy: enums_1.LoadStrategy.SELECT_IN,
                // no need to look up populate children recursively as we just pass `all: true` here
                all: true,
            });
        });
        return ret;
    }
    getRelationName(meta, prop) {
        if (!prop.embedded) {
            return prop.name;
        }
        return `${this.getRelationName(meta, meta.properties[prop.embedded[0]])}.${prop.embedded[1]}`;
    }
    lookupEagerLoadedRelationships(entityName, populate, strategy, prefix = '', visited = []) {
        const meta = this.metadata.find(entityName);
        if (!meta && !prefix) {
            return populate;
        }
        if (visited.includes(entityName) || !meta) {
            return [];
        }
        visited.push(entityName);
        const ret = prefix === '' ? [...populate] : [];
        meta.relations
            .filter(prop => {
            const eager = prop.eager && !populate.some(p => p.field === `${prop.name}:ref`);
            const populated = populate.some(p => p.field === prop.name);
            const disabled = populate.some(p => p.field === prop.name && p.all === false);
            return !disabled && (eager || populated);
        })
            .forEach(prop => {
            const field = this.getRelationName(meta, prop);
            const prefixed = prefix ? `${prefix}.${field}` : field;
            const nestedPopulate = populate.filter(p => p.field === prop.name).flatMap(p => p.children).filter(Boolean);
            const nested = this.lookupEagerLoadedRelationships(prop.type, nestedPopulate, strategy, prefixed, visited.slice());
            if (nested.length > 0) {
                ret.push(...nested);
            }
            else {
                const selfReferencing = [meta.className, meta.root.className, ...visited].includes(prop.type) && prop.eager;
                ret.push({
                    field: prefixed,
                    // enforce select-in strategy for self-referencing relations
                    strategy: selfReferencing ? enums_1.LoadStrategy.SELECT_IN : strategy ?? prop.strategy,
                });
            }
        });
        return ret;
    }
}
exports.EntityLoader = EntityLoader;
