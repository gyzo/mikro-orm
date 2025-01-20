"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibSqlPlatform = void 0;
// @ts-ignore
const sqlstring_sqlite_1 = require("sqlstring-sqlite");
const knex_1 = require("@mikro-orm/knex");
const LibSqlSchemaHelper_1 = require("./LibSqlSchemaHelper");
const LibSqlExceptionConverter_1 = require("./LibSqlExceptionConverter");
class LibSqlPlatform extends knex_1.BaseSqlitePlatform {
    schemaHelper = new LibSqlSchemaHelper_1.LibSqlSchemaHelper(this);
    exceptionConverter = new LibSqlExceptionConverter_1.LibSqlExceptionConverter();
    escape(value) {
        return (0, sqlstring_sqlite_1.escape)(value, true, this.timezone);
    }
}
exports.LibSqlPlatform = LibSqlPlatform;
