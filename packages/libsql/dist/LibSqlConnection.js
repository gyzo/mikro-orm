"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibSqlConnection = void 0;
const knex_1 = require("@mikro-orm/knex");
class LibSqlConnection extends knex_1.BaseSqliteConnection {
    createKnex() {
        this.client = this.createKnexClient(knex_1.LibSqlKnexDialect);
        this.connected = true;
    }
    getKnexOptions(type) {
        return knex_1.Utils.mergeConfig({
            client: type,
            connection: {
                filename: this.config.get('dbName'),
                authToken: this.config.get('password'),
            },
            pool: this.config.get('pool'),
            useNullAsDefault: true,
        }, this.config.get('driverOptions'));
    }
}
exports.LibSqlConnection = LibSqlConnection;
