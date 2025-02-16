"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationGenerator = void 0;
const core_1 = require("@mikro-orm/core");
const fs_extra_1 = require("fs-extra");
/* istanbul ignore next */
class MigrationGenerator {
    driver;
    namingStrategy;
    options;
    constructor(driver, namingStrategy, options) {
        this.driver = driver;
        this.namingStrategy = namingStrategy;
        this.options = options;
    }
    /**
     * @inheritDoc
     */
    async generate(diff, path, name) {
        /* istanbul ignore next */
        const defaultPath = this.options.emit === 'ts' && this.options.pathTs ? this.options.pathTs : this.options.path;
        path = core_1.Utils.normalizePath(this.driver.config.get('baseDir'), path ?? defaultPath);
        await (0, fs_extra_1.ensureDir)(path);
        const timestamp = new Date().toISOString().replace(/[-T:]|\.\d{3}z$/ig, '');
        const className = this.namingStrategy.classToMigrationName(timestamp, name);
        const fileName = `${this.options.fileName(timestamp, name)}.${this.options.emit}`;
        const ret = this.generateMigrationFile(className, diff);
        await (0, fs_extra_1.writeFile)(path + '/' + fileName, ret, { flush: true });
        return [ret, fileName];
    }
    /**
     * @inheritDoc
     */
    createStatement(query, padLeft) {
        if (query) {
            const padding = ' '.repeat(padLeft);
            return `${padding}console.log('${query}');\n`;
        }
        return '\n';
    }
}
exports.MigrationGenerator = MigrationGenerator;
