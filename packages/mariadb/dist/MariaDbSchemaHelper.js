"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbSchemaHelper = void 0;
const knex_1 = require("@mikro-orm/knex");
class MariaDbSchemaHelper extends knex_1.MySqlSchemaHelper {
    async loadInformationSchema(schema, connection, tables) {
        /* istanbul ignore next */
        if (tables.length === 0) {
            return;
        }
        const columns = await this.getAllColumns(connection, tables);
        const indexes = await this.getAllIndexes(connection, tables);
        const checks = await this.getAllChecks(connection, tables, columns);
        const fks = await this.getAllForeignKeys(connection, tables);
        const enums = await this.getAllEnumDefinitions(connection, tables);
        for (const t of tables) {
            const key = this.getTableKey(t);
            const table = schema.addTable(t.table_name, t.schema_name, t.table_comment);
            const pks = await this.getPrimaryKeys(connection, indexes[key], table.name, table.schema);
            table.init(columns[key], indexes[key], checks[key], pks, fks[key], enums[key]);
        }
    }
    async getAllIndexes(connection, tables) {
        const sql = `select table_name as table_name, nullif(table_schema, schema()) as schema_name, index_name as index_name, non_unique as non_unique, column_name as column_name
        from information_schema.statistics where table_schema = database()
        and table_name in (${tables.map(t => this.platform.quoteValue(t.table_name)).join(', ')})
        order by schema_name, table_name, index_name, seq_in_index`;
        const allIndexes = await connection.execute(sql);
        const ret = {};
        for (const index of allIndexes) {
            const key = this.getTableKey(index);
            ret[key] ??= [];
            ret[key].push({
                columnNames: [index.column_name],
                keyName: index.index_name,
                unique: !index.non_unique,
                primary: index.index_name === 'PRIMARY',
                constraint: !index.non_unique,
            });
        }
        for (const key of Object.keys(ret)) {
            ret[key] = await this.mapIndexes(ret[key]);
        }
        return ret;
    }
    async getAllColumns(connection, tables) {
        const sql = `select table_name as table_name,
      nullif(table_schema, schema()) as schema_name,
      column_name as column_name,
      column_default as column_default,
      nullif(column_comment, '') as column_comment,
      is_nullable as is_nullable,
      data_type as data_type,
      column_type as column_type,
      column_key as column_key,
      extra as extra,
      generation_expression as generation_expression,
      numeric_precision as numeric_precision,
      numeric_scale as numeric_scale,
      ifnull(datetime_precision, character_maximum_length) length
      from information_schema.columns where table_schema = database() and table_name in (${tables.map(t => this.platform.quoteValue(t.table_name))})
      order by ordinal_position`;
        const allColumns = await connection.execute(sql);
        const str = (val) => val != null ? '' + val : val;
        const extra = (val) => val.replace(/auto_increment|default_generated|(stored|virtual) generated/i, '').trim() || undefined;
        const ret = {};
        for (const col of allColumns) {
            const mappedType = this.platform.getMappedType(col.column_type);
            const tmp = this.normalizeDefaultValue((mappedType.compareAsType() === 'boolean' && ['0', '1'].includes(col.column_default))
                ? ['false', 'true'][+col.column_default]
                : col.column_default, col.length);
            const defaultValue = str(tmp === 'NULL' && col.is_nullable === 'YES' ? null : tmp);
            const key = this.getTableKey(col);
            const generated = col.generation_expression ? `${col.generation_expression.replaceAll(`\\'`, `'`)} ${col.extra.match(/stored generated/i) ? 'stored' : 'virtual'}` : undefined;
            ret[key] ??= [];
            ret[key].push({
                name: col.column_name,
                type: this.platform.isNumericColumn(mappedType) ? col.column_type.replace(/ unsigned$/, '').replace(/\(\d+\)$/, '') : col.column_type,
                mappedType,
                unsigned: col.column_type.endsWith(' unsigned'),
                length: col.length,
                default: this.wrap(defaultValue, mappedType),
                nullable: col.is_nullable === 'YES',
                primary: col.column_key === 'PRI',
                unique: col.column_key === 'UNI',
                autoincrement: col.extra === 'auto_increment',
                precision: col.numeric_precision,
                scale: col.numeric_scale,
                comment: col.column_comment,
                extra: extra(col.extra),
                generated,
            });
        }
        return ret;
    }
    async getAllChecks(connection, tables, columns) {
        const sql = this.getChecksSQL(tables);
        const allChecks = await connection.execute(sql);
        const ret = {};
        for (const check of allChecks) {
            const key = this.getTableKey(check);
            const match = check.expression.match(/^json_valid\(`(.*)`\)$/i);
            const col = columns?.[key]?.find(col => col.name === match?.[1]);
            if (col && match) {
                col.type = 'json';
                col.mappedType = this.platform.getMappedType('json');
                delete col.length;
                continue;
            }
            ret[key] ??= [];
            ret[key].push({
                name: check.name,
                columnName: check.column_name,
                definition: `check ${check.expression}`,
                expression: check.expression.replace(/^\((.*)\)$/, '$1'),
            });
        }
        return ret;
    }
    getChecksSQL(tables) {
        return `select tc.constraint_schema as table_schema, tc.table_name as table_name, tc.constraint_name as name, tc.check_clause as expression,
      case when tc.level = 'Column' then tc.constraint_name else null end as column_name
      from information_schema.check_constraints tc
      where tc.table_name in (${tables.map(t => this.platform.quoteValue(t.table_name))}) and tc.constraint_schema = database()
      order by tc.constraint_name`;
    }
    /* istanbul ignore next */
    async getChecks(connection, tableName, schemaName, columns) {
        const res = await this.getAllChecks(connection, [{ table_name: tableName, schema_name: schemaName }], { [tableName]: columns });
        return res[tableName];
    }
    wrap(val, type) {
        return val;
    }
}
exports.MariaDbSchemaHelper = MariaDbSchemaHelper;
