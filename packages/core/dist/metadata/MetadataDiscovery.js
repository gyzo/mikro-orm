"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataDiscovery = void 0;
const node_path_1 = require("node:path");
const globby_1 = __importDefault(require("globby"));
const typings_1 = require("../typings");
const Utils_1 = require("../utils/Utils");
const MetadataValidator_1 = require("./MetadataValidator");
const MetadataStorage_1 = require("./MetadataStorage");
const EntitySchema_1 = require("./EntitySchema");
const enums_1 = require("../enums");
const errors_1 = require("../errors");
const types_1 = require("../types");
const colors_1 = require("../logging/colors");
const RawQueryFragment_1 = require("../utils/RawQueryFragment");
class MetadataDiscovery {
    metadata;
    platform;
    config;
    namingStrategy;
    metadataProvider;
    cache;
    logger;
    schemaHelper;
    validator = new MetadataValidator_1.MetadataValidator();
    discovered = [];
    constructor(metadata, platform, config) {
        this.metadata = metadata;
        this.platform = platform;
        this.config = config;
        this.namingStrategy = this.config.getNamingStrategy();
        this.metadataProvider = this.config.getMetadataProvider();
        this.cache = this.config.getMetadataCacheAdapter();
        this.logger = this.config.getLogger();
        this.schemaHelper = this.platform.getSchemaHelper();
    }
    async discover(preferTsNode = true) {
        const startTime = Date.now();
        this.logger.log('discovery', `ORM entity discovery started, using ${colors_1.colors.cyan(this.metadataProvider.constructor.name)}`);
        await this.findEntities(preferTsNode);
        for (const meta of this.discovered) {
            await this.config.get('discovery').onMetadata?.(meta, this.platform);
        }
        this.processDiscoveredEntities(this.discovered);
        const diff = Date.now() - startTime;
        this.logger.log('discovery', `- entity discovery finished, found ${colors_1.colors.green('' + this.discovered.length)} entities, took ${colors_1.colors.green(`${diff} ms`)}`);
        const storage = this.mapDiscoveredEntities();
        await this.config.get('discovery').afterDiscovered?.(storage, this.platform);
        return storage;
    }
    discoverSync(preferTsNode = true) {
        const startTime = Date.now();
        this.logger.log('discovery', `ORM entity discovery started, using ${colors_1.colors.cyan(this.metadataProvider.constructor.name)} in sync mode`);
        this.findEntities(preferTsNode, true);
        for (const meta of this.discovered) {
            void this.config.get('discovery').onMetadata?.(meta, this.platform);
        }
        this.processDiscoveredEntities(this.discovered);
        const diff = Date.now() - startTime;
        this.logger.log('discovery', `- entity discovery finished, found ${colors_1.colors.green('' + this.discovered.length)} entities, took ${colors_1.colors.green(`${diff} ms`)}`);
        const storage = this.mapDiscoveredEntities();
        void this.config.get('discovery').afterDiscovered?.(storage, this.platform);
        return storage;
    }
    mapDiscoveredEntities() {
        const discovered = new MetadataStorage_1.MetadataStorage();
        this.discovered
            .filter(meta => meta.root.name)
            .sort((a, b) => b.root.name.localeCompare(a.root.name))
            .forEach(meta => {
            this.platform.validateMetadata(meta);
            discovered.set(meta.className, meta);
        });
        return discovered;
    }
    processDiscoveredEntities(discovered) {
        for (const meta of discovered) {
            let i = 1;
            Object.values(meta.properties).forEach(prop => meta.propertyOrder.set(prop.name, i++));
            Object.values(meta.properties).forEach(prop => this.initPolyEmbeddables(prop, discovered));
        }
        // ignore base entities (not annotated with @Entity)
        const filtered = discovered.filter(meta => meta.root.name);
        // sort so we discover entities first to get around issues with nested embeddables
        filtered.sort((a, b) => !a.embeddable === !b.embeddable ? 0 : (a.embeddable ? 1 : -1));
        filtered.forEach(meta => this.initSingleTableInheritance(meta, filtered));
        filtered.forEach(meta => this.defineBaseEntityProperties(meta));
        filtered.forEach(meta => this.metadata.set(meta.className, EntitySchema_1.EntitySchema.fromMetadata(meta).init().meta));
        filtered.forEach(meta => this.initAutoincrement(meta));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initEmbeddables(meta, prop)));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initFactoryField(meta, prop)));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initFieldName(prop)));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initVersionProperty(meta, prop)));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initCustomType(meta, prop)));
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initGeneratedColumn(meta, prop)));
        filtered.forEach(meta => this.initAutoincrement(meta)); // once again after we init custom types
        filtered.forEach(meta => this.initCheckConstraints(meta));
        for (const meta of filtered) {
            for (const prop of Object.values(meta.properties)) {
                this.initDefaultValue(prop);
                this.inferTypeFromDefault(prop);
                this.initColumnType(prop);
                // change tracking on scalars is used only for "auto" flushMode
                if (this.config.get('flushMode') !== 'auto' && [enums_1.ReferenceKind.SCALAR, enums_1.ReferenceKind.EMBEDDED].includes(prop.kind)) {
                    prop.trackChanges = false;
                }
            }
        }
        filtered.forEach(meta => Object.values(meta.properties).forEach(prop => this.initIndexes(meta, prop)));
        filtered.forEach(meta => this.autoWireBidirectionalProperties(meta));
        filtered.forEach(meta => this.findReferencingProperties(meta, filtered));
        for (const meta of filtered) {
            discovered.push(...this.processEntity(meta));
        }
        discovered.forEach(meta => meta.sync(true));
        const combinedCachePath = this.cache.combine?.();
        // override the path in the options, so we can log it from the CLI in `cache:generate` command
        if (combinedCachePath) {
            this.config.get('metadataCache').combined = combinedCachePath;
        }
        return discovered.map(meta => {
            meta = this.metadata.get(meta.className);
            meta.sync(true);
            return meta;
        });
    }
    findEntities(preferTs, sync = false) {
        this.discovered.length = 0;
        const options = this.config.get('discovery');
        const key = (preferTs && this.config.get('preferTs', Utils_1.Utils.detectTsNode()) && this.config.get('entitiesTs').length > 0) ? 'entitiesTs' : 'entities';
        const paths = this.config.get(key).filter(item => Utils_1.Utils.isString(item));
        const refs = this.config.get(key).filter(item => !Utils_1.Utils.isString(item));
        if (paths.length > 0) {
            if (sync || options.requireEntitiesArray) {
                throw new Error(`[requireEntitiesArray] Explicit list of entities is required, please use the 'entities' option.`);
            }
            return this.discoverDirectories(paths).then(() => {
                this.discoverReferences(refs);
                this.discoverMissingTargets();
                this.validator.validateDiscovered(this.discovered, options);
                return this.discovered;
            });
        }
        this.discoverReferences(refs);
        this.discoverMissingTargets();
        this.validator.validateDiscovered(this.discovered, options);
        return this.discovered;
    }
    discoverMissingTargets() {
        const unwrap = (type) => type
            .replace(/Array<(.*)>/, '$1') // unwrap array
            .replace(/\[]$/, '') // remove array suffix
            .replace(/\((.*)\)/, '$1'); // unwrap union types
        const missing = [];
        this.discovered.forEach(meta => Object.values(meta.properties).forEach(prop => {
            if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.pivotEntity && !this.discovered.find(m => m.className === Utils_1.Utils.className(prop.pivotEntity))) {
                const target = typeof prop.pivotEntity === 'function'
                    ? prop.pivotEntity()
                    : prop.pivotEntity;
                missing.push(target);
            }
            if (prop.kind !== enums_1.ReferenceKind.SCALAR && !unwrap(prop.type).split(/ ?\| ?/).every(type => this.discovered.find(m => m.className === type))) {
                const target = typeof prop.entity === 'function'
                    ? prop.entity()
                    : prop.type;
                missing.push(...Utils_1.Utils.asArray(target));
            }
        }));
        if (missing.length > 0) {
            this.tryDiscoverTargets(missing);
        }
    }
    tryDiscoverTargets(targets) {
        for (const target of targets) {
            if (typeof target === 'function' && target.name && !this.metadata.has(target.name)) {
                this.discoverReferences([target]);
                this.discoverMissingTargets();
            }
        }
    }
    async discoverDirectories(paths) {
        paths = paths.map(path => Utils_1.Utils.normalizePath(path));
        const files = await (0, globby_1.default)(paths, { cwd: Utils_1.Utils.normalizePath(this.config.get('baseDir')) });
        this.logger.log('discovery', `- processing ${colors_1.colors.cyan('' + files.length)} files`);
        const found = [];
        for (const filepath of files) {
            const filename = (0, node_path_1.basename)(filepath);
            if (!filename.match(/\.[cm]?[jt]s$/) ||
                filename.endsWith('.js.map') ||
                filename.match(/\.d\.[cm]?ts/) ||
                filename.startsWith('.') ||
                filename.match(/index\.[cm]?[jt]s$/)) {
                this.logger.log('discovery', `- ignoring file ${filename}`);
                continue;
            }
            const name = this.namingStrategy.getClassName(filename);
            const path = Utils_1.Utils.normalizePath(this.config.get('baseDir'), filepath);
            const targets = await this.getEntityClassOrSchema(path, name);
            for (const target of targets) {
                if (!(target instanceof Function) && !(target instanceof EntitySchema_1.EntitySchema)) {
                    this.logger.log('discovery', `- ignoring file ${filename}`);
                    continue;
                }
                const entity = this.prepare(target);
                const schema = this.getSchema(entity, path);
                const meta = schema.init().meta;
                this.metadata.set(meta.className, meta);
                found.push([schema, path]);
            }
        }
        for (const [schema, path] of found) {
            this.discoverEntity(schema, path);
        }
    }
    discoverReferences(refs) {
        const found = [];
        for (const entity of refs) {
            const schema = this.getSchema(this.prepare(entity));
            const meta = schema.init().meta;
            this.metadata.set(meta.className, meta);
            found.push(schema);
        }
        // discover parents (base entities) automatically
        for (const meta of this.metadata) {
            let parent = meta.extends;
            if (parent instanceof EntitySchema_1.EntitySchema && !this.metadata.has(parent.meta.className)) {
                this.discoverReferences([parent]);
            }
            if (!meta.class) {
                continue;
            }
            parent = Object.getPrototypeOf(meta.class);
            if (parent.name !== '' && !this.metadata.has(parent.name)) {
                this.discoverReferences([parent]);
            }
        }
        for (const schema of found) {
            this.discoverEntity(schema);
        }
        return this.discovered.filter(meta => found.find(m => m.name === meta.className));
    }
    reset(className) {
        const exists = this.discovered.findIndex(m => m.className === className);
        if (exists !== -1) {
            this.metadata.reset(this.discovered[exists].className);
            this.discovered.splice(exists, 1);
        }
    }
    prepare(entity) {
        if ('schema' in entity && entity.schema instanceof EntitySchema_1.EntitySchema) {
            return entity.schema;
        }
        if (EntitySchema_1.EntitySchema.REGISTRY.has(entity)) {
            return EntitySchema_1.EntitySchema.REGISTRY.get(entity);
        }
        return entity;
    }
    getSchema(entity, filepath) {
        if (entity instanceof EntitySchema_1.EntitySchema) {
            if (filepath) {
                // initialize global metadata for given entity
                MetadataStorage_1.MetadataStorage.getMetadata(entity.meta.className, filepath);
            }
            return entity;
        }
        const path = entity[MetadataStorage_1.MetadataStorage.PATH_SYMBOL];
        if (path) {
            const meta = Utils_1.Utils.copy(MetadataStorage_1.MetadataStorage.getMetadata(entity.name, path), false);
            meta.path = Utils_1.Utils.relativePath(path, this.config.get('baseDir'));
            this.metadata.set(entity.name, meta);
        }
        const exists = this.metadata.has(entity.name);
        const meta = this.metadata.get(entity.name, true);
        meta.abstract ??= !(exists && meta.name);
        const schema = EntitySchema_1.EntitySchema.fromMetadata(meta);
        schema.setClass(entity);
        schema.meta.useCache = this.metadataProvider.useCache();
        return schema;
    }
    discoverEntity(schema, path) {
        this.logger.log('discovery', `- processing entity ${colors_1.colors.cyan(schema.meta.className)}${colors_1.colors.grey(path ? ` (${path})` : '')}`);
        const meta = schema.meta;
        const root = Utils_1.Utils.getRootEntity(this.metadata, meta);
        schema.meta.path = Utils_1.Utils.relativePath(path || meta.path, this.config.get('baseDir'));
        const cache = meta.useCache && meta.path && this.cache.get(meta.className + (0, node_path_1.extname)(meta.path));
        if (cache) {
            this.logger.log('discovery', `- using cached metadata for entity ${colors_1.colors.cyan(meta.className)}`);
            this.metadataProvider.loadFromCache(meta, cache);
            meta.root = root;
            this.discovered.push(meta);
            return;
        }
        // infer default value from property initializer early, as the metadata provider might use some defaults, e.g. string for reflect-metadata
        for (const prop of meta.props) {
            this.inferDefaultValue(meta, prop);
        }
        // if the definition is using EntitySchema we still want it to go through the metadata provider to validate no types are missing
        this.metadataProvider.loadEntityMetadata(meta, meta.className);
        if (!meta.collection && meta.name) {
            const entityName = root.discriminatorColumn ? root.name : meta.name;
            meta.collection = this.namingStrategy.classToTableName(entityName);
        }
        delete meta.root; // to allow caching (as root can contain cycles)
        this.saveToCache(meta);
        meta.root = root;
        this.discovered.push(meta);
    }
    saveToCache(meta) {
        if (!meta.useCache) {
            return;
        }
        const copy = Utils_1.Utils.copy(meta, false);
        copy.props
            .filter(prop => types_1.Type.isMappedType(prop.type))
            .forEach(prop => {
            ['type', 'customType']
                .filter(k => types_1.Type.isMappedType(prop[k]))
                .forEach(k => delete prop[k]);
        });
        copy.props
            .filter(prop => prop.default)
            .forEach(prop => {
            const raw = RawQueryFragment_1.RawQueryFragment.getKnownFragment(prop.default);
            if (raw) {
                prop.defaultRaw ??= this.platform.formatQuery(raw.sql, raw.params);
                delete prop.default;
            }
        });
        [
            'prototype', 'props', 'referencingProperties', 'propertyOrder', 'relations',
            'concurrencyCheckKeys', 'checks',
        ].forEach(key => delete copy[key]);
        // base entity without properties might not have path, but nothing to cache there
        if (meta.path) {
            this.cache.set(meta.className + (0, node_path_1.extname)(meta.path), copy, meta.path);
        }
    }
    initNullability(prop) {
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_ONE) {
            return Utils_1.Utils.defaultValue(prop, 'nullable', prop.optional || prop.cascade.includes(enums_1.Cascade.REMOVE) || prop.cascade.includes(enums_1.Cascade.ALL));
        }
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_ONE) {
            return Utils_1.Utils.defaultValue(prop, 'nullable', prop.optional || !prop.owner || prop.cascade.includes(enums_1.Cascade.REMOVE) || prop.cascade.includes(enums_1.Cascade.ALL));
        }
        return Utils_1.Utils.defaultValue(prop, 'nullable', prop.optional);
    }
    applyNamingStrategy(meta, prop) {
        if (!prop.fieldNames) {
            this.initFieldName(prop);
        }
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY) {
            this.initManyToManyFields(meta, prop);
        }
        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
            this.initManyToOneFields(prop);
        }
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_MANY) {
            this.initOneToManyFields(prop);
        }
    }
    initOwnColumns(meta) {
        meta.sync();
        for (const prop of meta.props) {
            if (!prop.joinColumns || !prop.columnTypes || prop.ownColumns || ![enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
                continue;
            }
            if (prop.joinColumns.length > 1) {
                prop.ownColumns = prop.joinColumns.filter(col => {
                    return !meta.props.find(p => p.name !== prop.name && (!p.fieldNames || p.fieldNames.includes(col)));
                });
            }
            if (!prop.ownColumns || prop.ownColumns.length === 0) {
                prop.ownColumns = prop.joinColumns;
            }
            if (prop.joinColumns.length !== prop.columnTypes.length) {
                prop.columnTypes = prop.joinColumns.flatMap(field => {
                    const matched = meta.props.find(p => p.fieldNames?.includes(field));
                    if (matched) {
                        return matched.columnTypes;
                    }
                    /* istanbul ignore next */
                    throw errors_1.MetadataError.fromWrongForeignKey(meta, prop, 'columnTypes');
                });
            }
            if (prop.joinColumns.length !== prop.referencedColumnNames.length) {
                throw errors_1.MetadataError.fromWrongForeignKey(meta, prop, 'referencedColumnNames');
            }
        }
    }
    initFieldName(prop, object = false) {
        if (prop.fieldNames && prop.fieldNames.length > 0) {
            return;
        }
        if (prop.kind === enums_1.ReferenceKind.SCALAR || prop.kind === enums_1.ReferenceKind.EMBEDDED) {
            prop.fieldNames = [this.namingStrategy.propertyToColumnName(prop.name, object)];
        }
        else if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
            prop.fieldNames = this.initManyToOneFieldName(prop, prop.name);
        }
        else if (prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.owner) {
            prop.fieldNames = this.initManyToManyFieldName(prop, prop.name);
        }
    }
    initManyToOneFieldName(prop, name) {
        const meta2 = this.metadata.get(prop.type);
        const ret = [];
        for (const primaryKey of meta2.primaryKeys) {
            this.initFieldName(meta2.properties[primaryKey]);
            for (const fieldName of meta2.properties[primaryKey].fieldNames) {
                ret.push(this.namingStrategy.joinKeyColumnName(name, fieldName, meta2.compositePK));
            }
        }
        return ret;
    }
    initManyToManyFieldName(prop, name) {
        const meta2 = this.metadata.get(prop.type);
        return meta2.primaryKeys.map(() => this.namingStrategy.propertyToColumnName(name));
    }
    initManyToManyFields(meta, prop) {
        const meta2 = this.metadata.get(prop.type);
        Utils_1.Utils.defaultValue(prop, 'fixedOrder', !!prop.fixedOrderColumn);
        const pivotMeta = this.metadata.find(prop.pivotEntity);
        const props = Object.values(pivotMeta?.properties ?? {});
        const pks = props.filter(p => p.primary);
        const fks = props.filter(p => p.kind === enums_1.ReferenceKind.MANY_TO_ONE);
        if (pivotMeta) {
            pivotMeta.pivotTable = true;
            prop.pivotTable = pivotMeta.tableName;
            if (pks.length === 1) {
                prop.fixedOrder = true;
                prop.fixedOrderColumn = pks[0].name;
            }
        }
        if (pivotMeta && (pks.length === 2 || fks.length >= 2)) {
            const owner = prop.mappedBy ? meta2.properties[prop.mappedBy] : prop;
            const [first, second] = this.ensureCorrectFKOrderInPivotEntity(pivotMeta, owner);
            prop.joinColumns ??= first.fieldNames;
            prop.inverseJoinColumns ??= second.fieldNames;
        }
        if (!prop.pivotTable && prop.owner && this.platform.usesPivotTable()) {
            prop.pivotTable = this.namingStrategy.joinTableName(meta.tableName, meta2.tableName, prop.name);
        }
        if (prop.mappedBy) {
            const prop2 = meta2.properties[prop.mappedBy];
            this.initManyToManyFields(meta2, prop2);
            prop.pivotTable = prop2.pivotTable;
            prop.pivotEntity = prop2.pivotEntity ?? prop2.pivotTable;
            prop.fixedOrder = prop2.fixedOrder;
            prop.fixedOrderColumn = prop2.fixedOrderColumn;
            prop.joinColumns = prop2.inverseJoinColumns;
            prop.inverseJoinColumns = prop2.joinColumns;
        }
        prop.referencedColumnNames ??= Utils_1.Utils.flatten(meta.primaryKeys.map(primaryKey => meta.properties[primaryKey].fieldNames));
        prop.joinColumns ??= prop.referencedColumnNames.map(referencedColumnName => this.namingStrategy.joinKeyColumnName(meta.root.className, referencedColumnName, meta.compositePK));
        prop.inverseJoinColumns ??= this.initManyToOneFieldName(prop, meta2.root.className);
    }
    initManyToOneFields(prop) {
        const meta2 = this.metadata.get(prop.type);
        const fieldNames = Utils_1.Utils.flatten(meta2.primaryKeys.map(primaryKey => meta2.properties[primaryKey].fieldNames));
        Utils_1.Utils.defaultValue(prop, 'referencedTableName', meta2.collection);
        if (!prop.joinColumns) {
            prop.joinColumns = fieldNames.map(fieldName => this.namingStrategy.joinKeyColumnName(prop.name, fieldName, fieldNames.length > 1));
        }
        if (!prop.referencedColumnNames) {
            prop.referencedColumnNames = fieldNames;
        }
    }
    initOneToManyFields(prop) {
        const meta2 = this.metadata.get(prop.type);
        if (!prop.joinColumns) {
            prop.joinColumns = [this.namingStrategy.joinColumnName(prop.name)];
        }
        if (!prop.referencedColumnNames) {
            meta2.getPrimaryProps().forEach(pk => this.applyNamingStrategy(meta2, pk));
            prop.referencedColumnNames = Utils_1.Utils.flatten(meta2.getPrimaryProps().map(pk => pk.fieldNames));
        }
    }
    processEntity(meta) {
        const pks = Object.values(meta.properties).filter(prop => prop.primary);
        meta.primaryKeys = pks.map(prop => prop.name);
        meta.compositePK = pks.length > 1;
        // FK used as PK, we need to cascade
        if (pks.length === 1 && pks[0].kind !== enums_1.ReferenceKind.SCALAR) {
            pks[0].deleteRule ??= 'cascade';
        }
        meta.forceConstructor ??= this.shouldForceConstructorUsage(meta);
        this.validator.validateEntityDefinition(this.metadata, meta.className, this.config.get('discovery'));
        for (const prop of Object.values(meta.properties)) {
            this.initNullability(prop);
            this.applyNamingStrategy(meta, prop);
            this.initDefaultValue(prop);
            this.inferTypeFromDefault(prop);
            this.initVersionProperty(meta, prop);
            this.initCustomType(meta, prop);
            this.initColumnType(prop);
            this.initRelation(prop);
        }
        this.initOwnColumns(meta);
        meta.simplePK = pks.length === 1 && pks[0].kind === enums_1.ReferenceKind.SCALAR && !pks[0].customType && pks[0].runtimeType !== 'Date';
        meta.serializedPrimaryKey = this.platform.getSerializedPrimaryKeyField(meta.primaryKeys[0]);
        const serializedPKProp = meta.properties[meta.serializedPrimaryKey];
        if (serializedPKProp && meta.serializedPrimaryKey !== meta.primaryKeys[0]) {
            serializedPKProp.persist = false;
        }
        if (this.platform.usesPivotTable()) {
            return Object.values(meta.properties)
                .filter(prop => prop.kind === enums_1.ReferenceKind.MANY_TO_MANY && prop.owner && prop.pivotTable)
                .map(prop => this.definePivotTableEntity(meta, prop));
        }
        return [];
    }
    findReferencingProperties(meta, metadata) {
        for (const meta2 of metadata) {
            for (const prop2 of meta2.relations) {
                if (prop2.kind !== enums_1.ReferenceKind.SCALAR && prop2.type === meta.className) {
                    meta.referencingProperties.push({ meta: meta2, prop: prop2 });
                }
            }
        }
    }
    initFactoryField(meta, prop) {
        ['mappedBy', 'inversedBy', 'pivotEntity'].forEach(type => {
            const value = prop[type];
            if (value instanceof Function) {
                const meta2 = this.metadata.get(prop.type);
                prop[type] = value(meta2.properties)?.name;
                if (prop[type] == null) {
                    throw errors_1.MetadataError.fromWrongReference(meta, prop, type);
                }
            }
        });
    }
    ensureCorrectFKOrderInPivotEntity(meta, owner) {
        const pks = Object.values(meta.properties).filter(p => p.primary);
        const fks = Object.values(meta.properties).filter(p => p.kind === enums_1.ReferenceKind.MANY_TO_ONE);
        let first, second;
        if (pks.length === 2) {
            [first, second] = pks;
        }
        else if (fks.length >= 2) {
            [first, second] = fks;
        }
        else {
            /* istanbul ignore next */
            return [];
        }
        // wrong FK order, first FK needs to point to the owning side
        // (note that we can detect this only if the FKs target different types)
        if (owner.type === first.type && first.type !== second.type) {
            delete meta.properties[first.name];
            meta.removeProperty(first.name, false);
            meta.addProperty(first);
            [first, second] = [second, first];
        }
        return [first, second];
    }
    definePivotTableEntity(meta, prop) {
        const pivotMeta = this.metadata.find(prop.pivotEntity);
        // ensure inverse side exists so we can join it when populating via pivot tables
        if (!prop.inversedBy && prop.targetMeta) {
            const inverseName = `${meta.className}_${prop.name}__inverse`;
            prop.inversedBy = inverseName;
            const inverseProp = {
                name: inverseName,
                kind: enums_1.ReferenceKind.MANY_TO_MANY,
                type: meta.className,
                mappedBy: prop.name,
                pivotEntity: prop.pivotEntity,
                pivotTable: prop.pivotTable,
                persist: false,
                hydrate: false,
            };
            this.applyNamingStrategy(prop.targetMeta, inverseProp);
            this.initCustomType(prop.targetMeta, inverseProp);
            this.initRelation(inverseProp);
            prop.targetMeta.properties[inverseName] = inverseProp;
        }
        if (pivotMeta) {
            this.ensureCorrectFKOrderInPivotEntity(pivotMeta, prop);
            return pivotMeta;
        }
        const exists = this.metadata.find(prop.pivotTable);
        if (exists) {
            prop.pivotEntity = exists.className;
            return exists;
        }
        let tableName = prop.pivotTable;
        let schemaName;
        if (prop.pivotTable.includes('.')) {
            [schemaName, tableName] = prop.pivotTable.split('.');
        }
        schemaName ??= meta.schema;
        const targetType = prop.targetMeta.className;
        const data = new typings_1.EntityMetadata({
            name: prop.pivotTable,
            className: prop.pivotTable,
            collection: tableName,
            schema: schemaName,
            pivotTable: true,
        });
        prop.pivotEntity = data.className;
        if (prop.fixedOrder) {
            const primaryProp = this.defineFixedOrderProperty(prop, targetType);
            data.properties[primaryProp.name] = primaryProp;
        }
        else {
            data.compositePK = true;
        }
        // handle self-referenced m:n with same default field names
        if (meta.className === targetType && prop.joinColumns.every((joinColumn, idx) => joinColumn === prop.inverseJoinColumns[idx])) {
            prop.joinColumns = prop.referencedColumnNames.map(name => this.namingStrategy.joinKeyColumnName(meta.className + '_1', name, meta.compositePK));
            prop.inverseJoinColumns = prop.referencedColumnNames.map(name => this.namingStrategy.joinKeyColumnName(meta.className + '_2', name, meta.compositePK));
            if (prop.inversedBy) {
                const prop2 = this.metadata.get(targetType).properties[prop.inversedBy];
                prop2.inverseJoinColumns = prop.joinColumns;
                prop2.joinColumns = prop.inverseJoinColumns;
            }
        }
        data.properties[meta.name + '_owner'] = this.definePivotProperty(prop, meta.name + '_owner', meta.className, targetType + '_inverse', true, meta.className === targetType);
        data.properties[targetType + '_inverse'] = this.definePivotProperty(prop, targetType + '_inverse', targetType, meta.name + '_owner', false, meta.className === targetType);
        return this.metadata.set(data.className, data);
    }
    defineFixedOrderProperty(prop, targetType) {
        const pk = prop.fixedOrderColumn || this.namingStrategy.referenceColumnName();
        const primaryProp = {
            name: pk,
            type: 'number',
            kind: enums_1.ReferenceKind.SCALAR,
            primary: true,
            autoincrement: true,
            unsigned: this.platform.supportsUnsigned(),
        };
        this.initFieldName(primaryProp);
        this.initColumnType(primaryProp);
        prop.fixedOrderColumn = pk;
        if (prop.inversedBy) {
            const prop2 = this.metadata.get(targetType).properties[prop.inversedBy];
            prop2.fixedOrder = true;
            prop2.fixedOrderColumn = pk;
        }
        return primaryProp;
    }
    definePivotProperty(prop, name, type, inverse, owner, selfReferencing) {
        const ret = {
            name,
            type,
            kind: enums_1.ReferenceKind.MANY_TO_ONE,
            cascade: [enums_1.Cascade.ALL],
            fixedOrder: prop.fixedOrder,
            fixedOrderColumn: prop.fixedOrderColumn,
            index: this.platform.indexForeignKeys(),
            primary: !prop.fixedOrder,
            autoincrement: false,
            updateRule: prop.updateRule,
            deleteRule: prop.deleteRule,
        };
        if (selfReferencing && !this.platform.supportsMultipleCascadePaths()) {
            ret.updateRule ??= 'no action';
            ret.deleteRule ??= 'no action';
        }
        const meta = this.metadata.get(type);
        ret.targetMeta = meta;
        ret.joinColumns = [];
        ret.inverseJoinColumns = [];
        const schema = meta.schema ?? this.config.get('schema') ?? this.platform.getDefaultSchemaName();
        ret.referencedTableName = schema && schema !== '*' ? schema + '.' + meta.tableName : meta.tableName;
        if (owner) {
            ret.owner = true;
            ret.inversedBy = inverse;
            ret.referencedColumnNames = prop.referencedColumnNames;
            ret.fieldNames = ret.joinColumns = prop.joinColumns;
            ret.inverseJoinColumns = prop.referencedColumnNames;
            meta.primaryKeys.forEach(primaryKey => {
                const prop2 = meta.properties[primaryKey];
                ret.length = prop2.length;
                ret.precision = prop2.precision;
                ret.scale = prop2.scale;
            });
        }
        else {
            ret.owner = false;
            ret.mappedBy = inverse;
            ret.fieldNames = ret.joinColumns = prop.inverseJoinColumns;
            ret.referencedColumnNames = [];
            ret.inverseJoinColumns = [];
            meta.primaryKeys.forEach(primaryKey => {
                const prop2 = meta.properties[primaryKey];
                ret.referencedColumnNames.push(...prop2.fieldNames);
                ret.inverseJoinColumns.push(...prop2.fieldNames);
                ret.length = prop2.length;
                ret.precision = prop2.precision;
                ret.scale = prop2.scale;
            });
        }
        this.initColumnType(ret);
        this.initRelation(ret);
        return ret;
    }
    autoWireBidirectionalProperties(meta) {
        Object.values(meta.properties)
            .filter(prop => prop.kind !== enums_1.ReferenceKind.SCALAR && !prop.owner && prop.mappedBy)
            .forEach(prop => {
            const meta2 = this.metadata.get(prop.type);
            const prop2 = meta2.properties[prop.mappedBy];
            if (prop2 && !prop2.inversedBy) {
                prop2.inversedBy = prop.name;
            }
        });
    }
    defineBaseEntityProperties(meta) {
        const base = meta.extends && this.metadata.get(Utils_1.Utils.className(meta.extends));
        if (!base || base === meta) { // make sure we do not fall into infinite loop
            return 0;
        }
        let order = this.defineBaseEntityProperties(base);
        const ownProps = Object.values(meta.properties);
        const old = ownProps.map(x => x.name);
        meta.properties = {};
        Object.values(base.properties).forEach(prop => {
            if (!prop.inherited) {
                meta.properties[prop.name] = prop;
            }
        });
        ownProps.forEach(prop => meta.properties[prop.name] = prop);
        meta.filters = { ...base.filters, ...meta.filters };
        if (!meta.discriminatorValue) {
            Object.values(base.properties).filter(prop => !old.includes(prop.name)).forEach(prop => {
                meta.properties[prop.name] = { ...prop };
                meta.propertyOrder.set(prop.name, (order += 0.01));
            });
        }
        meta.indexes = Utils_1.Utils.unique([...base.indexes, ...meta.indexes]);
        meta.uniques = Utils_1.Utils.unique([...base.uniques, ...meta.uniques]);
        meta.checks = Utils_1.Utils.unique([...base.checks, ...meta.checks]);
        const pks = Object.values(meta.properties).filter(p => p.primary).map(p => p.name);
        if (pks.length > 0 && meta.primaryKeys.length === 0) {
            meta.primaryKeys = pks;
        }
        Utils_1.Utils.keys(base.hooks).forEach(type => {
            meta.hooks[type] = Utils_1.Utils.unique([...base.hooks[type], ...(meta.hooks[type] || [])]);
        });
        if (meta.constructorParams.length === 0 && base.constructorParams.length > 0) {
            meta.constructorParams = [...base.constructorParams];
        }
        if (meta.toJsonParams.length === 0 && base.toJsonParams.length > 0) {
            meta.toJsonParams = [...base.toJsonParams];
        }
        return order;
    }
    initPolyEmbeddables(embeddedProp, discovered, visited = new Set()) {
        if (embeddedProp.kind !== enums_1.ReferenceKind.EMBEDDED || visited.has(embeddedProp)) {
            return;
        }
        visited.add(embeddedProp);
        const types = embeddedProp.type.split(/ ?\| ?/);
        let embeddable = this.discovered.find(m => m.name === embeddedProp.type);
        const polymorphs = this.discovered.filter(m => types.includes(m.name));
        // create virtual polymorphic entity
        if (!embeddable && polymorphs.length > 0) {
            const properties = {};
            let discriminatorColumn;
            const inlineProperties = (meta) => {
                Object.values(meta.properties).forEach(prop => {
                    // defaults on db level would mess up with change tracking
                    delete prop.default;
                    if (properties[prop.name] && properties[prop.name].type !== prop.type) {
                        properties[prop.name].type = `${properties[prop.name].type} | ${prop.type}`;
                        return properties[prop.name];
                    }
                    return properties[prop.name] = prop;
                });
            };
            const processExtensions = (meta) => {
                const parent = this.discovered.find(m => {
                    return meta.extends && Utils_1.Utils.className(meta.extends) === m.className;
                });
                if (!parent) {
                    return;
                }
                discriminatorColumn ??= parent.discriminatorColumn;
                inlineProperties(parent);
                processExtensions(parent);
            };
            polymorphs.forEach(meta => {
                inlineProperties(meta);
                processExtensions(meta);
            });
            const name = polymorphs.map(t => t.className).sort().join(' | ');
            embeddable = new typings_1.EntityMetadata({
                name,
                className: name,
                embeddable: true,
                abstract: true,
                properties,
                polymorphs,
                discriminatorColumn,
            });
            embeddable.sync();
            discovered.push(embeddable);
            polymorphs.forEach(meta => meta.root = embeddable);
        }
    }
    initEmbeddables(meta, embeddedProp, visited = new Set()) {
        if (embeddedProp.kind !== enums_1.ReferenceKind.EMBEDDED || visited.has(embeddedProp)) {
            return;
        }
        visited.add(embeddedProp);
        const embeddable = this.discovered.find(m => m.name === embeddedProp.type);
        if (!embeddable) {
            throw errors_1.MetadataError.fromUnknownEntity(embeddedProp.type, `${meta.className}.${embeddedProp.name}`);
        }
        embeddedProp.embeddable = embeddable.class;
        embeddedProp.embeddedProps = {};
        let order = meta.propertyOrder.get(embeddedProp.name);
        const getRootProperty = (prop) => prop.embedded ? getRootProperty(meta.properties[prop.embedded[0]]) : prop;
        const isParentObject = (prop) => {
            if (prop.object || prop.array) {
                return true;
            }
            return prop.embedded ? isParentObject(meta.properties[prop.embedded[0]]) : false;
        };
        const rootProperty = getRootProperty(embeddedProp);
        const parentProperty = meta.properties[embeddedProp.embedded?.[0] ?? ''];
        const object = isParentObject(embeddedProp);
        this.initFieldName(embeddedProp, rootProperty !== embeddedProp && object);
        // the prefix of the parent can not be a boolean; it already passed here
        const prefix = this.getPrefix(embeddedProp, parentProperty);
        for (const prop of Object.values(embeddable.properties)) {
            const name = (embeddedProp.embeddedPath?.join('_') ?? embeddedProp.fieldNames[0] + '_') + prop.name;
            meta.properties[name] = Utils_1.Utils.copy(prop, false);
            meta.properties[name].name = name;
            meta.properties[name].embedded = [embeddedProp.name, prop.name];
            meta.propertyOrder.set(name, (order += 0.01));
            embeddedProp.embeddedProps[prop.name] = meta.properties[name];
            meta.properties[name].persist ??= embeddedProp.persist;
            if (embeddedProp.nullable) {
                meta.properties[name].nullable = true;
            }
            if (meta.properties[name].fieldNames) {
                meta.properties[name].fieldNames[0] = prefix + meta.properties[name].fieldNames[0];
            }
            else {
                const name2 = meta.properties[name].name;
                meta.properties[name].name = prefix + prop.name;
                this.initFieldName(meta.properties[name]);
                meta.properties[name].name = name2;
            }
            if (object) {
                embeddedProp.object = true;
                let path = [];
                let tmp = embeddedProp;
                while (tmp.embedded && tmp.object) {
                    path.unshift(tmp.embedded[1]);
                    tmp = meta.properties[tmp.embedded[0]];
                }
                if (tmp === rootProperty) {
                    path.unshift(rootProperty.fieldNames[0]);
                }
                else if (embeddedProp.embeddedPath) {
                    path = [...embeddedProp.embeddedPath];
                }
                else {
                    path = [embeddedProp.fieldNames[0]];
                }
                this.initFieldName(prop, true);
                path.push(prop.fieldNames[0]);
                meta.properties[name].fieldNames = prop.fieldNames;
                meta.properties[name].embeddedPath = path;
                const fieldName = (0, RawQueryFragment_1.raw)(this.platform.getSearchJsonPropertySQL(path.join('->'), prop.runtimeType ?? prop.type, true));
                meta.properties[name].fieldNameRaw = fieldName.sql; // for querying in SQL drivers
                meta.properties[name].persist = false; // only virtual as we store the whole object
                meta.properties[name].userDefined = false; // mark this as a generated/internal property, so we can distinguish from user-defined non-persist properties
                meta.properties[name].object = true;
            }
            this.initEmbeddables(meta, meta.properties[name], visited);
        }
        for (const index of embeddable.indexes) {
            meta.indexes.push({
                ...index,
                properties: Utils_1.Utils.asArray(index.properties).map(p => {
                    return embeddedProp.embeddedProps[p].name;
                }),
            });
        }
        for (const unique of embeddable.uniques) {
            meta.uniques.push({
                ...unique,
                properties: Utils_1.Utils.asArray(unique.properties).map(p => {
                    return embeddedProp.embeddedProps[p].name;
                }),
            });
        }
    }
    initSingleTableInheritance(meta, metadata) {
        if (meta.root !== meta && !meta.__processed) {
            meta.root = metadata.find(m => m.className === meta.root.className);
            meta.root.__processed = true;
        }
        else {
            delete meta.root.__processed;
        }
        if (!meta.root.discriminatorColumn) {
            return;
        }
        if (!meta.root.discriminatorMap) {
            meta.root.discriminatorMap = {};
            const children = metadata.filter(m => m.root.className === meta.root.className && !m.abstract);
            children.forEach(m => {
                const name = m.discriminatorValue ?? this.namingStrategy.classToTableName(m.className);
                meta.root.discriminatorMap[name] = m.className;
            });
        }
        meta.discriminatorValue = Object.entries(meta.root.discriminatorMap).find(([, className]) => className === meta.className)?.[0];
        if (!meta.root.properties[meta.root.discriminatorColumn]) {
            this.createDiscriminatorProperty(meta.root);
        }
        Utils_1.Utils.defaultValue(meta.root.properties[meta.root.discriminatorColumn], 'items', Object.keys(meta.root.discriminatorMap));
        Utils_1.Utils.defaultValue(meta.root.properties[meta.root.discriminatorColumn], 'index', true);
        if (meta.root === meta) {
            return;
        }
        let i = 1;
        Object.values(meta.properties).forEach(prop => {
            const newProp = Utils_1.Utils.copy(prop, false);
            if (meta.root.properties[prop.name] && meta.root.properties[prop.name].type !== prop.type) {
                const name = newProp.name;
                this.initFieldName(newProp, newProp.object);
                newProp.name = name + '_' + (i++);
                meta.root.addProperty(newProp);
                newProp.nullable = true;
                newProp.name = name;
                newProp.hydrate = false;
                newProp.inherited = true;
                return;
            }
            if (prop.enum && prop.items && meta.root.properties[prop.name]?.items) {
                newProp.items = Utils_1.Utils.unique([...meta.root.properties[prop.name].items, ...prop.items]);
            }
            newProp.nullable = true;
            newProp.inherited = true;
            meta.root.addProperty(newProp);
        });
        meta.collection = meta.root.collection;
        meta.root.indexes = Utils_1.Utils.unique([...meta.root.indexes, ...meta.indexes]);
        meta.root.uniques = Utils_1.Utils.unique([...meta.root.uniques, ...meta.uniques]);
    }
    createDiscriminatorProperty(meta) {
        meta.addProperty({
            name: meta.discriminatorColumn,
            type: 'string',
            enum: true,
            kind: enums_1.ReferenceKind.SCALAR,
            userDefined: false,
        });
    }
    initAutoincrement(meta) {
        const pks = meta.getPrimaryProps();
        if (pks.length === 1 && this.platform.isNumericProperty(pks[0])) {
            /* istanbul ignore next */
            pks[0].autoincrement ??= true;
        }
    }
    initCheckConstraints(meta) {
        const map = this.createColumnMappingObject(meta);
        for (const check of meta.checks) {
            const columns = check.property ? meta.properties[check.property].fieldNames : [];
            check.name ??= this.namingStrategy.indexName(meta.tableName, columns, 'check');
            if (check.expression instanceof Function) {
                check.expression = check.expression(map);
            }
        }
    }
    initGeneratedColumn(meta, prop) {
        if (!prop.generated && prop.columnTypes) {
            const match = prop.columnTypes[0]?.match(/(.*) generated always as (.*)/i);
            if (match) {
                prop.columnTypes[0] = match[1];
                prop.generated = match[2];
                return;
            }
            const match2 = prop.columnTypes[0]?.trim().match(/^as (.*)/i);
            if (match2) {
                prop.generated = match2[1];
            }
            return;
        }
        const map = this.createColumnMappingObject(meta);
        if (prop.generated instanceof Function) {
            prop.generated = prop.generated(map);
        }
    }
    createColumnMappingObject(meta) {
        return Object.values(meta.properties).reduce((o, prop) => {
            if (prop.fieldNames) {
                o[prop.name] = prop.fieldNames[0];
            }
            return o;
        }, {});
    }
    getDefaultVersionValue(prop) {
        if (typeof prop.defaultRaw !== 'undefined') {
            return prop.defaultRaw;
        }
        /* istanbul ignore next */
        if (prop.default != null) {
            return '' + this.platform.quoteVersionValue(prop.default, prop);
        }
        if (prop.type.toLowerCase() === 'date') {
            prop.length ??= this.platform.getDefaultVersionLength();
            return this.platform.getCurrentTimestampSQL(prop.length);
        }
        return '1';
    }
    inferDefaultValue(meta, prop) {
        /* istanbul ignore next */
        if (!meta.class) {
            return;
        }
        try {
            // try to create two entity instances to detect the value is stable
            const now = Date.now();
            const entity1 = new meta.class();
            const entity2 = new meta.class();
            // we compare the two values by reference, this will discard things like `new Date()` or `Date.now()`
            if (this.config.get('discovery').inferDefaultValues && prop.default === undefined && entity1[prop.name] != null && entity1[prop.name] === entity2[prop.name] && entity1[prop.name] !== now) {
                prop.default ??= entity1[prop.name];
            }
            // if the default value is null, infer nullability
            if (entity1[prop.name] === null) {
                prop.nullable ??= true;
            }
            // but still use object values for type inference if not explicitly set, e.g. `createdAt = new Date()`
            if (prop.kind === enums_1.ReferenceKind.SCALAR && prop.type == null && entity1[prop.name] != null) {
                prop.type = prop.runtimeType = Utils_1.Utils.getObjectType(entity1[prop.name]);
            }
        }
        catch {
            // ignore
        }
    }
    initDefaultValue(prop) {
        if (prop.defaultRaw || !('default' in prop)) {
            return;
        }
        let val = prop.default;
        const raw = RawQueryFragment_1.RawQueryFragment.getKnownFragment(val);
        if (raw) {
            prop.defaultRaw = this.platform.formatQuery(raw.sql, raw.params);
            return;
        }
        if (prop.customType instanceof types_1.ArrayType && Array.isArray(prop.default)) {
            val = prop.customType.convertToDatabaseValue(prop.default, this.platform);
        }
        prop.defaultRaw = typeof val === 'string' ? `'${val}'` : '' + val;
    }
    inferTypeFromDefault(prop) {
        if ((prop.defaultRaw == null && prop.default == null) || prop.type !== 'any') {
            return;
        }
        switch (typeof prop.default) {
            case 'string':
                prop.type = prop.runtimeType = 'string';
                break;
            case 'number':
                prop.type = prop.runtimeType = 'number';
                break;
            case 'boolean':
                prop.type = prop.runtimeType = 'boolean';
                break;
        }
        if (prop.defaultRaw?.startsWith('current_timestamp')) {
            prop.type = prop.runtimeType = 'Date';
        }
    }
    initVersionProperty(meta, prop) {
        if (prop.version) {
            this.initDefaultValue(prop);
            meta.versionProperty = prop.name;
            prop.defaultRaw = this.getDefaultVersionValue(prop);
        }
        if (prop.concurrencyCheck && !prop.primary) {
            meta.concurrencyCheckKeys.add(prop.name);
        }
    }
    initCustomType(meta, prop) {
        // `prop.type` might be actually instance of custom type class
        if (types_1.Type.isMappedType(prop.type) && !prop.customType) {
            prop.customType = prop.type;
            prop.type = prop.customType.constructor.name;
        }
        // `prop.type` might also be custom type class (not instance), so `typeof MyType` will give us `function`, not `object`
        if (typeof prop.type === 'function' && types_1.Type.isMappedType(prop.type.prototype) && !prop.customType) {
            prop.customType = new prop.type();
            prop.type = prop.customType.constructor.name;
        }
        if (!prop.customType && ['json', 'jsonb'].includes(prop.type?.toLowerCase())) {
            prop.customType = new types_1.JsonType();
        }
        if (prop.kind === enums_1.ReferenceKind.SCALAR && !prop.customType && prop.columnTypes && ['json', 'jsonb'].includes(prop.columnTypes[0])) {
            prop.customType = new types_1.JsonType();
        }
        if (!prop.customType && prop.array && prop.items) {
            prop.customType = new types_1.EnumArrayType(`${meta.className}.${prop.name}`, prop.items);
        }
        // for number arrays we make sure to convert the items to numbers
        if (!prop.customType && prop.type === 'number[]') {
            prop.customType = new types_1.ArrayType(i => +i);
        }
        // `string[]` can be returned via ts-morph, while reflect metadata will give us just `array`
        if (!prop.customType && (prop.type?.toLowerCase() === 'array' || prop.type?.toString().endsWith('[]'))) {
            prop.customType = new types_1.ArrayType();
        }
        if (!prop.customType && prop.type?.toLowerCase() === 'buffer') {
            prop.customType = new types_1.BlobType();
        }
        if (!prop.customType && prop.type?.toLowerCase() === 'uint8array') {
            prop.customType = new types_1.Uint8ArrayType();
        }
        const mappedType = this.getMappedType(prop);
        if (prop.fieldNames?.length === 1 && !prop.customType) {
            [types_1.BigIntType, types_1.DoubleType, types_1.DecimalType, types_1.IntervalType]
                .filter(type => mappedType instanceof type)
                .forEach(type => prop.customType = new type());
        }
        if (prop.customType && !prop.columnTypes) {
            const mappedType = this.getMappedType({ columnTypes: [prop.customType.getColumnType(prop, this.platform)] });
            if (prop.customType.compareAsType() === 'any' && ![types_1.JsonType].some(t => prop.customType instanceof t)) {
                prop.runtimeType ??= mappedType.runtimeType;
            }
            else {
                prop.runtimeType ??= prop.customType.runtimeType;
            }
        }
        else {
            prop.runtimeType ??= mappedType.runtimeType;
        }
        if (prop.customType) {
            prop.customType.platform = this.platform;
            prop.customType.meta = meta;
            prop.customType.prop = prop;
            prop.columnTypes ??= [prop.customType.getColumnType(prop, this.platform)];
            prop.hasConvertToJSValueSQL = !!prop.customType.convertToJSValueSQL && prop.customType.convertToJSValueSQL('', this.platform) !== '';
            prop.hasConvertToDatabaseValueSQL = !!prop.customType.convertToDatabaseValueSQL && prop.customType.convertToDatabaseValueSQL('', this.platform) !== '';
            if (prop.customType instanceof types_1.BigIntType && ['string', 'bigint', 'number'].includes(prop.runtimeType.toLowerCase())) {
                prop.customType.mode = prop.runtimeType.toLowerCase();
            }
        }
        if (types_1.Type.isMappedType(prop.customType) && prop.kind === enums_1.ReferenceKind.SCALAR && !prop.type?.toString().endsWith('[]')) {
            prop.type = prop.customType.name;
        }
        if (!prop.customType && [enums_1.ReferenceKind.ONE_TO_ONE, enums_1.ReferenceKind.MANY_TO_ONE].includes(prop.kind) && this.metadata.get(prop.type).compositePK) {
            prop.customTypes = [];
            for (const pk of this.metadata.get(prop.type).getPrimaryProps()) {
                if (pk.customType) {
                    prop.customTypes.push(pk.customType);
                    prop.hasConvertToJSValueSQL ||= !!pk.customType.convertToJSValueSQL && pk.customType.convertToJSValueSQL('', this.platform) !== '';
                    prop.hasConvertToDatabaseValueSQL ||= !!pk.customType.convertToDatabaseValueSQL && pk.customType.convertToDatabaseValueSQL('', this.platform) !== '';
                }
                else {
                    prop.customTypes.push(undefined);
                }
            }
        }
        if (prop.kind === enums_1.ReferenceKind.SCALAR && !(mappedType instanceof types_1.UnknownType)) {
            if (!prop.columnTypes && prop.nativeEnumName && meta.schema !== this.platform.getDefaultSchemaName() && meta.schema && !prop.nativeEnumName.includes('.')) {
                prop.columnTypes = [`${meta.schema}.${prop.nativeEnumName}`];
            }
            else {
                prop.columnTypes ??= [mappedType.getColumnType(prop, this.platform)];
            }
            // use only custom types provided by user, we don't need to use the ones provided by ORM,
            // with exception for ArrayType and JsonType, those two are handled in
            if (!Object.values(types_1.t).some(type => type === mappedType.constructor)) {
                prop.customType ??= mappedType;
            }
        }
    }
    initRelation(prop) {
        if (prop.kind === enums_1.ReferenceKind.SCALAR) {
            return;
        }
        const meta2 = this.discovered.find(m => m.className === prop.type);
        prop.referencedPKs = meta2.primaryKeys;
        prop.targetMeta = meta2;
        if (!prop.formula && prop.persist === false && [enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) && !prop.embedded) {
            prop.formula = a => `${a}.${this.platform.quoteIdentifier(prop.fieldNames[0])}`;
        }
    }
    initColumnType(prop) {
        this.initUnsigned(prop);
        this.metadata.find(prop.type)?.getPrimaryProps().map(pk => {
            prop.length ??= pk.length;
            prop.precision ??= pk.precision;
            prop.scale ??= pk.scale;
        });
        if (prop.kind === enums_1.ReferenceKind.SCALAR && (prop.type == null || prop.type === 'object') && prop.columnTypes?.[0]) {
            delete prop.type;
            const mappedType = this.getMappedType(prop);
            prop.type = mappedType.compareAsType();
        }
        if (prop.columnTypes || !this.schemaHelper) {
            return;
        }
        if (prop.kind === enums_1.ReferenceKind.SCALAR) {
            const mappedType = this.getMappedType(prop);
            const SCALAR_TYPES = ['string', 'number', 'boolean', 'bigint', 'Date', 'Buffer', 'RegExp', 'any', 'unknown'];
            if (mappedType instanceof types_1.UnknownType
                && !prop.columnTypes
                // it could be a runtime type from reflect-metadata
                && !SCALAR_TYPES.includes(prop.type)
                // or it might be inferred via ts-morph to some generic type alias
                && !prop.type.match(/[<>:"';{}]/)) {
                const type = prop.length != null && !prop.type.endsWith(`(${prop.length})`) ? `${prop.type}(${prop.length})` : prop.type;
                prop.columnTypes = [type];
            }
            else {
                prop.columnTypes = [mappedType.getColumnType(prop, this.platform)];
            }
            return;
        }
        if (prop.kind === enums_1.ReferenceKind.EMBEDDED && prop.object && !prop.columnTypes) {
            prop.columnTypes = [this.platform.getJsonDeclarationSQL()];
            return;
        }
        const targetMeta = this.metadata.get(prop.type);
        prop.columnTypes = [];
        for (const pk of targetMeta.getPrimaryProps()) {
            this.initCustomType(targetMeta, pk);
            this.initColumnType(pk);
            const mappedType = this.getMappedType(pk);
            let columnTypes = pk.columnTypes;
            if (pk.autoincrement) {
                columnTypes = [mappedType.getColumnType({ ...pk, autoincrement: false }, this.platform)];
            }
            prop.columnTypes.push(...columnTypes);
            if (!targetMeta.compositePK) {
                prop.customType = pk.customType;
            }
        }
    }
    getMappedType(prop) {
        if (prop.customType) {
            return prop.customType;
        }
        let t = prop.columnTypes?.[0] ?? prop.type;
        if (prop.nativeEnumName) {
            t = 'enum';
        }
        else if (prop.enum) {
            t = prop.items?.every(item => Utils_1.Utils.isString(item)) ? 'enum' : 'tinyint';
        }
        if (t === 'Date') {
            t = 'datetime';
        }
        return this.platform.getMappedType(t);
    }
    getPrefix(prop, parent) {
        const { embeddedPath = [], fieldNames, prefix = true, prefixMode } = prop;
        if (prefix === true) {
            return (embeddedPath.length ? embeddedPath.join('_') : fieldNames[0]) + '_';
        }
        const prefixParent = parent ? this.getPrefix(parent, null) : '';
        if (prefix === false) {
            return prefixParent;
        }
        const mode = prefixMode ?? this.config.get('embeddables').prefixMode;
        return mode === 'absolute' ? prefix : prefixParent + prefix;
    }
    initUnsigned(prop) {
        if (prop.unsigned != null) {
            return;
        }
        if ([enums_1.ReferenceKind.MANY_TO_ONE, enums_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
            const meta2 = this.metadata.get(prop.type);
            prop.unsigned = meta2.getPrimaryProps().some(pk => {
                this.initUnsigned(pk);
                return pk.unsigned;
            });
            return;
        }
        prop.unsigned ??= (prop.primary || prop.unsigned) && this.platform.isNumericProperty(prop) && this.platform.supportsUnsigned();
    }
    initIndexes(meta, prop) {
        const hasIndex = meta.indexes.some(idx => idx.properties?.length === 1 && idx.properties[0] === prop.name);
        if (prop.kind === enums_1.ReferenceKind.MANY_TO_ONE && this.platform.indexForeignKeys() && !hasIndex) {
            prop.index ??= true;
        }
    }
    async getEntityClassOrSchema(path, name) {
        const exports = await Utils_1.Utils.dynamicImport(path);
        const targets = Object.values(exports)
            .filter(item => item instanceof EntitySchema_1.EntitySchema || (item instanceof Function && MetadataStorage_1.MetadataStorage.isKnownEntity(item.name)));
        // ignore class implementations that are linked from an EntitySchema
        for (const item of targets) {
            if (item instanceof EntitySchema_1.EntitySchema) {
                targets.forEach((item2, idx) => {
                    if (item.meta.class === item2) {
                        targets.splice(idx, 1);
                    }
                });
            }
        }
        if (targets.length > 0) {
            return targets;
        }
        const target = exports.default ?? exports[name];
        /* istanbul ignore next */
        if (!target) {
            throw errors_1.MetadataError.entityNotFound(name, path.replace(this.config.get('baseDir'), '.'));
        }
        return [target];
    }
    shouldForceConstructorUsage(meta) {
        const forceConstructor = this.config.get('forceEntityConstructor');
        if (Array.isArray(forceConstructor)) {
            return forceConstructor.some(cls => Utils_1.Utils.className(cls) === meta.className);
        }
        return forceConstructor;
    }
}
exports.MetadataDiscovery = MetadataDiscovery;
