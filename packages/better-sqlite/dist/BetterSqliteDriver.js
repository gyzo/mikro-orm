"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetterSqliteDriver = void 0;
const knex_1 = require("@mikro-orm/knex");
const BetterSqliteConnection_1 = require("./BetterSqliteConnection");
const BetterSqlitePlatform_1 = require("./BetterSqlitePlatform");
class BetterSqliteDriver extends knex_1.AbstractSqlDriver {
    constructor(config) {
        super(config, new BetterSqlitePlatform_1.BetterSqlitePlatform(), BetterSqliteConnection_1.BetterSqliteConnection, ['knex', 'better-sqlite3']);
    }
}
exports.BetterSqliteDriver = BetterSqliteDriver;
