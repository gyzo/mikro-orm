"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsSqlConnection = void 0;
const knex_1 = require("@mikro-orm/knex");
class MsSqlConnection extends knex_1.AbstractSqlConnection {
    createKnex() {
        this.client = this.createKnexClient(knex_1.MsSqlKnexDialect);
        this.connected = true;
    }
    getDefaultClientUrl() {
        return 'mssql://sa@localhost:1433';
    }
    getConnectionOptions() {
        const config = super.getConnectionOptions();
        const overrides = {
            options: {
                enableArithAbort: true,
                fallbackToDefaultDb: true,
                useUTC: this.config.get('forceUtcTimezone', false),
            },
        };
        /* istanbul ignore next */
        if (config.host?.includes('\\')) {
            const [host, ...name] = config.host.split('\\');
            overrides.server = host;
            overrides.options.instanceName = name.join('\\');
            delete config.host;
            delete config.port;
        }
        knex_1.Utils.mergeConfig(config, overrides);
        return config;
    }
    async begin(options = {}) {
        if (!options.ctx) {
            if (options.isolationLevel) {
                this.logQuery(`set transaction isolation level ${options.isolationLevel}`);
            }
            this.logQuery('begin');
        }
        return super.begin(options);
    }
    async commit(ctx, eventBroadcaster) {
        this.logQuery('commit');
        return super.commit(ctx, eventBroadcaster);
    }
    async rollback(ctx, eventBroadcaster) {
        if (eventBroadcaster?.isTopLevel()) {
            this.logQuery('rollback');
        }
        return super.rollback(ctx, eventBroadcaster);
    }
    transformRawResult(res, method) {
        if (method === 'get') {
            return res[0];
        }
        if (method === 'all' || !res) {
            return res;
        }
        const rowCount = res.length;
        const hasEmptyCount = (rowCount === 1) && ('' in res[0]);
        const emptyRow = hasEmptyCount && res[0][''];
        return {
            affectedRows: hasEmptyCount ? emptyRow : res.length,
            insertId: res[0] ? res[0].id : 0,
            row: res[0],
            rows: res,
        };
    }
}
exports.MsSqlConnection = MsSqlConnection;
