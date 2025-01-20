"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = void 0;
class MigrationRunner {
    driver;
    options;
    connection;
    masterTransaction;
    constructor(driver, options) {
        this.driver = driver;
        this.options = options;
        this.connection = this.driver.getConnection();
    }
    async run(migration, method) {
        migration.reset();
        if (!this.options.transactional || !migration.isTransactional()) {
            await migration[method]();
        }
        else if (this.masterTransaction) {
            migration.setTransactionContext(this.masterTransaction);
            await migration[method]();
        }
        else {
            await this.connection.transactional(async (tx) => {
                migration.setTransactionContext(tx);
                await migration[method]();
            }, { ctx: this.masterTransaction });
        }
    }
    setMasterMigration(trx) {
        this.masterTransaction = trx;
    }
    unsetMasterMigration() {
        delete this.masterTransaction;
    }
}
exports.MigrationRunner = MigrationRunner;
