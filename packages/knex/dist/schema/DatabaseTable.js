"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseTable = void 0;
const core_1 = require("@mikro-orm/core");
/**
 * @internal
 */
class DatabaseTable {
    platform;
    name;
    schema;
    columns = {};
    indexes = [];
    checks = [];
    foreignKeys = {};
    nativeEnums = {}; // for postgres
    comment;
    constructor(platform, name, schema) {
        this.platform = platform;
        this.name = name;
        this.schema = schema;
        Object.defineProperties(this, {
            platform: { enumerable: false, writable: true },
        });
    }
    getColumns() {
        return Object.values(this.columns);
    }
    getColumn(name) {
        return this.columns[name];
    }
    removeColumn(name) {
        delete this.columns[name];
    }
    getIndexes() {
        return core_1.Utils.removeDuplicates(this.indexes);
    }
    getChecks() {
        return this.checks;
    }
    init(cols, indexes = [], checks = [], pks, fks = {}, enums = {}) {
        this.indexes = indexes;
        this.checks = checks;
        this.foreignKeys = fks;
        this.columns = cols.reduce((o, v) => {
            const index = indexes.filter(i => i.columnNames[0] === v.name);
            v.primary = v.primary || pks.includes(v.name);
            v.unique = index.some(i => i.unique && !i.primary);
            const type = v.name in enums ? 'enum' : v.type;
            v.mappedType = this.platform.getMappedType(type);
            v.default = v.default?.toString().startsWith('nextval(') ? null : v.default;
            v.enumItems ??= enums[v.name] || [];
            o[v.name] = v;
            return o;
        }, {});
    }
    addColumn(column) {
        this.columns[column.name] = column;
    }
    addColumnFromProperty(prop, meta, config) {
        prop.fieldNames?.forEach((field, idx) => {
            const type = prop.enum ? 'enum' : prop.columnTypes[idx];
            const mappedType = this.platform.getMappedType(type);
            if (mappedType instanceof core_1.DecimalType) {
                const match = prop.columnTypes[idx].match(/\w+\((\d+), ?(\d+)\)/);
                /* istanbul ignore else */
                if (match) {
                    prop.precision ??= +match[1];
                    prop.scale ??= +match[2];
                    prop.length = undefined;
                }
            }
            if (prop.length == null && prop.columnTypes[idx]) {
                prop.length = this.platform.getSchemaHelper().inferLengthFromColumnType(prop.columnTypes[idx]);
                if (typeof mappedType.getDefaultLength !== 'undefined') {
                    prop.length ??= mappedType.getDefaultLength(this.platform);
                }
            }
            const primary = !meta.compositePK && !!prop.primary && prop.kind === core_1.ReferenceKind.SCALAR && this.platform.isNumericColumn(mappedType);
            this.columns[field] = {
                name: prop.fieldNames[idx],
                type: prop.columnTypes[idx],
                generated: prop.generated,
                mappedType,
                unsigned: prop.unsigned && this.platform.isNumericColumn(mappedType),
                autoincrement: prop.autoincrement ?? primary,
                primary,
                nullable: this.columns[field]?.nullable ?? !!prop.nullable,
                nativeEnumName: prop.nativeEnumName,
                length: prop.length,
                precision: prop.precision,
                scale: prop.scale,
                default: prop.defaultRaw,
                enumItems: prop.nativeEnumName || prop.items?.every(core_1.Utils.isString) ? prop.items : undefined,
                comment: prop.comment,
                extra: prop.extra,
                ignoreSchemaChanges: prop.ignoreSchemaChanges,
            };
            this.columns[field].unsigned ??= this.columns[field].autoincrement;
            const defaultValue = this.platform.getSchemaHelper().normalizeDefaultValue(prop.defaultRaw, prop.length);
            this.columns[field].default = defaultValue;
        });
        if ([core_1.ReferenceKind.MANY_TO_ONE, core_1.ReferenceKind.ONE_TO_ONE].includes(prop.kind)) {
            const constraintName = this.getIndexName(true, prop.fieldNames, 'foreign');
            let schema = prop.targetMeta.root.schema === '*' ? this.schema : (prop.targetMeta.root.schema ?? config.get('schema', this.platform.getDefaultSchemaName()));
            if (prop.referencedTableName.includes('.')) {
                schema = undefined;
            }
            this.foreignKeys[constraintName] = {
                constraintName,
                columnNames: prop.fieldNames,
                localTableName: this.getShortestName(),
                referencedColumnNames: prop.referencedColumnNames,
                referencedTableName: schema ? `${schema}.${prop.referencedTableName}` : prop.referencedTableName,
            };
            const cascade = prop.cascade.includes(core_1.Cascade.REMOVE) || prop.cascade.includes(core_1.Cascade.ALL);
            if (prop.deleteRule || cascade || prop.nullable) {
                this.foreignKeys[constraintName].deleteRule = prop.deleteRule || (cascade ? 'cascade' : 'set null');
            }
            if (prop.updateRule) {
                this.foreignKeys[constraintName].updateRule = prop.updateRule || 'cascade';
            }
            if ((prop.cascade.includes(core_1.Cascade.PERSIST) || prop.cascade.includes(core_1.Cascade.ALL))) {
                const hasCascadePath = Object.values(this.foreignKeys).some(fk => {
                    return fk.constraintName !== constraintName
                        && ((fk.updateRule && fk.updateRule !== 'no action') || (fk.deleteRule && fk.deleteRule !== 'no action'))
                        && fk.referencedTableName === this.foreignKeys[constraintName].referencedTableName;
                });
                if (!hasCascadePath || this.platform.supportsMultipleCascadePaths()) {
                    this.foreignKeys[constraintName].updateRule ??= 'cascade';
                }
            }
            if (prop.deferMode) {
                this.foreignKeys[constraintName].deferMode = prop.deferMode;
            }
        }
        if (prop.index) {
            this.indexes.push({
                columnNames: prop.fieldNames,
                composite: prop.fieldNames.length > 1,
                keyName: this.getIndexName(prop.index, prop.fieldNames, 'index'),
                constraint: false,
                primary: false,
                unique: false,
            });
        }
        if (prop.unique && !(prop.primary && !meta.compositePK)) {
            this.indexes.push({
                columnNames: prop.fieldNames,
                composite: prop.fieldNames.length > 1,
                keyName: this.getIndexName(prop.unique, prop.fieldNames, 'unique'),
                constraint: !prop.fieldNames.some((d) => d.includes('.')),
                primary: false,
                unique: true,
                deferMode: prop.deferMode,
            });
        }
    }
    getIndexName(value, columnNames, type) {
        if (core_1.Utils.isString(value)) {
            return value;
        }
        return this.platform.getIndexName(this.name, columnNames, type);
    }
    getEntityDeclaration(namingStrategy, schemaHelper, scalarPropertiesForRelations) {
        const { fksOnColumnProps, fksOnStandaloneProps, columnFks, fkIndexes, nullableForeignKeys, skippedColumnNames, } = this.foreignKeysToProps(namingStrategy, scalarPropertiesForRelations);
        const name = namingStrategy.getEntityName(this.name, this.schema);
        const schema = new core_1.EntitySchema({ name, collection: this.name, schema: this.schema, comment: this.comment });
        const compositeFkIndexes = {};
        const compositeFkUniques = {};
        const potentiallyUnmappedIndexes = this.indexes.filter(index => !index.primary // Skip primary index. Whether it's in use by scalar column or FK, it's already mapped.
            && (index.columnNames.length > 1 // All composite indexes are to be mapped to entity decorators or FK props.
                || skippedColumnNames.includes(index.columnNames[0]) // Non-composite indexes for skipped columns are to be mapped as entity decorators.
                || index.deferMode || index.expression // Non-trivial non-composite indexes will be declared at the entity's metadata, though later outputted in the property
                || !(index.columnNames[0] in columnFks) // Trivial non-composite indexes for scalar props are to be mapped to the column.
            )
            // ignore indexes that don't have all column names (this can happen in sqlite where there is no way to infer this for expressions)
            && !(index.columnNames.some(col => !col) && !index.expression));
        for (const index of potentiallyUnmappedIndexes) {
            const ret = {
                name: index.keyName,
                deferMode: index.deferMode,
                expression: index.expression,
            };
            const isTrivial = !index.deferMode && !index.expression;
            if (isTrivial) {
                // Index is for FK. Map to the FK prop and move on.
                const fkForIndex = fkIndexes.get(index);
                if (fkForIndex && !fkForIndex.fk.columnNames.some(col => !index.columnNames.includes(col))) {
                    ret.properties = [this.getPropertyName(namingStrategy, fkForIndex.baseName, fkForIndex.fk)];
                    const map = index.unique ? compositeFkUniques : compositeFkIndexes;
                    if (typeof map[ret.properties[0]] === 'undefined') {
                        map[ret.properties[0]] = index;
                        continue;
                    }
                }
            }
            const properties = ret.properties ?? this.getIndexProperties(index, columnFks, fksOnColumnProps, fksOnStandaloneProps, namingStrategy);
            // If there is a column that cannot be unambiguously mapped to a prop, render an expression.
            if (typeof properties === 'undefined') {
                ret.expression ??= schemaHelper.getCreateIndexSQL(this.name, index);
            }
            else {
                ret.properties ??= properties;
                // If the index is for one property that is not a FK prop, map to the column prop and move on.
                if (properties.length === 1 && isTrivial && !fksOnStandaloneProps.has(properties[0])) {
                    const map = index.unique ? compositeFkUniques : compositeFkIndexes;
                    // Only map one trivial index. If the same column is indexed many times over, output
                    if (typeof map[properties[0]] === 'undefined') {
                        map[properties[0]] = index;
                        continue;
                    }
                }
            }
            // Composite indexes that aren't exclusively mapped to FK props get an entity decorator.
            if (index.unique) {
                schema.addUnique(ret);
                continue;
            }
            schema.addIndex(ret);
        }
        const addedStandaloneFkPropsBasedOnColumn = new Set;
        const nonSkippedColumns = this.getColumns().filter(column => !skippedColumnNames.includes(column.name));
        for (const column of nonSkippedColumns) {
            const columnName = column.name;
            const standaloneFkPropBasedOnColumn = fksOnStandaloneProps.get(columnName);
            if (standaloneFkPropBasedOnColumn && !fksOnColumnProps.get(columnName)) {
                addedStandaloneFkPropsBasedOnColumn.add(columnName);
                const { fkIndex, currentFk } = standaloneFkPropBasedOnColumn;
                const prop = this.getForeignKeyDeclaration(currentFk, namingStrategy, schemaHelper, fkIndex, nullableForeignKeys.has(currentFk), columnName, fksOnColumnProps);
                schema.addProperty(prop.name, prop.type, prop);
            }
            const prop = this.getPropertyDeclaration(column, namingStrategy, schemaHelper, compositeFkIndexes, compositeFkUniques, columnFks, fksOnColumnProps.get(columnName));
            schema.addProperty(prop.name, prop.type, prop);
        }
        for (const [propBaseName, { fkIndex, currentFk }] of fksOnStandaloneProps.entries()) {
            if (addedStandaloneFkPropsBasedOnColumn.has(propBaseName)) {
                continue;
            }
            const prop = this.getForeignKeyDeclaration(currentFk, namingStrategy, schemaHelper, fkIndex, nullableForeignKeys.has(currentFk), propBaseName, fksOnColumnProps);
            schema.addProperty(prop.name, prop.type, prop);
        }
        const meta = schema.init().meta;
        const oneToOneCandidateProperties = meta.relations
            .filter(prop => prop.primary && prop.kind === core_1.ReferenceKind.MANY_TO_ONE);
        if (oneToOneCandidateProperties.length === 1
            && oneToOneCandidateProperties[0].fieldNames.length === (new Set(meta.getPrimaryProps().flatMap(prop => prop.fieldNames))).size) {
            oneToOneCandidateProperties[0].kind = core_1.ReferenceKind.ONE_TO_ONE;
        }
        return meta;
    }
    foreignKeysToProps(namingStrategy, scalarPropertiesForRelations) {
        const fks = Object.values(this.getForeignKeys());
        const fksOnColumnProps = new Map();
        const fksOnStandaloneProps = new Map();
        const columnFks = {};
        const fkIndexes = new Map();
        const nullableForeignKeys = new Set();
        const standaloneFksBasedOnColumnNames = new Map();
        for (const currentFk of fks) {
            const fkIndex = this.findFkIndex(currentFk);
            if (currentFk.columnNames.length === 1 && !fks.some(fk => fk !== currentFk && fk.columnNames.length === 1 && currentFk.columnNames[0] === fk.columnNames[0])) {
                // Non-composite FK is the only possible one for a column. Render the column with it.
                const columnName = currentFk.columnNames[0];
                columnFks[columnName] ??= [];
                columnFks[columnName].push(currentFk);
                if (this.getColumn(columnName)?.nullable) {
                    nullableForeignKeys.add(currentFk);
                }
                if (scalarPropertiesForRelations === 'always') {
                    const baseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks, columnName);
                    standaloneFksBasedOnColumnNames.set(baseName, currentFk);
                    fksOnStandaloneProps.set(baseName, { fkIndex, currentFk });
                    if (fkIndex) {
                        fkIndexes.set(fkIndex, { fk: currentFk, baseName });
                    }
                }
                else {
                    fksOnColumnProps.set(columnName, currentFk);
                    if (fkIndex) {
                        fkIndexes.set(fkIndex, { fk: currentFk, baseName: columnName });
                    }
                }
                continue;
            }
            const specificColumnNames = [];
            const nullableColumnsInFk = [];
            for (const columnName of currentFk.columnNames) {
                columnFks[columnName] ??= [];
                columnFks[columnName].push(currentFk);
                if (!fks.some(fk => fk !== currentFk && fk.columnNames.includes(columnName))) {
                    specificColumnNames.push(columnName);
                }
                if (this.getColumn(columnName)?.nullable) {
                    nullableColumnsInFk.push(columnName);
                }
            }
            if (nullableColumnsInFk.length > 0) {
                nullableForeignKeys.add(currentFk);
            }
            if (specificColumnNames.length === 1 && ((nullableColumnsInFk.length === currentFk.columnNames.length || nullableColumnsInFk.length === 0) || (nullableColumnsInFk.length === 1 && nullableColumnsInFk[0] === specificColumnNames[0]))) {
                // Composite FK has exactly one column which is not used in any other FK.
                // The FK also doesn't have a mix of nullable and non-nullable columns,
                // or its only nullable column is this very one.
                // It is safe to just render this FK attached to the specific column.
                const columnName = specificColumnNames[0];
                if (scalarPropertiesForRelations === 'always') {
                    const baseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks, columnName);
                    standaloneFksBasedOnColumnNames.set(baseName, currentFk);
                    fksOnStandaloneProps.set(baseName, { fkIndex, currentFk });
                    if (fkIndex) {
                        fkIndexes.set(fkIndex, { fk: currentFk, baseName });
                    }
                }
                else {
                    fksOnColumnProps.set(columnName, currentFk);
                    if (fkIndex) {
                        fkIndexes.set(fkIndex, { fk: currentFk, baseName: columnName });
                    }
                }
                continue;
            }
            if (specificColumnNames.length === currentFk.columnNames.length) {
                // All columns involved with this FK are only covered by this one FK.
                if (nullableColumnsInFk.length <= 1) {
                    // Also, this FK is either not nullable, or has only one nullable column.
                    // It is safe to name the FK after the nullable column, or any non-nullable one (the first one is picked).
                    const columnName = nullableColumnsInFk.at(0) ?? currentFk.columnNames[0];
                    if (scalarPropertiesForRelations === 'always') {
                        const baseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks, columnName);
                        standaloneFksBasedOnColumnNames.set(baseName, currentFk);
                        fksOnStandaloneProps.set(baseName, { fkIndex, currentFk });
                        if (fkIndex) {
                            fkIndexes.set(fkIndex, { fk: currentFk, baseName });
                        }
                    }
                    else {
                        fksOnColumnProps.set(columnName, currentFk);
                        if (fkIndex) {
                            fkIndexes.set(fkIndex, { fk: currentFk, baseName: columnName });
                        }
                    }
                    continue;
                }
                // If the first nullable column's name with FK is different from the name without FK,
                // name a standalone prop after the column, but treat the column prop itself as not having FK.
                const columnName = nullableColumnsInFk[0];
                const baseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks, columnName);
                standaloneFksBasedOnColumnNames.set(baseName, currentFk);
                fksOnStandaloneProps.set(baseName, { fkIndex, currentFk });
                if (fkIndex) {
                    fkIndexes.set(fkIndex, { fk: currentFk, baseName });
                }
                continue;
            }
            // FK is not unambiguously mappable to a column. Pick another name for a standalone FK prop.
            const baseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks);
            fksOnStandaloneProps.set(baseName, { fkIndex, currentFk });
            if (fkIndex) {
                fkIndexes.set(fkIndex, { fk: currentFk, baseName });
            }
        }
        const columnsInFks = Object.keys(columnFks);
        const skippingHandlers = {
            // Never generate scalar props for composite keys,
            // i.e. always skip columns if they are covered by foreign keys.
            never: (column) => columnsInFks.includes(column.name) && !fksOnColumnProps.has(column.name),
            // Always generate scalar props for composite keys,
            // i.e. do not skip columns, even if they are covered by foreign keys.
            always: (column) => false,
            // Smart scalar props generation.
            // Skips columns if they are covered by foreign keys.
            // But also does not skip if the column is not nullable, and yet all involved FKs are nullable,
            // or if one or more FKs involved has multiple nullable columns.
            smart: (column) => {
                return columnsInFks.includes(column.name)
                    && !fksOnColumnProps.has(column.name)
                    && (column.nullable
                        ? columnFks[column.name].some(fk => !fk.columnNames.some(fkColumnName => fkColumnName !== column.name && this.getColumn(fkColumnName)?.nullable))
                        : columnFks[column.name].some(fk => !nullableForeignKeys.has(fk)));
            },
        };
        const skippedColumnNames = this.getColumns().filter(skippingHandlers[scalarPropertiesForRelations]).map(column => column.name);
        // Check standalone FKs named after columns for potential conflicts among themselves.
        // This typically happens when two standalone FKs named after a column resolve to the same prop name
        // because the respective columns include the referenced table in the name.
        // Depending on naming strategy and actual names, it may also originate from other scenarios.
        // We do our best to de-duplicate them here.
        const safePropNames = new Set();
        const unsafePropNames = new Map();
        for (const [unsafeBaseName, currentFk] of standaloneFksBasedOnColumnNames) {
            const propName = this.getPropertyName(namingStrategy, unsafeBaseName, currentFk);
            if (safePropNames.has(propName)) {
                if (!unsafePropNames.has(propName)) {
                    unsafePropNames.set(propName, []);
                }
                unsafePropNames.get(propName).push({ unsafeBaseName, currentFk });
                continue;
            }
            safePropNames.add(propName);
        }
        for (const [unsafePropName, affectedBaseNames] of unsafePropNames) {
            safePropNames.delete(unsafePropName);
            for (const { unsafeBaseName, currentFk } of affectedBaseNames) {
                const newBaseName = this.getSafeBaseNameForFkProp(namingStrategy, currentFk, fks);
                fksOnStandaloneProps.delete(unsafeBaseName);
                let fkIndex;
                for (const [indexDef, fkIndexDesc] of fkIndexes) {
                    if (fkIndexDesc.fk !== currentFk) {
                        continue;
                    }
                    fkIndexDesc.baseName = newBaseName;
                    fkIndex = indexDef;
                    break;
                }
                fksOnStandaloneProps.set(newBaseName, { fkIndex, currentFk });
            }
        }
        return { fksOnColumnProps, fksOnStandaloneProps, columnFks, fkIndexes, nullableForeignKeys, skippedColumnNames };
    }
    findFkIndex(currentFk) {
        const fkColumnsLength = currentFk.columnNames.length;
        const possibleIndexes = this.indexes.filter(index => {
            return index.columnNames.length === fkColumnsLength && !currentFk.columnNames.some((columnName, i) => index.columnNames[i] !== columnName);
        });
        possibleIndexes.sort((a, b) => {
            if (a.primary !== b.primary) {
                return a.primary ? -1 : 1;
            }
            if (a.unique !== b.unique) {
                return a.unique ? -1 : 1;
            }
            return a.keyName.localeCompare(b.keyName);
        });
        return possibleIndexes.at(0);
    }
    getIndexProperties(index, columnFks, fksOnColumnProps, fksOnStandaloneProps, namingStrategy) {
        const propBaseNames = new Set();
        const columnNames = index.columnNames;
        const l = columnNames.length;
        if (columnNames.some(col => !col)) {
            return;
        }
        for (let i = 0; i < l; ++i) {
            const columnName = columnNames[i];
            // The column is not involved with FKs.
            if (!(columnName in columnFks)) {
                // If there is no such column, the "name" is actually an expression.
                if (!this.hasColumn(columnName)) {
                    return;
                }
                // It has a prop named after it.
                // Add it and move on.
                propBaseNames.add(columnName);
                continue;
            }
            // If the prop named after the column has a FK and the FK's columns are a subset of this index,
            // include this prop and move on.
            const columnPropFk = fksOnColumnProps.get(columnName);
            if (columnPropFk && !columnPropFk.columnNames.some(fkColumnName => !columnNames.includes(fkColumnName))) {
                propBaseNames.add(columnName);
                continue;
            }
            // If there is at least one standalone FK featuring this column,
            // and all of its columns are a subset of this index,
            // include that FK, and consider mapping of this column to a prop a success.
            let propAdded = false;
            for (const [propName, { currentFk: fk }] of fksOnStandaloneProps) {
                if (!columnFks[columnName].includes(fk)) {
                    continue;
                }
                if (!fk.columnNames.some(fkColumnName => !columnNames.includes(fkColumnName))) {
                    propBaseNames.add(propName);
                    propAdded = true;
                }
            }
            if (propAdded) {
                continue;
            }
            // If we have reached this point, it means the column is not mappable to a prop name.
            // Break the whole prop creation.
            return;
        }
        return Array.from(propBaseNames).map(baseName => this.getPropertyName(namingStrategy, baseName, fksOnColumnProps.get(baseName)));
    }
    getSafeBaseNameForFkProp(namingStrategy, currentFk, fks, columnName) {
        if (columnName && this.getPropertyName(namingStrategy, columnName, currentFk) !== this.getPropertyName(namingStrategy, columnName)) {
            // The eligible scalar column name is different from the name of the FK prop of the same column.
            // Both can be safely rendered.
            // Use the column name as a base for the FK prop.
            return columnName;
        }
        if (!fks.some(fk => fk !== currentFk && fk.referencedTableName === currentFk.referencedTableName) && !this.getColumn(currentFk.referencedTableName)) {
            // FK is the only one in this table that references this other table.
            // The name of the referenced table is not shared with a column in this table,
            // so it is safe to output prop name based on the referenced entity.
            return currentFk.referencedTableName;
        }
        // Any ambiguous FK is rendered with a name based on the FK constraint name
        let finalPropBaseName = currentFk.constraintName;
        while (this.getColumn(finalPropBaseName)) {
            // In the unlikely event that the FK constraint name is shared by a column name, generate a name by
            // continuously prefixing with "fk_", until a non-existent column is hit.
            // The worst case scenario is a very long name with several repeated "fk_"
            // that is not really a valid DB identifier but a valid JS variable name.
            finalPropBaseName = `fk_${finalPropBaseName}`;
        }
        return finalPropBaseName;
    }
    /**
     * The shortest name is stripped of the default namespace. All other namespaced elements are returned as full-qualified names.
     */
    getShortestName() {
        if (!this.schema || this.name.startsWith(this.schema + '.')) {
            return this.name;
        }
        return `${this.schema}.${this.name}`;
    }
    getForeignKeys() {
        return this.foreignKeys;
    }
    hasColumn(columnName) {
        return columnName in this.columns;
    }
    getIndex(indexName) {
        return this.indexes.find(i => i.keyName === indexName);
    }
    hasIndex(indexName) {
        return !!this.getIndex(indexName);
    }
    getCheck(checkName) {
        return this.checks.find(i => i.name === checkName);
    }
    hasCheck(checkName) {
        return !!this.getCheck(checkName);
    }
    getPrimaryKey() {
        return this.indexes.find(i => i.primary);
    }
    hasPrimaryKey() {
        return !!this.getPrimaryKey();
    }
    getForeignKeyDeclaration(fk, namingStrategy, schemaHelper, fkIndex, nullable, propNameBase, fksOnColumnProps) {
        const prop = this.getPropertyName(namingStrategy, propNameBase, fk);
        const kind = (fkIndex?.unique && !fkIndex.primary) ? this.getReferenceKind(fk, fkIndex) : this.getReferenceKind(fk);
        const runtimeType = this.getPropertyTypeForForeignKey(namingStrategy, fk);
        const fkOptions = {};
        fkOptions.fieldNames = fk.columnNames;
        fkOptions.referencedTableName = fk.referencedTableName;
        fkOptions.referencedColumnNames = fk.referencedColumnNames;
        fkOptions.updateRule = fk.updateRule?.toLowerCase();
        fkOptions.deleteRule = fk.deleteRule?.toLowerCase();
        fkOptions.deferMode = fk.deferMode;
        fkOptions.columnTypes = fk.columnNames.map(c => this.getColumn(c).type);
        const columnOptions = {};
        if (fk.columnNames.length === 1) {
            const column = this.getColumn(fk.columnNames[0]);
            const defaultRaw = this.getPropertyDefaultValue(schemaHelper, column, column.type, true);
            const defaultTs = this.getPropertyDefaultValue(schemaHelper, column, column.type);
            columnOptions.default = (defaultRaw !== defaultTs || defaultRaw === '') ? defaultTs : undefined;
            columnOptions.defaultRaw = (column.nullable && defaultRaw === 'null') ? undefined : defaultRaw;
            columnOptions.optional = typeof column.generated !== 'undefined' || defaultRaw !== 'null';
            columnOptions.generated = column.generated;
            columnOptions.nullable = column.nullable;
            columnOptions.primary = column.primary;
            columnOptions.length = column.length;
            columnOptions.precision = column.precision;
            columnOptions.scale = column.scale;
            columnOptions.extra = column.extra;
            columnOptions.comment = column.comment;
            columnOptions.enum = !!column.enumItems?.length;
            columnOptions.items = column.enumItems;
        }
        return {
            name: prop,
            type: runtimeType,
            runtimeType,
            kind,
            ...columnOptions,
            nullable,
            primary: fkIndex?.primary || !fk.columnNames.some(columnName => !this.getPrimaryKey()?.columnNames.includes(columnName)),
            index: !fkIndex?.unique ? fkIndex?.keyName : undefined,
            unique: (fkIndex?.unique && !fkIndex.primary) ? fkIndex.keyName : undefined,
            ...fkOptions,
        };
    }
    getPropertyDeclaration(column, namingStrategy, schemaHelper, compositeFkIndexes, compositeFkUniques, columnFks, fk) {
        const prop = this.getPropertyName(namingStrategy, column.name, fk);
        const persist = !(column.name in columnFks && typeof fk === 'undefined');
        const index = compositeFkIndexes[prop] || this.indexes.find(idx => idx.columnNames[0] === column.name && !idx.composite && !idx.unique && !idx.primary);
        const unique = compositeFkUniques[prop] || this.indexes.find(idx => idx.columnNames[0] === column.name && !idx.composite && idx.unique && !idx.primary);
        const kind = this.getReferenceKind(fk, unique);
        const runtimeType = this.getPropertyTypeForColumn(namingStrategy, column, fk);
        const type = fk ? runtimeType : (core_1.Utils.keys(core_1.t).find(k => {
            const typeInCoreMap = this.platform.getMappedType(k);
            return (typeInCoreMap !== core_1.Type.getType(core_1.UnknownType) || k === 'unknown') && typeInCoreMap === column.mappedType;
        }) ?? runtimeType);
        const ignoreSchemaChanges = (type === 'unknown' && column.length) ? (column.extra ? ['type', 'extra'] : ['type']) : undefined;
        const defaultRaw = this.getPropertyDefaultValue(schemaHelper, column, runtimeType, true);
        const defaultParsed = this.getPropertyDefaultValue(schemaHelper, column, runtimeType);
        const defaultTs = (defaultRaw !== defaultParsed || defaultParsed === '') ? defaultParsed : undefined;
        const fkOptions = {};
        if (fk) {
            fkOptions.fieldNames = fk.columnNames;
            fkOptions.referencedTableName = fk.referencedTableName;
            fkOptions.referencedColumnNames = fk.referencedColumnNames;
            fkOptions.updateRule = fk.updateRule?.toLowerCase();
            fkOptions.deleteRule = fk.deleteRule?.toLowerCase();
            fkOptions.deferMode = fk.deferMode;
            fkOptions.columnTypes = fk.columnNames.map(col => this.getColumn(col).type);
        }
        return {
            name: prop,
            type,
            runtimeType,
            kind,
            ignoreSchemaChanges,
            generated: column.generated,
            optional: defaultRaw !== 'null' || defaultTs != null || typeof column.generated !== 'undefined',
            columnType: column.type,
            default: defaultTs,
            defaultRaw: (column.nullable && defaultRaw === 'null') ? undefined : defaultRaw,
            nullable: column.nullable,
            primary: column.primary && persist,
            autoincrement: column.autoincrement,
            fieldName: column.name,
            unsigned: column.unsigned,
            length: column.length,
            precision: column.precision,
            scale: column.scale,
            extra: column.extra,
            comment: column.comment,
            index: index ? index.keyName : undefined,
            unique: unique ? unique.keyName : undefined,
            enum: !!column.enumItems?.length,
            items: column.enumItems,
            persist,
            ...fkOptions,
        };
    }
    getReferenceKind(fk, unique) {
        if (fk && unique) {
            return core_1.ReferenceKind.ONE_TO_ONE;
        }
        if (fk) {
            return core_1.ReferenceKind.MANY_TO_ONE;
        }
        return core_1.ReferenceKind.SCALAR;
    }
    getPropertyName(namingStrategy, baseName, fk) {
        let field = baseName;
        if (fk) {
            const idx = fk.columnNames.indexOf(baseName);
            let replacedFieldName = field.replace(new RegExp(`_${fk.referencedColumnNames[idx]}$`), '');
            if (replacedFieldName === field) {
                replacedFieldName = field.replace(new RegExp(`_${namingStrategy.referenceColumnName()}$`), '');
            }
            field = replacedFieldName;
        }
        if (field.startsWith('_')) {
            return field;
        }
        return namingStrategy.columnNameToProperty(field);
    }
    getPropertyTypeForForeignKey(namingStrategy, fk) {
        const parts = fk.referencedTableName.split('.', 2);
        return namingStrategy.getEntityName(...parts.reverse());
    }
    getPropertyTypeForColumn(namingStrategy, column, fk) {
        if (fk) {
            return this.getPropertyTypeForForeignKey(namingStrategy, fk);
        }
        // If this column is using an enum.
        if (column.enumItems?.length) {
            // We will create a new enum name for this type and set it as the property type as well.
            return namingStrategy.getEnumClassName(column.name, this.name, this.schema);
        }
        return column.mappedType?.runtimeType ?? 'unknown';
    }
    getPropertyDefaultValue(schemaHelper, column, propType, raw = false) {
        const defaultValue = column.default ?? 'null';
        const val = schemaHelper.normalizeDefaultValue(defaultValue, column.length);
        if (val === 'null') {
            return raw ? 'null' : (column.nullable ? null : undefined);
        }
        if (propType === 'boolean' && !raw) {
            return !['0', 'false', 'f', 'n', 'no', 'off'].includes('' + column.default);
        }
        if (propType === 'number' && !raw) {
            return +defaultValue;
        }
        // unquote string defaults if `raw = false`
        const match = ('' + val).match(/^'(.*)'$/);
        if (!raw && match) {
            return match[1];
        }
        return '' + val;
    }
    addIndex(meta, index, type) {
        const properties = core_1.Utils.unique(core_1.Utils.flatten(core_1.Utils.asArray(index.properties).map(prop => {
            const root = prop.replace(/\..+$/, '');
            if (meta.properties[prop]) {
                if (meta.properties[prop].embeddedPath) {
                    return [meta.properties[prop].embeddedPath.join('.')];
                }
                return meta.properties[prop].fieldNames;
            }
            // json index, we need to rename the column only
            if (meta.properties[root]) {
                return [prop.replace(root, meta.properties[root].fieldNames[0])];
            }
            /* istanbul ignore next */
            return [prop];
        })));
        if (properties.length === 0 && !index.expression) {
            return;
        }
        const name = this.getIndexName(index.name, properties, type);
        this.indexes.push({
            keyName: name,
            columnNames: properties,
            composite: properties.length > 1,
            // JSON columns can have unique index but not unique constraint, and we need to distinguish those, so we can properly drop them
            constraint: type !== 'index' && !properties.some((d) => d.includes('.')),
            primary: type === 'primary',
            unique: type !== 'index',
            type: index.type,
            expression: index.expression,
            options: index.options,
            deferMode: index.deferMode,
        });
    }
    addCheck(check) {
        this.checks.push(check);
    }
    toJSON() {
        const { platform, columns, ...rest } = this;
        const columnsMapped = core_1.Utils.keys(columns).reduce((o, col) => {
            const { mappedType, ...restCol } = columns[col];
            o[col] = restCol;
            o[col].mappedType = core_1.Utils.keys(core_1.t).find(k => core_1.t[k] === mappedType.constructor);
            return o;
        }, {});
        return { columns: columnsMapped, ...rest };
    }
}
exports.DatabaseTable = DatabaseTable;
