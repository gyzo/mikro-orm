"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsSqlQueryBuilder = void 0;
const core_1 = require("@mikro-orm/core");
const knex_1 = require("@mikro-orm/knex");
class MsSqlQueryBuilder extends knex_1.QueryBuilder {
    insert(data) {
        this.checkIdentityInsert(data);
        return super.insert(data);
    }
    getKnex() {
        const qb = super.getKnex();
        if (this.flags.has(core_1.QueryFlag.IDENTITY_INSERT)) {
            this.appendIdentityInsert(qb);
        }
        return qb;
    }
    getKnexQuery(processVirtualEntity = true) {
        if (this.type === knex_1.QueryType.TRUNCATE) {
            const tableName = this.driver.getTableName(this.mainAlias.metadata, { schema: this._schema }, false);
            const tableNameQuoted = this.platform.quoteIdentifier(tableName);
            const sql = `delete from ${tableNameQuoted}; declare @count int = case @@rowcount when 0 then 1 else 0 end; dbcc checkident ('${tableName}', reseed, @count)`;
            this._query = {};
            return this._query.qb = this.knex.raw(sql);
        }
        return super.getKnexQuery(processVirtualEntity);
    }
    appendIdentityInsert(qb) {
        const meta = this.metadata.get(this.mainAlias.entityName);
        const table = this.driver.getTableName(meta, { schema: this._schema });
        const originalToSQL = qb.toSQL;
        qb.toSQL = () => {
            const res = originalToSQL.apply(qb);
            return {
                ...res,
                sql: `set identity_insert ${table} on; ${res.sql}; set identity_insert ${table} off;`,
                toNative: () => res.toNative(),
            };
        };
    }
    checkIdentityInsert(data) {
        const meta = this.metadata.find(this.mainAlias.entityName);
        if (!meta) {
            return;
        }
        const dataKeys = core_1.Utils.unique(core_1.Utils.asArray(data).flatMap(Object.keys));
        const hasAutoincrement = dataKeys.some(x => meta.properties[x]?.autoincrement);
        if (hasAutoincrement) {
            this.setFlag(core_1.QueryFlag.IDENTITY_INSERT);
        }
    }
}
exports.MsSqlQueryBuilder = MsSqlQueryBuilder;
