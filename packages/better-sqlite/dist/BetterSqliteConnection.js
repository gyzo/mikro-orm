"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetterSqliteConnection = void 0;
const knex_1 = require("@mikro-orm/knex");
class BetterSqliteConnection extends knex_1.BaseSqliteConnection {
    createKnex() {
        this.client = this.createKnexClient(knex_1.BetterSqliteKnexDialect);
        this.connected = true;
    }
}
exports.BetterSqliteConnection = BetterSqliteConnection;
