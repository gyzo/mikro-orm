"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibSqlDriver = void 0;
const knex_1 = require("@mikro-orm/knex");
const LibSqlConnection_1 = require("./LibSqlConnection");
const LibSqlPlatform_1 = require("./LibSqlPlatform");
class LibSqlDriver extends knex_1.AbstractSqlDriver {
    constructor(config) {
        super(config, new LibSqlPlatform_1.LibSqlPlatform(), LibSqlConnection_1.LibSqlConnection, ['knex', 'libsql']);
    }
}
exports.LibSqlDriver = LibSqlDriver;
