"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsSqlDriver = void 0;
const core_1 = require("@mikro-orm/core");
const knex_1 = require("@mikro-orm/knex");
const MsSqlConnection_1 = require("./MsSqlConnection");
const MsSqlPlatform_1 = require("./MsSqlPlatform");
const MsSqlQueryBuilder_1 = require("./MsSqlQueryBuilder");
class MsSqlDriver extends knex_1.AbstractSqlDriver {
    constructor(config) {
        super(config, new MsSqlPlatform_1.MsSqlPlatform(), MsSqlConnection_1.MsSqlConnection, ['knex', 'tedious']);
    }
    async nativeInsertMany(entityName, data, options = {}) {
        const meta = this.metadata.get(entityName);
        const keys = new Set();
        data.forEach(row => Object.keys(row).forEach(k => keys.add(k)));
        const props = [...keys].map(name => meta.properties[name] ?? { name, fieldNames: [name] });
        const fields = core_1.Utils.flatten(props.map(prop => prop.fieldNames));
        const tableName = this.getTableName(meta, options);
        const hasFields = fields.length > 0;
        // Is this en empty insert... this is rather hard in mssql (especially with an insert many)
        if (!hasFields) {
            const returningProps = meta.props.filter(prop => prop.primary || prop.defaultRaw);
            const returningFields = core_1.Utils.flatten(returningProps.map(prop => prop.fieldNames));
            const using2 = `select * from (values ${data.map((x, i) => `(${i})`).join(',')}) v (id) where 1 = 1`;
            /* istanbul ignore next */
            const output = returningFields.length > 0 ? `output ${returningFields.map(field => 'inserted.' + this.platform.quoteIdentifier(field)).join(', ')}` : '';
            const sql = `merge into ${tableName} using (${using2}) s on 1 = 0 when not matched then insert default values ${output};`;
            const res = await this.execute(sql, [], 'run', options.ctx);
            const pks = this.getPrimaryKeyFields(entityName);
            let pk;
            /* istanbul ignore next */
            if (pks.length > 1) { // owner has composite pk
                pk = data.map(d => core_1.Utils.getPrimaryKeyCond(d, pks));
            }
            else {
                res.row ??= {};
                res.rows ??= [];
                pk = data.map((d, i) => d[pks[0]] ?? res.rows[i]?.[pks[0]]).map(d => [d]);
                res.insertId = res.insertId || res.row[pks[0]];
            }
            return res;
        }
        if (props.some(prop => prop.autoincrement)) {
            return super.nativeInsertMany(entityName, data, options, sql => {
                return `set identity_insert ${tableName} on; ${sql}; set identity_insert ${tableName} off`;
            });
        }
        return super.nativeInsertMany(entityName, data, options);
    }
    createQueryBuilder(entityName, ctx, preferredConnectionType, convertCustomTypes, loggerContext, alias, em) {
        // do not compute the connectionType if EM is provided as it will be computed from it in the QB later on
        const connectionType = em ? preferredConnectionType : this.resolveConnectionType({ ctx, connectionType: preferredConnectionType });
        const qb = new MsSqlQueryBuilder_1.MsSqlQueryBuilder(entityName, this.metadata, this, ctx, alias, connectionType, em, loggerContext);
        if (!convertCustomTypes) {
            qb.unsetFlag(core_1.QueryFlag.CONVERT_CUSTOM_TYPES);
        }
        return qb;
    }
}
exports.MsSqlDriver = MsSqlDriver;
