"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityGenerator = void 0;
const core_1 = require("@mikro-orm/core");
const knex_1 = require("@mikro-orm/knex");
const node_path_1 = require("node:path");
const fs_extra_1 = require("fs-extra");
const EntitySchemaSourceFile_1 = require("./EntitySchemaSourceFile");
const SourceFile_1 = require("./SourceFile");
class EntityGenerator {
    em;
    config;
    driver;
    platform;
    helper;
    connection;
    namingStrategy;
    sources = [];
    referencedEntities = new WeakSet();
    constructor(em) {
        this.em = em;
        this.config = this.em.config;
        this.driver = this.em.getDriver();
        this.platform = this.driver.getPlatform();
        this.helper = this.platform.getSchemaHelper();
        this.connection = this.driver.getConnection();
        this.namingStrategy = this.config.getNamingStrategy();
    }
    static register(orm) {
        orm.config.registerExtension('@mikro-orm/entity-generator', () => new EntityGenerator(orm.em));
    }
    async generate(options = {}) {
        options = core_1.Utils.mergeConfig({}, this.config.get('entityGenerator'), options);
        const schema = await knex_1.DatabaseSchema.create(this.connection, this.platform, this.config, undefined, undefined, options.takeTables, options.skipTables);
        const metadata = await this.getEntityMetadata(schema, options);
        const defaultPath = `${this.config.get('baseDir')}/generated-entities`;
        const baseDir = core_1.Utils.normalizePath(options.path ?? defaultPath);
        for (const meta of metadata) {
            if (!meta.pivotTable || options.outputPurePivotTables || this.referencedEntities.has(meta)) {
                if (options.entitySchema) {
                    this.sources.push(new EntitySchemaSourceFile_1.EntitySchemaSourceFile(meta, this.namingStrategy, this.platform, { ...options, scalarTypeInDecorator: true }));
                }
                else {
                    this.sources.push(new SourceFile_1.SourceFile(meta, this.namingStrategy, this.platform, options));
                }
            }
        }
        if (options.save) {
            await (0, fs_extra_1.ensureDir)(baseDir);
            await Promise.all(this.sources.map(async (file) => {
                const fileName = file.getBaseName();
                const fileDir = (0, node_path_1.dirname)(fileName);
                if (fileDir !== '.') {
                    await (0, fs_extra_1.ensureDir)((0, node_path_1.join)(baseDir, fileDir));
                }
                return (0, fs_extra_1.writeFile)((0, node_path_1.join)(baseDir, fileName), file.generate(), { flush: true });
            }));
        }
        return this.sources.map(file => file.generate());
    }
    async getEntityMetadata(schema, options) {
        const metadata = schema.getTables()
            .filter(table => !options.schema || table.schema === options.schema)
            .sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`))
            .map(table => {
            const skipColumns = options.skipColumns?.[table.getShortestName()];
            if (skipColumns) {
                for (const col of table.getColumns()) {
                    if (skipColumns.some(matchColumnName => this.matchName(col.name, matchColumnName))) {
                        table.removeColumn(col.name);
                    }
                }
            }
            return table.getEntityDeclaration(this.namingStrategy, this.helper, options.scalarPropertiesForRelations);
        });
        for (const meta of metadata) {
            for (const prop of meta.relations) {
                if (!metadata.some(otherMeta => prop.referencedTableName === otherMeta.collection || prop.referencedTableName === `${otherMeta.schema ?? schema.name}.${otherMeta.collection}`)) {
                    prop.kind = core_1.ReferenceKind.SCALAR;
                    const mappedTypes = prop.columnTypes.map((t, i) => this.platform.getMappedType(t));
                    const runtimeTypes = mappedTypes.map(t => t.runtimeType);
                    prop.runtimeType = (runtimeTypes.length === 1 ? runtimeTypes[0] : `[${runtimeTypes.join(', ')}]`);
                    prop.type = mappedTypes.length === 1 ? (core_1.Utils.entries(core_1.types).find(([k, v]) => Object.getPrototypeOf(mappedTypes[0]) === v.prototype)?.[0] ?? mappedTypes[0].name) : 'unknown';
                }
                const meta2 = metadata.find(meta2 => meta2.className === prop.type);
                const targetPrimaryColumns = meta2?.getPrimaryProps().flatMap(p => p.fieldNames);
                if (targetPrimaryColumns && targetPrimaryColumns.length !== prop.referencedColumnNames.length) {
                    prop.ownColumns = prop.joinColumns.filter(col => {
                        return !meta.props.find(p => p.name !== prop.name && (!p.fieldNames || p.fieldNames.includes(col)));
                    });
                }
            }
        }
        await options.onInitialMetadata?.(metadata, this.platform);
        // enforce schema usage in class names only on duplicates
        const duplicates = core_1.Utils.findDuplicates(metadata.map(meta => meta.className));
        for (const duplicate of duplicates) {
            for (const meta of metadata.filter(meta => meta.className === duplicate)) {
                meta.className = this.namingStrategy.getEntityName(`${meta.schema ?? schema.name}_${meta.className}`);
                for (const relMeta of metadata) {
                    for (const prop of relMeta.relations) {
                        if (prop.type === duplicate && (prop.referencedTableName === meta.collection || prop.referencedTableName === `${meta.schema ?? schema.name}.${meta.collection}`)) {
                            prop.type = meta.className;
                        }
                    }
                }
            }
        }
        this.detectManyToManyRelations(metadata, options.onlyPurePivotTables, options.readOnlyPivotTables, options.outputPurePivotTables);
        if (options.bidirectionalRelations) {
            this.generateBidirectionalRelations(metadata, options.outputPurePivotTables);
        }
        if (options.identifiedReferences) {
            this.generateIdentifiedReferences(metadata);
        }
        if (options.customBaseEntityName) {
            this.generateAndAttachCustomBaseEntity(metadata, options.customBaseEntityName);
        }
        if (options.undefinedDefaults) {
            this.castNullDefaultsToUndefined(metadata);
        }
        await options.onProcessedMetadata?.(metadata, this.platform);
        return metadata;
    }
    matchName(name, nameToMatch) {
        return typeof nameToMatch === 'string'
            ? name.toLocaleLowerCase() === nameToMatch.toLocaleLowerCase()
            : nameToMatch.test(name);
    }
    detectManyToManyRelations(metadata, onlyPurePivotTables, readOnlyPivotTables, outputPurePivotTables) {
        for (const meta of metadata) {
            const isReferenced = metadata.some(m => {
                return m.tableName !== meta.tableName && m.relations.some(r => {
                    return r.referencedTableName === meta.tableName && [core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(r.kind);
                });
            });
            if (isReferenced) {
                this.referencedEntities.add(meta);
            }
            // Entities with non-composite PKs are never pivot tables. Skip.
            if (!meta.compositePK) {
                continue;
            }
            // Entities where there are not exactly 2 PK relations that are both ManyToOne are never pivot tables. Skip.
            const pkRelations = meta.relations.filter(rel => rel.primary);
            if (pkRelations.length !== 2 ||
                pkRelations.some(rel => rel.kind !== core_1.ReferenceKind.MANY_TO_ONE)) {
                continue;
            }
            const pkRelationFields = new Set(pkRelations.flatMap(rel => rel.fieldNames));
            const nonPkFields = Array.from(new Set(meta.props.flatMap(prop => prop.fieldNames))).filter(fieldName => !pkRelationFields.has(fieldName));
            let fixedOrderColumn;
            let isReadOnly = false;
            // If there are any fields other than the ones in the two PK relations, table may or may not be a pivot one.
            // Check further and skip on disqualification.
            if (nonPkFields.length > 0) {
                // Additional columns have been disabled with the setting.
                // Skip table even it otherwise would have qualified as a pivot table.
                if (onlyPurePivotTables) {
                    continue;
                }
                const pkRelationNames = pkRelations.map(rel => rel.name);
                let otherProps = meta.props
                    .filter(prop => !pkRelationNames.includes(prop.name) &&
                    prop.persist !== false && // Skip checking non-persist props
                    prop.fieldNames.some(fieldName => nonPkFields.includes(fieldName)));
                // Deal with the auto increment column first. That is the column used for fixed ordering, if present.
                const autoIncrementProp = meta.props.find(prop => prop.autoincrement && prop.fieldNames.length === 1);
                if (autoIncrementProp) {
                    otherProps = otherProps.filter(prop => prop !== autoIncrementProp);
                    fixedOrderColumn = autoIncrementProp.fieldNames[0];
                }
                isReadOnly = otherProps.some(prop => {
                    // If the prop is non-nullable and unique, it will trivially end up causing issues.
                    // Mark as read only.
                    if (!prop.nullable && prop.unique) {
                        return true;
                    }
                    // Any other props need to also be optional.
                    // Whether they have a default or are generated,
                    // we've already checked that not explicitly setting the property means the default is either NULL,
                    // or a non-unique non-null value, making it safe to write to pivot entity.
                    return !prop.optional;
                });
                if (isReadOnly && !readOnlyPivotTables) {
                    continue;
                }
                // If this now proven pivot entity has persistent props other than the fixed order column,
                // output it, by considering it as a referenced one.
                if (otherProps.length > 0) {
                    this.referencedEntities.add(meta);
                }
            }
            meta.pivotTable = true;
            const owner = metadata.find(m => m.className === meta.relations[0].type);
            const name = this.namingStrategy.columnNameToProperty(meta.tableName.replace(new RegExp('^' + owner.tableName + '_'), ''));
            const ownerProp = {
                name,
                kind: core_1.ReferenceKind.MANY_TO_MANY,
                pivotTable: meta.tableName,
                type: meta.relations[1].type,
                joinColumns: meta.relations[0].fieldNames,
                inverseJoinColumns: meta.relations[1].fieldNames,
            };
            if (outputPurePivotTables || this.referencedEntities.has(meta)) {
                ownerProp.pivotEntity = meta.className;
            }
            if (fixedOrderColumn) {
                ownerProp.fixedOrder = true;
                ownerProp.fixedOrderColumn = fixedOrderColumn;
            }
            if (isReadOnly) {
                ownerProp.persist = false;
            }
            owner.addProperty(ownerProp);
        }
    }
    generateBidirectionalRelations(metadata, includeUnreferencedPurePivotTables) {
        const filteredMetadata = includeUnreferencedPurePivotTables
            ? metadata
            : metadata.filter(m => !m.pivotTable || this.referencedEntities.has(m));
        for (const meta of filteredMetadata) {
            for (const prop of meta.relations) {
                const targetMeta = metadata.find(m => m.className === prop.type);
                if (!targetMeta) {
                    continue;
                }
                const newProp = {
                    type: meta.className,
                    joinColumns: prop.fieldNames,
                    referencedTableName: meta.tableName,
                    referencedColumnNames: core_1.Utils.flatten(targetMeta.getPrimaryProps().map(pk => pk.fieldNames)),
                    mappedBy: prop.name,
                    persist: prop.persist,
                };
                if (prop.kind === core_1.ReferenceKind.MANY_TO_ONE) {
                    newProp.kind = core_1.ReferenceKind.ONE_TO_MANY;
                }
                else if (prop.kind === core_1.ReferenceKind.ONE_TO_ONE && !prop.mappedBy) {
                    newProp.kind = core_1.ReferenceKind.ONE_TO_ONE;
                    newProp.nullable = true;
                    newProp.default = null;
                    newProp.defaultRaw = 'null';
                }
                else if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY && !prop.mappedBy) {
                    newProp.kind = core_1.ReferenceKind.MANY_TO_MANY;
                }
                else {
                    continue;
                }
                let i = 1;
                const name = newProp.name = this.namingStrategy.inverseSideName(meta.className, prop.name, newProp.kind);
                while (targetMeta.properties[newProp.name]) {
                    newProp.name = name + (i++);
                }
                targetMeta.addProperty(newProp);
            }
        }
    }
    generateIdentifiedReferences(metadata) {
        for (const meta of metadata.filter(m => !m.pivotTable || this.referencedEntities.has(m))) {
            for (const prop of Object.values(meta.properties)) {
                if ([core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind) || prop.lazy) {
                    prop.ref = true;
                }
            }
        }
    }
    generateAndAttachCustomBaseEntity(metadata, customBaseEntityName) {
        let baseClassExists = false;
        for (const meta of metadata) {
            if (meta.className === customBaseEntityName) {
                baseClassExists = true;
                continue;
            }
            meta.extends ??= customBaseEntityName;
        }
        if (!baseClassExists) {
            metadata.push(new core_1.EntityMetadata({
                className: customBaseEntityName,
                abstract: true,
                relations: [],
            }));
        }
    }
    castNullDefaultsToUndefined(metadata) {
        for (const meta of metadata) {
            for (const prop of Object.values(meta.properties)) {
                if (prop.nullable && !prop.optional && prop.default === null && typeof prop.defaultRaw === 'undefined') {
                    prop.default = undefined;
                    prop.optional = true;
                }
            }
        }
    }
}
exports.EntityGenerator = EntityGenerator;
