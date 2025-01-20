"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetterSqlitePlatform = void 0;
// @ts-ignore
const sqlstring_sqlite_1 = require("sqlstring-sqlite");
const knex_1 = require("@mikro-orm/knex");
const BetterSqliteSchemaHelper_1 = require("./BetterSqliteSchemaHelper");
const BetterSqliteExceptionConverter_1 = require("./BetterSqliteExceptionConverter");
class BetterSqlitePlatform extends knex_1.BaseSqlitePlatform {
    schemaHelper = new BetterSqliteSchemaHelper_1.BetterSqliteSchemaHelper(this);
    exceptionConverter = new BetterSqliteExceptionConverter_1.BetterSqliteExceptionConverter();
    escape(value) {
        return (0, sqlstring_sqlite_1.escape)(value, true, this.timezone);
    }
}
exports.BetterSqlitePlatform = BetterSqlitePlatform;
